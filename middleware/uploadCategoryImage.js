import multer from 'multer';
import path from 'path';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import s3, { S3_BUCKET, S3_BASE_URL } from '../config/s3.js';

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG, PNG, and WEBP images are allowed'));
  }
};

// Store in memory — we upload the buffer directly to S3
const uploadSingle = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
}).single('banner');

const uploadCategoryImage = (req, res, next) => {
  uploadSingle(req, res, async (err) => {
    if (err) {
      console.error('Category image upload error:', err.message);
      const isEdit = req.params && req.params.id;
      const modalParam = isEdit ? `openModal=edit&editId=${req.params.id}` : 'openModal=add';
      return res.redirect(
        `/admin/categories?${modalParam}&formError=${encodeURIComponent(err.message || 'Image upload failed')}`
      );
    }

    // If a file was chosen, upload it to S3 now
    if (req.file) {
      try {
        const ext      = path.extname(req.file.originalname).toLowerCase() || '.jpg';
        const filename = `categories/cat-${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

        await s3.send(new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: filename,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }));

        // Attach the public S3 URL so the controller can save it
        req.file.s3Url = `${S3_BASE_URL}/${filename}`;
      } catch (s3Err) {
        console.error('S3 upload error (category):', s3Err.message);
        const isEdit   = req.params && req.params.id;
        const modalParam = isEdit ? `openModal=edit&editId=${req.params.id}` : 'openModal=add';
        return res.redirect(
          `/admin/categories?${modalParam}&formError=${encodeURIComponent('Image upload failed. Please try again.')}`
        );
      }
    }

    next();
  });
};

// Builds the public URL — now returns the full S3 URL that was stored on req.file.s3Url
// Kept for backward compat; controllers should prefer req.file.s3Url directly.
const toPublicPath = (s3Url) => s3Url;

// Deletes an old category banner from S3 (best-effort, never throws)
async function deleteBannerFromS3(bannerUrl) {
  if (!bannerUrl || !bannerUrl.startsWith('https://')) return;
  try {
    const key = bannerUrl.replace(`${S3_BASE_URL}/`, '');
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (err) {
    console.error('S3 delete error (category banner):', err.message);
  }
}

// uploadDir kept as null so any stale import doesn't crash
const uploadDir = null;

export { uploadCategoryImage, toPublicPath, deleteBannerFromS3, uploadDir };
export default { uploadCategoryImage, toPublicPath, deleteBannerFromS3, uploadDir };
