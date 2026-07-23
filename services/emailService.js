const nodemailer = require('nodemailer');

// Reusable transporter — configured once, used everywhere
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// @desc Send an OTP code to a user's email
const sendOTPEmail = async (toEmail, otpCode, purpose = 'registration') => {
  const subjectMap = {
    registration: 'Verify Your Email — Essence',
    password_reset: 'Password Reset Code — Essence',
  };

  const subject = subjectMap[purpose] || 'Your OTP Code — Essence';

  const mailOptions = {
    from: `"Essence" <${process.env.EMAIL_USER}>`,
    to: toEmail,
    subject: subject,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
        <h2 style="color: #1c1c1e;">Essence</h2>
        <p>Your verification code is:</p>
        <p style="font-size: 28px; font-weight: bold; letter-spacing: 6px; color: #1c1c1e;">${otpCode}</p>
        <p style="color: #7a7367; font-size: 14px;">This code expires in 10 minutes. If you didn't request this, you can safely ignore this email.</p>
      </div>
    `,
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('✅ Email sent:', info.messageId, 'to', toEmail);
};

module.exports = { sendOTPEmail };