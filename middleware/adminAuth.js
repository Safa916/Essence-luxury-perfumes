const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');

// Protects admin-only routes (dashboard, user management, etc.)
// Reads the JWT from the "adminToken" cookie set at login.
exports.requireAdminAuth = async (req, res, next) => {
  try {
    const token = req.cookies.adminToken;
    if (!token) {
      return res.redirect('/admin/login');
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.redirect('/admin/login');
    }

    const admin = await Admin.findById(decoded.id).select('-password_hash');
    if (!admin || !admin.is_active) {
      res.clearCookie('adminToken');
      return res.redirect('/admin/login');
    }

    req.admin = admin;
    next();
  } catch (err) {
    res.clearCookie('adminToken');
    return res.redirect('/admin/login');
  }
};

// If an admin is already logged in, skip the login page and go straight to the dashboard
exports.redirectIfAdminLoggedIn = (req, res, next) => {
  const token = req.cookies.adminToken;
  if (!token) return next();

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return res.redirect('/admin/dashboard');
  } catch (err) {
    return next();
  }
};
