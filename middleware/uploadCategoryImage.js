const multer = require('multer');
const path = require('path');
const fs = require('fs');

const uploadDir = path.join(__dirname, '../public/uploads/categories');

// Ensure the folder exists (won't error if it already does)
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueName = `cat-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
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

// Single image, field name "banner" — matches the Category model's banner_url field
const uploadSingle = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('banner');

const uploadCategoryImage = (req, res, next) => {
  uploadSingle(req, res, (err) => {
    if (err) {
      console.error('Category image upload error:', err.message);
      const isEdit = req.params && req.params.id;
      const modalParam = isEdit ? `openModal=edit&editId=${req.params.id}` : 'openModal=add';
      return res.redirect(
        `/admin/categories?${modalParam}&formError=${encodeURIComponent(err.message || 'Image upload failed')}`
      );
    }
    next();
  });
};

// Builds the public URL saved on the Category doc, e.g. "/uploads/categories/cat-...jpg"
const toPublicPath = (filename) => `/uploads/categories/${filename}`;


module.exports = { uploadCategoryImage, toPublicPath, uploadDir };