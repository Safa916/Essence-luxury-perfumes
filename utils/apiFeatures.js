/**
 * APIFeatures — the "util service" your mentor mentioned.
 *
 * It wraps a Mongoose query and lets you chain search / sort / pagination
 * onto it based on the query string (req.query), instead of writing that
 * logic separately in every controller.
 *
 * Usage (see controllers/userManagementController.js):
 *
 *   const features = new APIFeatures(User.find(), req.query)
 *     .search(['full_name', 'email'])
 *     .sort('-created_at')
 *     .paginate();
 *
 *   const users = await features.query;
 */
class APIFeatures {
  constructor(query, queryString) {
    this.query = query; // a Mongoose Query, e.g. User.find()
    this.queryString = queryString; // usually req.query
    this.pagination = { page: 1, limit: 10, skip: 0 };
  }

  // Case-insensitive partial match across the given fields.
  // e.g. search(['full_name', 'email']) -> matches if EITHER field contains the search text
  search(fields = []) {
    const { search } = this.queryString;

    if (search && String(search).trim() !== '') {
      // escape regex special characters so user input can't break the query
      const safe = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(safe, 'i');

      const orConditions = fields.map((field) => ({ [field]: regex }));
      this.query = this.query.find({ $or: orConditions });
    }

    return this;
  }

  // Sort — defaults to newest first (descending by created_at)
  sort(defaultSort = '-created_at') {
    if (this.queryString.sort) {
      const sortBy = this.queryString.sort.split(',').join(' ');
      this.query = this.query.sort(sortBy);
    } else {
      this.query = this.query.sort(defaultSort); // '-created_at' = latest first
    }
    return this;
  }

  // Pagination using page & limit from the query string
  paginate() {
    const page = Math.max(parseInt(this.queryString.page, 10) || 1, 1);
    const limit = Math.max(parseInt(this.queryString.limit, 10) || 8, 1);
    const skip = (page - 1) * limit;

    this.query = this.query.skip(skip).limit(limit);
    this.pagination = { page, limit, skip };

    return this;
  }
}

module.exports = APIFeatures;
