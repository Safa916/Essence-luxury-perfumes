const Order   = require('../../models/order');
const Product = require('../../models/product');
const Variant = require('../../models/variant');
const Return  = require('../../models/Return');
const walletService = require('../../services/walletService');
const User = require('../../models/User');

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
exports.listOrders = async (req, res) => {
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

      return {
        _id          : o._id,
        order_number : o.order_number,
        placed_at    : o.placed_at,
        total_amount : toNum(o.total_amount),
        items        : items,
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
    res.status(500).render('user/error', { message: 'Could not load orders.' });
  }
};

// ─── GET /orders/:id ──────────────────────────────────────────────────────────
exports.getOrderDetail = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id     : req.params.id,
      user_id : req.user._id,
    })
      .populate('items.product_id', 'images')  // needed for old orders without snapshot image
      .lean();

    if (!order) return res.redirect('/orders');

    let st = order.order_status || 'placed';
    const addr = order.shipping_address || {};

    let rawItems = order.items || [];
    if (req.query.itemId) {
      rawItems = rawItems.filter(i => i._id.toString() === req.query.itemId);
    }

    const items = rawItems.map(i => {
      // Resolve image: snapshot (new orders) → populated product (old orders)
      const productDoc = i.product_id || {};
      const image = i.image
        || (productDoc.images && productDoc.images[0])
        || '';
      return {
        _id      : i._id,
        name     : i.product_name || 'Product',
        size     : i.size || '',
        image,
        quantity : i.quantity,
        price    : toNum(i.price_at_purchase),
        total    : toNum(i.price_at_purchase) * i.quantity,
        item_status: i.item_status || 'placed',
        cancel_reason: i.cancel_reason || null,
        cancelled_at: i.cancelled_at || null,
      };
    });

    // If viewing an isolated item, use its specific status for the page timeline/badges
    if (req.query.itemId && items.length === 1) {
      st = items[0].item_status;
    }

    const canCancel = ['placed', 'processing'].includes(st);

    const allReturns = await Return.find({ order_id: order._id }).lean();
    const returnMap = {};
    allReturns.forEach(r => {
      if (!r.order_item_id) {
        returnMap['ALL'] = r.status;
      } else {
        returnMap[r.order_item_id.toString()] = r.status;
      }
    });
    
    // For the isolated view's timeline
    let isReturnRequested = false;
    let isReturnRejected = false;
    
    // Check if the current item (or whole order) is returned
    const currentReturnStatus = req.query.itemId ? (returnMap[req.query.itemId] || returnMap['ALL']) : returnMap['ALL'];
    
    if (currentReturnStatus) {
      isReturnRequested = currentReturnStatus === 'requested';
      isReturnRejected = currentReturnStatus === 'rejected';
      // Fallback for legacy returns: if return is approved/refunded but item_status wasn't updated
      if (currentReturnStatus === 'approved' || currentReturnStatus === 'refunded') {
        st = 'returned'; 
      }
    }

    const stepMap   = { placed: 0, processing: 0, shipped: 1, out_for_delivery: 1, delivered: 2 };
    const stepIndex = stepMap[st] !== undefined ? stepMap[st] : 0;

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
exports.cancelOrder = async (req, res) => {
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
    let totalRefundAmt = 0;
    let itemsCancelledCount = 0;

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
      totalRefundAmt += parseFloat(item.price_at_purchase.toString()) * item.quantity;
    }

    if (itemsCancelledCount === 0) {
      return res.redirect(`/orders/${req.params.id}?error=not_cancellable`);
    }

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
      refunded = true;
    }

    // Recalculate global order_status
    const activeItems = order.items.filter(i => i.item_status !== 'cancelled' && i.item_status !== 'returned');
    if (activeItems.length === 0) {
      order.order_status = 'cancelled';
      order.cancel_reason = finalReason;
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
exports.renderReturnForm = async (req, res) => {
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
exports.submitReturn = async (req, res) => {
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
    if (itemId) {
      const targetItem = order.items.find(i => i._id.toString() === itemId);
      if (!targetItem) {
        return res.redirect(`/orders/${req.params.id}?error=invalid_item`);
      }
      refundAmount = parseFloat(targetItem.price_at_purchase.toString()) * targetItem.quantity;
    } else {
      if (order.order_status !== 'delivered') {
        return res.redirect(`/orders/${req.params.id}`);
      }
      refundAmount = parseFloat(order.total_amount.toString());
    }

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
exports.downloadInvoice = async (req, res) => {
  try {
    const order = await Order.findOne({
      _id     : req.params.id,
      user_id : req.user._id,
    })
      .populate('items.product_id', 'images')
      .lean();

    if (!order) return res.redirect('/orders');

    const PDFDocument = require('pdfkit');
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

    const addr = order.shipping_address || {};
    const dateStr = order.placed_at
      ? new Date(order.placed_at).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '';

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

    // ── TABLE HEADER ──────────────────────────────────────────────────────────
    // Column x-positions — keep PRICE column within the page right edge (L + PAGE_W)
    const PRICE_W   = 90;                        // fixed width for price values
    const COL = {
      item  : L,
      desc  : L + 30,
      qty   : L + PAGE_W - 160,
      price : L + PAGE_W - PRICE_W,             // right-most column, fits inside page
      priceW: PRICE_W,
    };

    doc.font('Helvetica').fontSize(7).fillColor('#6B675E');
    ['ITEM', 'DESCRIPTION', 'QTY', 'PRICE'].forEach((h, i) => {
      const x = [COL.item, COL.desc, COL.qty, COL.price][i];
      doc.text(h, x, TABLE_Y + 10, { characterSpacing: 1.5 });
    });

    doc.moveTo(L, TABLE_Y + 25).lineTo(L + PAGE_W, TABLE_Y + 25)
       .strokeColor('#E0DDD8').stroke();

    // ── TABLE ROWS — only non-cancelled items ────────────────────────────────
    let rowY = TABLE_Y + 35;
    // Exclude items that were cancelled by the user
    const CANCELLED_STATUSES = ['cancelled', 'cancel_requested'];
    const activeItems = (order.items || []).filter(
      (it) => !CANCELLED_STATUSES.includes((it.item_status || '').toLowerCase())
    );

    activeItems.forEach((item) => {
      const name  = item.product_name || 'Product';
      const size  = item.size || '';
      const qty   = item.quantity || 1;
      const price = toNum(item.price_at_purchase);
      const total = price * qty;

      // Item number dot
      doc.circle(COL.item + 4, rowY + 5, 4).fill('#E7E7E2');

      doc.font('Helvetica-Bold').fontSize(9).fillColor('#1C1A16')
         .text(name, COL.desc, rowY, { width: COL.qty - COL.desc - 10 });

      if (size) {
        doc.font('Helvetica').fontSize(8).fillColor('#6B675E')
           .text(`Size: ${size}`, COL.desc, doc.y + 2);
      }

      doc.font('Helvetica').fontSize(9).fillColor('#1C1A16')
         .text(String(qty).padStart(2, '0'), COL.qty, rowY);

      doc.font('Helvetica-Bold').fontSize(9)
         .text(inr(total), COL.price, rowY, { width: COL.priceW, align: 'right' });

      rowY = Math.max(doc.y, rowY) + 20;

      // Light row separator
      doc.moveTo(L, rowY - 8).lineTo(L + PAGE_W, rowY - 8)
         .strokeColor('#F2F2EF').lineWidth(0.5).stroke();
    });

    // ── TOTALS — recalculated from active (non-cancelled) items ──────────────
    const TOT_X = COL.qty;
    const TOT_W = L + PAGE_W - TOT_X;

    // Recalculate from active items so cancelled items don't inflate totals
    const GST_RATE          = 0.18;
    const FREE_SHIPPING_AT  = 2000;
    const SHIPPING_FEE      = 99;

    const activeSubtotal = activeItems.reduce(
      (sum, it) => sum + toNum(it.price_at_purchase) * (it.quantity || 1), 0
    );
    const savedDiscount  = toNum(order.discount_amount) || 0;
    // Pro-rate the coupon discount if some items were cancelled
    const allSubtotal    = toNum(order.subtotal) || activeSubtotal;
    const discountRatio  = allSubtotal > 0 ? activeSubtotal / allSubtotal : 1;
    const appliedDiscount = parseFloat((savedDiscount * discountRatio).toFixed(2));

    const taxable        = Math.max(activeSubtotal - appliedDiscount, 0);
    const activeTax      = parseFloat((taxable * GST_RATE).toFixed(2));
    const activeShipping = taxable >= FREE_SHIPPING_AT ? 0 : SHIPPING_FEE;
    const activeTotal    = parseFloat((taxable + activeTax + activeShipping).toFixed(2));

    rowY += 10;
    doc.moveTo(L, rowY).lineTo(L + PAGE_W, rowY).strokeColor('#E0DDD8').lineWidth(1).stroke();

    const totals = [
      ['SUBTOTAL',     activeSubtotal],
      ['SHIPPING',     activeShipping === 0 ? null : activeShipping],
      ['TAX (GST 18%)', activeTax],
    ];

    if (appliedDiscount > 0) {
      totals.push(['DISCOUNT', -appliedDiscount]);
    }

    rowY += 12;
    totals.forEach(([label, val]) => {
      if (val === null) {
        doc.font('Helvetica').fontSize(8).fillColor('#6B675E')
           .text(label, TOT_X, rowY);
        doc.font('Helvetica').fontSize(8).fillColor('#1C1A16')
           .text('FREE', COL.price, rowY, { width: COL.priceW, align: 'right' });
      } else {
        doc.font('Helvetica').fontSize(8).fillColor('#6B675E')
           .text(label, TOT_X, rowY);
        doc.font('Helvetica').fontSize(8).fillColor('#1C1A16')
           .text(inr(Math.abs(val)), COL.price, rowY, { width: COL.priceW, align: 'right' });
      }
      rowY += 16;
    });

    // Total band
    rowY += 4;
    doc.rect(TOT_X - 10, rowY, TOT_W + 10, 40).fill('#1C1A16');
    doc.font('Helvetica').fontSize(8).fillColor('#A6A296')
       .text('TOTAL AMOUNT', TOT_X, rowY + 8, { characterSpacing: 1.5 });
    doc.font('Helvetica-Bold').fontSize(14).fillColor('#F4F0E6')
       .text(inr(activeTotal), COL.price, rowY + 10, { width: COL.priceW, align: 'right' });

    // ── FOOTER ────────────────────────────────────────────────────────────────
    rowY += 70;
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
