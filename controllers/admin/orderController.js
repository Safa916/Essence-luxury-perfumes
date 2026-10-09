const Order = require('../../models/order');
const User  = require('../../models/user');

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
    const statusFilter = (status && status !== 'all') ? { order_status: status } : {};

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
        _id     : o._id,
        orderId : o.order_number,
        createdAt: o.placed_at || o.created_at,
        status  : o.order_status,
        total   : toNum(o.total_amount),
        customer: { name: user.full_name || user.email || 'Unknown', email: user.email || '' },
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
    const { status } = req.body;
    const allowed = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

    if (!allowed.includes(status)) {
      return res.redirect(`/admin/orders/${req.params.id}?flash=invalid_status`);
    }

    // Fetch the current order to enforce terminal-state guard
    const order = await Order.findById(req.params.id).select('order_status').lean();
    if (!order) return res.redirect('/admin/orders');

    const terminal = ['cancelled', 'returned', 'delivered'];
    if (terminal.includes(order.order_status)) {
      return res.redirect(`/admin/orders/${req.params.id}?flash=invalid_status`);
    }

    await Order.findByIdAndUpdate(req.params.id, { order_status: status });

    res.redirect(`/admin/orders/${req.params.id}?flash=status_updated`);
  } catch (err) {
    console.error('admin updateOrderStatus error:', err);
    res.redirect(`/admin/orders/${req.params.id}?flash=error`);
  }
};

// ─── POST /admin/orders/:id/items/:itemId/status ─────────────────────────────
const mongoose = require('mongoose');
exports.updateItemStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered', 'cancelled'];

    if (!allowed.includes(status)) {
      return res.redirect(`/admin/orders/${req.params.id}?flash=invalid_status`);
    }

    // Update the specific item's status and return the updated order document
    const order = await Order.findOneAndUpdate(
      { _id: req.params.id, 'items._id': new mongoose.Types.ObjectId(req.params.itemId) },
      { $set: { 'items.$.item_status': status } },
      { new: true }
    );

    if (order) {
     
      const activeItems = order.items.filter(i => i.item_status !== 'cancelled' && i.item_status !== 'returned');
      let newOrderStatus = 'placed';
      
      if (activeItems.length === 0) {
      
        newOrderStatus = 'cancelled';
      } else {
        const statuses = ['placed', 'processing', 'shipped', 'out_for_delivery', 'delivered'];
          const minIndex = Math.min(...activeItems.map(i => statuses.indexOf(i.item_status) !== -1 ? statuses.indexOf(i.item_status) : 0));
        newOrderStatus = statuses[minIndex] || 'placed';
      }
      
      if (order.order_status !== newOrderStatus) {
        order.order_status = newOrderStatus;
        await order.save();
      }
    }

    const referer = req.get('Referrer') || `/admin/orders/${req.params.id}`;
    res.redirect(`${referer}${referer.includes('?') ? '&' : '?'}flash=item_status_updated`);
  } catch (err) {
    console.error('admin updateItemStatus error:', err);
    res.redirect(`/admin/orders/${req.params.id}?flash=error`);
  }
};
