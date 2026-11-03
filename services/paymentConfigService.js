/**
 * Configurable Maximum Cash on Delivery limit.
 * Controlled via MAX_COD_AMOUNT in .env (defaults to 1000 if not specified).
 * If set to 'unlimited' or 0, returns null (no limit).
 */
export function getMaxCodLimit() {
  const envVal = process.env.MAX_COD_AMOUNT;
  if (envVal !== undefined && envVal !== null && envVal !== '') {
    const trimmed = String(envVal).trim().toLowerCase();
    if (trimmed === 'unlimited' || trimmed === 'none' || trimmed === 'null') {
      return null;
    }
    const parsed = parseFloat(envVal);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
    if (parsed === 0) return null;
  }
  return 1000;
}

export default {
  getMaxCodLimit,
};
