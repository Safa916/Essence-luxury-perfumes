const mongoose = require('mongoose');
const Product = require('../../models/product');
const Variant = require('../../models/variant');

const toDecimal = (val) => mongoose.Types.Decimal128.fromString(String(Number(val) || 0));

// Builds the next sequential variant SKU for a product, e.g. "V-9921-003"

async function nextVariantSku(product) {
  const shortId = product._id.toString().slice(-6).toUpperCase();

   const count = await Variant.countDocuments({ product_id: product._id });

  const seq = String(count + 1).padStart(3, '0');
  return `V-${shortId}-${seq}`;
}

// GET /admin/variants/single/:variantId  -> prefill data for the Edit modal

exports.getVariant = async (req, res) => {
  try {
    // Use .lean() so Decimal128 fields come back as BSON Decimal128 instances
    // that have a reliable .toString() method, not raw Mongoose Document objects.
    const variant = await Variant.findById(req.params.variantId).lean();
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    // Convert Decimal128 price → plain JS number so the browser receives a
    // normal numeric value instead of {"$numberDecimal":"..."}.
    const variantData = {
      ...variant,
      price: variant.price != null ? parseFloat(variant.price.toString()) : 0,
    };

    res.json({ success: true, variant: variantData });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not load variant' });
  }
};


// POST /admin/variants/:productId  -> "Add New Variant" modal submit

exports.addVariant = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const { variant_name, concentration, size_ml, quantity, price, is_active, sku } = req.body;

    // variant_name is now required
    if (!variant_name || !variant_name.trim()) {
      return res.status(400).json({ success: false, message: 'Variant name is required.' });
    }

    if (!size_ml || price === undefined || price === null || price === '') {
      return res.status(400).json({ success: false, message: 'Size and price are required' });
    }

    // Check for an existing active (non-deleted) variant with the same name
    const dupName = await Variant.findOne({
      product_id: product._id,
      variant_name: variant_name.trim(),
      deleted_at: null,
    });
    if (dupName) {
      return res.status(409).json({
        success: false,
        message: `A variant named "${variant_name.trim()}" already exists for this product. Please use a unique name.`,
      });
    }

    // Check for an existing active (non-deleted) variant with the same size + concentration
    const duplicate = await Variant.findOne({
      product_id: product._id,
      size_ml: Number(size_ml),
      concentration: (concentration || '').trim(),
      deleted_at: null,
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `A variant with ${size_ml}ml and "${concentration || 'no concentration'}" already exists. Please change either the size or the concentration.`,
      });
    }

    const variant = await Variant.create({
      product_id: product._id,
      sku: sku && sku.trim() ? sku.trim() : await nextVariantSku(product),
      variant_name: variant_name.trim(),
      concentration: (concentration || '').trim(),
      size_ml: Number(size_ml),
      quantity: Number(quantity) || 0,
      price: toDecimal(price),
      is_active: is_active === undefined ? true : is_active === 'true' || is_active === true,
    });

    // Keep the parent product's aggregate price/stock in sync
    await Promise.all([recalcProductStock(product._id), recalcProductPrice(product._id)]);

    res.status(201).json({ success: true, variant });
  } catch (err) {
    console.error('addVariant error:', err);
    // MongoDB duplicate key fallback (e.g. if the pre-check races)
    if (err.code === 11000) {
      const isNameDup = err.keyPattern && err.keyPattern.variant_name;
      return res.status(409).json({
        success: false,
        message: isNameDup
          ? 'A variant with that name already exists for this product.'
          : 'A variant with the same size and concentration already exists for this product.',
      });
    }
    res.status(400).json({ success: false, message: err.message || 'Could not add variant' });
  }
};



// PUT /admin/variants/:variantId  -> "Edit Variant" modal submit

exports.updateVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    const { variant_name, concentration, size_ml, quantity, price, is_active } = req.body;

    // variant_name is now required
    if (variant_name !== undefined && variant_name.trim() === '') {
      return res.status(400).json({ success: false, message: 'Variant name cannot be empty.' });
    }

    // If name is being changed, check uniqueness among other live variants
    const newName = variant_name !== undefined ? variant_name.trim() : variant.variant_name;
    if (newName && newName !== (variant.variant_name || '').trim()) {
      const dupName = await Variant.findOne({
        _id: { $ne: variant._id },
        product_id: variant.product_id,
        variant_name: newName,
        deleted_at: null,
      });
      if (dupName) {
        return res.status(409).json({
          success: false,
          message: `Another variant named "${newName}" already exists for this product. Please use a unique name.`,
        });
      }
    }

    // If size or concentration is being changed, check for a duplicate among other live variants
    const newSize   = size_ml !== undefined ? Number(size_ml) : variant.size_ml;
    const newConc   = concentration !== undefined ? (concentration || '').trim() : (variant.concentration || '').trim();

    const duplicate = await Variant.findOne({
      _id: { $ne: variant._id },          // exclude self
      product_id: variant.product_id,
      size_ml: newSize,
      concentration: newConc,
      deleted_at: null,
    });
    if (duplicate) {
      return res.status(409).json({
        success: false,
        message: `Another variant with ${newSize}ml and "${newConc || 'no concentration'}" already exists. Please change either the size or the concentration.`,
      });
    }

    if (variant_name  !== undefined) variant.variant_name  = newName;
    if (concentration !== undefined) variant.concentration  = newConc;
    if (size_ml       !== undefined) variant.size_ml        = newSize;
    if (quantity      !== undefined) variant.quantity       = Number(quantity);
    if (price         !== undefined) variant.price          = toDecimal(price);
    if (is_active     !== undefined) variant.is_active      = is_active === 'true' || is_active === true;

    await variant.save();
    await Promise.all([recalcProductStock(variant.product_id), recalcProductPrice(variant.product_id)]);

    res.json({ success: true, variant });
  } catch (err) {
    console.error('updateVariant error:', err);
    if (err.code === 11000) {
      const isNameDup = err.keyPattern && err.keyPattern.variant_name;
      return res.status(409).json({
        success: false,
        message: isNameDup
          ? 'A variant with that name already exists for this product.'
          : 'A variant with the same size and concentration already exists for this product.',
      });
    }
    res.status(400).json({ success: false, message: err.message || 'Could not update variant' });
  }
};



// DELETE /admin/variants/:variantId  -> "Delete Variant" confirm popup
// (soft delete via deleted_at, matching your schema)

exports.deleteVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    variant.deleted_at = new Date();
    variant.is_active = false;
    await variant.save();

    await recalcProductStock(variant.product_id);
    await recalcProductPrice(variant.product_id);

    res.json({ success: true, message: 'Variant deleted', id: variant._id });
  } catch (err) {
    console.error('deleteVariant error:', err);
    res.status(500).json({ success: false, message: 'Could not delete variant' });
  }
};

async function recalcProductStock(productId) {
  // Only count ACTIVE, non-deleted variants — a deactivated variant must NOT
  // contribute to the product's aggregate stock (matches recalcProductPrice logic).
  const variants = await Variant.find({ product_id: productId, is_active: true, deleted_at: null }).lean();
  const total = variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
  await Product.findByIdAndUpdate(productId, { stock: total });



}
async function recalcProductPrice(productId) {
  const variants = await Variant.find({ product_id: productId, is_active: true, deleted_at: null }).lean();
  if (!variants.length) return;
  const lowest = variants.reduce((min, v) => {
    const p = v.price != null ? parseFloat(v.price.toString()) : 0;
    return min === null || p < min ? p : min;
  }, null);
  await Product.findByIdAndUpdate(productId, { price: lowest });
}
module.exports.nextVariantSku = nextVariantSku;
module.exports.recalcProductStock = recalcProductStock;
module.exports.recalcProductPrice = recalcProductPrice;