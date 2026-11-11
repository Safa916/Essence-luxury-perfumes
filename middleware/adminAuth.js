import jwt from 'jsonwebtoken';
import Admin from '../models/admin.js';

// Protects admin-only routes (dashboard, user management, etc.)
// Reads the JWT from the "adminToken" cookie set at login.
export const requireAdminAuth = async (req, res, next) => {
  const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.is('json');

  const sendUnauthorized = (clearCookie = false) => {
    if (clearCookie) res.clearCookie('adminToken');
    if (isAjax) {
      return res.status(401).json({ success: false, message: 'Admin authentication required.', redirect: '/admin/login' });
    }
    return res.redirect('/admin/login');
  };

  try {
    const token = req.cookies.adminToken;
    if (!token) {
      return sendUnauthorized(false);
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return sendUnauthorized(true);
    }

    const admin = await Admin.findById(decoded.id).select('-password_hash');
    if (!admin || !admin.is_active) {
      return sendUnauthorized(true);
    }

    req.admin = admin;
    next();
  } catch (err) {
    return sendUnauthorized(true);
  }
};

// If an admin is already logged in, skip the login page and go straight to the dashboard
export const redirectIfAdminLoggedIn = (req, res, next) => {
  const token = req.cookies.adminToken;
  if (!token) return next();

  try {
    jwt.verify(token, process.env.JWT_SECRET);
    return res.redirect('/admin/dashboard');
  } catch (err) {
    return next();
  }
};

export default {
  requireAdminAuth,
  redirectIfAdminLoggedIn
};
