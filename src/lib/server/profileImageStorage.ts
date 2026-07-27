import "server-only";

import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import {
  PROFILE_IMAGE_STORAGE_PREFIX,
  normalizeProfileImageAssetKey,
  normalizeProfileImageObjectKey,
  normalizeProfileImageUserId,
  profileImageThumbnailObjectKey,
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
  thumbnailBytes: Uint8Array;
}): Promise<string> {
  const { client, bucket } = storage();
  const key = `${PROFILE_IMAGE_STORAGE_PREFIX}/${input.userId}/${randomUUID()}.webp`;
  const thumbnailKey = profileImageThumbnailObjectKey(key);
  if (!thumbnailKey) throw new Error("invalid_profile_image_key");
  const common = {
    Bucket: bucket,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  };
  try {
    await Promise.all([
      client.send(
        new PutObjectCommand({ ...common, Key: key, Body: input.bytes }),
      ),
      client.send(
        new PutObjectCommand({
          ...common,
          Key: thumbnailKey,
          Body: input.thumbnailBytes,
        }),
      ),
    ]);
  } catch (error) {
    await Promise.allSettled([
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key })),
      client.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbnailKey })),
    ]);
    throw error;
  }
  return key;
}

export async function readProfileImage(key: string): Promise<Uint8Array | null> {
  const normalized = normalizeProfileImageAssetKey(key);
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

export async function uploadProfileImageThumbnail(
  key: string,
  bytes: Uint8Array,
): Promise<void> {
  const normalized = normalizeProfileImageAssetKey(key);
  if (!normalized?.endsWith(".thumb.webp")) {
    throw new Error("invalid_profile_image_thumbnail_key");
  }
  const { client, bucket } = storage();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: normalized,
      Body: bytes,
      ContentType: "image/webp",
      CacheControl: "public, max-age=31536000, immutable",
    }),
  );
}

export async function deleteProfileImage(key: unknown): Promise<void> {
  const normalized = normalizeProfileImageObjectKey(key);
  if (!normalized) return;
  const { client, bucket } = storage();
  const thumbnailKey = profileImageThumbnailObjectKey(normalized);
  const results = await Promise.allSettled([
    client.send(new DeleteObjectCommand({ Bucket: bucket, Key: normalized })),
    ...(thumbnailKey
      ? [client.send(new DeleteObjectCommand({ Bucket: bucket, Key: thumbnailKey }))]
      : []),
  ]);
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
}

// 회원 탈퇴 때 현재 프로필에 연결된 한 장뿐 아니라, 과거 교체 삭제가 실패해 남았을 수
// 있는 같은 사용자 prefix 의 객체까지 모두 정리한다.
export async function deleteProfileImagesForUser(userId: unknown): Promise<number> {
  const normalizedUserId = normalizeProfileImageUserId(userId);
  if (!normalizedUserId) throw new Error("invalid_profile_image_user_id");
  const { client, bucket } = storage();
  const prefix = `${PROFILE_IMAGE_STORAGE_PREFIX}/${normalizedUserId}/`;
  let deleted = 0;

  while (true) {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1_000 }),
    );
    const keys = (listed.Contents ?? [])
      .map((entry) => normalizeProfileImageObjectKey(entry.Key))
      .filter((key): key is string => key !== null);
    if (keys.length === 0) return deleted;
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if ((result.Errors?.length ?? 0) > 0) {
      throw new Error("profile_image_batch_delete_failed");
    }
    deleted += keys.length;
  }
}
