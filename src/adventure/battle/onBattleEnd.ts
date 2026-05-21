import type { BattleEndPayload } from "@/adventure/BattleView";
import type { PotionId } from "@/adventure/data/potions";
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

// 보상 / 칭호 / 마일스톤 / 누적 카운터 / 의뢰 진행 / 길드 의뢰 kill 보고 는 EPIC #3-3
// Phase 1+2+3 이후 모두 서버 권위. 클라는 claimVictory 응답을 받아 saves replaceFromSaved +
// loot/milestone/EXP/quest_ready 토스트 + grantTitle chain (잔영 컬렉션 등) 처리.
// 비-보상 클라 잔존:
//   - potion_overload 칭호 (패배 시) — 패배 path 자체가 클라 권위.
//   - 패배 페널티 (respawn / 마을 강제 이동 / incrementBattleLosses). 보상이 없어 보안 면 없음.
export type BattleEndDeps = {
  /** 서버 victory claim — encounterId 와 stat 만 보내고 saves + drops + 칭호/마일스톤 받음. */
  claimVictory: (input: {
    encounterId: string;
    enemyName: string;
    finalPlayerHp: number;
    playerMaxHp: number;
    isBoss: boolean;
    bossRegionId?: string;
    damageTakenThisCombat: number;
    potionsConsumedTotal: number;
  }) => Promise<BattleClaimOutcome | null>;
  inventory: {
    consume: (id: PotionId, n: number) => void;
  };
  adventureLog: {
    /** potion_overload 칭호 (패배 시 잔존) + 잔영 컬렉션 chain 트리거용 grantTitle. */
    markTitleObtained: (titleId: string) => void;
    incrementBattleLosses: () => void;
  };
  characterState: {
    setHp: (n: number) => void;
  };
  respawnRegionId: RegionId;
  addNotification: (
    kind: NotificationKind,
    text: string,
    meta?: NotificationMeta,
  ) => void;
  setHuntingActive: (next: boolean) => void;
  replaceLocation: (tab: TabKey, subView: string | null) => void;
  setMapProgress: (updater: (prev: MapProgress) => MapProgress) => void;
};

// crypto.randomUUID fallback. encounterId 는 서버 idempotency 가드(Phase 3 추가 예정)
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

  if (payload.outcome === "win") {
    // 보상 + 칭호 + 마일스톤 + 카운터 + 의뢰 진행 + 길드 의뢰 kill — 모두 서버.
    // fetch 실패 시 stuck 회피 fallback.
    const outcome = await deps.claimVictory({
      encounterId: newEncounterId(),
      enemyName: payload.enemyName,
      finalPlayerHp: payload.finalPlayerHp,
      playerMaxHp: payload.playerMaxHp,
      isBoss: !!payload.isBoss,
      bossRegionId: payload.bossRegionId,
      damageTakenThisCombat: payload.damageTakenThisCombat,
      potionsConsumedTotal: potionTotal,
    });
    if (!outcome) {
      // 통신 실패 — finalHp 만 따로 적용해 stuck 회피. 재생 룬·서버 칭호 미반영.
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

    // 드랍 토스트 — 서버가 굴린 결과대로.
    for (const drop of outcome.drops) {
      if (drop.kind === "material") {
        deps.addNotification(
          "loot",
          `${drop.name}${drop.amount > 1 ? ` ×${drop.amount}` : ""}을(를) 손에 넣었다.`,
        );
      } else if (drop.kind === "gold") {
        deps.addNotification("loot", `골드 +${drop.amount}`);
      } else if (drop.kind === "equip") {
        const prefix = dropQualityPrefix(drop.quality);
        const display = prefix + drop.name;
        const equipDef = ITEMS[drop.itemId as ItemId];
        if (drop.lucky) reportUniqueDrop(drop.itemId as ItemId);
        deps.addNotification(
          drop.lucky ? "milestone" : "equip_drop",
          `${drop.lucky ? "✨ 굉장한 발견! " : ""}${display}을(를) 손에 넣었다!`,
          {
            highlight: {
              // 이름은 rarity 색 유지, 접두어(드랍 수식어)만 품질 색.
              name: drop.name,
              className: rarityTextClass(equipDef),
              ...(drop.quality
                ? {
                    prefix: {
                      text: prefix,
                      className: dropQualityTextClass(drop.quality),
                    },
                  }
                : {}),
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

    // 마일스톤 스킬북 토스트 — 서버가 storyFlag + inventory 에 박았고, 클라 토스트만 띄움.
    for (const m of outcome.milestones) {
      deps.addNotification("milestone", m.message);
    }

    // 칭호 grants — saves 의 titles 는 이미 갱신됨. grantTitle 은 클라 측 toast +
    // 잔영 컬렉션 chain (예: starlit_quietener 자동 grant) 트리거. idempotent.
    for (const titleId of outcome.grantedTitleIds) {
      deps.adventureLog.markTitleObtained(titleId);
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
    for (const id of outcome.readyQuestIds) {
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

  // 패배 — Phase 3 까지 클라 잔존. potion_overload 도 패배 시엔 클라가 처리.
  if (potionTotal >= 5) deps.adventureLog.markTitleObtained("potion_overload");
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
