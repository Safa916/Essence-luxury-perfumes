const mongoose = require('mongoose');

const homepageSettingsSchema = new mongoose.Schema(
  {
    category_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    featured_products: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],
    featured_category_banner: [
      {
        // array of embedded objects — e.g. { category_id, image_url, title }
        category_id: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'Category',
        },
        image_url: String,
        title: String,
      },
    ],
    banner_image_url: {
      type: String,
      default: null,
    },
    campaign_headline: {
      type: String,
      trim: true,
    },
    campaign_subtext: {
      type: String,
      trim: true,
    },
    auto_active: {
      type: Boolean,
      default: false,
      // e.g. auto-activate this campaign based on scheduling
    },
    is_active: {
      type: Boolean,
      default: true,
    },
    expires_in_hours: {
      type: Number,
      default: null,
    },
    updated_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin', // tracks which admin last updated homepage settings
      default: null,
    },
  },
  { timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' } }
);

const homepageSettings = mongoose.models.homepageSettings || mongoose.model('homepageSettings', homepageSettingsSchema);
module.exports = homepageSettings;