const mongoose = require('mongoose');
const Product = require('../../models/product');
const Variant = require('../../models/variant');

const toDecimal = (val) => mongoose.Types.Decimal128.fromString(String(Number(val) || 0));

// Builds the next sequential variant SKU for a product, e.g. "V-9921-003"
async function nextVariantSku(product) {
  const shortSku = (product.sku || product._id.toString().slice(-4))
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(-4)
    .toUpperCase();

  const count = await Variant.countDocuments({ product_id: product._id }).setOptions({
    withDeleted: true,
  });

  const seq = String(count + 1).padStart(3, '0');
  return `V-${shortSku}-${seq}`;
}

// ---------------------------------------------------------------------------
// GET /admin/variants/single/:variantId  -> prefill data for the Edit modal
// ---------------------------------------------------------------------------
exports.getVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });
    res.json({ success: true, variant }); // toJSON transform converts price -> Number
  } catch (err) {
    res.status(500).json({ success: false, message: 'Could not load variant' });
  }
};

// ---------------------------------------------------------------------------
// POST /admin/variants/:productId  -> "Add New Variant" modal submit
// ---------------------------------------------------------------------------
exports.addVariant = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if (!product) return res.status(404).json({ success: false, message: 'Product not found' });

    const { variant_name, concentration, size_ml, quantity, price, is_active, sku } = req.body;

    if (!size_ml || price === undefined || price === null || price === '') {
      return res.status(400).json({ success: false, message: 'Size and price are required' });
    }

    const variant = await Variant.create({
      product_id: product._id,
      sku: sku && sku.trim() ? sku.trim() : await nextVariantSku(product),
      variant_name: variant_name || `${size_ml}ml ${concentration || ''}`.trim(),
      concentration,
      size_ml: Number(size_ml),
      quantity: Number(quantity) || 0,
      price: toDecimal(price),
      is_active: is_active === undefined ? true : is_active === 'true' || is_active === true,
    });

    // Keep the parent product's aggregate stock in sync
    await recalcProductStock(product._id);

    res.status(201).json({ success: true, variant });
  } catch (err) {
    console.error('addVariant error:', err);
    res.status(400).json({ success: false, message: err.message || 'Could not add variant' });
  }
};

// ---------------------------------------------------------------------------
// PUT /admin/variants/:variantId  -> "Edit Variant" modal submit
// ---------------------------------------------------------------------------
exports.updateVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    const { variant_name, concentration, size_ml, quantity, price, is_active } = req.body;

    if (variant_name !== undefined) variant.variant_name = variant_name;
    if (concentration !== undefined) variant.concentration = concentration;
    if (size_ml !== undefined) variant.size_ml = Number(size_ml);
    if (quantity !== undefined) variant.quantity = Number(quantity);
    if (price !== undefined) variant.price = toDecimal(price);
    if (is_active !== undefined) variant.is_active = is_active === 'true' || is_active === true;

    await variant.save();
    await recalcProductStock(variant.product_id);

    res.json({ success: true, variant });
  } catch (err) {
    console.error('updateVariant error:', err);
    res.status(400).json({ success: false, message: err.message || 'Could not update variant' });
  }
};

// ---------------------------------------------------------------------------
// DELETE /admin/variants/:variantId  -> "Delete Variant" confirm popup
// (soft delete via deleted_at, matching your schema)
// ---------------------------------------------------------------------------
exports.deleteVariant = async (req, res) => {
  try {
    const variant = await Variant.findById(req.params.variantId);
    if (!variant) return res.status(404).json({ success: false, message: 'Variant not found' });

    variant.deleted_at = new Date();
    variant.is_active = false;
    await variant.save();

    await recalcProductStock(variant.product_id);

    res.json({ success: true, message: 'Variant deleted', id: variant._id });
  } catch (err) {
    console.error('deleteVariant error:', err);
    res.status(500).json({ success: false, message: 'Could not delete variant' });
  }
};

// Recompute the product's aggregate stock (Product.stock) from its live
// (non-deleted) variants' `quantity` field.
async function recalcProductStock(productId) {
  const variants = await Variant.find({ product_id: productId }).lean();
  const total = variants.reduce((sum, v) => sum + (v.quantity || 0), 0);
  await Product.findByIdAndUpdate(productId, { stock: total });
}
