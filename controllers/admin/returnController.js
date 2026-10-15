const Return = require('../../models/Return');
const Order = require('../../models/order');
const User = require('../../models/user');
const Product = require('../../models/product');
const Variant = require('../../models/variant');
const walletService = require('../../services/walletService');


function toNum(d) {
  return d == null ? 0 : parseFloat(d.toString());
}

// ─── GET /admin/returns ───────────────────────────────────────────────────────
exports.listReturns = async (req, res) => {
  try {
    const { status = 'all', page = 1 } = req.query;
    const PER_PAGE = 10;
    const currentPage = Math.max(1, parseInt(page) || 1);

    const filter = status !== 'all' ? { status } : {};

    const [returns, total] = await Promise.all([
      Return.find(filter)
        .sort({ created_at: -1 })
        .skip((currentPage - 1) * PER_PAGE)
        .limit(PER_PAGE)
        .populate('user_id', 'full_name email')
        .populate('order_id', 'order_number total_amount payment_method')
        .lean(),
      Return.countDocuments(filter),
    ]);

    const shaped = returns.map(r => {
      const user = r.user_id || {};
      const order = r.order_id || {};
      return {
        _id: r._id,
        returnId: r.return_id,
        status: r.status,
        reason: r.reason || '',
        refundAmount: toNum(r.refund_amount),
        refundMethod: r.refund_method || '',
        createdAt: r.created_at,
        customer: { name: user.full_name || user.email || 'Unknown', email: user.email || '' },
        order: {
          id: order.order_number || '',
          _id: order._id,
          total: toNum(order.total_amount),
          payment: order.payment_method || '',
        },
      };
    });

    res.render('admin/orders/admin-returns', {
      returns: shaped,
      statusFilter: status,
      currentPage,
      totalPages: Math.ceil(total / PER_PAGE) || 1,
      total,
      query: req.query,
    });
  } catch (err) {
    console.error('admin listReturns error:', err);
    res.redirect('/admin/dashboard');
  }
};

// ─── POST /admin/returns/:id/approve ─────────────────────────────────────────
exports.approveReturn = async (req, res) => {
  try {
    // Atomically find and mark as processing to prevent race conditions & double refunds
    const ret = await Return.findOneAndUpdate(
      { _id: req.params.id, status: 'requested' },
      { $set: { status: 'refunded', refund_method: 'wallet' } },
      { returnDocument: 'after' }
    )
      .populate('order_id')
      .populate('user_id');

    if (!ret) {
      return res.redirect('/admin/returns?flash=invalid');
    }

    const order = ret.order_id;
    if (!order) {
      return res.redirect('/admin/returns?flash=invalid');
    }

    const userId = (ret.user_id && ret.user_id._id) ? ret.user_id._id : (ret.user_id || order.user_id);

    // Refund to wallet
    const refundAmt = toNum(ret.refund_amount);
    if (refundAmt > 0 && userId) {
      await walletService.creditWallet({
        userId,
        amount: refundAmt,
        category: 'refund',
        description: `Return approved — refund for order #${order.order_number}`,
        method: 'system',
        relatedOrderId: order._id,
      });
    }

    const itemId = ret.order_item_id;
    if (order.items && order.items.length) {
      for (const item of order.items) {
        if (itemId && item._id.toString() !== itemId.toString()) continue;

        if (item.item_status !== 'returned' && item.item_status !== 'cancelled') {
          item.item_status = 'returned';

          // Restore stock
          if (item.variant_id) {
            await Variant.findByIdAndUpdate(item.variant_id, { $inc: { quantity: item.quantity } });
          }
          if (item.product_id) {
            await Product.findByIdAndUpdate(item.product_id, { $inc: { stock: item.quantity } });
          }
        }
      }

      const activeItems = order.items.filter(i => i.item_status !== 'cancelled' && i.item_status !== 'returned');
      if (activeItems.length === 0) {
        order.order_status = 'returned';
        order.payment_status = 'refunded';
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
      }

      await order.save();
    }

    res.redirect('/admin/returns?flash=approved');
  } catch (err) {
    console.error('admin approveReturn error:', err);
    res.redirect('/admin/returns?flash=error');
  }
};

// ─── POST /admin/returns/:id/reject ──────────────────────────────────────────
exports.rejectReturn = async (req, res) => {
  try {
    const rejectReason = (req.body.reject_reason || '').trim();
    const ret = await Return.findOneAndUpdate(
      { _id: req.params.id, status: 'requested' },
      { $set: { status: 'rejected', ...(rejectReason ? { comments: rejectReason } : {}) } },
      { returnDocument: 'after' }
    );
    if (!ret) {
      return res.redirect('/admin/returns?flash=invalid');
    }

    res.redirect('/admin/returns?flash=rejected');
  } catch (err) {
    console.error('admin rejectReturn error:', err);
    res.redirect('/admin/returns?flash=error');
  }
};
