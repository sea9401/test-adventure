import type { BattleEndPayload } from "@/adventure/BattleView";
import type { PotionId } from "@/adventure/data/potions";
import { MONSTERS } from "@/adventure/data/monsters";
import {
  dropQualityPrefix,
  dropQualityTextClass,
} from "@/adventure/data/dropQuality";
import { rarityTextClass, ITEMS, type ItemId } from "@/adventure/data/items";
import { WORLD_MAP, type RegionId } from "@/adventure/data/world";
import { getQuestById } from "@/adventure/data/quests";
import { reportUniqueDrop } from "@/lib/clientFeed";
import type { MapProgress } from "@/lib/map-progress";
import type {
  NotificationKind,
  NotificationMeta,
} from "@/lib/notifications";
import type { TabKey } from "@/lib/useNavTabs";
import type { BattleClaimOutcome } from "@/lib/server/battleClaim";

// 보상 (드랍 RNG + EXP/gold + HP-regen) 는 EPIC #3-3 Phase 1 이후 서버 권위.
// 클라는 claimVictory 응답을 받아 saves replaceFromSaved + loot/EXP 토스트.
// 비-보상 (칭호/마일스톤/스토리플래그/quest progress/패배 페널티) 은 Phase 2/3 까지 잔존.
export type BattleEndDeps = {
  /** 서버 victory claim — encounterId 와 stat 만 보내고 saves + drops 받음. null = 통신 실패. */
  claimVictory: (input: {
    encounterId: string;
    enemyName: string;
    finalPlayerHp: number;
    playerMaxHp: number;
    isBoss: boolean;
  }) => Promise<BattleClaimOutcome | null>;
  inventory: {
    consume: (id: PotionId, n: number) => void;
  };
  adventureLog: {
    addKill: (name: string) => void;
    markTitleObtained: (titleId: string) => void;
    incrementBattleLosses: () => void;
    incrementNoDamageWin: () => void;
  };
  quests: {
    recordKill: (
      name: string,
      ctx?: { hpFraction?: number; potionsUsed?: number },
    ) => string[];
  };
  inventoryActions: {
    /** 마일스톤 스킬북 1회 지급 — Phase 2 이전까지 클라 잔존. */
    addSkillBook: (
      id:
        | "book_mad_slash"
        | "book_deep_wound"
        | "book_frenzy"
        | "book_thunder_strike"
        | "book_light_glide",
      n?: number,
    ) => void;
  };
  characterState: {
    setHp: (n: number) => void;
  };
  storyFlags: { set: (id: string) => void; has: (id: string) => boolean };
  /** 누적 보스 처치 수 (이번 처치 전 기준) — 보스 50회 업적 보상 발급용. */
  bossKillsTotal: number;
  /** 누적 일반 처치 수 (이번 처치 전 기준) — 1000회 사냥 폭주 업적 발급용. */
  totalKillsTotal: number;
  /** 누적 무피해 승리 수 (이번 처치 전 기준) — 무피해 100회 광살참 업적용. */
  noDamageWinsTotal: number;
  /** 누적 운봉의 거인 처치 수 (이번 처치 전 기준) — 거인 10회 천뢰 일격 업적용. */
  peakGiantKillsTotal: number;
  respawnRegionId: RegionId;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
  setHuntingActive: (next: boolean) => void;
  replaceLocation: (tab: TabKey, subView: string | null) => void;
  setMapProgress: (updater: (prev: MapProgress) => MapProgress) => void;
  /** 길드 의뢰 진행도 보고 — 길드 미가입/미매칭이면 서버가 silent ignore. */
  reportGuildKill?: (enemyName: string) => void;
};

// crypto.randomUUID fallback. encounterId 는 서버 idempotency 가드(Phase 2 추가 예정)
// 의 키 — 일단 충돌만 안 나면 충분.
function newEncounterId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// BattleView 의 onBattleEnd 콜백 본체. 의존성을 명시적으로 주입받는 형태로
// page.tsx 에서 분리 — 테스트 가능 + 거대한 컴포넌트 본체에서 빠져나옴.
export async function onBattleEnd(
  payload: BattleEndPayload,
  deps: BattleEndDeps,
): Promise<void> {
  // 전투 중 사용된 포션을 인벤토리에서 차감 (resolveBattle 은 가짜 잔량으로 시뮬했음).
  let potionTotal = 0;
  for (const [id, n] of Object.entries(payload.potionsConsumed)) {
    if (n) {
      deps.inventory.consume(id as PotionId, n);
      potionTotal += n;
    }
  }
  // '포션 폭격기' — 승패 무관, 한 전투에서 5병 이상.
  if (potionTotal >= 5) deps.adventureLog.markTitleObtained("potion_overload");

  if (payload.outcome === "win") {
    deps.adventureLog.addKill(payload.enemyName);
    deps.adventureLog.markTitleObtained("first_blood");
    // 무피해 승리 — 광살참 업적 카운터 +1. 누적 100회 도달 시 1회성 지급.
    if (payload.damageTakenThisCombat === 0) {
      deps.adventureLog.incrementNoDamageWin();
      if (
        deps.noDamageWinsTotal + 1 >= 100 &&
        !deps.storyFlags.has("mad_slash_book_granted")
      ) {
        deps.storyFlags.set("mad_slash_book_granted");
        deps.inventoryActions.addSkillBook("book_mad_slash", 1);
        deps.addNotification(
          "milestone",
          "✨ 무피해 100회 승리 — '스킬북 — 광살참' 을 손에 넣었다!",
        );
      }
    }
    // '구사일생' — 체력 1 남긴 채 승리.
    if (payload.finalPlayerHp === 1) {
      deps.adventureLog.markTitleObtained("close_call");
    }
    // kill_within_hp / no_potion_boss 의뢰 판정용 ctx. autohunt 경로는 ctx 없이 호출 →
    // 조건부 kind 는 자동으로 진행 안 됨 (의도 — 라이브 도전 의뢰).
    const hpFraction =
      payload.playerMaxHp > 0 ? payload.finalPlayerHp / payload.playerMaxHp : 0;
    const readyQuestIds = deps.quests.recordKill(payload.enemyName, {
      hpFraction,
      potionsUsed: potionTotal,
    });
    deps.reportGuildKill?.(payload.enemyName);

    // 보스 storyFlag / 칭호 — data-driven (monster.onDefeatFlag/onDefeatTitleId).
    const monster = MONSTERS[payload.enemyName];
    if (monster?.onDefeatFlag) deps.storyFlags.set(monster.onDefeatFlag);
    if (monster?.onDefeatTitleId) {
      deps.adventureLog.markTitleObtained(monster.onDefeatTitleId);
    }

    // 누적 마일스톤 — 보스 50 / 총 1000 / 거인 10 / 천공인 첫 처치.
    if (
      monster?.phaseTrigger &&
      deps.bossKillsTotal + 1 >= 50 &&
      !deps.storyFlags.has("deep_wound_book_granted")
    ) {
      deps.storyFlags.set("deep_wound_book_granted");
      deps.inventoryActions.addSkillBook("book_deep_wound", 1);
      deps.addNotification(
        "milestone",
        "✨ 보스 50회 처치 — '스킬북 — 깊은 상처' 를 손에 넣었다!",
      );
    }
    if (
      deps.totalKillsTotal + 1 >= 1000 &&
      !deps.storyFlags.has("frenzy_book_granted")
    ) {
      deps.storyFlags.set("frenzy_book_granted");
      deps.inventoryActions.addSkillBook("book_frenzy", 1);
      deps.addNotification(
        "milestone",
        "✨ 누적 1000회 처치 — '스킬북 — 폭주' 를 손에 넣었다!",
      );
    }
    if (
      payload.enemyName === "운봉의 거인" &&
      deps.peakGiantKillsTotal + 1 >= 10 &&
      !deps.storyFlags.has("thunder_strike_book_granted")
    ) {
      deps.storyFlags.set("thunder_strike_book_granted");
      deps.inventoryActions.addSkillBook("book_thunder_strike", 1);
      deps.addNotification(
        "milestone",
        "✨ 운봉의 거인 10회 처치 — '스킬북 — 천뢰 일격' 을 손에 넣었다!",
      );
    }
    if (
      payload.enemyName === "천공인의 왕" &&
      !deps.storyFlags.has("light_glide_book_granted")
    ) {
      deps.storyFlags.set("light_glide_book_granted");
      deps.inventoryActions.addSkillBook("book_light_glide", 1);
      deps.addNotification(
        "milestone",
        "✨ 천공인의 왕 처치 — '스킬북 — 빛의 활공' 을 손에 넣었다!",
      );
    }

    // 보상 적용 — 서버 권위. fetch 실패해도 위의 클라 비-보상 부분은 이미 적용됨.
    const outcome = await deps.claimVictory({
      encounterId: newEncounterId(),
      enemyName: payload.enemyName,
      finalPlayerHp: payload.finalPlayerHp,
      playerMaxHp: payload.playerMaxHp,
      isBoss: !!payload.isBoss,
    });
    if (!outcome) {
      // 통신 실패 — finalHp 만 따로 적용해 stuck 회피. 재생 룬 미적용.
      deps.characterState.setHp(payload.finalPlayerHp);
      deps.addNotification(
        "info",
        "보상 통신 오류 — 잠시 후 다시 시도해 주세요.",
      );
      return;
    }

    if (outcome.hpRegenHealed > 0) {
      deps.addNotification("info", `재생의 룬 — HP +${outcome.hpRegenHealed}`);
    }

    // 드랍 토스트 — 서버가 굴린 결과대로 클라에서 같은 문구로.
    for (const drop of outcome.drops) {
      if (drop.kind === "material") {
        deps.addNotification(
          "loot",
          `${drop.name}${drop.amount > 1 ? ` ×${drop.amount}` : ""}을(를) 손에 넣었다.`,
        );
      } else if (drop.kind === "gold") {
        deps.addNotification("loot", `골드 +${drop.amount}`);
      } else if (drop.kind === "equip") {
        const display = dropQualityPrefix(drop.quality) + drop.name;
        const equipDef = ITEMS[drop.itemId as ItemId];
        if (drop.lucky) reportUniqueDrop(drop.itemId as ItemId);
        deps.addNotification(
          drop.lucky ? "milestone" : "equip_drop",
          `${drop.lucky ? "✨ 굉장한 발견! " : ""}${display}을(를) 손에 넣었다!`,
          {
            highlight: {
              name: display,
              className: drop.quality
                ? dropQualityTextClass(drop.quality)
                : rarityTextClass(equipDef),
            },
          },
        );
      } else if (drop.kind === "recipe") {
        deps.addNotification(
          "equip_drop",
          `${drop.name}을(를) 손에 넣었다!`,
        );
      } else if (drop.kind === "skill_book") {
        deps.addNotification(
          "milestone",
          `✨ ${drop.name}을(를) 손에 넣었다!`,
        );
      } else if (drop.kind === "recipe_one_of_already_known") {
        deps.addNotification(
          "info",
          "제작서 보상 — 이미 모든 종류를 알고 있다.",
        );
      }
    }

    // EXP 토스트 — 곱셈 분해 라벨.
    let expParts = "";
    if (outcome.expBonusApplied) expParts += " (신참 ×2)";
    if (outcome.expMultParts.guild > 1)
      expParts += ` (길드 ×${outcome.expMultParts.guild.toFixed(2)})`;
    if (outcome.expMultParts.rune > 1)
      expParts += ` (룬 ×${outcome.expMultParts.rune.toFixed(2)})`;
    if (outcome.expMultParts.paragon > 1)
      expParts += ` (파라곤 ×${outcome.expMultParts.paragon.toFixed(2)})`;
    const reward =
      outcome.expGained > 0
        ? `EXP +${outcome.expGained}${expParts}`
        : "보상 없음";
    deps.addNotification(
      "battle_win",
      `${payload.enemyName}을(를) 쓰러뜨렸다 — ${reward}`,
      { battleLog: payload.log },
    );
    for (const id of readyQuestIds) {
      const quest = getQuestById(id);
      if (quest) {
        deps.addNotification(
          "quest_ready",
          `의뢰 조건 달성 — ${quest.title}: 길드에서 보상을 받을 수 있다.`,
        );
      }
    }
    return;
  }

  deps.adventureLog.incrementBattleLosses();
  deps.setHuntingActive(false);

  // 보스 패배 (개인 region.boss 도전) — 마을 강제 이동 X, HP 는 maxHP 로 풀회.
  if (payload.isBoss) {
    deps.characterState.setHp(payload.playerMaxHp);
    deps.addNotification(
      "battle_lose",
      `${payload.enemyName}에게 쓰러졌다... HP 가 회복됐다.`,
      { battleLog: payload.log },
    );
    return;
  }

  // 일반 전투 패배 — HP 0 + 복귀 마을 강제 이동.
  deps.characterState.setHp(0);
  deps.replaceLocation("town", "healing");
  const respawnId = deps.respawnRegionId;
  deps.setMapProgress((prev) => ({
    ...prev,
    currentRegionId: respawnId,
    visitedRegionIds: prev.visitedRegionIds.includes(respawnId)
      ? prev.visitedRegionIds
      : [...prev.visitedRegionIds, respawnId],
  }));
  const respawnName =
    WORLD_MAP.regions.find((r) => r.id === respawnId)?.name ?? "마을";
  deps.addNotification(
    "battle_lose",
    `${payload.enemyName}에게 쓰러졌다... ${respawnName} 치유소에서 회복이 필요하다.`,
    { battleLog: payload.log },
  );
}
