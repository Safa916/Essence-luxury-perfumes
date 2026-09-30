const Category = require('../../models/category');
const Product = require('../../models/product');

// GET /categories — browsable grid of every active category
exports.renderCategoriesPage = async (req, res) => {
  try {
    const categories = await Category.find({ is_active: true, is_deleted: { $ne: true } })
      .sort({ name: 1 })
      .lean();

    // Product count per category, so each card can show "24 fragrances"
    const counts = await Product.aggregate([
      { $match: { is_active: true, is_deleted: { $ne: true } } },
      { $group: { _id: '$category_id', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => {
      if (c._id) countMap[c._id.toString()] = c.count;
    });

    const categoriesWithCount = categories.map((cat) => ({
      ...cat,
      productCount: countMap[cat._id.toString()] || 0,
    }));

    res.render('user/categories/categories', {
      user: req.user,
      categories: categoriesWithCount,
    });
  } catch (err) {
    console.error('renderCategoriesPage error:', err);
    res.status(500).render('user/error', { message: 'Failed to load categories' });
  }
};
