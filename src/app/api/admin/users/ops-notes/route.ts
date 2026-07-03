import { desc, eq, like } from "drizzle-orm";
import { db } from "@/db";
import { opsSettings } from "@/db/schema";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  currentAdminCapabilities,
  currentAdminEmail,
  requireAdmin,
} from "@/lib/server/isAdmin";

type OpsUserNote = {
  id: string;
  text: string;
  status: "open" | "resolved";
  createdByEmail: string;
  createdAt: string;
  updatedByEmail: string | null;
  updatedAt: string | null;
};

type OpsUserNoteSearchRow = OpsUserNote & {
  userId: string;
};

const NOTE_KEY_PREFIX = "ops-user-notes.v1:";
const MAX_NOTES = 80;
const MAX_SEARCH_ROWS = 500;

export async function GET(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const sp = new URL(req.url).searchParams;
  const userId = sp.get("userId")?.trim();
  if (!userId) {
    return Response.json({
      ok: true,
      notes: await searchNotes({
        q: sp.get("q")?.trim() ?? "",
        status: parseStatus(sp.get("status")),
        limit: clampLimit(sp.get("limit")),
      }),
    });
  }

  return Response.json({
    ok: true,
    userId,
    notes: await readNotes(userId),
  });
}

async function searchNotes({
  q,
  status,
  limit,
}: {
  q: string;
  status: "open" | "resolved" | "all";
  limit: number;
}): Promise<OpsUserNoteSearchRow[]> {
  const rows = await db
    .select({
      key: opsSettings.key,
      value: opsSettings.value,
      updatedAt: opsSettings.updatedAt,
    })
    .from(opsSettings)
    .where(like(opsSettings.key, `${NOTE_KEY_PREFIX}%`))
    .orderBy(desc(opsSettings.updatedAt))
    .limit(MAX_SEARCH_ROWS);
  const needle = q.toLowerCase();
  return rows
    .flatMap((row): OpsUserNoteSearchRow[] => {
      const userId = row.key.slice(NOTE_KEY_PREFIX.length);
      return parseNotes(row.value).map((note) => ({ ...note, userId }));
    })
    .filter((note) => status === "all" || note.status === status)
    .filter((note) => {
      if (!needle) return true;
      return `${note.userId} ${note.text} ${note.createdByEmail} ${note.updatedByEmail ?? ""}`
        .toLowerCase()
        .includes(needle);
    })
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, limit);
}

export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  const capabilities = await currentAdminCapabilities();
  if (!capabilities.reward && !capabilities.sanction && !capabilities.super) {
    return Response.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
  const action = typeof body?.action === "string" ? body.action : "";
  if (!userId) {
    return Response.json({ ok: false, error: "missing_user" }, { status: 400 });
  }

  const adminEmail = await currentAdminEmail();
  const now = new Date().toISOString();
  const notes = await readNotes(userId);
  let next = notes;

  if (action === "add") {
    const text = typeof body?.text === "string" ? body.text.trim().slice(0, 1_000) : "";
    if (!text) {
      return Response.json({ ok: false, error: "missing_text" }, { status: 400 });
    }
    next = [
      {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        text,
        status: "open" as const,
        createdByEmail: adminEmail,
        createdAt: now,
        updatedByEmail: null,
        updatedAt: null,
      },
      ...notes,
    ].slice(0, MAX_NOTES);
  } else if (action === "resolve" || action === "reopen" || action === "delete") {
    const noteId = typeof body?.noteId === "string" ? body.noteId : "";
    if (!noteId) {
      return Response.json({ ok: false, error: "missing_note" }, { status: 400 });
    }
    if (action === "delete") {
      next = notes.filter((note) => note.id !== noteId);
    } else {
      next = notes.map((note) =>
        note.id === noteId
          ? {
              ...note,
              status: action === "resolve" ? "resolved" : "open",
              updatedByEmail: adminEmail,
              updatedAt: now,
            }
          : note,
      );
    }
  } else {
    return Response.json({ ok: false, error: "bad_action" }, { status: 400 });
  }

  await db
    .insert(opsSettings)
    .values({
      key: noteKey(userId),
      value: next,
      updatedByEmail: adminEmail,
      updatedAt: new Date(now),
    })
    .onConflictDoUpdate({
      target: opsSettings.key,
      set: { value: next, updatedByEmail: adminEmail, updatedAt: new Date(now) },
    });

  await logAdminAction({
    adminEmail,
    action: `ops-user-notes.${action}`,
    targetUserId: userId,
    detail: { noteCount: next.length },
  });

  return Response.json({ ok: true, notes: next });
}

async function readNotes(userId: string): Promise<OpsUserNote[]> {
  const row = (
    await db
      .select({ value: opsSettings.value })
      .from(opsSettings)
      .where(eq(opsSettings.key, noteKey(userId)))
      .limit(1)
  )[0];
  return parseNotes(row?.value);
}

function noteKey(userId: string) {
  return `${NOTE_KEY_PREFIX}${userId}`;
}

function parseStatus(raw: string | null): "open" | "resolved" | "all" {
  return raw === "open" || raw === "resolved" ? raw : "all";
}

function clampLimit(raw: string | null) {
  const value = Number(raw ?? 80);
  if (!Number.isFinite(value)) return 80;
  return Math.max(1, Math.min(200, Math.floor(value)));
}

function parseNotes(raw: unknown): OpsUserNote[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .flatMap((row): OpsUserNote[] => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return [];
      const value = row as Partial<OpsUserNote>;
      if (typeof value.id !== "string" || typeof value.text !== "string") return [];
      return [
        {
          id: value.id,
          text: value.text.slice(0, 1_000),
          status: value.status === "resolved" ? "resolved" : "open",
          createdByEmail:
            typeof value.createdByEmail === "string" ? value.createdByEmail : "unknown",
          createdAt:
            typeof value.createdAt === "string" ? value.createdAt : new Date(0).toISOString(),
          updatedByEmail:
            typeof value.updatedByEmail === "string" ? value.updatedByEmail : null,
          updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : null,
        },
      ];
    })
    .slice(0, MAX_NOTES);
}
