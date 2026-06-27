import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  parseV2Class,
  nextAdvanceTier,
  tierCodexMin,
  elementalSkillsForClass,
  tier1ClassOf,
} from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  setGrown,
  setGroupTier,
  flattenGroupTiers,
  addReincarnation,
  emptyProficiency,
  effectiveLevelCap,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import { sanitizeLoadout } from "@/adventure/data/v2/v2Loadout";
import {
  codexRequirement,
  countDiscoveredMaterials,
} from "@/adventure/data/v2/codex";
import {
  V2_CORE_LOOP_V2,
  V2_LEVEL_CAP,
  calcSpBudget,
} from "@/adventure/data/v2/coreLoopConfig";
import { spCapBonusFromRaw } from "@/adventure/data/v2/spFruit";
import {
  V2_JOB_CATALOG,
  isJobUnlocked,
  jobIdFromLegacy,
  CATALOG_USES_QUEST_CONDITION,
  LEGACY_CLASS_SPEC_BY_JOB,
  type JobUnlockContext,
} from "@/adventure/data/v2/v2JobCatalog";
import { loadCompletedQuestIds } from "@/lib/server/v2QuestContext";

// POST /api/v2/me/advance-class — 다음 차수 전직(진척). 게이트 = 직군 누적 레벨(cumLevel)
// 임계(t2=55·t3=110·t4=170) + 최소 Lv50 + (3·4차) 모험의 서 — 골드 X(docs §7, PR-6).
// earned→cumLevel 전환(2026-06): 전직을 "킬 수"가 아닌 "누적 레벨"로 게이트.
// 1→2→3→4 어느 단계든 nextTierClassOf 로 바로 위 차수로 승급. respec(직업군 변경,
// 비용+쿨다운)과 별개 — 같은 직업군 안에서의 단계 승급. 새 차수 시그니처는 자동 학습이
// 아니라 learn-skill 로 숙련도 학습(전직은 equipped 만 reconcile, docs §6).
// 3·4차는 재료 도감 등재 종 수(advanceCodexMin)를 추가 요건으로 — 직업 해금을 모험의 서
// 진척에 묶는다(설계 §11-8).

type CharSaveShape = {
  class?: unknown;
  level?: number;
  materials?: unknown;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // 코어루프 재전직은 타겟 body(targetJobId)를 받는다. 코어루프 off(기존 차수 전직)은 body 무시.
  let reqBody: {
    targetJobId?: unknown;
  } = {};
  if (V2_CORE_LOOP_V2) {
    try {
      reqBody = (await req.json()) as typeof reqBody;
    } catch {
      reqBody = {};
    }
  }

  const result = await db.transaction(async (tx) => {
    // 락 순서 통일 — character.v2 → skills.v2 (hunt·learn·class-element 와 동일).
    const charSave = await lockSaveForUpdate<CharSaveShape>(
      tx,
      userId,
      "character.v2",
      {},
    );
    const skillsRaw = await lockSaveForUpdate(
      tx,
      userId,
      "skills.v2",
      emptyV2SkillsState() as unknown as Record<string, unknown>,
    );
    const skills = parseV2SkillsState(skillsRaw);
    // 게이트(누적 숙련도)에 쓰므로 락 순서(character→skills→proficiency)대로 미리 잠가 읽는다.
    const prof = parseProficiencyForChar(
      await lockSaveForUpdate<V2ProficiencyState>(
        tx,
        userId,
        "proficiency.v2",
        emptyProficiency(),
      ),
      charSave,
    );

    // === 코어루프 재전직 (flag on) — 차수 폐지. Lv50 도달 후 스탯게이트 해금된 직군/계파로
    //     갈아타고 레벨1·exp0·grown 리셋, cumLevel/points/caps 보존. 기존 차수 전직 대체. ===
    if (V2_CORE_LOOP_V2) {
      const lvl = Math.max(1, charSave.level ?? 1);
      if (lvl < V2_LEVEL_CAP) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "level_too_low" as const,
            required: V2_LEVEL_CAP,
            have: lvl,
          },
        };
      }
      // 타겟 직업 = 단일 targetJobId + 카탈로그 cumLevel 게이트(isJobUnlocked). 세이브/스킬
      //   체인은 브리지 LEGACY_CLASS_SPEC_BY_JOB 로 옛 class+spec 모델로 변환(저장 호환, 영구).
      // 현재 직업과 동일한 targetJobId(재전직)도 의도적으로 허용 — 같은 직업 환생 루프
      //   (레벨1 리셋·cumLevel 보존). 별도 same-job 거부 가드를 두지 않는다.
      const targetJobId =
        typeof reqBody.targetJobId === "string" ? reqBody.targetJobId : "";
      const jobDef = V2_JOB_CATALOG[targetJobId];
      // 모험가(tier 0, id "none")는 전직 대상으로 허용 — 전직 후엔 모험가 킷(강인함·수련)을
      //   배울 길이 없어(되돌아갈 수 없음) 학습이 막히던 문제 해소. 그 외 tier 0(미래 추가분)은 차단.
      if (!jobDef || (jobDef.tier === 0 && jobDef.id !== "none")) {
        return {
          status: 400,
          body: { ok: false as const, error: "bad_target" as const },
        };
      }
      // 🔑 같은 직업 재전직(환생 루프)이면 해금 게이트를 건너뛴다 — 이미 그 직업을 보유 중이므로
      //   해금 규칙이 나중에 바뀌어도(예: 직군 게이팅 → 계보 게이팅) 자기 직업 환생은 항상 가능해야
      //   한다(옛 규칙으로 얻은 직업이 새 규칙 미달이라 재전직조차 막히는 잠금 방지).
      const currentJobId = jobIdFromLegacy(
        parseV2Class(charSave.class),
        typeof charSave.specChoice === "string" ? charSave.specChoice : null,
      );
      const isReJobToCurrent = targetJobId === currentJobId;
      // 해금 게이트 = cumLevel prereqs + 추가조건(stat=proficiency·quest=ctx). 기본 직업은
      //   prereqs 비어 통과(위 Lv50 이 바닥 게이트). quest 조건 쓰는 직업이 있을 때만 quest 세이브 로드.
      const jobCtx: JobUnlockContext | undefined = CATALOG_USES_QUEST_CONDITION
        ? { completedQuestIds: await loadCompletedQuestIds(tx, userId) }
        : undefined;
      if (!isReJobToCurrent && !isJobUnlocked(jobDef, prof, jobCtx)) {
        return {
          status: 400,
          body: { ok: false as const, error: "job_locked" as const },
        };
      }
      const legacy = LEGACY_CLASS_SPEC_BY_JOB[targetJobId];
      const targetClass = parseV2Class(legacy?.class ?? targetJobId);
      const targetSpec: string | null = legacy?.spec ?? null;

      // 재전직 — class/spec 갈아끼우고 레벨1·exp0·grown 리셋(스탯은 floor 부터 재성장).
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        class: targetClass,
        specChoice: targetSpec,
        level: 1,
        exp: 0,
      });
      // 차수 폐지 — 모든 직업군 tier=1 정규화(flattenGroupTiers). setGroupTier 는 max-clamp 라
      //   1차로 내릴 수 없어 옛 차수 보너스(앵커 %·floor mult)가 샌다. cumLevel/points/caps 보존.
      //   환생 1회 기록(addReincarnation) — 같은 직업 재전직도 "다시 태어나다" 퀘스트가 깨지도록.
      const nextProf = addReincarnation(
        flattenGroupTiers(setGrown(prof, {}), tier1ClassOf(targetClass)),
      );
      // 코어루프 — 환생: 모아둔 로드아웃 보존 + SP 예산 초과분만 빠진다(강제 재산출 아님 →
      //   타직업 공용/기본기 오픈믹스 수집분 유지). 예산은 tier 1 정규화 기준(정복 보너스 빠짐).
      await upsertSave(tx, userId, "skills.v2", {
        ...skills,
        equipped: sanitizeLoadout(
          skills.equipped,
          skills.learned,
          calcSpBudget(
            nextProf.groups,
            spCapBonusFromRaw((charSave as { spFruitUsed?: unknown }).spFruitUsed),
          ),
        ),
      });
      await upsertSave(tx, userId, "proficiency.v2", nextProf);

      return {
        status: 200,
        body: {
          ok: true as const,
          class: targetClass,
          spec: targetSpec,
          reincarnated: true as const,
        },
      };
    }

    const curClass = parseV2Class(charSave.class);
    if (curClass === "none") {
      return {
        status: 400,
        body: { ok: false as const, error: "no_advance" as const },
      };
    }
    // P4 — 전직 = 그 직군 차수(proficiency.tier) +1. 4직군에선 class 자체가 그룹.
    // 환생(§3.1·design A) — 4차 정점에서 진행하면 차수→1 리셋(종환생), cumLevel/points/caps 보존.
    const group = tier1ClassOf(curClass);
    const curTier = prof.groups[group]?.tier ?? 1;

    // 게이트 — 현 차수 레벨 캡 도달(전직·환생 공통). 캡까지 올려야 진행.
    // 옛 cumLevel 게이트(55/110/170)는 레벨캡과 충돌(1차 캡 50 < 게이트 55 = 소프트락)이라 폐지.
    const level = Math.max(1, charSave.level ?? 1);
    const reqLevel = effectiveLevelCap(curTier);
    if (level < reqLevel) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "level_too_low" as const,
          required: reqLevel,
          have: level,
        },
      };
    }

    // 4차 정점 = 환생(차수→1, cumLevel 보존). 그 외 = 다음 차수 전직.
    const isReincarnate = curTier >= 4;
    const nextTier = isReincarnate ? 1 : (nextAdvanceTier(curTier) ?? 1);

    // 게이트 2 — 모험의 서(3·4차 승급만). 환생(→1차)은 면제(이미 등재 보유).
    if (!isReincarnate) {
      const codexReq = codexRequirement(tierCodexMin(nextTier));
      if (codexReq > 0) {
        const discovered = countDiscoveredMaterials(charSave.materials);
        if (discovered < codexReq) {
          return {
            status: 400,
            body: {
              ok: false as const,
              error: "codex_incomplete" as const,
              required: codexReq,
              have: discovered,
            },
          };
        }
      }
    }

    // PR-prof — 전직 시 레벨 1 리셋 + 랜덤 성장(grown) 리셋. 스탯은 floor(숙련도 누적)부터
    // 다시 키운다(prestige 루프, docs §2·§5). exp 도 0. 골드 변동 없음(PR-6).
    // P4 — class 는 불변(차수는 proficiency 에). 레벨/exp 만 리셋.
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      class: curClass,
      level: 1,
      exp: 0,
    });

    // 스킬은 학습+수동장착(자동부여·자동장착 폐지). 전직은 learned 불변, equipped 는 PRUNE 만
    // — 장착 가능 = 공용 + 선택 전문화의 차수 해금분(차수당 1개). 풀 밖/미학습 제거 +
    // equipped = 학습한 스킬 중 새 체인 유효분 전부(장착 슬롯 폐지·상한 없음). 차수는 전직 후
    // 값(nextTier) — 환생(→1차)이면 전문화 스킬이 다시 잠겨 빠지고, 재등반하며 자동 복원.
    const specChoice =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
    const chain = new Set<string>(
      elementalSkillsForClass(curClass, specChoice, nextTier),
    );
    await upsertSave(tx, userId, "skills.v2", {
      ...skills,
      equipped: skills.learned.filter((s) => chain.has(s)),
    });

    // 숙달 — grown 리셋(레벨1=성장분 0, floor 부터) + 직업군 도달 차수 기록(floor tierMult).
    // points/cumLevel/caps 는 보존(전직해도 잔액·누적레벨·수행이득 유지). 위에서 잠가 읽은 prof 재사용.
    // 환생(4차 정점→1차)일 때만 환생 1회 기록 — 일반 차수 승급은 환생이 아니므로 제외.
    const advancedProf = setGroupTier(setGrown(prof, {}), group, nextTier);
    const nextProf = isReincarnate
      ? addReincarnation(advancedProf)
      : advancedProf;
    await upsertSave(tx, userId, "proficiency.v2", nextProf);

    return {
      status: 200,
      body: {
        ok: true as const,
        class: curClass,
        tier: nextTier,
        reincarnated: isReincarnate,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
