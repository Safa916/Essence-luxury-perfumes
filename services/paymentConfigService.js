import mongoose from 'mongoose';
import PaymentSettings from '../models/PaymentSettings.js';

/**
 * Returns the maximum COD limit (number or null).
 * Hierarchy:
 * 1. DB setting (if exists and max_cod_amount is a finite number >= 0)
 * 2. Environment variable: process.env.MAX_COD_AMOUNT || process.env.COD_MAX_LIMIT (if set and valid number >= 0)
 * 3. null (meaning no limit is set / unlimited COD, preserving existing behavior)
 */
export async function getMaxCodLimit() {
  try {
    if (mongoose.connection && mongoose.connection.readyState === 1) {
      const settings = await PaymentSettings.findOne().lean();
      if (settings && settings.max_cod_amount !== null && settings.max_cod_amount !== undefined) {
        const num = Number(settings.max_cod_amount);
        if (!isNaN(num) && num >= 0) {
          return num;
        }
      }
    }
  } catch (err) {
    console.error('[PaymentConfigService] Error reading PaymentSettings:', err);
  }

  // Fallback to environment variable if configured
  const envVal = process.env.MAX_COD_AMOUNT || process.env.COD_MAX_LIMIT || process.env.MAX_COD_ORDER_TOTAL;
  if (envVal !== undefined && envVal !== null && envVal !== '') {
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed >= 0) {
      return parsed;
    }
  }

  return null;
}

/**
 * Sets or clears the maximum COD limit in the database.
 * Pass a number >= 0 to set a limit, or null / empty string to clear the limit.
 */
export async function setMaxCodLimit(limit) {
  let val = null;
  if (limit !== null && limit !== undefined && limit !== '') {
    const parsed = parseFloat(limit);
    if (!isNaN(parsed) && parsed >= 0) {
      val = parsed;
    }
  }

  return PaymentSettings.findOneAndUpdate(
    {},
    { max_cod_amount: val },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export default {
  getMaxCodLimit,
  setMaxCodLimit,
};
