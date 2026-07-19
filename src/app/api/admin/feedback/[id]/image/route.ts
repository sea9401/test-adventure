import { eq } from "drizzle-orm";
import { db } from "@/db";
import { feedbackReports } from "@/db/schema";
import { requireAdmin } from "@/lib/server/isAdmin";
import {
  isFeedbackImageStorageConfigured,
  readFeedbackImage,
} from "@/lib/server/feedbackImageStorage";

export async function GET(
  _req: Request,
  context: { params: Promise<{ id: string }> },
) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const { id: rawId } = await context.params;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) {
    return new Response(null, { status: 404 });
  }

  const [entry] = await db
    .select({ imageKey: feedbackReports.imageKey })
    .from(feedbackReports)
    .where(eq(feedbackReports.id, id))
    .limit(1);
  if (!entry?.imageKey) return new Response(null, { status: 404 });
  if (!isFeedbackImageStorageConfigured()) {
    return new Response(null, { status: 503 });
  }

  try {
    const bytes = await readFeedbackImage(entry.imageKey);
    if (!bytes) return new Response(null, { status: 404 });
    return new Response(Buffer.from(bytes), {
      headers: {
        "cache-control": "private, max-age=31536000, immutable",
        "content-type": "image/webp",
        "content-length": String(bytes.byteLength),
        "cross-origin-resource-policy": "same-origin",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    console.error("admin feedback image R2 read failed", error);
    return new Response(null, { status: 502 });
  }
}
