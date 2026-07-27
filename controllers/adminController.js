const jwt = require('jsonwebtoken');
const Admin = require('../models/admin');

// GET /admin/login
exports.getLoginPage = (req, res) => {
  res.render('admin/login', { error: null });
};

// POST /admin/login
exports.postLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).render('admin/login', { error: 'Email and password are required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    // same generic message whether the email doesn't exist or the password is wrong
    if (!admin || !admin.is_active) {
      return res.status(401).render('admin/login', { error: 'Invalid email or password' });
    }

    const isMatch = await admin.comparePassword(password);
    if (!isMatch) {
      return res.status(401).render('admin/login', { error: 'Invalid email or password' });
    }

    admin.last_login_at = new Date();
    await admin.save();

    const token = jwt.sign({ id: admin._id, role: 'admin' }, process.env.JWT_SECRET, {
      expiresIn: '1d'
    });

    res.cookie('adminToken', token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000, // 1 day
      sameSite: 'lax'
      // secure: true  <- uncomment once your site runs on HTTPS in production
    });

    return res.redirect('/admin/dashboard');
  } catch (err) {
    console.error('Admin login error:', err);
    return res.status(500).render('admin/login', { error: 'Something went wrong, please try again' });
  }
};

// GET /admin/logout
exports.logout = (req, res) => {
  res.clearCookie('adminToken');
  res.redirect('/admin/login');
};

// GET /admin/dashboard (dummy content for now, per your design)
exports.getDashboard = (req, res) => {
  res.render('admin/dashboard', { admin: req.admin });
};
