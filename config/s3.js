import { S3Client } from '@aws-sdk/client-s3';

const region = (process.env.AWS_REGION || 'ap-south-1').trim();

const clientConfig = { region };
if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
  clientConfig.credentials = {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID.trim(),
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY.trim(),
  };
}

const s3 = new S3Client(clientConfig);

export const S3_BUCKET = (process.env.AWS_S3_BUCKET || '').trim();
export const S3_BASE_URL = S3_BUCKET
  ? `https://${S3_BUCKET}.s3.${region}.amazonaws.com`
  : '';

export default s3;
