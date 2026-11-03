import mongoose from 'mongoose';

/**
 * Global payment settings — admin configurable.
 * Stores configuration such as maximum COD order limit.
 * There should only ever be ONE document in this collection.
 */
const paymentSettingsSchema = new mongoose.Schema(
  {
    max_cod_amount: {
      type: Number,
      default: 10000,
      min: 0,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const PaymentSettings =
  mongoose.models.PaymentSettings ||
  mongoose.model('PaymentSettings', paymentSettingsSchema);

export default PaymentSettings;

