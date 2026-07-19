import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { feedbackReports } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import {
  isFeedbackImageStorageConfigured,
  readFeedbackImage,
} from "@/lib/server/feedbackImageStorage";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const userId = await ensureUser();
  if (!userId) return new Response(null, { status: 401 });

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return new Response(null, { status: 404 });
  }

  const [entry] = await db
    .select({ imageKey: feedbackReports.imageKey })
    .from(feedbackReports)
    .where(
      and(eq(feedbackReports.id, id), eq(feedbackReports.userId, userId)),
    )
    .limit(1);
  if (!entry?.imageKey) return new Response(null, { status: 404 });
  if (!isFeedbackImageStorageConfigured()) {
    return new Response(null, { status: 503 });
  }

  try {
    const bytes = await readFeedbackImage(entry.imageKey);
    if (!bytes) return new Response(null, { status: 404 });
    return imageResponse(bytes);
  } catch (error) {
    console.error("feedback image R2 read failed", error);
    return new Response(null, { status: 502 });
  }
}

function imageResponse(bytes: Uint8Array) {
  return new Response(Buffer.from(bytes), {
    headers: {
      "cache-control": "private, max-age=31536000, immutable",
      "content-type": "image/webp",
      "content-length": String(bytes.byteLength),
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}
