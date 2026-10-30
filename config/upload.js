import multer from 'multer';
import path from 'path';
import { PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import s3, { S3_BUCKET, S3_BASE_URL } from './s3.js';

const fileFilter = (req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG and PNG images are allowed'));
  }
};

// Use memory storage — upload buffer to S3 after multer parses it
const uploadAvatar = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: 3 * 1024 * 1024 }, // 3MB max
});

// Call this after uploadAvatar.single('avatar') in the route chain.
// Uploads the file to S3 and attaches req.file.s3Url for the controller.
async function handleAvatarUpload(req, res, next) {
  if (!req.file) return next(); // no file selected — skip

  try {
    const ext      = path.extname(req.file.originalname).toLowerCase() || '.jpg';
    const filename = `avatars/${req.user._id}-${Date.now()}${ext}`;

    await s3.send(new PutObjectCommand({
      Bucket: S3_BUCKET,
      Key: filename,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));

    req.file.s3Url = `${S3_BASE_URL}/${filename}`;
    next();
  } catch (err) {
    console.error('S3 avatar upload error:', err.message);
    next(err);
  }
}

// Deletes an old avatar from S3 (best-effort, never throws)
async function deleteAvatarFromS3(avatarUrl) {
  if (!avatarUrl || !avatarUrl.startsWith('https://')) return;
  try {
    const key = avatarUrl.replace(`${S3_BASE_URL}/`, '');
    await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
  } catch (err) {
    console.error('S3 delete error (avatar):', err.message);
  }
}

export { handleAvatarUpload, deleteAvatarFromS3 };
export default uploadAvatar;
