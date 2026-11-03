/**
 * Refactor script: Remove flat/fixed discount type from Offers and Coupons.
 * Makes everything percentage-only.
 * Run with: node scripts/refactor_percentage_only.js
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve } from 'path';

const root = resolve('.');

function read(rel) { return readFileSync(resolve(root, rel), 'utf8'); }
function write(rel, content) { writeFileSync(resolve(root, rel), content, 'utf8'); }

// ─────────────────────────────────────────────────────────────────────────────
// 1. models/offer.js — remove 'fixed' from enum, add default 'percentage'
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('models/offer.js');
  src = src.replace(
    `discount_type: {\n      type: String,\n      enum: ['percentage', 'fixed'],\n      required: [true, 'Discount type is required'],\n    },`,
    `discount_type: {\n      type: String,\n      enum: ['percentage'],\n      default: 'percentage',\n      required: [true, 'Discount type is required'],\n    },`
  );
  write('models/offer.js', src);
  console.log('✅ models/offer.js');
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. models/coupon.js — remove 'fixed' from enum, add default, fix comment
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('models/coupon.js');
  src = src.replace(
    `discount_type: {\n      type: String,\n      enum: ['percentage', 'fixed'],\n      required: [true, 'Discount type is required'],\n    },`,
    `discount_type: {\n      type: String,\n      enum: ['percentage'],\n      default: 'percentage',\n      required: [true, 'Discount type is required'],\n    },`
  );
  // Fix the comment on max_discount_amount
  src = src.replace(
    `default: null, // nullable — e.g. for "fixed" discounts, a cap may not apply`,
    `default: null, // nullable — leave null for unlimited cap`
  );
  write('models/coupon.js', src);
  console.log('✅ models/coupon.js');
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. services/offerService.js — fix evaluateOffer: remove fixed branch,
//    recalculate effective % when cap applied
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('services/offerService.js');
  src = src.replace(
    `  if (offer.discount_type === 'percentage') {\n    percentage = val;\n    discount = (price * val) / 100;\n    const maxDiscount = toNum(offer.maximum_discount_amount);\n    if (maxDiscount > 0 && discount > maxDiscount) {\n      discount = maxDiscount;\n    }\n  } else {\n    // flat/fixed amount\n    discount = val;\n    percentage = price > 0 ? (discount / price) * 100 : 0;\n  }`,
    `  // Always percentage (flat amount removed)
  percentage = val;
  discount = (price * val) / 100;
  const maxDiscount = toNum(offer.maximum_discount_amount);
  if (maxDiscount > 0 && discount > maxDiscount) {
    discount = maxDiscount;
    // Recalculate effective percentage when capped
    percentage = price > 0 ? (discount / price) * 100 : 0;
  }`
  );
  write('services/offerService.js', src);
  console.log('✅ services/offerService.js');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. controllers/admin/offerController.js — remove fixed validations,
//    hardcode discount_type = 'percentage'
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('controllers/admin/offerController.js');

  // createOffer: remove 'discount_type' from destructuring
  src = src.replace(
    `    const {\n      name,\n      internal_code,\n      discount_type,\n      discount_value,\n      apply_to,\n      target_id,\n      minimum_purchase_amount,\n      maximum_discount_amount,\n      start_date,\n      end_date,\n      status,\n    } = req.body;\n\n    // Validations\n    if (!name || !name.trim()) {\n      return res.redirect('/admin/offers?error=name_required');\n    }\n\n    const val = parseFloat(discount_value);\n    if (isNaN(val) || val <= 0) {\n      return res.redirect('/admin/offers?error=invalid_discount');\n    }\n\n    if (discount_type === 'percentage' && (val <= 0 || val > 90)) {\n      return res.redirect('/admin/offers?error=percentage_out_of_range');\n    }\n\n    // For fixed offers: must be a reasonable amount (cap at ₹10,000)\n    if (discount_type === 'fixed' && val > 10000) {\n      return res.redirect('/admin/offers?error=fixed_amount_too_high');\n    }\n\n    // For fixed offers with minimum_purchase_amount: discount must be less than min order value\n    const minPurchase = parseFloat(minimum_purchase_amount) || 0;\n    if (discount_type === 'fixed' && minPurchase > 0 && val >= minPurchase) {\n      return res.redirect('/admin/offers?error=fixed_exceeds_min_purchase');\n    }`,
    `    const {\n      name,\n      internal_code,\n      discount_value,\n      apply_to,\n      target_id,\n      minimum_purchase_amount,\n      maximum_discount_amount,\n      start_date,\n      end_date,\n      status,\n    } = req.body;\n\n    // Validations\n    if (!name || !name.trim()) {\n      return res.redirect('/admin/offers?error=name_required');\n    }\n\n    const val = parseFloat(discount_value);\n    if (isNaN(val) || val <= 0 || val > 90) {\n      return res.redirect('/admin/offers?error=percentage_out_of_range');\n    }`
  );

  // createOffer: hardcode discount_type in Offer.create
  src = src.replace(
    `      discount_type: discount_type === 'fixed' ? 'fixed' : 'percentage',`,
    `      discount_type: 'percentage',`
  );

  // updateOffer: remove 'discount_type' from destructuring
  src = src.replace(
    `    const {\n      name,\n      internal_code,\n      discount_type,\n      discount_value,\n      apply_to,\n      target_id,\n      minimum_purchase_amount,\n      maximum_discount_amount,\n      start_date,\n      end_date,\n      status,\n    } = req.body;\n\n    if (!name || !name.trim()) {\n      return res.redirect(\`/admin/offers/\${req.params.id}/edit?error=name_required\`);\n    }\n\n    const val = parseFloat(discount_value);\n    if (isNaN(val) || val <= 0) {\n      return res.redirect(\`/admin/offers/\${req.params.id}/edit?error=invalid_discount\`);\n    }\n\n    if (discount_type === 'percentage' && (val <= 0 || val > 90)) {\n      return res.redirect(\`/admin/offers/\${req.params.id}/edit?error=percentage_out_of_range\`);\n    }\n\n    // For fixed offers: must be a reasonable amount (cap at ₹10,000)\n    if (discount_type === 'fixed' && val > 10000) {\n      return res.redirect(\`/admin/offers/\${req.params.id}/edit?error=fixed_amount_too_high\`);\n    }\n\n    // For fixed offers with minimum_purchase_amount: discount must be less than min order value\n    const minPurchaseEdit = parseFloat(minimum_purchase_amount) || 0;\n    if (discount_type === 'fixed' && minPurchaseEdit > 0 && val >= minPurchaseEdit) {\n      return res.redirect(\`/admin/offers/\${req.params.id}/edit?error=fixed_exceeds_min_purchase\`);\n    }`,
    `    const {\n      name,\n      internal_code,\n      discount_value,\n      apply_to,\n      target_id,\n      minimum_purchase_amount,\n      maximum_discount_amount,\n      start_date,\n      end_date,\n      status,\n    } = req.body;\n\n    if (!name || !name.trim()) {\n      return res.redirect(\`/admin/offers/\${req.params.id}/edit?error=name_required\`);\n    }\n\n    const val = parseFloat(discount_value);\n    if (isNaN(val) || val <= 0 || val > 90) {\n      return res.redirect(\`/admin/offers/\${req.params.id}/edit?error=percentage_out_of_range\`);\n    }`
  );

  // updateOffer: hardcode discount_type in offer.discount_type assignment
  src = src.replace(
    `    offer.discount_type = discount_type === 'fixed' ? 'fixed' : 'percentage';`,
    `    offer.discount_type = 'percentage';`
  );

  write('controllers/admin/offerController.js', src);
  console.log('✅ controllers/admin/offerController.js');
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. controllers/admin/couponController.js — remove cleanType, hardcode percentage
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('controllers/admin/couponController.js');

  // createCoupon: remove discount_type from destructuring
  src = src.replace(
    `    const { code, description, discount_type, discount_value,\n            min_order_value, max_discount_amount, valid_until,\n            usage_limit_per_user, total_usage_limit, is_active } = req.body;`,
    `    const { code, description, discount_value,\n            min_order_value, max_discount_amount, valid_until,\n            usage_limit_per_user, total_usage_limit, is_active } = req.body;`
  );

  // createCoupon: remove cleanType line
  src = src.replace(
    `    const cleanType = discount_type === 'fixed' ? 'fixed' : 'percentage';\n    const dv        = parseFloat(discount_value);`,
    `    const dv        = parseFloat(discount_value);`
  );

  // createCoupon: replace all cleanType usages with 'percentage'
  // Step: fix dv > 100 check
  src = src.replace(
    `    if (cleanType === 'percentage' && dv > 100) {\n      return res.redirect('/admin/coupons?error=invalid_value&open=add');\n    }`,
    `    if (dv > 100) {\n      return res.redirect('/admin/coupons?error=invalid_value&open=add');\n    }`
  );

  // createCoupon: remove fixed_gt_min check
  src = src.replace(
    `    if (cleanType === 'fixed' && mov > 0 && dv >= mov) {\n      return res.redirect('/admin/coupons?error=fixed_gt_min&open=add');\n    }\n\n    // 5. Max discount cap validation (required for percentage discounts)\n    if (cleanType === 'percentage') {\n      if (maxCap == null || isNaN(maxCap) || maxCap <= 0) {\n        return res.redirect('/admin/coupons?error=invalid_max_cap&open=add');\n      }\n    }`,
    `    // 5. Max discount cap validation (required for all percentage discounts)\n    if (maxCap == null || isNaN(maxCap) || maxCap <= 0) {\n      return res.redirect('/admin/coupons?error=invalid_max_cap&open=add');\n    }`
  );

  // createCoupon: fix Coupon.create
  src = src.replace(
    `      discount_type      : cleanType,\n      discount_value     : dv,\n      min_order_value    : mov,\n      max_discount_amount: cleanType === 'percentage' ? maxCap : null,`,
    `      discount_type      : 'percentage',\n      discount_value     : dv,\n      min_order_value    : mov,\n      max_discount_amount: maxCap,`
  );

  // updateCoupon: remove discount_type from destructuring
  src = src.replace(
    `    const { description, discount_type, discount_value,\n            min_order_value, max_discount_amount, valid_until,\n            usage_limit_per_user, total_usage_limit, is_active } = req.body;`,
    `    const { description, discount_value,\n            min_order_value, max_discount_amount, valid_until,\n            usage_limit_per_user, total_usage_limit, is_active } = req.body;`
  );

  // updateCoupon: remove cleanType line
  src = src.replace(
    `    const cleanType = discount_type === 'fixed' ? 'fixed' : 'percentage';\n    const dv        = parseFloat(discount_value);`,
    `    const dv        = parseFloat(discount_value);`
  );

  // updateCoupon: fix dv > 100 check
  src = src.replace(
    `    if (cleanType === 'percentage' && dv > 100) {\n      return res.redirect(\`/admin/coupons/\${couponId}/edit?error=invalid_value\`);\n    }`,
    `    if (dv > 100) {\n      return res.redirect(\`/admin/coupons/\${couponId}/edit?error=invalid_value\`);\n    }`
  );

  // updateCoupon: remove fixed_gt_min check and simplify max cap validation
  src = src.replace(
    `    if (cleanType === 'fixed' && mov > 0 && dv >= mov) {\n      return res.redirect(\`/admin/coupons/\${couponId}/edit?error=fixed_gt_min\`);\n    }\n\n    // 4. Max discount cap validation\n    if (cleanType === 'percentage') {\n      if (maxCap == null || isNaN(maxCap) || maxCap <= 0) {\n        return res.redirect(\`/admin/coupons/\${couponId}/edit?error=invalid_max_cap\`);\n      }\n    }`,
    `    // 4. Max discount cap validation (required for all percentage discounts)\n    if (maxCap == null || isNaN(maxCap) || maxCap <= 0) {\n      return res.redirect(\`/admin/coupons/\${couponId}/edit?error=invalid_max_cap\`);\n    }`
  );

  // updateCoupon: fix findByIdAndUpdate
  src = src.replace(
    `      discount_type      : cleanType,\n      discount_value     : dv,\n      min_order_value    : mov,\n      max_discount_amount: cleanType === 'percentage' ? maxCap : null,`,
    `      discount_type      : 'percentage',\n      discount_value     : dv,\n      min_order_value    : mov,\n      max_discount_amount: maxCap,`
  );

  write('controllers/admin/couponController.js', src);
  console.log('✅ controllers/admin/couponController.js');
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. controllers/user/couponController.js — remove fixed branch in applyCoupon
// ─────────────────────────────────────────────────────────────────────────────
{
  let src = read('controllers/user/couponController.js');
  src = src.replace(
    `    // 6. Calculate discount\n    let discountValue = 0;\n    if (coupon.discount_type === 'percentage') {\n      discountValue = parseFloat(((subtotal * toNum(coupon.discount_value)) / 100).toFixed(2));\n      const cap = toNum(coupon.max_discount_amount);\n      if (cap > 0 && discountValue > cap) discountValue = cap;\n    } else {\n      // fixed\n      discountValue = toNum(coupon.discount_value);\n    }`,
    `    // 6. Calculate discount (percentage only)
    let discountValue = 0;
    discountValue = parseFloat(((subtotal * toNum(coupon.discount_value)) / 100).toFixed(2));
    const cap = toNum(coupon.max_discount_amount);
    if (cap > 0 && discountValue > cap) discountValue = cap;`
  );
  write('controllers/user/couponController.js', src);
  console.log('✅ controllers/user/couponController.js');
}

console.log('\n✅ All JS/model files patched. Now patch views separately.\n');
