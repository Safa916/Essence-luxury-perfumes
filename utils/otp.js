import crypto from 'crypto';

// Helper: generate a 6-digit OTP code
export const generateOTPCode = () => crypto.randomInt(100000, 1000000).toString();
export default {
  generateOTPCode
};
