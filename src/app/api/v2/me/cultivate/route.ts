import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { insertFeedEntry } from "@/lib/server/serverFeed";
import { parseV2Class, tier1ClassOf } from "@/adventure/data/v2/classes";
import {
  cultivationGroupForJob,
  isLifestyleMasteryJobId,
  isVisitedJob,
  jobIdFromLegacy,
  V2_JOB_CATALOG,
} from "@/adventure/data/v2/v2JobCatalog";
import {
  parseProficiencyForChar,
  applyCultivationBatch,
  emptyProficiency,
  usablePoints,
  cultivationCost,
  totalCapGains,
  capGain,
  effectiveStatCap,
  effectiveCultivateProfile,
  refundableCultivationPoints,
  V2_CULTIVATION_BATCH_LIMIT,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import { V2_STAT_KEYS } from "@/adventure/data/v2/v2StatKeys";

// POST /api/v2/me/cultivate — 수행 1회. 공용 숙달 포인트로 현 직업 프로필의 stat cap 상승.
// docs/v2-proficiency-redesign.md §4. 골드/쿨다운 없음. lock 순서 character.v2 → proficiency.v2.
export async function POST(req?: Request) {
  const requestBody = req
    ? ((await req.json().catch(() => null)) as {
        mode?: unknown;
        targetJobId?: unknown;
      } | null)
    : null;
  const maxIterations =
    requestBody?.mode === "max" ? V2_CULTIVATION_BATCH_LIMIT : 1;
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const result = await db.transaction(async (tx) => {
    const charSave = await lockSaveForUpdate<{
      class?: unknown;
      specChoice?: unknown;
    }>(tx, userId, "character.v2", {});
    const cls = parseV2Class(charSave.class);
    const currentGroup = tier1ClassOf(cls);
    // 하이브리드(마검사·성기사)는 저장 class 가 직군(전사)이라 직군 프로필만으론 정체성 축을 못 키운다.
    //   jobId 로 직업 전용 프로필을 적용한다(회계는 group 그대로). spec 미상이면 group 폴백.
    const spec =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
    const currentJobId = jobIdFromLegacy(cls, spec);
    const profSave = await lockSaveForUpdate<V2ProficiencyState>(
      tx,
      userId,
      "proficiency.v2",
      emptyProficiency(),
    );
    const prof = parseProficiencyForChar(profSave, charSave);
    const requestedJobId =
      typeof requestBody?.targetJobId === "string"
        ? requestBody.targetJobId.trim()
        : "";
    const selectedJobId = requestedJobId || currentJobId;
    if (
      requestedJobId &&
      !isVisitedJob(prof, currentJobId, selectedJobId)
    ) {
      return {
        status: 400,
        body: { ok: false as const, error: "unvisited_job" as const },
      };
    }
    const group = requestedJobId
      ? cultivationGroupForJob(selectedJobId)
      : currentGroup;
    // 생활직은 Lv.1 재전직이 가능하므로 수행까지 허용하면 전투직 만렙 성장 과정을 건너뛸 수 있다.
    // UI 비활성화와 별개로 직접 API 호출도 여기서 차단한다.
    if (isLifestyleMasteryJobId(selectedJobId)) {
      return {
        status: 400,
        body: { ok: false as const, error: "lifestyle_job" as const },
      };
    }
    // 수행 프로필이 있는 직업만 허용한다. 선택 직업은 직군 공용값뿐 아니라 하이브리드·전문화
    // 오버라이드까지 포함한 실효 프로필로 검사한다.
    if (!group || !effectiveCultivateProfile(group, selectedJobId)) {
      return { status: 400, body: { ok: false as const, error: "no_class" as const } };
    }
    // 크리티컬 다중 수행 — 각 회의 결과로 다음 비용을 다시 계산한다.
    // 본문 없는 기존 요청은 maxIterations=1로 정확히 1회만 처리한다.
    const applied = applyCultivationBatch(
      prof,
      group,
      Math.random,
      selectedJobId,
      maxIterations,
    );
    if (!applied) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_proficiency" as const,
          required: cultivationCost(totalCapGains(prof)),
          have: usablePoints(prof),
        },
      };
    }
    await upsertSave(tx, userId, "proficiency.v2", applied.next);
    const nextCult = applied.next.groups[group].cultivations;
    // 유효 cap(= 기본 60 + 수행 이득)으로 반환 — state 와 일치.
    const effectiveCaps: Partial<Record<string, number>> = {};
    for (const k of V2_STAT_KEYS) {
      effectiveCaps[k] = effectiveStatCap(capGain(applied.next, k));
    }
    return {
      status: 200,
      body: {
        ok: true as const,
        spent: applied.spent,
        mult: applied.lastMult, // 마지막 크리티컬 배수(1/3/5) — 기존 1회 UI 호환용.
        performed: applied.performed,
        greatSuccesses: applied.greatSuccesses,
        awakenings: applied.awakenings,
        hasMore: applied.hasMore,
        group,
        targetJobId: selectedJobId,
        targetJobName: V2_JOB_CATALOG[selectedJobId]?.name ?? selectedJobId,
        caps: effectiveCaps,
        cultivations: nextCult,
        capGains: totalCapGains(applied.next),
        points: usablePoints(applied.next),
        cultivationPointsSpent: refundableCultivationPoints(applied.next),
        redistributedGrowthPoints: applied.redistributedGrowthPoints,
        growthRespecPoints: applied.next.growthRespecPoints ?? 0,
        nextCost: cultivationCost(totalCapGains(applied.next)),
      },
    };
  });

  // 수행 각성(×5)은 트랜잭션이 성공적으로 커밋된 뒤 서버 전체 소식에 기록한다.
  // 피드 기록 실패는 수행 결과를 되돌리지 않으며, insertFeedEntry 내부에서 안전하게 처리한다.
  if (result.body.ok) {
    for (let i = 0; i < result.body.awakenings; i += 1) {
      await insertFeedEntry(userId, "cultivation_awakening", {
        cultivationMult: 5,
      });
    }
  }

  return Response.json(result.body, { status: result.status });
}
