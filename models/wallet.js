const mongoose = require('mongoose');

const walletSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'User id is required'],
      unique: true, // one wallet per user
    },
    balance: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const wallet = mongoose.model('wallet', walletSchema);
module.exports = wallet;