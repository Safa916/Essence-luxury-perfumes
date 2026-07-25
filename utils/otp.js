// Helper: generate a 6-digit OTP code
exports.generateOTPCode = () => Math.floor(100000 + Math.random() * 900000).toString();