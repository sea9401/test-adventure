import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { readCodexMasteryFeatureSettings } from "@/lib/server/opsSettings";
import {
  readCodexMasteryProgressRows,
  readCodexMasterySummary,
} from "@/lib/server/codexMasteryRepository";
import {
  readCodexMasteryPins,
  validateCodexMasteryPinRequest,
  writeCodexMasteryPins,
} from "@/lib/server/codexMasteryPins";
import { buildCodexMasterySnapshot } from "@/lib/server/codexMasterySnapshot";
import { readCodexResearchPersonalView } from "@/lib/server/codexResearchService";

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const settings = await readCodexMasteryFeatureSettings(db);
  if (!settings.overviewVisible) {
    return Response.json({ ok: true, enabled: false });
  }

  const [summary, progressRows, pinnedGoals, monthlyResearch] = await Promise.all([
    readCodexMasterySummary(db, userId),
    readCodexMasteryProgressRows(db, userId),
    readCodexMasteryPins(db, userId),
    settings.monthlyProgressEnabled
      ? readCodexResearchPersonalView(db, userId)
      : Promise.resolve(null),
  ]);
  const snapshot = buildCodexMasterySnapshot({
    summary,
    progressRows,
    pinnedGoals,
    features: {
      rankingVisible: settings.rankingVisible,
      sealsEnabled: settings.sealsEnabled,
      trophiesEnabled: settings.trophiesEnabled,
      monthlyProgressEnabled: settings.monthlyProgressEnabled,
    },
    monthlyResearch,
  });
  return Response.json({ ok: true, enabled: true, snapshot });
}

export async function POST(request: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const settings = await readCodexMasteryFeatureSettings(db);
  if (!settings.overviewVisible) {
    return Response.json(
      { ok: false, error: "feature_disabled" },
      { status: 409 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }
  const pinnedGoals =
    body && typeof body === "object" && !Array.isArray(body) &&
      Object.hasOwn(body, "pinnedGoals")
      ? (body as { pinnedGoals: unknown }).pinnedGoals
      : undefined;
  const validation = validateCodexMasteryPinRequest(pinnedGoals);
  if (!validation.ok) {
    return Response.json(
      { ok: false, error: validation.error },
      { status: 400 },
    );
  }

  const saved = await db.transaction((tx) =>
    writeCodexMasteryPins(tx, userId, validation.entries)
  );
  return Response.json({ ok: true, pinnedGoals: saved });
}
