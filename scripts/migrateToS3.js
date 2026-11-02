import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { PutObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import s3, { S3_BUCKET, S3_BASE_URL } from '../config/s3.js';
import Product from '../models/product.js';
import Category from '../models/category.js';
import User from '../models/user.js';

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
};

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

async function s3ObjectExists(key) {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      return false;
    }
    return false;
  }
}

async function uploadFile(localPath, key) {
  const fileBuffer = fs.readFileSync(localPath);
  const contentType = getMimeType(localPath);

  await s3.send(new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: fileBuffer,
    ContentType: contentType,
  }));
}

async function runMigration() {
  console.log('--- Starting S3 Migration ---');

  if (!process.env.AWS_REGION || !process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY || !process.env.AWS_S3_BUCKET) {
    console.error('Missing AWS S3 configuration in environment variables.');
    console.error('Please make sure AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_S3_BUCKET are set.');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('Missing MONGODB_URI in environment variables.');
    process.exit(1);
  }

  console.log(`Target Bucket: ${S3_BUCKET}`);
  console.log(`Base URL:      ${S3_BASE_URL}`);

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB.\n');

  const baseUploadsDir = path.join(process.cwd(), 'public', 'uploads');

  let stats = {
    productsUploaded: 0,
    productsDbUpdated: 0,
    categoriesUploaded: 0,
    categoriesDbUpdated: 0,
    avatarsUploaded: 0,
    avatarsDbUpdated: 0,
  };

  // 1. PRODUCTS
  const productDir = path.join(baseUploadsDir, 'products');
  if (fs.existsSync(productDir)) {
    console.log('Processing Product Images...');
    const files = fs.readdirSync(productDir).filter((f) => fs.statSync(path.join(productDir, f)).isFile());
    for (const file of files) {
      const localPath = path.join(productDir, file);
      const s3Key = `products/${file}`;
      const s3Url = `${S3_BASE_URL}/${s3Key}`;

      const exists = await s3ObjectExists(s3Key);
      if (!exists) {
        process.stdout.write(`  Uploading ${file} ... `);
        await uploadFile(localPath, s3Key);
        stats.productsUploaded++;
        console.log('DONE');
      }

      // Update database references
      const localSubstrings = [`/uploads/products/${file}`, `uploads/products/${file}`];
      for (const pattern of localSubstrings) {
        const updateRes = await Product.updateMany(
          { images: pattern },
          { $set: { 'images.$': s3Url } }
        );
        stats.productsDbUpdated += (updateRes.modifiedCount || 0);
      }
    }
  }

  // 2. CATEGORIES
  const categoryDir = path.join(baseUploadsDir, 'categories');
  if (fs.existsSync(categoryDir)) {
    console.log('\nProcessing Category Banners...');
    const files = fs.readdirSync(categoryDir).filter((f) => fs.statSync(path.join(categoryDir, f)).isFile());
    for (const file of files) {
      const localPath = path.join(categoryDir, file);
      const s3Key = `categories/${file}`;
      const s3Url = `${S3_BASE_URL}/${s3Key}`;

      const exists = await s3ObjectExists(s3Key);
      if (!exists) {
        process.stdout.write(`  Uploading ${file} ... `);
        await uploadFile(localPath, s3Key);
        stats.categoriesUploaded++;
        console.log('DONE');
      }

      const updateRes = await Category.updateMany(
        { banner_url: { $in: [`/uploads/categories/${file}`, `uploads/categories/${file}`] } },
        { $set: { banner_url: s3Url } }
      );
      stats.categoriesDbUpdated += (updateRes.modifiedCount || 0);
    }
  }

  // 3. AVATARS
  const avatarDir = path.join(baseUploadsDir, 'avatars');
  if (fs.existsSync(avatarDir)) {
    console.log('\nProcessing Avatars...');
    const files = fs.readdirSync(avatarDir).filter((f) => fs.statSync(path.join(avatarDir, f)).isFile());
    for (const file of files) {
      const localPath = path.join(avatarDir, file);
      const s3Key = `avatars/${file}`;
      const s3Url = `${S3_BASE_URL}/${s3Key}`;

      const exists = await s3ObjectExists(s3Key);
      if (!exists) {
        process.stdout.write(`  Uploading ${file} ... `);
        await uploadFile(localPath, s3Key);
        stats.avatarsUploaded++;
        console.log('DONE');
      }

      const updateRes = await User.updateMany(
        { profile_picture: { $in: [`/uploads/avatars/${file}`, `uploads/avatars/${file}`] } },
        { $set: { profile_picture: s3Url } }
      );
      stats.avatarsDbUpdated += (updateRes.modifiedCount || 0);
    }
  }

  console.log('\n=========================================');
  console.log('Migration Completed Summary:');
  console.log(`  Products:   ${stats.productsUploaded} uploaded, ${stats.productsDbUpdated} DB updates`);
  console.log(`  Categories: ${stats.categoriesUploaded} uploaded, ${stats.categoriesDbUpdated} DB updates`);
  console.log(`  Avatars:    ${stats.avatarsUploaded} uploaded, ${stats.avatarsDbUpdated} DB updates`);
  console.log('=========================================\n');

  await mongoose.disconnect();
}

runMigration().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});

