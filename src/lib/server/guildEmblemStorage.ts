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
  GUILD_EMBLEM_STORAGE_PREFIX,
  normalizeGuildEmblemObjectKey,
} from "@/adventure/data/guild-emblems";

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
  if (!config) throw new Error("guild_emblem_storage_not_configured");
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

export function isGuildEmblemStorageConfigured(): boolean {
  return readR2Config() !== null;
}

export async function uploadGuildEmblemImage(input: {
  guildId: number;
  bytes: Uint8Array;
}): Promise<string> {
  const { client, bucket } = storage();
  const key = `${GUILD_EMBLEM_STORAGE_PREFIX}/${input.guildId}/${randomUUID()}.webp`;
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

export async function readGuildEmblemImage(key: string): Promise<Uint8Array | null> {
  const normalized = normalizeGuildEmblemObjectKey(key);
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

export async function deleteGuildEmblemImage(key: unknown): Promise<void> {
  const normalized = normalizeGuildEmblemObjectKey(key);
  if (!normalized) return;
  const { client, bucket } = storage();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: normalized }));
}

// 길드가 계정 삭제의 cascade 로 사라질 때 과거 교체 실패분까지 길드 prefix 단위로 정리한다.
export async function deleteGuildEmblemImagesForGuild(
  guildId: unknown,
): Promise<number> {
  if (
    typeof guildId !== "number" ||
    !Number.isSafeInteger(guildId) ||
    guildId <= 0
  ) {
    throw new Error("invalid_guild_id");
  }
  const { client, bucket } = storage();
  const prefix = `${GUILD_EMBLEM_STORAGE_PREFIX}/${guildId}/`;
  let deleted = 0;

  while (true) {
    const listed = await client.send(
      new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix, MaxKeys: 1_000 }),
    );
    const keys = (listed.Contents ?? [])
      .map((entry) => normalizeGuildEmblemObjectKey(entry.Key))
      .filter((key): key is string => key !== null);
    if (keys.length === 0) return deleted;
    const result = await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
    if ((result.Errors?.length ?? 0) > 0) {
      throw new Error("guild_emblem_batch_delete_failed");
    }
    deleted += keys.length;
  }
}
