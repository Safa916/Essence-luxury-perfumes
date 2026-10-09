const mongoose = require('mongoose');

const dashboardAnalyticsSchema = new mongoose.Schema(
  {
    snapshot_date: {
      type: Date,
      required: [true, 'Snapshot date is required'],
    },
    period: {
      type: String,
      trim: true,
      // e.g. "daily", "weekly", "monthly"
    },
    total_users: {
      type: Number,
      default: 0,
    },
    active_users: {
      type: Number,
      default: 0,
    },
    blocked_users: {
      type: Number,
      default: 0,
    },
    total_orders: {
      type: Number,
      default: 0,
    },
    orders_change_pct: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    total_revenue: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    revenue_change_pct: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    avg_order_value: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    total_returns: {
      type: Number,
      default: 0,
    },
    return_rate: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    returns_change_pct: {
      type: mongoose.Schema.Types.Decimal128,
      default: 0,
    },
    product_count: {
      type: Number,
      default: 0,
    },
    payment_methods: [
      {
        // e.g. { method: "card", count: 120, total_amount: 4500 }
        method: String,
        count: Number,
        total_amount: mongoose.Schema.Types.Decimal128,
      },
    ],
    sales_by_category: [
      {
        // e.g. { category_id, category_name, total_sales }
        category_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Category',
        },
        category_name: String,
        total_sales: mongoose.Schema.Types.Decimal128,
      },
    ],
    regional_distribution: {
      type: [String],
      default: [],
      // simple array, e.g. ["Mumbai: 45%", "Delhi: 30%", ...] — adjust structure if you need more detail
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const dashboardAnalytics = mongoose.models.dashboardAnalytics || mongoose.model('dashboardAnalytics', dashboardAnalyticsSchema);
module.exports = dashboardAnalytics;