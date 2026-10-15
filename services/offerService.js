const Offer = require('../models/offer');

function toNum(d) {
  if (d == null) return 0;
  return parseFloat(d.toString());
}

/**
 * Get all active, non-expired offers that are currently valid.
 */
async function getActiveOffers() {
  const now = new Date();
  const offers = await Offer.find({
    deleted_at: null,
    status: 'active',
    $and: [
      {
        $or: [
          { start_date: null },
          { start_date: { $lte: now } },
        ],
      },
      {
        $or: [
          { end_date: null },
          { end_date: { $gte: now } },
        ],
      },
    ],
  }).lean();

  return offers;
}

/**
 * Compute the discount amount and percentage given an offer and base price.
 */
function evaluateOffer(offer, price) {
  if (!offer || price <= 0) return { discount: 0, percentage: 0 };

  const minPurchase = toNum(offer.minimum_purchase_amount);
  if (minPurchase > 0 && price < minPurchase) {
    return { discount: 0, percentage: 0 };
  }

  const val = toNum(offer.discount_value);
  let discount = 0;
  let percentage = 0;

  if (offer.discount_type === 'percentage') {
    percentage = val;
    discount = (price * val) / 100;
    const maxDiscount = toNum(offer.maximum_discount_amount);
    if (maxDiscount > 0 && discount > maxDiscount) {
      discount = maxDiscount;
    }
  } else {
    // flat/fixed amount
    discount = val;
    percentage = price > 0 ? (discount / price) * 100 : 0;
  }

  discount = Math.min(discount, price);
  discount = parseFloat(discount.toFixed(2));
  percentage = parseFloat(percentage.toFixed(1));

  return { discount, percentage, offer };
}

/**
 * Calculate the best offer for a specific product and category against its original price.
 * Compares Product Offer vs Category Offer and chooses the LARGER discount.
 * 
 * @param {Object} params
 * @param {string|ObjectId} params.productId
 * @param {string|ObjectId} params.categoryId
 * @param {number} params.price - Original price
 * @param {Array} [params.activeOffers] - Optional pre-fetched active offers
 * @returns {Object} { finalPrice, originalPrice, discount, percentage, appliedOffer, offerType }
 */
function calculateProductDiscount({ productId, categoryId, price, activeOffers = [] }) {
  const originalPrice = parseFloat(Number(price || 0).toFixed(2));
  if (originalPrice <= 0) {
    return {
      originalPrice: 0,
      finalPrice: 0,
      discount: 0,
      discountPercentage: 0,
      appliedOffer: null,
      offerType: null,
    };
  }

  const pIdStr = productId ? productId.toString() : '';
  const cIdStr = categoryId ? categoryId.toString() : '';

  let bestProductOffer = null;
  let bestProductDiscount = 0;
  let bestProductPercentage = 0;

  let bestCategoryOffer = null;
  let bestCategoryDiscount = 0;
  let bestCategoryPercentage = 0;

  for (const offer of activeOffers) {
    const targetIds = (offer.target_ids || []).map((id) => id.toString());

    if (offer.apply_to === 'product' && targetIds.includes(pIdStr)) {
      const evalRes = evaluateOffer(offer, originalPrice);
      if (evalRes.discount > bestProductDiscount) {
        bestProductDiscount = evalRes.discount;
        bestProductPercentage = evalRes.percentage;
        bestProductOffer = offer;
      }
    } else if (offer.apply_to === 'category' && targetIds.includes(cIdStr)) {
      const evalRes = evaluateOffer(offer, originalPrice);
      if (evalRes.discount > bestCategoryDiscount) {
        bestCategoryDiscount = evalRes.discount;
        bestCategoryPercentage = evalRes.percentage;
        bestCategoryOffer = offer;
      }
    }
  }

  // Compare Product Offer vs Category Offer and apply the larger discount
  let appliedOffer = null;
  let finalDiscount = 0;
  let finalPercentage = 0;
  let offerType = null;

  if (bestProductDiscount > 0 || bestCategoryDiscount > 0) {
    if (bestProductDiscount >= bestCategoryDiscount) {
      appliedOffer = bestProductOffer;
      finalDiscount = bestProductDiscount;
      finalPercentage = bestProductPercentage;
      offerType = 'product';
    } else {
      appliedOffer = bestCategoryOffer;
      finalDiscount = bestCategoryDiscount;
      finalPercentage = bestCategoryPercentage;
      offerType = 'category';
    }
  }

  const finalPrice = parseFloat(Math.max(0, originalPrice - finalDiscount).toFixed(2));

  return {
    originalPrice,
    finalPrice,
    discount: finalDiscount,
    discountPercentage: Math.round(finalPercentage),
    appliedOffer,
    offerType,
  };
}

module.exports = {
  getActiveOffers,
  calculateProductDiscount,
  toNum,
};
