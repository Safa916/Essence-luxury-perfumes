const Wallet            = require('../models/wallet');
const WalletTransaction = require('../models/walletTransaction');

function toNum(d) {
  if (d == null) return 0;
  return parseFloat(d.toString());
}

/**
 * Credit an amount into a user's wallet.
 * Creates the wallet if it doesn't exist.
 * Returns { wallet, transaction }
 */
async function creditWallet({ userId, amount, category, description, relatedOrderId = null }) {
  let wallet = await Wallet.findOne({ user_id: userId });
  if (!wallet) {
    wallet = await Wallet.create({ user_id: userId, balance: 0 });
  }

  const prev       = toNum(wallet.balance);
  const newBalance = parseFloat((prev + amount).toFixed(2));

  wallet.balance = newBalance;
  await wallet.save();

  const transaction = await WalletTransaction.create({
    wallet_id     : wallet._id,
    user_id       : userId,
    type          : 'credit',
    amount,
    balance_after : newBalance,
    category,
    description,
    method        : 'system',
    related_order_id: relatedOrderId,
  });

  return { wallet, transaction };
}

/**
 * Debit an amount from a user's wallet.
 * Throws if insufficient balance.
 * Returns { wallet, transaction }
 */
async function debitWallet({ userId, amount, category, description, relatedOrderId = null }) {
  let wallet = await Wallet.findOne({ user_id: userId });
  if (!wallet) throw new Error('Wallet not found');

  const prev = toNum(wallet.balance);
  if (prev < amount) throw new Error('Insufficient wallet balance');

  const newBalance = parseFloat((prev - amount).toFixed(2));
  wallet.balance = newBalance;
  await wallet.save();

  const transaction = await WalletTransaction.create({
    wallet_id     : wallet._id,
    user_id       : userId,
    type          : 'debit',
    amount,
    balance_after : newBalance,
    category,
    description,
    method        : 'system',
    related_order_id: relatedOrderId,
  });

  return { wallet, transaction };
}

/**
 * Get wallet balance for a user (returns 0 if no wallet yet).
 */
async function getBalance(userId) {
  const wallet = await Wallet.findOne({ user_id: userId }).lean();
  return wallet ? toNum(wallet.balance) : 0;
}

module.exports = { creditWallet, debitWallet, getBalance };
