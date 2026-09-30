const Category = require('../../models/category');

// GET /  (replaces the inline route currently in server.js)
exports.renderHome = async (req, res) => {
  try {
    const [categoryForHer, categoryForHim] = await Promise.all([
      Category.findOne({ slug: 'for-her', is_active: true, is_deleted: { $ne: true } }).lean(),
      Category.findOne({ slug: 'for-him', is_active: true, is_deleted: { $ne: true } }).lean(),
    ]);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.render('user/home/homepage', {
      user: req.user,
      categoryForHer,
      categoryForHim,
    });
  } catch (err) {
    console.error('renderHome error:', err);
    res.status(500).render('user/error', { message: 'Failed to load home page' });
  }
};