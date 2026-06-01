import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import {
  V2_CLASS_DEFS,
  parseV2Class,
  nextTierClassOf,
  signaturesForClass,
  tier1ClassOf,
  type V2Class,
} from "@/adventure/data/v2/classes";
import {
  parseProficiencyForChar,
  setGrown,
  setGroupTier,
  emptyProficiency,
  groupCumLevel,
  advanceCumLevelReq,
  V2_ADVANCE_MIN_LEVEL,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
  v2SkillSlotsForLevel,
} from "@/adventure/data/v2/v2Skills";
import {
  codexRequirement,
  countDiscoveredMaterials,
} from "@/adventure/data/v2/codex";

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

export async function POST() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
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

    const curClass = parseV2Class(charSave.class);

    // 전직 가능한 다음 차수 직업 (none 이거나 이미 정점(4차)이면 불가).
    const nextClass: V2Class | null = nextTierClassOf(curClass);
    if (!nextClass) {
      return {
        status: 400,
        body: { ok: false as const, error: "no_advance" as const },
      };
    }
    const group = tier1ClassOf(nextClass);

    // 게이트 0 — 최소 레벨(전직마다 레벨 1 리셋이라 매 차수 사이 50까지 키워야 승급).
    const level = Math.max(1, charSave.level ?? 1);
    if (level < V2_ADVANCE_MIN_LEVEL) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "level_too_low" as const,
          required: V2_ADVANCE_MIN_LEVEL,
          have: level,
        },
      };
    }

    // 게이트 1 — 직군 누적 레벨(cumLevel) 임계. earned→cumLevel 전환(2026-06). 골드 없음(docs §7).
    const reqCumLevel = advanceCumLevelReq(V2_CLASS_DEFS[nextClass].tier);
    const haveCumLevel = groupCumLevel(prof, group);
    if (haveCumLevel < reqCumLevel) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "insufficient_cum_level" as const,
          required: reqCumLevel,
          have: haveCumLevel,
        },
      };
    }
    // 게이트 2 — 3·4차 모험의 서: 재료 도감 등재 종 수가 요건 미만이면 차단.
    const codexReq = codexRequirement(V2_CLASS_DEFS[nextClass].advanceCodexMin);
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

    // PR-prof — 전직 시 레벨 1 리셋 + 랜덤 성장(grown) 리셋. 스탯은 floor(숙련도 누적)부터
    // 다시 키운다(prestige 루프, docs §2·§5). exp 도 0. 골드 변동 없음(PR-6).
    await upsertSave(tx, userId, "character.v2", {
      ...charSave,
      class: nextClass,
      level: 1,
      exp: 0,
    });

    // 스킬은 학습+수동장착(자동부여·자동장착 폐지). 전직은 learned 불변, equipped 는 PRUNE 만
    // — 새 체인 밖/미학습 장착 제거 + 레벨1 리셋이라 슬롯(3)으로 절단. 새 차수 시그니처는
    // learn-skill 로 학습 후 equip-skill 로 직접 장착.
    const chain = new Set<string>(signaturesForClass(nextClass));
    const learnedSet = new Set<string>(skills.learned);
    const slots = v2SkillSlotsForLevel(1);
    await upsertSave(tx, userId, "skills.v2", {
      ...skills,
      equipped: skills.equipped
        .filter((s) => learnedSet.has(s) && chain.has(s))
        .slice(0, slots),
    });

    // 숙련도 — grown 리셋(레벨1=성장분 0, floor 부터) + 직업군 도달 차수 기록(floor tierMult).
    // earned/spent 는 보존(누적 숙련도는 줄지 않음). 위에서 잠가 읽은 prof 재사용.
    const nextProf = setGroupTier(
      setGrown(prof, {}),
      group,
      V2_CLASS_DEFS[nextClass].tier,
    );
    await upsertSave(tx, userId, "proficiency.v2", nextProf);

    return {
      status: 200,
      body: {
        ok: true as const,
        class: nextClass,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
