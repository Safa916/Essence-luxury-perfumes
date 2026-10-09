const jwt = require('jsonwebtoken');
const User = require('../models/user');
 
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Expect header format: "Authorization: Bearer <token>"
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ message: 'Not authorized, no token provided' });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the actual user (minus password) to req.user
    const user = await User.findById(decoded.id).select('-password_hash');
    if (!user) {
      return res.status(401).json({ message: 'Not authorized, user no longer exists' });
    }

    if (!user.is_active) {
      return res.status(403).json({ message: 'This account has been deactivated' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error.message);

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Session expired, please log in again' });
    }

    return res.status(401).json({ message: 'Not authorized, invalid token' });
  }
};

const Cart = require('../models/cart');

exports.checkUser = async (req, res, next) => {
  const token = req.cookies.token;

  res.locals.cartCount = 0; // Default
  res.locals.user = null;

  if (!token) {
    req.user = null;
    return next();
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password_hash');

    if (!user || !user.is_active) {
      res.clearCookie('token', { httpOnly: true }); // force logout
      req.user = null;
      return next();
    }

    req.user = user;
    res.locals.user = user;
    
    // Fetch cart count
    const cart = await Cart.findOne({ user_id: user._id }).lean();
    if (cart && cart.items) {
      res.locals.cartCount = cart.items.length;
    }
  } catch (err) {
    req.user = null;
  }

  next();
};

// @desc    Require a logged-in user (cookie-based) — redirect to login if not authenticated
exports.requireAuth = async (req, res, next) => {
  const token = req.cookies.token;

  res.locals.cartCount = 0; // Default
  res.locals.user = null;

  if (!token) {
    return res.redirect('/auth/login');
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password_hash');

    if (!user || !user.is_active) {
      return res.redirect('/auth/login');
    }

    req.user = user;
    res.locals.user = user;
    
    // Fetch cart count
    const cart = await Cart.findOne({ user_id: user._id }).lean();
    if (cart && cart.items) {
      res.locals.cartCount = cart.items.length;
    }
    next();
  } catch (error) {
    return res.redirect('/auth/login');
  }
};