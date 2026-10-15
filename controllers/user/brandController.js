const Brand = require('../../models/brands');
const Product = require('../../models/product');

// GET /brands — all active brands
exports.renderBrandsPage = async (req, res) => {
  try {
    const brands = await Brand.find({ is_active: true }).sort({ name: 1 }).lean();

    // Count products per brand
    const brandIds = brands.map((b) => b._id);
    const counts = await Product.aggregate([
      { $match: { brand_id: { $in: brandIds }, is_active: true, is_deleted: { $ne: true } } },
      { $group: { _id: '$brand_id', count: { $sum: 1 } } },
    ]);
    const countMap = {};
    counts.forEach((c) => {
      if (c._id) countMap[c._id.toString()] = c.count;
    });

    const brandsWithCount = brands.map((b) => ({
      ...b,
      productCount: countMap[b._id.toString()] || 0,
    }));

    res.render('user/shop/houses', {
      user: req.user,
      brands: brandsWithCount,
      activePage: 'brands',
      title: 'The Fragrance Houses — Essence',
    });
  } catch (err) {
    console.error('renderBrandsPage error:', err);
    res.status(500).render('user/error', { message: 'Failed to load brands' });
  }
};

// GET /brands/:slug — dedicated brand showcase page
exports.renderBrandDetail = async (req, res) => {
  try {
    const slug = (req.params.slug || '').trim().toLowerCase();
    const brand = await Brand.findOne({
      slug,
      is_active: true,
    }).lean();

    if (!brand) {
      return res.status(404).render('user/error', { message: 'Fragrance House not found.' });
    }

    // Fetch products belonging to this brand
    const productsRaw = await Product.find({
      brand_id: brand._id,
      is_active: true,
      is_deleted: { $ne: true },
    })
      .sort({ created_at: -1 })
      .lean();

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const products = productsRaw.map((p) => {
      const isNew = p.created_at ? new Date(p.created_at) > thirtyDaysAgo : false;
      const primaryImage =
        Array.isArray(p.images) && p.images.length > 0
          ? p.images[0]
          : '/user/images/Perfumebottle.jpg';

      return {
        _id: p._id,
        name: p.name,
        slug: p.slug,
        price: p.price != null ? Number(p.price) : 0,
        short_description: p.short_description || '',
        image: primaryImage,
        isNew,
      };
    });

    res.render('user/brands/brandDetail', {
      user: req.user,
      brand,
      products,
      activePage: 'brands',
      title: `${brand.name} — Essence Fine Fragrance`,
    });
  } catch (err) {
    console.error('renderBrandDetail error:', err);
    res.status(500).render('user/error', { message: 'Failed to load brand showcase' });
  }
};
