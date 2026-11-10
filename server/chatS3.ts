import fs from 'node:fs';
import path from 'node:path';
import { CreateBucketCommand, DeleteObjectCommand, GetObjectCommand, HeadBucketCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const storageMode = () => process.env.CHAT_ATTACHMENT_STORAGE?.trim().toLowerCase() || 'sqlite';
const isS3 = () => storageMode() === 's3';
const isLocalObj = () => storageMode() === 'local';

const LOCAL_STORAGE_DIR = path.join(process.cwd(), 'storage_files');
let client: S3Client | null = null;

function getBucket() {
  const bucket = process.env.CHAT_S3_BUCKET?.trim();
  if (!bucket) throw new Error('CHAT_S3_BUCKET 설정이 필요합니다.');
  return bucket;
}

function getClient() {
  if (client) return client;
  const endpoint = process.env.CHAT_S3_ENDPOINT?.trim();
  const accessKeyId = process.env.CHAT_S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.CHAT_S3_SECRET_ACCESS_KEY?.trim();
  if (!endpoint || !accessKeyId || !secretAccessKey) throw new Error('CHAT_S3_ENDPOINT, CHAT_S3_ACCESS_KEY_ID, CHAT_S3_SECRET_ACCESS_KEY 설정이 필요합니다.');
  client = new S3Client({
    endpoint,
    region: process.env.CHAT_S3_REGION?.trim() || 'us-east-1',
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
  return client;
}

export function chatAttachmentsUseS3() { return isS3() || isLocalObj(); }

export async function checkChatS3Bucket() {
  if (isS3()) {
    const bucket = getBucket();
    try {
      await getClient().send(new HeadBucketCommand({ Bucket: bucket }));
      console.log(`[S3/Floci] Connected to bucket: "${bucket}"`);
    } catch (err: any) {
      const isNotFound = err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound' || err?.name === 'NoSuchBucket';
      if (isNotFound) {
        try {
          console.log(`[S3/Floci] Bucket "${bucket}" not found (404). Attempting automatic bucket creation...`);
          await getClient().send(new CreateBucketCommand({ Bucket: bucket }));
          console.log(`[S3/Floci] Successfully created bucket: "${bucket}"`);
        } catch (createErr: any) {
          console.warn(`[S3/Floci] Notice: Bucket "${bucket}" 404 Not Found. Please create the bucket "${bucket}" on your Floci server.`);
        }
      } else {
        console.warn(`[S3/Floci] Warning checking bucket "${bucket}":`, err.message || err);
      }
    }
  } else if (isLocalObj()) {
    if (!fs.existsSync(LOCAL_STORAGE_DIR)) {
      fs.mkdirSync(LOCAL_STORAGE_DIR, { recursive: true });
    }
    console.log(`[Local Object Storage] Initialized local object storage directory: "${LOCAL_STORAGE_DIR}"`);
  }
}

export async function putChatS3Object(key: string, content: Uint8Array, contentType: string) {
  if (isS3()) {
    await getClient().send(new PutObjectCommand({ Bucket: getBucket(), Key: key, Body: content, ContentType: contentType }));
  } else if (isLocalObj()) {
    const targetPath = path.join(LOCAL_STORAGE_DIR, key);
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(targetPath, Buffer.from(content));
  }
}

export async function getChatS3Object(key: string) {
  if (isS3()) {
    const result = await getClient().send(new GetObjectCommand({ Bucket: getBucket(), Key: key }));
    if (!result.Body) throw new Error('S3 객체 본문이 비어 있습니다.');
    return new Uint8Array(await result.Body.transformToByteArray());
  } else if (isLocalObj()) {
    const targetPath = path.join(LOCAL_STORAGE_DIR, key);
    if (!fs.existsSync(targetPath)) throw new Error('파일을 찾을 수 없습니다.');
    const buffer = fs.readFileSync(targetPath);
    return new Uint8Array(buffer);
  }
  throw new Error('스토리지 모드가 설정되지 않았습니다.');
}

export async function deleteChatS3Object(key: string) {
  if (isS3()) {
    await getClient().send(new DeleteObjectCommand({ Bucket: getBucket(), Key: key }));
  } else if (isLocalObj()) {
    const targetPath = path.join(LOCAL_STORAGE_DIR, key);
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  }
}
