import User from '../../models/user.js';
import APIFeatures from '../../utils/apiFeatures.js';
import { HTTP_STATUS } from '../../constants/httpStatus.js';


// GET /admin/users?search=&page=&limit=
export const getUsersPage = async (req, res) => {
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
      .sort({ created_at: -1 })
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
    res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).send('Something went wrong loading users');
  }
};




// POST /admin/users/:id/toggle-block
export const toggleBlockUser = async (req, res) => {
  const isAjax = req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type'] === 'application/json';

  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      if (isAjax) {
        return res.status(HTTP_STATUS.NOT_FOUND).json({
          success: false,
          message: 'User not found.',
        });
      }
      return res.redirect('/admin/users');
    }

    user.is_active = !user.is_active; // is_active = false means blocked
    await user.save();

    const totalActive = await User.countDocuments({ is_active: true });

    if (isAjax) {
      return res.json({
        success: true,
        is_active: user.is_active,
        totalActive,
        message: user.is_active
          ? `${user.full_name || 'User'} has been unblocked.`
          : `${user.full_name || 'User'} has been blocked.`,
      });
    }

    // send the admin back to the same search/page they were on
    const backTo = req.body.redirectTo || '/admin/users';
    res.redirect(backTo);
  } catch (err) {
    console.error('Error toggling block status:', err);
    if (isAjax) {
      return res.status(HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
        success: false,
        message: 'Something went wrong while updating user status.',
      });
    }
    res.redirect('/admin/users');
  }
};


















export default {
  getUsersPage,
  toggleBlockUser
};
