const Wallet            = require('../../models/wallet');
const WalletTransaction = require('../../models/walletTransaction');
const Payment           = require('../../models/payment');
const Order             = require('../../models/order');
const CartItem          = require('../../models/cartItem');
const Cart              = require('../../models/cart');
const walletService     = require('../../services/walletService');
const { getRazorpayInstance } = require('../../config/razorpay');
const crypto            = require('crypto');

function toNum(d) {
  if (d == null) return 0;
  return parseFloat(d.toString());
}

// ─── GET /wallet ──────────────────────────────────────────────────────────────
exports.renderWallet = async (req, res) => {
  try {
    const userId = req.user._id;
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = 5;

    let wallet = await Wallet.findOne({ user_id: userId }).lean();
    if (!wallet) {
      const created = await Wallet.create({ user_id: userId, balance: 0 });
      wallet = created.toObject();
    }

    // Get cart count for header badge
    const cart = await Cart.findOne({ user_id: userId }).lean();
    const cartCount = cart ? await CartItem.countDocuments({ cart_id: cart._id }) : 0;

    const [transactions, totalTx] = await Promise.all([
      WalletTransaction.find({ user_id: userId })
        .sort({ created_at: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('related_order_id', 'order_number')
        .lean(),
      WalletTransaction.countDocuments({ user_id: userId }),
    ]);

    const formattedTx = transactions.map(tx => {
      const isCredit = tx.type === 'credit';
      const orderNum = tx.related_order_id ? tx.related_order_id.order_number : null;
      let methodDisplay = tx.method || 'System';
      if (tx.category === 'top_up') methodDisplay = 'Razorpay';
      else if (tx.category === 'refund') methodDisplay = orderNum ? `Order #${orderNum}` : 'Refund';
      else if (tx.category === 'purchase') methodDisplay = orderNum ? `Order #${orderNum}` : 'Checkout';

      return {
        _id: tx._id,
        date: tx.created_at ? new Date(tx.created_at).toLocaleDateString('en-IN', {
          month: 'short',
          day: '2-digit',
          year: 'numeric',
        }) : '',
        category: tx.category || (isCredit ? 'refund' : 'purchase'),
        methodDisplay,
        description: tx.description || (isCredit ? 'Wallet Credit' : 'Wallet Debit'),
        amount: toNum(tx.amount),
        type: tx.type,
      };
    });

    res.render('user/wallet/wallet', {
      user: req.user,
      cartCount,
      balance: toNum(wallet.balance),
      transactions: formattedTx,
      currentPage: page,
      totalPages: Math.ceil(totalTx / limit) || 1,
      totalTx,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    });
  } catch (err) {
    console.error('renderWallet error:', err);
    res.status(500).render('user/error', { message: 'Failed to load wallet.' });
  }
};

// ─── POST /wallet/topup/create-order ──────────────────────────────────────────
exports.createTopupOrder = async (req, res) => {
  try {
    const userId = req.user._id;
    const amount = parseFloat(req.body.amount);

    if (!amount || isNaN(amount) || amount < 1) {
      return res.status(400).json({ success: false, message: 'Please enter a valid amount (minimum ₹1).' });
    }

    const razorpay = getRazorpayInstance();
    if (!razorpay) {
      return res.status(500).json({ success: false, message: 'Payment gateway not configured.' });
    }

    const amountInPaise = Math.round(amount * 100);

    const rzpOrder = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `w_top_${Date.now().toString(36).toUpperCase()}`,
      notes: {
        userId: userId.toString(),
        purpose: 'wallet_topup',
      },
    });

    await Payment.create({
      user_id: userId,
      purpose: 'wallet_topup',
      gateway: 'razorpay',
      gateway_order_id: rzpOrder.id,
      amount,
      status: 'pending',
    });

    return res.json({
      success: true,
      orderId: rzpOrder.id,
      amount: rzpOrder.amount,
      currency: rzpOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      user: {
        name: req.user.full_name || '',
        email: req.user.email || '',
        phone: req.user.phone || '',
      },
    });
  } catch (err) {
    console.error('createTopupOrder error:', err);
    return res.status(500).json({ success: false, message: 'Could not create topup order.' });
  }
};

// ─── POST /wallet/topup/verify ────────────────────────────────────────────────
exports.verifyTopupPayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, amount } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ success: false, message: 'Missing payment details.' });
    }

    const secret = process.env.RAZORPAY_KEY_SECRET || '';
    const bodyStr = `${razorpay_order_id}|${razorpay_payment_id}`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(bodyStr)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      await Payment.findOneAndUpdate(
        { gateway_order_id: razorpay_order_id },
        { status: 'failed', failure_reason: 'Signature mismatch' }
      );
      return res.status(400).json({ success: false, message: 'Signature verification failed.' });
    }

    const topupAmount = parseFloat(amount);
    const { wallet } = await walletService.creditWallet({
      userId,
      amount: topupAmount,
      category: 'top_up',
      description: 'Wallet Top-up via Razorpay',
      method: 'Razorpay',
    });

    await Payment.findOneAndUpdate(
      { gateway_order_id: razorpay_order_id },
      {
        transaction_id: razorpay_payment_id,
        status: 'success',
      }
    );

    return res.json({
      success: true,
      transactionId: razorpay_payment_id,
      newBalance: toNum(wallet.balance),
      amount: topupAmount,
    });
  } catch (err) {
    console.error('verifyTopupPayment error:', err);
    return res.status(500).json({ success: false, message: 'Failed to credit wallet.' });
  }
};
