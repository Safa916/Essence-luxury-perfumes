import multer from 'multer';
import sharp from 'sharp';
import path from 'path';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import s3, { S3_BUCKET, S3_BASE_URL } from '../config/s3.js';

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

// Store files in memory — we resize with sharp before uploading to S3
const uploadProductImages = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB per file
});

// Runs AFTER uploadProductImages in the route chain.
// Resizes every file with sharp, uploads the buffer to S3, and stores
// the resulting S3 URLs on req.processedImages for the controller.
async function resizeProductImages(req, res, next) {
  try {
    if (!req.files || req.files.length === 0) {
      return next(); // no new images uploaded — nothing to do
    }

    req.processedImages = [];

    await Promise.all(
      req.files.map(async (file, index) => {
        const filename = `products/product-${Date.now()}-${index + 1}.jpeg`;

        // Resize with sharp → get a buffer (never write to local disk)
        const buffer = await sharp(file.buffer)
          .resize(1000, 1000, { fit: 'inside', withoutEnlargement: true })
          .toFormat('jpeg')
          .jpeg({ quality: 88 })
          .toBuffer();

        // Upload buffer directly to S3
        await s3.send(new PutObjectCommand({
          Bucket: S3_BUCKET,
          Key: filename,
          Body: buffer,
          ContentType: 'image/jpeg',
        }));

        req.processedImages.push(`${S3_BASE_URL}/${filename}`);
      })
    );

    next();
  } catch (err) {
    next(err);
  }
}

// Deletes an array of S3 URLs from the bucket.
// The product controller calls this on validation failure / product deletion.
async function deleteProductImagesFromS3(imageUrls = []) {
  if (!imageUrls || imageUrls.length === 0) return;
  await Promise.all(
    imageUrls.map(async (url) => {
      try {
        // Extract the S3 key from the full URL
        // e.g. "https://bucket.s3.region.amazonaws.com/products/product-xxx.jpeg"
        //   →  "products/product-xxx.jpeg"
        const key = url.replace(`${S3_BASE_URL}/`, '');
        await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
      } catch (err) {
        console.error('S3 delete error for', url, err.message);
      }
    })
  );
}

// uploadDir is kept as a no-op export so any existing import doesn't break
export const uploadDir = null;

export { uploadProductImages, resizeProductImages, deleteProductImagesFromS3 };
export default { uploadProductImages, resizeProductImages, deleteProductImagesFromS3, uploadDir };
