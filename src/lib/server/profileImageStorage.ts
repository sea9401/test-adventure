import "server-only";

import { randomUUID } from "node:crypto";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  PROFILE_IMAGE_STORAGE_PREFIX,
  normalizeProfileImageObjectKey,
} from "@/adventure/profile/avatars";

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

let cachedConfig: R2Config | null | undefined;
let cachedClient: S3Client | null = null;

function readR2Config(): R2Config | null {
  if (cachedConfig !== undefined) return cachedConfig;
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  cachedConfig =
    accountId && accessKeyId && secretAccessKey && bucket
      ? { accountId, accessKeyId, secretAccessKey, bucket }
      : null;
  return cachedConfig;
}

function storage(): { client: S3Client; bucket: string } {
  const config = readR2Config();
  if (!config) throw new Error("profile_image_storage_not_configured");
  cachedClient ??= new S3Client({
    region: "auto",
    endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
  });
  return { client: cachedClient, bucket: config.bucket };
}

export function isProfileImageStorageConfigured(): boolean {
  return readR2Config() !== null;
}

export async function uploadProfileImage(input: {
  userId: string;
  bytes: Uint8Array;
}): Promise<string> {
  const { client, bucket } = storage();
  const key = `${PROFILE_IMAGE_STORAGE_PREFIX}/${input.userId}/${randomUUID()}.webp`;
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.bytes,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
  return key;
}

export async function readProfileImage(key: string): Promise<Uint8Array | null> {
  const normalized = normalizeProfileImageObjectKey(key);
  if (!normalized) return null;
  const { client, bucket } = storage();
  try {
    const result = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: normalized }),
    );
    return result.Body ? result.Body.transformToByteArray() : null;
  } catch (error) {
    if (
      error instanceof Error &&
      (error.name === "NoSuchKey" || error.name === "NotFound")
    ) {
      return null;
    }
    throw error;
  }
}

export async function deleteProfileImage(key: unknown): Promise<void> {
  const normalized = normalizeProfileImageObjectKey(key);
  if (!normalized) return;
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: normalized }));
}
