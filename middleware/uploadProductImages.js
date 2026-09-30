const multer = require('multer');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

// Make sure the upload folder exists
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'products');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Store the raw upload in memory first — we need the buffer so sharp can resize
// it before it ever touches disk (this avoids saving huge/oversized originals).
const storage = multer.memoryStorage();

const ALLOWED_MIMES      = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const ALLOWED_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

function fileFilter(req, file, cb) {
  const mimeOk = ALLOWED_MIMES.includes(file.mimetype);
  const ext    = path.extname(file.originalname).toLowerCase();
  const extOk  = ALLOWED_EXTENSIONS.includes(ext);

  if (mimeOk && extOk) {
    cb(null, true);
  } else {
    const err = new Error(
      `"${file.originalname}" is not a valid image. Only JPG, PNG, WebP and GIF files are allowed.`
    );
    err.code = 'INVALID_FILE_TYPE';
    cb(err, false);
  }
}

// The multer instance itself — used in routes as uploadProductImages.array('images', 8)
const uploadProductImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max per file
});

// Runs AFTER uploadProductImages in the route chain.
// Resizes every uploaded file, saves it to disk as a JPEG, and stores the
// resulting paths on req.body.images so the controller can save them to the product.
async function resizeProductImages(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return next(); // no new images uploaded — nothing to do
    }

    req.processedImages = [];

    await Promise.all(
      req.files.map(async (file, index) => {
        const filename = `product-${Date.now()}-${index + 1}.jpeg`;

        await sharp(file.buffer)
          .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
          .toFormat('jpeg')
          .jpeg({ quality: 88 })
          .toFile(path.join(uploadDir, filename));

        req.processedImages.push(`/uploads/products/${filename}`);
      })
    );

    next();
  } catch (err) {
    next(err);
  }
}

// uploadDir is exported so the product controller can clean up resized files
// that were already written to disk if the rest of the submission turns out
// to be invalid (resizeProductImages saves files BEFORE the controller gets
// a chance to validate the rest of the form).
module.exports = { uploadProductImages, resizeProductImages, uploadDir };