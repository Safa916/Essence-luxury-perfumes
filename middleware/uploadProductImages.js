const multer = require('multer');
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');

const uploadDir = path.join(__dirname, '../public/uploads/products');

// Ensure the folder exists (won't error if it already does)
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    // No req.user for products (unlike avatars) — use a random unique id instead
    const uniqueName = `pdt-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
    cb(null, uniqueName);
  },
});

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and WEBP images are allowed'));
  }
};

const uploadProductImages = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 }, // 5MB per image, 8 max
});

// Builds the public URL saved on the Product doc, e.g. "/uploads/products/pdt-...jpg"
const toPublicPath = (filename) => `/uploads/products/${filename}`;

// ---------------------------------------------------------------------------
// (iii) Server-side resize/optimize safety net — same idea as your avatar
// upload, just for multiple product images. Runs AFTER multer, BEFORE the
// controller reads req.files. Re-encodes to JPEG, strips EXIF, caps
// dimensions — a backstop in case the browser-side Cropper.js step
// (public/admin/js/productForm.js) was skipped or bypassed.
// ---------------------------------------------------------------------------
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

async function resizeProductImages(req, res, next) {
  try {
    const files = req.files || [];
    if (!files.length) return next();

    await Promise.all(
      files.map(async (file) => {
        const tmpPath = `${file.path}.tmp`;
        await sharp(file.path)
          .rotate() // respect EXIF orientation, then strip it
          .resize({
            width: MAX_DIMENSION,
            height: MAX_DIMENSION,
            fit: 'inside',
            withoutEnlargement: true,
          })
          .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
          .toFile(tmpPath);

        fs.unlinkSync(file.path);
        fs.renameSync(tmpPath, file.path);
      })
    );

    next();
  } catch (err) {
    console.error('resizeProductImages error:', err);
    // Don't hard-fail the upload just because optimization failed — the
    // original (already client-cropped) file is still usable.
    next();
  }
}

module.exports = { uploadProductImages, toPublicPath, uploadDir, resizeProductImages };
