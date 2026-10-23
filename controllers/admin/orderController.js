const Order = require('../../models/order');
const User  = require('../../models/user');
const Product = require('../../models/product');
const Variant = require('../../models/variant');
const walletService = require('../../services/walletService');
const mongoose = require('mongoose');

const PER_PAGE = 10;

function toNum(d) {
  if (d == null) return 0;
  return parseFloat(d.toString());
}





// ─── GET /admin/orders ────────────────────────────────────────────────────────
exports.listOrders = async (req, res) => {
  try {
    const { status = 'all', search = '', range = '30', page = 1 } = req.query;
    const currentPage = Math.max(1, parseInt(page) || 1);

    // Date range filter
    const dateFilter = {};
    if (range !== 'all') {
      const days = parseInt(range) || 30;
      dateFilter.placed_at = { $gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) };
    }
    // Status filter
    const statusFilter = (status && status !== 'all') ? { 'items.item_status': status } : {};

    // Search: by order_number or customer name (join via user)
    let searchFilter = {};
    if (search) {
      // Try to find matching user IDs for the search name
      const matchingUsers = await User.find({
        $or: [
          { full_name: { $regex: search, $options: 'i' } },
          { email:     { $regex: search, $options: 'i' } },
        ],
      }).select('_id').lean();

      const userIds = matchingUsers.map(u => u._id);
      searchFilter = {
        $or: [
          { order_number: { $regex: search, $options: 'i' } },
          ...(userIds.length ? [{ user_id: { $in: userIds } }] : []),
        ],
      };
    }

    const filter = { ...dateFilter, ...statusFilter, ...searchFilter };

    const [orders, total] = await Promise.all([
      Order.find(filter)
        .sort({ placed_at: -1 })
        .skip((currentPage - 1) * PER_PAGE)
        .limit(PER_PAGE)
        .populate('user_id', 'full_name email')
        .populate('items.product_id', 'images')
        .lean(),
      Order.countDocuments(filter),
    ]);

    // Stats for the cards
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const [pendingShipments, ordersToday, activeReturns] = await Promise.all([
      Order.countDocuments({ order_status: { $in: ['placed', 'processing'] } }),
      Order.countDocuments({ placed_at: { $gte: today } }),
      Order.countDocuments({ order_status: 'returned' }),
    ]);

    // Shape order data for the view
    const shaped = orders.map(o => {
      const user = o.user_id || {};
      const items = (o.items || []).map(i => ({
        _id: i._id,
        item_status: i.item_status || 'placed',
        product_name: i.product_name || 'Product',
        quantity: i.quantity || 1,
        price: toNum(i.price_at_purchase),
        image: i.image || (i.product_id && i.product_id.images && i.product_id.images[0]) || '',
      }));

      return {
        _id            : o._id,
        orderId        : o.order_number,
        createdAt      : o.placed_at || o.created_at,
        status         : o.order_status,
        total          : toNum(o.total_amount),
        payment_method : o.payment_method || 'cod',
        payment_status : o.payment_status || 'pending',
        customer       : { name: user.full_name || user.email || 'Unknown', email: user.email || '' },
        items,
      };
    });

    res.render('admin/orders/admin-orders', {
      orders      : shaped,
      stats       : {
        pendingShipments,
        ordersToday,
        activeReturns,
      },
      status      : status,
      range       : range,
      search      : search,
      currentPage,
      totalPages  : Math.ceil(total / PER_PAGE),
      total,
      limit       : PER_PAGE,
    });
  } catch (err) {
    console.error('admin listOrders error:', err);
    res.redirect('/admin/dashboard');
  }
};

// ─── GET /admin/orders/:id ────────────────────────────────────────────────────
exports.renderOrderDetail = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate('user_id', 'full_name email phone_number')
      .populate('items.product_id', 'images name')
      .lean();

    if (!order) return res.redirect('/admin/orders');

    const user = order.user_id || {};
    const userName = user.full_name || user.email || 'Unknown';
    const addr = order.shipping_address || {};

    function toNum(d) { return d == null ? 0 : parseFloat(d.toString()); }

    const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', {
      minimumFractionDigits: 2, maximumFractionDigits: 2,
    });

    let rawItems = order.items || [];
    if (req.query.itemId) {
      rawItems = rawItems.filter(i => i._id.toString() === req.query.itemId);
    }

    const items = rawItems.map(i => {
      const p = i.product_id || {};
      const price = toNum(i.price_at_purchase);
      const istatus = i.item_status || 'placed';
      // next statuses this specific item can move to
      const ITEM_NEXT = {
        placed          : ['processing', 'shipped', 'cancelled'],
        processing      : ['shipped', 'cancelled'],
        shipped         : ['out_for_delivery', 'delivered'],
        out_for_delivery: ['delivered'],
        delivered       : [],
        cancelled       : [],
      };
      return {
        _id         : i._id,
        name        : i.product_name || p.name || 'Product',
        size        : i.size || '',
        qty         : i.quantity,
        price,
        total       : price * i.quantity,
        image       : i.image || (p.images && p.images[0]) || '',
        item_status : istatus,
        item_status_label: istatus.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        cancel_reason: i.cancel_reason || (istatus === 'cancelled' ? order.cancel_reason : null),
        cancelled   : istatus === 'cancelled',
        next_statuses: ITEM_NEXT[istatus] || [],
      };
    });

    // Logistics timeline steps based on current status
    const STATUS_STEPS = [
      { key: 'placed',           label: 'Order Confirmed' },
      { key: 'processing',       label: 'Processing' },
      { key: 'shipped',          label: 'Shipped from Warehouse' },
      { key: 'out_for_delivery', label: 'Out for Delivery' },
      { key: 'delivered',        label: 'Order Delivered' },
    ];

    const statusOrder = STATUS_STEPS.map(s => s.key);
    const currentIdx  = statusOrder.indexOf(order.order_status);

    const timeline = STATUS_STEPS.map((step, idx) => ({
      label   : step.label,
      done    : idx <= currentIdx,
      current : idx === currentIdx,
    })).reverse(); 

    // Which statuses can this order move to next
    const NEXT = {
      placed          : ['processing', 'cancelled'],
      processing      : ['shipped', 'cancelled'],
      shipped         : ['out_for_delivery', 'delivered'],
      out_for_delivery: ['delivered'],
      delivered       : [],
      cancelled       : [],
      returned        : [],
    };
    const nextStatuses = NEXT[order.order_status] || [];

    const dateStr = order.placed_at
      ? new Date(order.placed_at).toLocaleDateString('en-IN', {
          day: '2-digit', month: 'short', year: 'numeric',
        })
      : '';

    res.render('admin/orders/admin-order-detail', {
      order: {
        _id           : order._id,
        orderId       : order.order_number,
        status        : order.order_status,
        cancel_reason : order.cancel_reason || null,
        dateStr,
        customer      : { name: userName, email: user.email || '' },
        paymentMethod : order.payment_method || 'Cash on Delivery',
        paymentStatus : order.payment_status || 'pending',
        subtotal      : inr(toNum(order.subtotal)),
        shipping      : toNum(order.shipping_fee) > 0 ? inr(toNum(order.shipping_fee)) : 'Free',
        tax           : inr(toNum(order.tax_amount)),
        discount      : toNum(order.discount_amount) > 0 ? inr(toNum(order.discount_amount)) : null,
        total         : inr(toNum(order.total_amount)),
        totalRaw      : toNum(order.total_amount),
        items,
        address       : {
          name    : addr.full_name  || '',
          phone   : addr.phone_number || '',
          line1   : addr.address_line1 || '',
          line2   : addr.address_line2 || '',
          city    : addr.city  || '',
          state   : addr.state || '',
          pincode : addr.pincode || '',
          country : addr.country || 'India',
        },
        timeline,
        nextStatuses,
      },
      flash: req.query.flash || null,
    });
  } catch (err) {
    console.error('admin renderOrderDetail error:', err);
    res.redirect('/admin/orders');
  }
};

// ─── POST /admin/orders/:id/status ───────────────────────────────────────────
exports.updateOrderStatus = async (req, res) => {
  try {
    const { status, cancel_reason, internal_notes } = req.body;
    const allowed = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

    if (!allowed.includes(status)) {
      return res.redirect(`/admin/orders/${req.params.id}?flash=invalid_status`);
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.redirect('/admin/orders');

    const terminal = ['cancelled', 'returned', 'delivered'];
    if (terminal.includes(order.order_status)) {
      return res.redirect(`/admin/orders/${req.params.id}?flash=invalid_status`);
    }

    if (status === 'cancelled') {
      const reason = (cancel_reason || internal_notes || 'Cancelled by Admin').trim();
      let totalRefundAmt = 0;

      for (const item of order.items) {
        const itemSt = item.item_status || 'placed';
        if (itemSt !== 'cancelled' && itemSt !== 'returned') {
          // Restore stock
          await Variant.findByIdAndUpdate(item.variant_id, { $inc: { quantity: item.quantity } });
          await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: item.quantity } });

          item.item_status = 'cancelled';
          item.cancel_reason = reason;
          item.cancelled_at = new Date();
          totalRefundAmt += parseFloat(item.price_at_purchase.toString()) * item.quantity;
        }
      }

      order.order_status = 'cancelled';
      order.cancel_reason = reason;

      const isPrepaid = (order.payment_method === 'Wallet' || order.payment_method === 'Online Payment') && order.payment_status === 'paid';
      if (isPrepaid && totalRefundAmt > 0) {
        await walletService.creditWallet({
          userId         : order.user_id,
          amount         : totalRefundAmt,
          category       : 'refund',
          description    : `Refund for cancelled order #${order.order_number}`,
          relatedOrderId : order._id,
        });
        order.payment_status = 'refunded';
      }

      if (internal_notes) {
        order.internal_notes = internal_notes;
      }

      await order.save();
    } else {
      order.order_status = status;
      if (internal_notes) order.internal_notes = internal_notes;
      if (req.body.tracking_number) order.tracking_number = req.body.tracking_number;
      await order.save();
    }

    res.redirect(`/admin/orders/${req.params.id}?flash=status_updated`);
  } catch (err) {
    console.error('admin updateOrderStatus error:', err);
    res.redirect(`/admin/orders/${req.params.id}?flash=error`);
  }
};

// ─── POST /admin/orders/:id/items/:itemId/status ─────────────────────────────
exports.updateItemStatus = async (req, res) => {
  try {
    const { status, cancel_reason, internal_notes } = req.body;
    const allowed = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

    if (!allowed.includes(status)) {
      return res.redirect(`/admin/orders/${req.params.id}?flash=invalid_status`);
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.redirect('/admin/orders');

    const item = order.items.id(req.params.itemId);
    if (!item) return res.redirect(`/admin/orders/${req.params.id}?flash=error`);

    if (status === 'cancelled') {
      const reason = (cancel_reason || internal_notes || 'Cancelled by Admin').trim();
      const prevStatus = item.item_status || 'placed';

      if (prevStatus !== 'cancelled' && prevStatus !== 'returned') {
        // Restore stock
        await Variant.findByIdAndUpdate(item.variant_id, { $inc: { quantity: item.quantity } });
        await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: item.quantity } });

        item.item_status = 'cancelled';
        item.cancel_reason = reason;
        item.cancelled_at = new Date();

        const isPrepaid = (order.payment_method === 'Wallet' || order.payment_method === 'Online Payment') && order.payment_status === 'paid';
        if (isPrepaid) {
          const itemRefund = parseFloat(item.price_at_purchase.toString()) * item.quantity;
          await walletService.creditWallet({
            userId         : order.user_id,
            amount         : itemRefund,
            category       : 'refund',
            description    : `Refund for cancelled item in order #${order.order_number}`,
            relatedOrderId : order._id,
          });
        }
      }
    } else {
      item.item_status = status;
    }

    const activeItems = order.items.filter(i => i.item_status !== 'cancelled' && i.item_status !== 'returned');
    if (activeItems.length === 0) {
      order.order_status = 'cancelled';
      if (!order.cancel_reason) {
        order.cancel_reason = item.cancel_reason || 'Cancelled by Admin';
      }
    } else {
      const statuses = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
      const minIndex = Math.min(...activeItems.map(i => statuses.indexOf(i.item_status) !== -1 ? statuses.indexOf(i.item_status) : 0));
      order.order_status = statuses[minIndex] || 'placed';
    }

    await order.save();

    const referer = req.get('Referrer') || `/admin/orders/${req.params.id}`;
    res.redirect(`${referer}${referer.includes('?') ? '&' : '?'}flash=item_status_updated`);
  } catch (err) {
    console.error('admin updateItemStatus error:', err);
    res.redirect(`/admin/orders/${req.params.id}?flash=error`);
  }
};
