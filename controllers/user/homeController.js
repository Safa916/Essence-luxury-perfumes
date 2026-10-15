const Category = require('../../models/category');
const Brand = require('../../models/brands');

// GET /  (replaces the inline route currently in server.js)
exports.renderHome = async (req, res) => {
  try {
    const [categoryForHer, categoryForHim, brands] = await Promise.all([
      Category.findOne({
        $or: [
          { slug: { $in: ['for-her', 'womens-fragrance', 'womens-fragrances', 'women'] } },
          { name: { $regex: /^(for\s*her|women)/i } },
        ],
        is_active: true,
        is_deleted: { $ne: true },
      }).lean(),
      Category.findOne({
        $or: [
          { slug: { $in: ['for-him', 'mens-fragrance', 'mens-fragrances', 'men'] } },
          { name: { $regex: /^(for\s*him|men)/i } },
        ],
        is_active: true,
        is_deleted: { $ne: true },
      }).lean(),
      Brand.find({ is_active: true }).sort({ name: 1 }).lean(),
    ]);

    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');

    res.render('user/home/homepage', {
      user: req.user,
      categoryForHer,
      categoryForHim,
      brands: brands || [],
    });
  } catch (err) {
    console.error('renderHome error:', err);
    res.status(500).render('user/error', { message: 'Failed to load home page' });
  }
};