import PDFDocument from 'pdfkit';
import Order from '../../models/order.js';
import Product from '../../models/product.js';
import Variant from '../../models/variant.js';
import Return from '../../models/Return.js';
import walletService from '../../services/walletService.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';

const PER_PAGE = 8;

function toNum(d) {
  if (d == null) return 0;
  return parseFloat(d.toString());
}

// Human-readable status labels
const STATUS_LABEL = {
  placed          : 'Order Placed',
  processing      : 'Processing',
  shipped         : 'Shipped',
  out_for_delivery: 'Out for Delivery',
  delivered       : 'Delivered',
  cancelled       : 'Cancelled',
  returned        : 'Returned',
};

const CANCELLATION_REASONS = [
  'Ordered by mistake',
  'Found a better price elsewhere',
  'Delayed delivery / Takes too long',
  'Need to change shipping address',
  'Need to change payment method',
  'Changed my mind / No longer needed',
  'Other',
];
// ─── GET /orders ──────────────────────────────────────────────────────────────
export const listOrders = async (req, res) => {
  try {
    const userId = req.user._id;
    const search = (req.query.search || '').trim();
    const status = req.query.status || 'all';
    const page   = Math.max(1, parseInt(req.query.page) || 1);

    // Build query
    const query = { user_id: userId };
    const andConditions = [];

    if (status !== 'all') {
      if (status === 'placed') {
        andConditions.push({
          $or: [
            { 'items.item_status': 'placed' },
            { 'items.item_status': { $exists: false } }
          ]
        });
      } else {
        andConditions.push({ 'items.item_status': status });
      }
    }

    if (search) {
      // Automatically remove '#' if the user pasted it
      const cleanSearch = search.replace(/^#/, '').trim();
      // Search by order number or product name snapshot
      andConditions.push({
        $or: [
          { order_number: { $regex: cleanSearch, $options: 'i' } },
          { 'items.product_name': { $regex: cleanSearch, $options: 'i' } },
        ]
      });
    }
    
    if (andConditions.length > 0) {
      query.$and = andConditions;
    }

    const total    = await Order.countDocuments(query);
    const totalPages = Math.ceil(total / PER_PAGE) || 1;
    const safePage  = Math.min(page, totalPages);
  
    const ordersRaw = await Order.find(query)
  //  .collation({ locale: 'en', strength: 2 })
   .sort({placed_at:-1})  
      .skip((safePage - 1) * PER_PAGE)
      .limit(PER_PAGE)
      .populate('items.product_id', 'images')   // get images for old orders
      .lean();

    // Shape for the view
    const orders = ordersRaw.map(o => {
      // Filter items to only show those that match the selected status tab
      const relevantItems = (o.items || []).filter(i => {
        let iStatus = i.item_status || 'placed';
        // Fallback for legacy returns: if order is returned, treat active items as returned
        if (o.order_status === 'returned' && iStatus !== 'cancelled') iStatus = 'returned';
        return status === 'all' || iStatus === status;
      });

      const items = relevantItems.map(i => {
        const p = i.product_id || {};
        let iStatus = i.item_status || 'placed';
        if (o.order_status === 'returned' && iStatus !== 'cancelled') iStatus = 'returned';
        return {
          _id: i._id,
          name: i.product_name || p.name || 'Product',
          size: i.size || '',
          image: i.image || (p.images && p.images[0]) || '',
          status: iStatus,
          status_label: STATUS_LABEL[iStatus] || iStatus,
          price: toNum(i.price_at_purchase),
          qty: i.quantity,
        };
      });

      // Compute an order-level display status
      const allStatuses = (o.items || []).map(i => {
        let s = i.item_status || 'placed';
        if (o.order_status === 'returned' && s !== 'cancelled') s = 'returned';
        return s;
      });
      const distinctStatuses = [...new Set(allStatuses)];
      const isMixed = distinctStatuses.length > 1;
      // Priority order for the display badge when statuses differ
      const STATUS_PRIORITY = ['delivered', 'shipped', 'out_for_delivery', 'processing', 'placed', 'returned', 'cancelled'];
      const displayStatusRaw = isMixed
        ? (STATUS_PRIORITY.find(s => allStatuses.includes(s)) || allStatuses[0])
        : allStatuses[0] || 'placed';

      return {
        _id          : o._id,
        order_number : o.order_number,
        placed_at    : o.placed_at,
        total_amount : toNum(o.total_amount),
        items        : items,
        display_status      : displayStatusRaw,
        display_status_label: STATUS_LABEL[displayStatusRaw] || displayStatusRaw,
        isMixed,
        mixed_summary: isMixed
          ? distinctStatuses.map(s => ({ status: s, label: STATUS_LABEL[s] || s, count: allStatuses.filter(x => x === s).length }))
          : null,
      };
    });

    // Remove orders that have empty items after filtering (just in case)
    const finalOrders = orders.filter(o => o.items.length > 0);

    res.render('user/orders/order-list', {
      user        : req.user,
      orders      : finalOrders,
      search,
      activeStatus: status,
      currentPage : safePage,
      totalPages,
      totalOrders : total,
      statusLabel : STATUS_LABEL,
    });
  } catch (err) {
    console.error('listOrders error:', err);
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).render('user/error', { message: 'Could not load orders.' });
  }
};

// ─── GET /orders/:id ──────────────────────────────────────────────────────────
export const getOrderDetail = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id     : req.params.id,
      user_id : req.user._id,
    })
      .populate('items.product_id', 'images slug')  // needed for old orders without snapshot image
      .lean();

    if (!order) return res.redirect('/orders');

    const addr = order.shipping_address || {};

    let rawItems = order.items || [];
    if (req.query.itemId) {
      rawItems = rawItems.filter(i => i._id.toString() === req.query.itemId);
    }

    const allReturns = await Return.find({ order_id: order._id }).lean();
    const returnMap = {};
    allReturns.forEach(r => {
      if (!r.order_item_id) {
        returnMap['ALL'] = r.status;
      } else {
        returnMap[r.order_item_id.toString()] = r.status;
      }
    });

    const items = rawItems.map(i => {
      // Resolve image: snapshot (new orders) → populated product (old orders)
      const productDoc = i.product_id || {};
      const image = i.image
        || (productDoc.images && productDoc.images[0])
        || '';
      let iStatus = i.item_status || 'placed';
      const itemRet = returnMap[i._id.toString()] || returnMap['ALL'];
      if (itemRet === 'approved' || itemRet === 'refunded') {
        iStatus = 'returned';
      }
      return {
        _id          : i._id,
        name         : i.product_name || 'Product',
        size         : i.size || '',
        image,
        quantity     : i.quantity,
        price        : toNum(i.price_at_purchase),
        total        : toNum(i.price_at_purchase) * i.quantity,
        item_status  : iStatus,
        status_label : STATUS_LABEL[iStatus] || iStatus,
        cancel_reason: i.cancel_reason || null,
        cancelled_at : i.cancelled_at || null,
        product_slug : productDoc.slug || null,
      };
    });

    // Compute order-level status and forward tracking milestone
    const allStatuses = items.map(i => i.item_status);
    const activeItems = items.filter(i => i.item_status !== 'cancelled' && i.item_status !== 'returned');
    const activeStatuses = activeItems.map(i => i.item_status);
    const distinctStatuses = [...new Set(allStatuses)];
    const isMixed = distinctStatuses.length > 1;

    // Tracking milestones: placed (0) -> processing (0) -> shipped (1) -> out_for_delivery (1) -> delivered (2)
    const FORWARD_STAGES = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
    let maxStageIdx = 0;
    if (activeStatuses.length > 0) {
      maxStageIdx = Math.max(...activeStatuses.map(s => FORWARD_STAGES.indexOf(s) !== -1 ? FORWARD_STAGES.indexOf(s) : 0));
    }
    const furthestStatus = FORWARD_STAGES[maxStageIdx] || 'placed';

    const stepMap = { placed: 0, processing: 0, shipped: 1, out_for_delivery: 1, delivered: 2 };
    let stepIndex = stepMap[furthestStatus] !== undefined ? stepMap[furthestStatus] : 0;

    let st = order.order_status || 'placed';
    if (items.length > 0 && items.every(i => i.item_status === 'cancelled')) {
      st = 'cancelled';
    } else if (items.length > 0 && items.every(i => i.item_status === 'returned')) {
      st = 'returned';
    } else if (req.query.itemId && items.length === 1) {
      st = items[0].item_status;
      stepIndex = stepMap[st] !== undefined ? stepMap[st] : 0;
    } else {
      st = furthestStatus;
    }

    // Whole order cancellation is only allowed if ALL active items are in placed/processing
    // (cannot cancel whole order if any item has already shipped or delivered)
    const canCancel = activeItems.length > 0 && activeItems.every(i => ['placed', 'processing'].includes(i.item_status));

    const mixedSummaryText = isMixed
      ? distinctStatuses.map(s => `${allStatuses.filter(x => x === s).length}× ${STATUS_LABEL[s] || s}`).join(' · ')
      : null;
    const allDelivered = activeItems.length > 0 && activeItems.every(i => i.item_status === 'delivered');

    // For the isolated view's timeline
    let isReturnRequested = false;
    let isReturnRejected = false;
    
    // Check if the current item (or whole order) is returned
    const currentReturnStatus = req.query.itemId ? (returnMap[req.query.itemId] || returnMap['ALL']) : returnMap['ALL'];
    
    if (currentReturnStatus) {
      isReturnRequested = currentReturnStatus === 'requested';
      isReturnRejected = currentReturnStatus === 'rejected';
      if (currentReturnStatus === 'approved' || currentReturnStatus === 'refunded') {
        st = 'returned'; 
      }
    }

    res.render('user/orders/order-detail', {
      user  : req.user,
      query : req.query,   // needed for flash banners (?cancelled=1, ?error=...)
      order : {
        _id          : order._id,
        orderId      : order.order_number,
        status       : st,
        status_label : STATUS_LABEL[st] || st,
        createdAt    : order.placed_at,
        paymentMethod: order.payment_method || 'Cash on Delivery',
        address: {
          fullName: addr.full_name    || '',
          line1   : addr.address_line1|| '',
          line2   : addr.address_line2|| '',
          city    : addr.city         || '',
          state   : addr.state        || '',
          pincode : addr.pincode      || '',
          phone   : addr.phone_number || '',
        },
        items,
        subtotal     : toNum(order.subtotal),
        discount     : toNum(order.discount_amount),
        tax          : toNum(order.tax_amount),
        isLegacyTaxAdded: (toNum(order.tax_amount) > 0) &&
          Math.abs(toNum(order.total_amount) - (toNum(order.subtotal) - toNum(order.discount_amount) + toNum(order.tax_amount) + toNum(order.shipping_fee))) < 1.0 &&
          Math.abs(toNum(order.total_amount) - (toNum(order.subtotal) - toNum(order.discount_amount) + toNum(order.shipping_fee))) > 0.5,
        shipping     : toNum(order.shipping_fee),
        total        : toNum(order.total_amount),
        coupon       : order.coupon_code || null,
        cancel_reason    : order.cancel_reason || null,
        return_reason    : order.return_reason || null,
        canCancel,
        canReturn: false, // deprecated global flag
        returnMap,
        isReturnRequested,
        isReturnRejected,
        stepIndex,
        isMixed,
        mixedSummaryText,
        display_status   : isMixed ? 'mixed' : st,
        furthestStatus,
        allDelivered,
        isCancelled      : st === 'cancelled',
        isReturned       : st === 'returned',
        cancellationReasons: CANCELLATION_REASONS,
      },
    });
  } catch (err) {
    console.error('getOrderDetail error:', err);
    res.redirect('/orders');
  }
};

// ─── POST /orders/:id/cancel ──────────────────────────────────────────────────
export const cancelOrder = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id     : req.params.id,
      user_id : req.user._id,
    });

    if (!order) return res.redirect('/orders');

    const itemId = req.query.itemId;
    const selectedReason = (req.body.cancel_reason || '').trim();
    const comment = (req.body.cancel_comment || '').trim();

    // 1. Mandatory Reason Validation
    if (!selectedReason) {
      return res.redirect(`/orders/${req.params.id}?error=reason_required${itemId ? '&itemId=' + itemId : ''}`);
    }

    let finalReason = selectedReason;
    if (selectedReason === 'Other') {
      if (!comment || comment.length < 5) {
        return res.redirect(`/orders/${req.params.id}?error=comment_required${itemId ? '&itemId=' + itemId : ''}`);
      }
      finalReason = `Other: ${comment}`;
    } else if (comment) {
      finalReason = `${selectedReason} (${comment})`;
    }

    const cancellable = ['placed', 'processing'];
    let itemsCancelledCount = 0;
    const cancelledItemsList = [];

    for (const item of order.items) {
      if (itemId && item._id.toString() !== itemId) continue;
      
      const itemStatus = item.item_status || 'placed';
      if (!cancellable.includes(itemStatus) && !cancellable.includes(order.order_status)) continue;

      // Restore stock
      await Variant.findByIdAndUpdate(item.variant_id, { $inc: { quantity: item.quantity } });
      await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: item.quantity } });
      
      item.item_status = 'cancelled';
      item.cancel_reason = finalReason;
      item.cancelled_at = new Date();
      itemsCancelledCount++;
      cancelledItemsList.push(item);
    }

    if (itemsCancelledCount === 0) {
      return res.redirect(`/orders/${req.params.id}?error=not_cancellable`);
    }

    // Calculate refund considering coupon discount proportionally
    const orderSubtotal = toNum(order.subtotal);
    const orderDiscount = toNum(order.discount_amount);
    const orderTotal = toNum(order.total_amount);
    const prevRefunded = toNum(order.refunded_amount);
    const maxRefundable = Math.max(0, orderTotal - prevRefunded);

    let totalRefundAmt = 0;
    for (const item of cancelledItemsList) {
      const itemTotal = toNum(item.price_at_purchase) * item.quantity;
      let effectiveItemAmt = itemTotal;
      if (orderSubtotal > 0 && orderDiscount > 0) {
        const itemDiscountShare = (itemTotal / orderSubtotal) * orderDiscount;
        effectiveItemAmt = Math.max(0, itemTotal - itemDiscountShare);
      }
      totalRefundAmt += effectiveItemAmt;
    }

    totalRefundAmt = Math.min(totalRefundAmt, maxRefundable);
    totalRefundAmt = Math.round(totalRefundAmt * 100) / 100;

    const isPrepaid = (order.payment_method === 'Wallet' || order.payment_method === 'Online Payment') && order.payment_status === 'paid';
    let refunded = false;
    if (isPrepaid && totalRefundAmt > 0) {
      await walletService.creditWallet({
        userId         : req.user._id,
        amount         : totalRefundAmt,
        category       : 'refund',
        description    : `Refund for cancelled item(s) in order #${order.order_number}`,
        relatedOrderId : order._id,
      });
      order.refunded_amount = prevRefunded + totalRefundAmt;
      refunded = true;
    }

    // Recalculate global order_status
    const activeItems = order.items.filter(i => i.item_status !== 'cancelled' && i.item_status !== 'returned');
    if (activeItems.length === 0) {
      const allReturned = order.items.length > 0 && order.items.every(i => i.item_status === 'returned');
      if (allReturned) {
        order.order_status = 'returned';
      } else {
        order.order_status = 'cancelled';
        order.cancel_reason = finalReason;
      }
      if (refunded) order.payment_status = 'refunded';
    } else {
      const statusWeights = { placed: 0, processing: 1, shipped: 2, out_for_delivery: 3, delivered: 4 };
      let minWeight = 99;
      let globalStatus = 'placed';
      activeItems.forEach(i => {
        const s = i.item_status || 'placed';
        if (statusWeights[s] < minWeight) {
          minWeight = statusWeights[s];
          globalStatus = s;
        }
      });
      order.order_status = globalStatus;
      if (!order.cancel_reason) {
        order.cancel_reason = finalReason;
      }
    }

    await order.save();
    res.redirect(`/orders/${req.params.id}?itemId=${itemId || ''}&cancelled=1${refunded ? '&refunded=1' : ''}`);
  } catch (err) {
    console.error('cancelOrder error:', err);
    res.redirect(`/orders/${req.params.id}?error=cancel_failed`);
  }
};

// ─── GET /orders/:id/return ──────────────────────────────────────────────
export const renderReturnForm = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id     : req.params.id,
      user_id : req.user._id,
    })
      .populate('items.product_id', 'images')
      .lean();

    if (!order || !req.query.itemId) return res.redirect('/orders');

    let rawItems = order.items || [];
    rawItems = rawItems.filter(i => i._id.toString() === req.query.itemId);

    if (rawItems.length === 0) {
      return res.redirect(`/orders/${req.params.id}`);
    }

    // If return already requested, redirect back to order detail
    const query = { order_id: order._id };
    if (req.query.itemId) query.order_item_id = req.query.itemId;
    const existingReturn = await Return.findOne(query).lean();
    if (existingReturn) {
      return res.redirect(`/orders/${req.params.id}`);
    }

    // Build item list with resolved images
    const items = rawItems.map(i => {
      const p = i.product_id || {};
      return {
        _id   : i._id,
        name  : i.product_name || 'Product',
        size  : i.size  || '',
        image : i.image || (p.images && p.images[0]) || '',
        price : toNum(i.price_at_purchase),
        qty   : i.quantity,
      };
    });

    res.render('user/orders/return-request', {
      user  : req.user,
      itemId: req.query.itemId || '',
      query : req.query,
      order : {
        _id      : order._id,
        orderId  : order.order_number,
        items,
        total    : items.reduce((sum, it) => sum + (it.price * it.qty), 0),
      },
    });
  } catch (err) {
    console.error('renderReturnForm error:', err);
    res.redirect('/orders');
  }
};

// ─── POST /orders/:id/return ──────────────────────────────────────────────
export const submitReturn = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id     : req.params.id,
      user_id : req.user._id,
    });

    if (!order) return res.redirect('/orders');

    const itemId = req.query.itemId;
    const query = { order_id: order._id };
    if (itemId) query.order_item_id = itemId;

    // Prevent duplicate return requests
    const existing = await Return.findOne(query);
    if (existing) {
      return res.redirect(`/orders/${req.params.id}`);
    }

    let refundAmount = 0;
    const orderSubtotal = toNum(order.subtotal);
    const orderDiscount = toNum(order.discount_amount);
    const orderTotal = toNum(order.total_amount);
    const prevRefunded = toNum(order.refunded_amount);
    const maxRefundable = Math.max(0, orderTotal - prevRefunded);

    if (itemId) {
      const targetItem = order.items.find(i => i._id.toString() === itemId);
      if (!targetItem) {
        return res.redirect(`/orders/${req.params.id}?error=invalid_item`);
      }
      const itemTotal = toNum(targetItem.price_at_purchase) * targetItem.quantity;
      let effectiveItemAmt = itemTotal;
      if (orderSubtotal > 0 && orderDiscount > 0) {
        const itemDiscountShare = (itemTotal / orderSubtotal) * orderDiscount;
        effectiveItemAmt = Math.max(0, itemTotal - itemDiscountShare);
      }
      refundAmount = Math.min(effectiveItemAmt, maxRefundable);
    } else {
      if (order.order_status !== 'delivered') {
        return res.redirect(`/orders/${req.params.id}`);
      }
      refundAmount = maxRefundable;
    }
    refundAmount = Math.round(refundAmount * 100) / 100;

    const reason   = (req.body.return_reason || '').trim();
    const comments = (req.body.comments || '').trim();

    // Reason is MANDATORY
    if (!reason) {
      return res.redirect(`/orders/${req.params.id}/return?itemId=${itemId || ''}&error=reason_required`);
    }

    // Comments MUST be text-only (letters and spaces)
    if (comments && !/^[A-Za-z\s]+$/.test(comments)) {
      return res.redirect(`/orders/${req.params.id}/return?itemId=${itemId || ''}&error=invalid_comments`);
    }

    // Generate return reference number
    const returnId = `RET-${Date.now().toString(36).toUpperCase()}`;
    const fullReason = comments ? `${reason} — ${comments}` : reason;

    // Create Return document
    await Return.create({
      order_id      : order._id,
      order_item_id : itemId || null,
      user_id       : req.user._id,
      return_id     : returnId,
      reason        : fullReason,
      status        : 'requested',
      refund_amount : refundAmount,
      refund_method : 'original_payment',
    });

    // Save the reason on the order for reference
    order.return_reason = fullReason;
    await order.save();

    res.redirect(`/orders/${req.params.id}?itemId=${itemId || ''}&returned=1`);
  } catch (err) {
    console.error('submitReturn error:', err);
    const itemId = req.query.itemId || '';
    res.redirect(`/orders/${req.params.id}/return?itemId=${itemId}&error=return_failed`);
  }
};

// ─── GET /orders/:id/invoice ─────────────────────────────────────────────────
export const downloadInvoice = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id     : req.params.id,
      user_id : req.user._id,
    })
      .populate('items.product_id', 'images')
      .lean();

    if (!order) return res.redirect('/orders');

    // PDFDocument imported at top
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // HTTP headers — triggers browser "Save As" dialog
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="Essence-Invoice-${order.order_number}.pdf"`
    );
    doc.pipe(res);

    // ── helpers ──────────────────────────────────────────────────────────────
    // NOTE: Helvetica does not include the Unicode Rupee glyph (U+20B9).
    // We use 'Rs.' as the prefix so the symbol always renders correctly in PDF.
    const inr = (n) =>
      'Rs. ' + Number(n || 0).toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });

    const fmt2 = (n) => Number(n || 0).toFixed(2);

    const addr    = order.shipping_address || {};
    const dateStr = order.placed_at
      ? new Date(order.placed_at).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '';

    // ── Determine intra-state vs inter-state ─────────────────────────────────
    // Store is registered in Kerala (KL). Compare with customer's state.
    const STORE_STATE = 'kerala';
    const custState   = (addr.state || '').toLowerCase().trim();
    const isIntraState = custState === STORE_STATE || custState === 'kl';

    const PAGE_W = doc.page.width  - 100; // usable width (margin 50 each side)
    const L = 50;                          // left margin

    // ── HEADER BAND ──────────────────────────────────────────────────────────
    doc.rect(L, 40, PAGE_W, 80).fill('#1C1A16');

    doc.fillColor('#F4F0E6')
       .font('Helvetica-Bold').fontSize(28)
       .text('ESSENCE', L + 20, 62);

    doc.font('Helvetica').fontSize(9)
       .text('LUXURY PERFUMES', L + 20, 95, { characterSpacing: 3 });

    // Invoice label top-right — anchor from L so it stays inside the header band
    const RIGHT_X = L + PAGE_W - 120;  // start x of right-side header block
    const RIGHT_W = 110;                // fixed width so text doesn't overflow

    doc.font('Helvetica').fontSize(9).fillColor('#B79461')
       .text('INVOICE', RIGHT_X, 62, { align: 'right', width: RIGHT_W, characterSpacing: 2 });

    doc.font('Helvetica-Bold').fontSize(11).fillColor('#F4F0E6')
       .text(order.order_number, RIGHT_X, 78, { align: 'right', width: RIGHT_W });

    doc.font('Helvetica').fontSize(9).fillColor('#A6A296')
       .text(dateStr, RIGHT_X, 95, { align: 'right', width: RIGHT_W });

    doc.fillColor('#1C1A16'); // reset text colour

    // ── SHIP TO / PAYMENT DETAILS ─────────────────────────────────────────────
    const INFO_Y = 150;
    doc.font('Helvetica').fontSize(7).fillColor('#6B675E')
       .text('SHIP TO', L, INFO_Y, { characterSpacing: 2 });

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1C1A16')
       .text(addr.full_name || '', L, INFO_Y + 14);

    const addrLines = [
      addr.address_line1,
      addr.address_line2,
      `${addr.city || ''}, ${addr.state || ''} ${addr.pincode || ''}`,
      addr.country || 'India',
    ].filter(Boolean);

    doc.font('Helvetica').fontSize(9).fillColor('#3d3b36');
    addrLines.forEach((line) => {
      doc.text(line, L, doc.y + 2);
    });

    // Payment details column (right)
    doc.font('Helvetica').fontSize(7).fillColor('#6B675E')
       .text('PAYMENT DETAILS', PAGE_W / 2 + L, INFO_Y, { characterSpacing: 2 });

    doc.font('Helvetica-Bold').fontSize(10).fillColor('#1C1A16')
       .text(order.payment_method || 'Cash on Delivery', PAGE_W / 2 + L, INFO_Y + 14);

    doc.font('Helvetica').fontSize(9).fillColor('#3d3b36')
       .text(`Status: ${order.payment_status || 'pending'}`, PAGE_W / 2 + L, INFO_Y + 28);

    // ── DIVIDER ───────────────────────────────────────────────────────────────
    const TABLE_Y = INFO_Y + 100;
    doc.moveTo(L, TABLE_Y).lineTo(L + PAGE_W, TABLE_Y)
       .strokeColor('#E0DDD8').lineWidth(1).stroke();

    // ── ITEMS TABLE HEADER ────────────────────────────────────────────────────
    // Columns: Item | Qty | Rate (excl. GST) | Taxable value | GST (18%) | Total
    const COL = {
      desc    : L,            // 50,  width: 155
      descW   : 150,
      qty     : L + 160,      // 210, width: 25 (center)
      qtyW    : 25,
      rate    : L + 190,      // 240, width: 75 (right)
      rateW   : 75,
      taxable : L + 270,      // 320, width: 75 (right)
      taxableW: 75,
      gst     : L + 350,      // 400, width: 65 (right)
      gstW    : 65,
      total   : L + 420,      // 470, width: 75 (right, ends at L + PAGE_W = 545)
      totalW  : (L + PAGE_W) - (L + 420),
    };

    doc.font('Helvetica').fontSize(6.8).fillColor('#6B675E');
    doc.text('ITEM',                 COL.desc,    TABLE_Y + 10, { width: COL.descW,    align: 'left',   characterSpacing: 0.8 });
    doc.text('QTY',                  COL.qty,     TABLE_Y + 10, { width: COL.qtyW,     align: 'center', characterSpacing: 0.8 });
    doc.text('RATE (EXCL. GST)',     COL.rate,    TABLE_Y + 10, { width: COL.rateW,    align: 'right',  characterSpacing: 0.5 });
    doc.text('TAXABLE VALUE',        COL.taxable, TABLE_Y + 10, { width: COL.taxableW, align: 'right',  characterSpacing: 0.5 });
    doc.text('GST (18%)',            COL.gst,     TABLE_Y + 10, { width: COL.gstW,     align: 'right',  characterSpacing: 0.5 });
    doc.text('TOTAL',                COL.total,   TABLE_Y + 10, { width: COL.totalW,   align: 'right',  characterSpacing: 0.8 });

    doc.moveTo(L, TABLE_Y + 25).lineTo(L + PAGE_W, TABLE_Y + 25)
       .strokeColor('#E0DDD8').stroke();

    // ── Shared order-level values ─────────────────────────────────────────────
    const savedInvTax      = toNum(order.tax_amount)      || 0;
    const savedInvTotal    = toNum(order.total_amount)    || 0;
    const savedInvSubtotal = toNum(order.subtotal)        || 0;
    const savedInvDiscount = toNum(order.discount_amount) || 0;
    const savedInvShipping = toNum(order.shipping_fee)    || 0;

    // Legacy detection: if tax was added on top of subtotal (old pricing model)
    const isLegacyTaxAdded = (savedInvTax > 0) &&
      Math.abs(savedInvTotal - (savedInvSubtotal - savedInvDiscount + savedInvTax + savedInvShipping)) < 1.0 &&
      Math.abs(savedInvTotal - (savedInvSubtotal - savedInvDiscount + savedInvShipping)) > 0.5;

    const EXCLUDED_STATUSES = ['cancelled', 'cancel_requested', 'returned'];
    const allOrderItems     = order.items || [];

    const totalRefundedOnInvoice = toNum(order.refunded_amount) || 0;

    // ── TABLE ROWS ────────────────────────────────────────────────────────────
    let rowY = TABLE_Y + 35;

    allOrderItems.forEach((item) => {
      const name        = item.product_name || 'Product';
      const size        = item.size || '';
      const qty         = item.quantity || 1;
      const priceIncl   = toNum(item.price_at_purchase);   // per-unit incl. GST
      const lineAmt     = priceIncl * qty;                 // line total incl. GST
      const gstRate     = item.gst_rate !== undefined ? item.gst_rate : 18;
      const itemSt      = (item.item_status || 'placed').toLowerCase();
      const isExcluded  = EXCLUDED_STATUSES.includes(itemSt);
      const statusLabel = itemSt === 'returned' ? 'RETURNED'
                        : itemSt === 'cancel_requested' ? 'CANCEL REQ.'
                        : 'CANCELLED';

      // Rate excluding GST (per unit)
      const rateExcl = (item.taxable_amount && toNum(item.taxable_amount) > 0)
        ? toNum(item.taxable_amount)
        : (priceIncl > 0 ? (priceIncl / (1 + gstRate / 100)) : 0);

      // Taxable value for line (qty * rateExcl)
      const lineTaxable = rateExcl * qty;

      // GST amount for line
      const lineGst = (item.gst_amount && toNum(item.gst_amount) > 0)
        ? (toNum(item.gst_amount) * qty)
        : Math.max(0, lineAmt - lineTaxable);

      // Total for line (incl. GST)
      const lineTotal = lineAmt;

      const textColor = isExcluded ? '#A6A296' : '#1C1A16';
      const subColor  = isExcluded ? '#C4C0B8' : '#6B675E';
      const valColor  = isExcluded ? '#A6A296' : '#3d3b36';

      // Description cell: Name and size
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(textColor)
         .text(name, COL.desc, rowY, { width: COL.descW });

      if (size) {
        doc.font('Helvetica').fontSize(7.5).fillColor(subColor)
           .text('Size: ' + size, COL.desc, doc.y + 2, { width: COL.descW });
      }

      if (isExcluded) {
        doc.font('Helvetica').fontSize(7).fillColor('#B0400A')
           .text('[' + statusLabel + ']', COL.desc, doc.y + 2);
      }

      const descBottomY = doc.y;

      // 1. Qty
      doc.font('Helvetica').fontSize(8.5).fillColor(textColor)
         .text(String(qty).padStart(2, '0'), COL.qty, rowY, { width: COL.qtyW, align: 'center' });

      // 2. Rate (excl. GST)
      doc.font('Helvetica').fontSize(8.5).fillColor(valColor)
         .text(inr(rateExcl), COL.rate, rowY, { width: COL.rateW, align: 'right' });

      // 3. Taxable value
      doc.font('Helvetica').fontSize(8.5).fillColor(valColor)
         .text(inr(lineTaxable), COL.taxable, rowY, { width: COL.taxableW, align: 'right' });

      // 4. GST (18%)
      doc.font('Helvetica').fontSize(8.5).fillColor(valColor)
         .text(inr(lineGst), COL.gst, rowY, { width: COL.gstW, align: 'right' });

      // 5. Total
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor(isExcluded ? '#A6A296' : '#1C1A16')
         .text(inr(lineTotal), COL.total, rowY, { width: COL.totalW, align: 'right' });

      rowY = Math.max(descBottomY, rowY + 20) + 12;

      // Light row separator
      doc.moveTo(L, rowY - 6).lineTo(L + PAGE_W, rowY - 6)
         .strokeColor('#F2F2EF').lineWidth(0.5).stroke();
    });

    // ── Categorise items for totals ───────────────────────────────────────────
    const CANCEL_STATUSES = ['cancelled', 'cancel_requested'];
    const billedItems = allOrderItems.filter(
      (it) => !CANCEL_STATUSES.includes((it.item_status || '').toLowerCase())
    );
    const cancelledItems = allOrderItems.filter(
      (it) => CANCEL_STATUSES.includes((it.item_status || '').toLowerCase())
    );

    const isCOD = !['Wallet', 'Online Payment'].includes(order.payment_method || '');
    const cancelledItemsTotal = cancelledItems.reduce(
      (sum, it) => sum + toNum(it.price_at_purchase) * (it.quantity || 1), 0
    );

    const billedSubtotal = billedItems.reduce(
      (sum, it) => sum + toNum(it.price_at_purchase) * (it.quantity || 1), 0
    );
    const fullSubtotal = allOrderItems.reduce(
      (sum, it) => sum + toNum(it.price_at_purchase) * (it.quantity || 1), 0
    );

    const savedDiscount   = toNum(order.discount_amount) || 0;
    const savedTax        = toNum(order.tax_amount)      || 0;
    const savedShipping   = toNum(order.shipping_fee)    || 0;
    const allSubtotal     = toNum(order.subtotal) || fullSubtotal;
    const appliedDiscount = savedDiscount;
    const originalTotal   = savedInvTotal;
    const refundedAmt     = totalRefundedOnInvoice;
    const codCancelDeduction = isCOD ? cancelledItemsTotal : 0;
    const netPayable = Math.max(0, parseFloat((originalTotal - codCancelDeduction - refundedAmt).toFixed(2)));

    // ── Compute GST totals (on billed items only) ─────────────────────────────
    let totalGstAmt, totalTaxableAmt;

    if (isLegacyTaxAdded) {
      // Legacy: GST was added on top — taxable = subtotal before GST
      totalTaxableAmt = billedSubtotal - appliedDiscount;
      totalGstAmt     = savedTax;
    } else {
      // Inclusive model: back-calculate taxable value from inclusive prices
      const billedTaxable = billedItems.reduce((sum, it) => {
        const r   = it.gst_rate !== undefined ? it.gst_rate : 18;
        const tot = toNum(it.price_at_purchase) * (it.quantity || 1);
        const taxVal = it.taxable_amount && toNum(it.taxable_amount) > 0
          ? toNum(it.taxable_amount) * (it.quantity || 1)
          : (tot > 0 ? (tot / (1 + r / 100)) : 0);
        return sum + taxVal;
      }, 0);
      // Apply discount proportionally if present
      const billedInclTotal = billedSubtotal - appliedDiscount;
      // Effective taxable = billedInclTotal ÷ (1 + avgGstRate)
      // Approximate using weighted taxable
      const discountRatio   = billedSubtotal > 0 ? (1 - appliedDiscount / billedSubtotal) : 1;
      totalTaxableAmt = billedTaxable * discountRatio;
      totalGstAmt     = billedInclTotal - totalTaxableAmt;
    }

    const cgstAmt = totalGstAmt / 2;
    const sgstAmt = totalGstAmt / 2;
    const igstAmt = totalGstAmt;

    // ── SUMMARY BLOCK (bottom-right) ──────────────────────────────────────────
    rowY += 10;
    doc.moveTo(L, rowY).lineTo(L + PAGE_W, rowY).strokeColor('#E0DDD8').lineWidth(1).stroke();
    rowY += 14;

    const TOT_X = L + PAGE_W - 220;
    const TOT_W = 220;
    const VAL_X = L + PAGE_W - 110;
    const VAL_W = 110;

    // Helper: render one summary row
    const summaryRow = (label, value, bold = false) => {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8).fillColor('#6B675E')
         .text(label, TOT_X, rowY);
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica-Bold').fontSize(8).fillColor('#1C1A16')
         .text(value, VAL_X, rowY, { width: VAL_W, align: 'right' });
      rowY += 15;
    };

    // Subtotal row
    summaryRow('SUBTOTAL', inr(allSubtotal));

    // Coupon discount
    if (appliedDiscount > 0) {
      summaryRow('COUPON DISCOUNT', '- ' + inr(appliedDiscount));
    }

    // Cancelled items deduction (COD only)
    if (codCancelDeduction > 0) {
      summaryRow('CANCELLED ITEM(S)', '- ' + inr(codCancelDeduction));
    }

    // Shipping
    summaryRow('SHIPPING', savedShipping === 0 ? 'FREE' : inr(savedShipping));

    // Refund row
    if (refundedAmt > 0) {
      summaryRow('AMOUNT REFUNDED', '- ' + inr(refundedAmt));
    }

    // Muted GST note between shipping and total
    const gstNoteText = `(Includes total GST of Rs. ${fmt2(totalGstAmt)})`;
    doc.font('Helvetica').fontSize(7).fillColor('#A6A296')
       .text(gstNoteText, TOT_X, rowY, { width: TOT_W, align: 'right' });
    rowY += 14;

    // Total payable band
    rowY += 4;
    doc.rect(TOT_X - 10, rowY, TOT_W + 10, 38).fill('#1C1A16');
    const totalBandLabel = netPayable === 0 ? 'NET PAYABLE (FULLY SETTLED)' : 'TOTAL PAYABLE';
    doc.font('Helvetica').fontSize(8).fillColor('#A6A296')
       .text(totalBandLabel, TOT_X, rowY + 8, { characterSpacing: 1.5 });
    doc.font('Helvetica-Bold').fontSize(13).fillColor('#F4F0E6')
       .text(inr(netPayable), VAL_X, rowY + 10, { width: VAL_W, align: 'right' });

    // ── LEGAL TAX BREAKDOWN TABLE ─────────────────────────────────────────────
    rowY += 55;
    doc.moveTo(L, rowY).lineTo(L + PAGE_W, rowY).strokeColor('#E0DDD8').lineWidth(0.8).stroke();
    rowY += 10;

    doc.font('Helvetica').fontSize(7).fillColor('#6B675E')
       .text('TAX BREAKDOWN (FOR COMPLIANCE)', L, rowY, { characterSpacing: 1.5 });
    rowY += 12;

    // Tax breakdown table background
    doc.rect(L, rowY, PAGE_W, 20).fill('#F8F7F5');

    if (isIntraState) {
      // Intra-State: CGST + SGST
      const taxW = PAGE_W / 6;
      const cols = [L, L + taxW, L + taxW * 2, L + taxW * 3, L + taxW * 4, L + taxW * 5];
      const headers = ['TAXABLE VALUE', 'CGST RATE %', 'CGST AMT', 'SGST RATE %', 'SGST AMT', 'TOTAL TAX'];

      headers.forEach((h, i) => {
        doc.font('Helvetica').fontSize(6.5).fillColor('#6B675E')
           .text(h, cols[i] + 2, rowY + 6, { width: taxW - 4, align: i > 0 ? 'right' : 'left', characterSpacing: 0.5 });
      });

      rowY += 20;
      doc.rect(L, rowY, PAGE_W, 18).fill('#FFFFFF');

      const halfGst = 9; // CGST 9% + SGST 9% = 18%
      const values = [
        inr(totalTaxableAmt),
        halfGst.toFixed(1) + '%',
        inr(cgstAmt),
        halfGst.toFixed(1) + '%',
        inr(sgstAmt),
        inr(totalGstAmt),
      ];
      values.forEach((v, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1C1A16')
           .text(v, cols[i] + 2, rowY + 5, { width: taxW - 4, align: i > 0 ? 'right' : 'left' });
      });
    } else {
      // Inter-State: IGST
      const taxW = PAGE_W / 4;
      const cols = [L, L + taxW, L + taxW * 2, L + taxW * 3];
      const headers = ['TAXABLE VALUE', 'IGST RATE %', 'IGST AMT', 'TOTAL TAX'];

      headers.forEach((h, i) => {
        doc.font('Helvetica').fontSize(6.5).fillColor('#6B675E')
           .text(h, cols[i] + 2, rowY + 6, { width: taxW - 4, align: i > 0 ? 'right' : 'left', characterSpacing: 0.5 });
      });

      rowY += 20;
      doc.rect(L, rowY, PAGE_W, 18).fill('#FFFFFF');

      const igstRate = 18; // flat 18% IGST for inter-state
      const values = [
        inr(totalTaxableAmt),
        igstRate.toFixed(1) + '%',
        inr(igstAmt),
        inr(igstAmt),
      ];
      values.forEach((v, i) => {
        doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#1C1A16')
           .text(v, cols[i] + 2, rowY + 5, { width: taxW - 4, align: i > 0 ? 'right' : 'left' });
      });
    }

    rowY += 18;
    doc.moveTo(L, rowY).lineTo(L + PAGE_W, rowY).strokeColor('#E0DDD8').lineWidth(0.5).stroke();

    // Tax type label (intra / inter state)
    rowY += 6;
    const taxTypeLabel = isIntraState
      ? 'Intra-State Supply  ·  CGST 9% + SGST 9%'
      : 'Inter-State Supply  ·  IGST 18%';
    doc.font('Helvetica').fontSize(7).fillColor('#A6A296')
       .text(taxTypeLabel, L, rowY, { align: 'center', width: PAGE_W });

    // ── FOOTER ────────────────────────────────────────────────────────────────
    rowY += 22;
    doc.moveTo(L, rowY).lineTo(L + PAGE_W, rowY).strokeColor('#E0DDD8').lineWidth(1).stroke();
    rowY += 14;
    doc.font('Helvetica').fontSize(8).fillColor('#6B675E')
       .text('Thank you for shopping with Essence Luxury Perfumes.', L, rowY, {
         align: 'center', width: PAGE_W,
       });

    doc.font('Helvetica').fontSize(7).fillColor('#A6A296')
       .text('support@essence.com  |  www.essence.com', L, rowY + 14, {
         align: 'center', width: PAGE_W,
       });

    doc.end();
  } catch (err) {
    console.error('downloadInvoice error:', err);
    res.redirect(`/orders/${req.params.id}`);
  }
};

export default {
  listOrders,
  getOrderDetail,
  cancelOrder,
  renderReturnForm,
  submitReturn,
  downloadInvoice
};
