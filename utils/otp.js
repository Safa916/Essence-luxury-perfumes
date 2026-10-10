const crypto = require('crypto');

// Helper: generate a 6-digit OTP code
exports.generateOTPCode = () => crypto.randomInt(100000, 1000000).toString();