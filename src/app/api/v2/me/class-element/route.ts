import { db } from "@/db";
import { ensureUser } from "@/lib/server/ensureUser";
import { lockSaveForUpdate, upsertSave } from "@/lib/server/savesKv";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import {
  V2_SELECTABLE_CLASSES,
  parseV2Class,
  elementalSkillsForClass,
  tier1ClassOf,
  type V2Class,
} from "@/adventure/data/v2/classes";
import {
  parseV2Element,
  type V2Element,
} from "@/adventure/data/v2/elements";
import { V2_CORE_LOOP_V2, spendGold } from "@/adventure/data/v2/coreLoopConfig";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  RESPEC_COOLDOWN_MS,
  isClassChange,
  isPaidRespec,
  respecGoldCost,
} from "@/adventure/data/v2/respec";
import {
  parseProficiencyForChar,
  setGrown,
  emptyProficiency,
  effectiveLevelCap,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";

// POST /api/v2/me/class-element — 직업·속성 선택/변경.
// PR-6 비용 전직: 첫 선택(none/neutral 에서)은 무료. 변경은 레벨비례 골드 + 24h 쿨다운.
// 시그니처는 숙련도 학습(learn-skill)이라 여기선 자동 학습 안 함 — equipped 만
// 학습분∩새 직업 체인으로 reconcile(learned 보존, docs §6).

type CharSaveShape = {
  class?: unknown;
  element?: unknown;
  level?: number;
  gold?: number;
  lastRespecAt?: number;
  [k: string]: unknown;
};

export async function POST(req: Request) {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  let body: { class?: unknown; element?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const nextClass: V2Class = parseV2Class(body.class);
  const nextElement: V2Element = parseV2Element(body.element);

  // 코어루프 — 신규 캐릭은 모험가(none)로 시작. 캐릭 생성의 "첫 선택"은 직업이 아니라 속성만
  //   고른다(직군은 인게임 스탯게이트 해금·재전직으로). class="none" 요청 = 속성만 설정,
  //   직업은 none 유지(직업/스킬 로직 미실행). 속성 변경 비활성 게이트는 그대로 적용.
  if (V2_CORE_LOOP_V2 && nextClass === "none") {
    const r = await db.transaction(async (tx) => {
      const charSave = await lockSaveForUpdate<CharSaveShape>(
        tx,
        userId,
        "character.v2",
        {},
      );
      const curElement = parseV2Element(charSave.element);
      if (curElement !== "neutral" && nextElement !== curElement) {
        return {
          status: 400,
          body: { ok: false as const, error: "element_change_disabled" as const },
        };
      }
      await upsertSave(tx, userId, "character.v2", {
        ...charSave,
        element: nextElement,
      });
      return {
        status: 200,
        body: { ok: true as const, class: "none" as const, element: nextElement },
      };
    });
    return Response.json(r.body, { status: r.status });
  }

  if (!V2_SELECTABLE_CLASSES.includes(nextClass)) {
    return Response.json({ ok: false, error: "bad_class" }, { status: 400 });
  }

  const now = Date.now();
  const result = await db.transaction(async (tx) => {
    // 락 순서 통일 — character.v2 → skills.v2 (hunt·learn 라우트와 동일, 데드락 방지).
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
    // 차수(도달차수 복귀·전문화 스킬 차수 해금)에 사용 — 항상 읽는다(락 순서 character→skills→proficiency).
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
    const curElement = parseV2Element(charSave.element);

    // 속성 변경 비활성(2026-06-12, 사용자 결정) — 최초 선택(현재 neutral)만 허용.
    // 변경 수단은 추후 별도 시스템으로 재도입 예정. respec.ts 의 element 비용 경로는
    // 이 게이트 때문에 현재 도달 불가(헬퍼·테스트는 보존).
    if (curElement !== "neutral" && nextElement !== curElement) {
      return {
        status: 400,
        body: {
          ok: false as const,
          error: "element_change_disabled" as const,
        },
      };
    }
    const level = Math.max(1, charSave.level ?? 1);
    const gold = Math.max(0, charSave.gold ?? 0);
    const bankedGold = Math.max(0, Math.floor(Number(charSave.bankedGold) || 0));
    const lastRespecAt =
      typeof charSave.lastRespecAt === "number" ? charSave.lastRespecAt : 0;

    // PR-7 — respec 은 직업군 단위. 같은 직업군의 1차를 골라도(2차 캐릭이 자기 군 1차 선택 등)
    // 현 직업을 유지(다운그레이드 X).
    const groupChanged = isClassChange(curClass, nextClass);
    // 첫 선택(curClass none = 캐릭터 생성) — isClassChange 는 none 을 false 로 보므로
    // groupChanged 만으로는 첫 선택이 effectiveClass 설정 블록을 안 타서 class 가 "none"
    // 으로 남아 저장된다(#395 회귀: 신규 캐릭 직업 선택 불가 → 온보딩 게이트 무한 /create).
    // 첫 선택도 nextClass 로 확정해야 함(none → reachedTier 1 → classOfGroupTier=nextClass).
    const isFirstPick = curClass === "none";
    // 직업군 변경(첫 선택 포함) 시 — 그 직업군의 "도달 차수"로 복귀(1차 추락 X, 2026-06).
    // 예전에 검호(3차)까지 갔던 직업군으로 돌아오면 다시 검호. 게이트 입력이므로 락 순서
    // (character→skills→proficiency)대로 미리 잠가 읽는다. 같은 직업군이면 현 직업 유지.
    let effectiveClass: V2Class = curClass;
    if (groupChanged || isFirstPick) {
      // P4 — 4직군에선 class 자체가 직군. 차수는 proficiency.groups[job].tier 에 보존되므로
      // "도달 차수로 복귀"는 자동(class 만 바꾸면 됨, 별도 매핑 불필요).
      effectiveClass = nextClass;
    }

    // design A(§3.2·§6) — 직업군 변경(횡환생)은 4차 정점(만렙) 전용. 자유 respec 폐기로
    // "싼 저차수 farming·snap-back" 익스플로잇 구조 차단. 첫 선택·같은 직업군·속성변경은 면제.
    // (잘못 고른 초반 캐릭의 탈출구는 신전 초기화 — respec 과 별개.)
    if (groupChanged && !isFirstPick) {
      const curGroupTier = prof.groups[tier1ClassOf(curClass)]?.tier ?? 1;
      if (curGroupTier !== 4 || level < effectiveLevelCap(4)) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "not_at_apex" as const,
            requiredTier: 4,
            requiredLevel: effectiveLevelCap(4),
            haveTier: curGroupTier,
            haveLevel: level,
          },
        };
      }
    }
    // 직업군 변경(다른 직업으로 전직) = prestige 리셋 — 레벨 1·exp 0·grown 리셋(advance 와 동일).
    // 도달 차수로 복귀해도 레벨은 1부터(차수 사이 50까지 재성장). 첫 선택·속성만 변경은 레벨 유지.
    // 스킬은 학습+수동장착(자동부여·자동장착 폐지). 직업(군) 변경 시 learned 불변,
    // equipped 는 PRUNE 만 — 장착 가능 = 공용 + 선택 전문화의 차수 해금분.
    // 새 그룹 풀 밖/미학습 제거 + 슬롯 절단(리셋 후 레벨 기준).
    // 직업군 변경 시엔 전문화가 비워지므로(아래) 공용만, 유지면 기존 전문화 풀 적용.
    // 차수 — 새 직군(또는 유지 직군)의 도달 차수로 전문화 스킬 해금분을 게이팅(차수당 1개).
    const specChoice =
      typeof charSave.specChoice === "string" ? charSave.specChoice : null;
    const effectiveTier =
      prof.groups[tier1ClassOf(effectiveClass)]?.tier ?? 1;
    const chain = new Set<string>(
      elementalSkillsForClass(
        effectiveClass,
        groupChanged ? null : specChoice,
        effectiveTier,
      ),
    );

    // PR-6 비용 전직 — 변경(none/neutral 에서의 첫 선택 제외) 시 골드+쿨다운.
    const paid = isPaidRespec(curClass, nextClass, curElement, nextElement);
    let spent = 0;
    let nextGold = gold;
    let nextBankedGold = bankedGold;
    let nextLastRespecAt = lastRespecAt;
    let cooldownUntil =
      lastRespecAt > 0 ? lastRespecAt + RESPEC_COOLDOWN_MS : 0;

    if (paid) {
      if (lastRespecAt > 0 && now < lastRespecAt + RESPEC_COOLDOWN_MS) {
        return {
          status: 409,
          body: {
            ok: false as const,
            error: "respec_cooldown" as const,
            cooldownUntil: lastRespecAt + RESPEC_COOLDOWN_MS,
          },
        };
      }
      const cost = respecGoldCost(
        curClass,
        nextClass,
        curElement,
        nextElement,
        level,
      );
      const spend = spendGold(gold, bankedGold, cost);
      if (!spend.ok) {
        return {
          status: 400,
          body: {
            ok: false as const,
            error: "insufficient_gold" as const,
            required: cost,
            have: gold,
          },
        };
      }
      spent = cost;
      nextGold = spend.gold;
      nextBankedGold = spend.bankedGold;
      nextLastRespecAt = now;
      cooldownUntil = now + RESPEC_COOLDOWN_MS;
    }

    const charUpdate: Record<string, unknown> = {
      ...charSave,
      class: effectiveClass,
      element: nextElement,
      gold: nextGold,
      bankedGold: nextBankedGold,
      lastRespecAt: nextLastRespecAt,
      // 직업군 변경 시 레벨 1·exp 0 리셋(prestige). 유지면 기존 값.
      ...(groupChanged ? { level: 1, exp: 0 } : {}),
    };
    // 전문화(spec)는 직업 종속 — 직업군 변경 시 옛 전문화/해금 패시브를 비운다(새 직업 전문화 재선택).
    // (안 비우면 stale specChoice 가 새 직업 전문화 선택을 잠그고 derive 누수 위험.)
    if (groupChanged) {
      delete charUpdate.specChoice;
      delete charUpdate.unlockedPassives;
    }
    await upsertSave(tx, userId, "character.v2", charUpdate);

    // 캐릭터 생성(첫 직업 선택, none→) 시 풀피로 시작. 스타터 character.v2 의 hp 는 v1
    // 기본값(97)이라 직업 확정 후 maxHp(예 150)와 불일치 → 갓 만든 캐릭이 97/150 으로
    // 시작하는 문제. 직업이 정해져 maxHp 가 확정된 이 시점에 hp=maxHp 로 보정한다.
    // (respec=curClass!=="none" 은 제외 — 무료 힐 악용 방지.)
    if (curClass === "none") {
      const combat = await derivePlayerCombatV2(userId, tx);
      if (combat) {
        await upsertSave(tx, userId, "character.v2", {
          ...charUpdate,
          hp: combat.maxHp,
          hpRegenSince: now,
        });
      }
    }

    // equipped = 학습한 스킬 중 새 체인 유효분 전부(장착 슬롯 폐지·상한 없음). learned 보존.
    await upsertSave(tx, userId, "skills.v2", {
      ...skills,
      equipped: skills.learned.filter((s) => chain.has(s)),
    });

    // 직업군 변경 시 grown(랜덤 성장분) 리셋 — 레벨 1 = 성장분 0, floor 부터 재시작(advance 와 동일).
    // 위에서 이미 잠가 읽은 prof 재사용(중복 락 X). points/caps/tier/cumLevel 은 보존.
    if (groupChanged) {
      await upsertSave(tx, userId, "proficiency.v2", setGrown(prof, {}));
    }

    return {
      status: 200,
      body: {
        ok: true as const,
        class: effectiveClass,
        element: nextElement,
        gold: nextGold,
        bankedGold: nextBankedGold,
        spent,
        cooldownUntil,
      },
    };
  });

  return Response.json(result.body, { status: result.status });
}
