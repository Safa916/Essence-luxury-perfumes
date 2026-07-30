const User = require('../../models/user');
const APIFeatures = require('../../utils/apiFeatures');

// GET /admin/users?search=&page=&limit=
exports.getUsersPage = async (req, res) => {
  try {
    const search = (req.query.search || '').trim();
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 8, 1);

    const baseQuery = User.find().select('-password_hash');

   
    const features = new APIFeatures(baseQuery, { search, page, limit })
      .search(['full_name', 'email'])
      .sort('created_at')
      .paginate();

    const users = await features.query;

   
    const countFeatures = new APIFeatures(User.find(), { search }).search(['full_name', 'email']);
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
      totalPages
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




