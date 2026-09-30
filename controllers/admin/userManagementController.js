const User = require('../../models/user');
const APIFeatures = require('../../utils/apiFeatures');


// GET /admin/users?search=&page=&limit=


exports.getUsersPage = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 8, 1);
    const joined = (req.query.joined || '').trim();

    // ---- Build the "joined date" filter ----
    const joinedFilter = {};
    const now = new Date();

    if (joined === 'today') {
      const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      joinedFilter.created_at = { $gte: startOfToday };
    } else if (joined === '7days') {
      joinedFilter.created_at = { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) };
    } else if (joined === '30days') {
      joinedFilter.created_at = { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) };
    } else if (joined === 'thisyear') {
      joinedFilter.created_at = { $gte: new Date(now.getFullYear(), 0, 1) };
    }

    const baseQuery = User.find(joinedFilter).select('-password_hash');

    const features = new APIFeatures(baseQuery, { search, page, limit })
      .search(['full_name', 'email'])
      .sort({ is_active: -1 })
      .paginate();

    const users = await features.query;

    // Count needs the SAME filters (search + joined) to match what's shown
    const countFeatures = new APIFeatures(User.find(joinedFilter), { search }).search(['full_name', 'email']);
    const matchedUsers = await countFeatures.query.countDocuments();

    const totalUsersAll = await User.countDocuments({});
    const totalActive = await User.countDocuments({ is_active: true });

    const totalPages = Math.max(Math.ceil(matchedUsers / limit), 1);

    res.render('admin/userManagement', {
      users,
      search,
      page,
      limit,
      matchedUsers,
      totalUsersAll,
      totalActive,
      totalPages,
      joined, // <-- new: pass this to the view so the <select> shows the right selected option
    });
  } catch (err) {
    console.error('Error loading users page:', err);
    res.status(500).send('Something went wrong loading users');
  }
};

// POST /admin/users/:id/toggle-block
exports.toggleBlockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      user.is_active = !user.is_active; // is_active = false means blocked
      await user.save();
    }

    // send the admin back to the same search/page they were on
    const backTo = req.body.redirectTo || '/admin/users';
    res.redirect(backTo);
  } catch (err) {
    console.error('Error toggling block status:', err);
    res.redirect('/admin/users');
  }

};

 














