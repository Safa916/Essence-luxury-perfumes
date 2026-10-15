const jwt = require('jsonwebtoken');
const Admin = require('../../models/admin');
const Order = require('../../models/order');
const Product = require('../../models/product');
const User = require('../../models/user');
const Category = require('../../models/category');

// GET /admin/login
exports.getLoginPage = (req, res) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

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

// ── GET /admin/dashboard ──────────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  try {
    const match = {
      order_status: { $nin: ['cancelled', 'returned'] },
      payment_status: { $ne: 'failed' },
    };

    // 1. KPI Aggregation
    const [kpiAgg, activeUsers] = await Promise.all([
      Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: '$total_amount' },
            totalOrders: { $sum: 1 },
          },
        },
      ]),
      User.countDocuments({ is_active: true }),
    ]);

    const totalRevenue = kpiAgg[0] ? parseFloat(kpiAgg[0].totalRevenue.toString()) : 0;
    const totalOrders = kpiAgg[0] ? kpiAgg[0].totalOrders : 0;

    // 2. Three Top 10 Lists (Products, Categories, Brands)
    const [topProductsRaw, topCategoriesRaw, topBrandsRaw] = await Promise.all([
      // Top 10 Products by quantity sold
      Order.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $group: {
            _id: '$items.product_id',
            name: { $first: '$items.product_name' },
            itemImage: { $first: '$items.image' },
            quantitySold: { $sum: '$items.quantity' },
            revenue: {
              $sum: { $multiply: ['$items.quantity', '$items.price_at_purchase'] },
            },
          },
        },
        { $sort: { quantitySold: -1 } },
        { $limit: 10 },
        {
          $lookup: {
            from: 'products',
            localField: '_id',
            foreignField: '_id',
            as: 'productDoc',
          },
        },
        {
          $unwind: {
            path: '$productDoc',
            preserveNullAndEmptyArrays: true,
          },
        },
      ]),

      // Top 10 Categories by quantity sold
      Order.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'categories',
            localField: 'product.category_id',
            foreignField: '_id',
            as: 'category',
          },
        },
        { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$product.category_id',
            name: { $first: '$category.name' },
            quantitySold: { $sum: '$items.quantity' },
            revenue: {
              $sum: { $multiply: ['$items.quantity', '$items.price_at_purchase'] },
            },
          },
        },
        { $match: { name: { $ne: null } } },
        { $sort: { quantitySold: -1 } },
        { $limit: 10 },
      ]),

      // Top 10 Brands by quantity sold
      Order.aggregate([
        { $match: match },
        { $unwind: '$items' },
        {
          $lookup: {
            from: 'products',
            localField: 'items.product_id',
            foreignField: '_id',
            as: 'product',
          },
        },
        { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
        {
          $lookup: {
            from: 'brands',
            localField: 'product.brand_id',
            foreignField: '_id',
            as: 'brand',
          },
        },
        { $unwind: { path: '$brand', preserveNullAndEmptyArrays: true } },
        {
          $group: {
            _id: '$product.brand_id',
            name: { $first: '$brand.name' },
            quantitySold: { $sum: '$items.quantity' },
            revenue: {
              $sum: { $multiply: ['$items.quantity', '$items.price_at_purchase'] },
            },
          },
        },
        { $match: { name: { $ne: null } } },
        { $sort: { quantitySold: -1 } },
        { $limit: 10 },
      ]),
    ]);

    const topProducts = (topProductsRaw || []).map((b) => {
      let img = b.itemImage;
      if (!img && b.productDoc && b.productDoc.images && b.productDoc.images.length > 0) {
        img = b.productDoc.images[0];
      }
      return {
        _id: b._id,
        name: b.name || (b.productDoc && b.productDoc.name) || 'Product',
        image: img || '/user/images/placeholder.jpg',
        quantitySold: b.quantitySold || 0,
        revenue: b.revenue ? parseFloat(b.revenue.toString()) : 0,
      };
    });

    const topCategories = (topCategoriesRaw || []).map((c) => ({
      _id: c._id,
      name: c.name || 'Uncategorized',
      quantitySold: c.quantitySold || 0,
      revenue: c.revenue ? parseFloat(c.revenue.toString()) : 0,
    }));

    const topBrands = (topBrandsRaw || []).map((br) => ({
      _id: br._id,
      name: br.name || 'Generic / Other',
      quantitySold: br.quantitySold || 0,
      revenue: br.revenue ? parseFloat(br.revenue.toString()) : 0,
    }));

    // Category breakdown for market share card
    const totalCatRevenue = topCategories.reduce((acc, c) => acc + c.revenue, 0) || 1;
    const categoryBreakdown = topCategories.slice(0, 5).map((c) => ({
      name: c.name,
      revenue: c.revenue,
      units: c.quantitySold,
      percentage: Math.round((c.revenue / totalCatRevenue) * 100),
    }));

    res.render('admin/dashboard', {
      admin: req.admin,
      activePage: 'dashboard',
      stats: {
        totalRevenue,
        totalOrders,
        activeUsers,
      },
      topProducts,
      topCategories,
      topBrands,
      categoryBreakdown,
    });
  } catch (err) {
    console.error('getDashboard error:', err);
    res.status(500).send('Server error loading dashboard');
  }
};

// ── GET /admin/api/dashboard/chart ───────────────────────────────────────────
exports.getDashboardChartData = async (req, res) => {
  try {
    const filter = (req.query.filter || 'monthly').toLowerCase();
    const now = new Date();

    const match = {
      order_status: { $nin: ['cancelled', 'returned'] },
      payment_status: { $ne: 'failed' },
    };

    let labels = [];
    let sales = [];
    let orderCounts = [];

    if (filter === 'weekly') {
      // Last 7 days including today
      const days = [];
      const dayLabels = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        const dateKey = `${yyyy}-${mm}-${dd}`;
        days.push(dateKey);
        dayLabels.push(d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
      }

      const sevenDaysAgo = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
      match.placed_at = { $gte: sevenDaysAgo };

      const agg = await Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$placed_at' } },
            totalSales: { $sum: '$total_amount' },
            count: { $sum: 1 },
          },
        },
      ]);

      const map = {};
      agg.forEach((item) => {
        map[item._id] = {
          sales: parseFloat(item.totalSales?.toString() || '0'),
          count: item.count,
        };
      });

      labels = dayLabels;
      sales = days.map((key) => map[key]?.sales || 0);
      orderCounts = days.map((key) => map[key]?.count || 0);

    } else if (filter === 'daily') {
      // Today's sales broken down by hour (0–23)
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      const todayEnd   = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
      match.placed_at  = { $gte: todayStart, $lte: todayEnd };

      const agg = await Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $hour: '$placed_at' },
            totalSales: { $sum: '$total_amount' },
            count: { $sum: 1 },
          },
        },
      ]);

      const map = {};
      agg.forEach((item) => {
        map[item._id] = {
          sales: parseFloat(item.totalSales?.toString() || '0'),
          count: item.count,
        };
      });

      labels = Array.from({ length: 24 }, (_, h) => {
        const suffix  = h < 12 ? 'AM' : 'PM';
        const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
        return `${display}${suffix}`;
      });
      sales       = Array.from({ length: 24 }, (_, h) => map[h]?.sales || 0);
      orderCounts = Array.from({ length: 24 }, (_, h) => map[h]?.count || 0);

    } else if (filter === 'custom') {
      // Custom date range: ?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD (grouped by day)
      const startStr = req.query.startDate;
      const endStr   = req.query.endDate;

      if (!startStr || !endStr) {
        return res.status(400).json({ success: false, message: 'startDate and endDate required' });
      }

      const rangeStart = new Date(startStr + 'T00:00:00.000Z');
      const rangeEnd   = new Date(endStr   + 'T23:59:59.999Z');

      if (isNaN(rangeStart) || isNaN(rangeEnd) || rangeStart > rangeEnd) {
        return res.status(400).json({ success: false, message: 'Invalid date range' });
      }

      match.placed_at = { $gte: rangeStart, $lte: rangeEnd };

      const agg = await Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$placed_at' } },
            totalSales: { $sum: '$total_amount' },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      // Generate complete day-by-day list for the range
      const dayList = [];
      const cursor  = new Date(rangeStart);
      while (cursor <= rangeEnd) {
        const yyyy = cursor.getUTCFullYear();
        const mm   = String(cursor.getUTCMonth() + 1).padStart(2, '0');
        const dd   = String(cursor.getUTCDate()).padStart(2, '0');
        dayList.push(`${yyyy}-${mm}-${dd}`);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }

      const map = {};
      agg.forEach((item) => {
        map[item._id] = {
          sales: parseFloat(item.totalSales?.toString() || '0'),
          count: item.count,
        };
      });

      labels      = dayList.map(d => { const [, m, dy] = d.split('-'); return `${dy}/${m}`; });
      sales       = dayList.map(key => map[key]?.sales || 0);
      orderCounts = dayList.map(key => map[key]?.count || 0);

    } else if (filter === 'yearly') {
      // Past 5 years up to current year
      const currentYear = now.getFullYear();
      const years = [];
      for (let y = currentYear - 4; y <= currentYear; y++) {
        years.push(y);
      }

      const fiveYearsAgo = new Date(currentYear - 4, 0, 1, 0, 0, 0, 0);
      match.placed_at = { $gte: fiveYearsAgo };

      const agg = await Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $year: '$placed_at' },
            totalSales: { $sum: '$total_amount' },
            count: { $sum: 1 },
          },
        },
      ]);

      const map = {};
      agg.forEach((item) => {
        map[item._id] = {
          sales: parseFloat(item.totalSales?.toString() || '0'),
          count: item.count,
        };
      });

      labels = years.map((y) => y.toString());
      sales = years.map((y) => map[y]?.sales || 0);
      orderCounts = years.map((y) => map[y]?.count || 0);

    } else {
      // Default: 'monthly' (12 months of current year)
      const currentYear = now.getFullYear();
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

      const startOfYear = new Date(currentYear, 0, 1, 0, 0, 0, 0);
      const endOfYear = new Date(currentYear, 11, 31, 23, 59, 59, 999);
      match.placed_at = { $gte: startOfYear, $lte: endOfYear };

      const agg = await Order.aggregate([
        { $match: match },
        {
          $group: {
            _id: { $month: '$placed_at' },
            totalSales: { $sum: '$total_amount' },
            count: { $sum: 1 },
          },
        },
      ]);

      const map = {};
      agg.forEach((item) => {
        map[item._id] = {
          sales: parseFloat(item.totalSales?.toString() || '0'),
          count: item.count,
        };
      });

      labels = monthNames;
      sales = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => map[m]?.sales || 0);
      orderCounts = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((m) => map[m]?.count || 0);
    }

    const totalSales = sales.reduce((a, b) => a + b, 0);
    const totalOrders = orderCounts.reduce((a, b) => a + b, 0);

    res.json({
      success: true,
      filter,
      labels,
      sales,
      orderCounts,
      totalSales,
      totalOrders,
    });
  } catch (err) {
    console.error('getDashboardChartData error:', err);
    res.status(500).json({ success: false, message: 'Server error loading chart data' });
  }
};

