"use client";

import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { BattleView } from "@/adventure/BattleView";
import { pickAutoAction } from "@/adventure/battle/pickAutoAction";
import { useGame } from "@/adventure/GameContext";
import { resolveBuffMultiplier } from "@/adventure/data/guildBuffs";
import { TutorialOverlay } from "@/adventure/tutorial";

export function BattleSubView() {
  const {
    character,
    currentRegion,
    back,
    adventureLog,
    characterStateHook,
    notifications,
    autoPotion,
    huntingActive,
    setHuntingActive,
    autoHunt,
    playerCombat,
    playerStatus,
    handleBattleEnd,
    inventory,
    guildBuffs,
  } = useGame();
  const bossCooldownReductionPct = resolveBuffMultiplier(
    guildBuffs,
    "boss_cooldown_reduction_pct",
  );

  return (
    <div className="space-y-3">
      <TutorialOverlay
        stepId="tutorial.battle.intro"
        title="처음 전투입니다"
        body={
          <>
            <p>
              전투는 <b>자동</b> 으로 진행된다. 매 턴 캐릭터가 알아서 공격하고,
              익힌 <b>스킬</b> 도 조건이 맞으면 자동으로 발동한다.
            </p>
            <p>
              HP 가 0 이 되면 패배. <b>포션 자동 사용</b> 규칙을 정해 두면 위험할
              때 알아서 회복한다.
            </p>
            <p>
              HP 는 마을 <b>치료소</b> 에서 회복할 수 있다. 너무 강한 적은 뒤로
              빠져 다른 적을 노리자.
            </p>
          </>
        }
      />
      {/* 뒤로 = 사냥 화면을 떠난다 → 사냥도 멈춘다. 재진입 시 "사냥 시작" 을 다시 눌러야
          전투가 이어진다 — "전투" 버튼 ↔ "뒤로가기" 연타로 쿨다운 없이 사냥하던 문제 차단.
          (다른 in-app 탭으로 갔다 돌아오는 경우는 setTab 경로라 사냥 유지 — 종전대로.) */}
      <SubViewHeader
        title="전투"
        onBack={() => {
          setHuntingActive(false);
          back();
        }}
      />
      <BattleView
        region={currentRegion}
        player={playerCombat}
        playerLevel={character.level}
        playerName={character.name}
        playerStatus={playerStatus}
        onBattleStart={adventureLog.markEncountered}
        onBattleEnd={handleBattleEnd}
        pickAutoAction={(state) =>
          pickAutoAction(state, {
            rules: autoPotion.config.rules,
            potions: inventory.state.potions,
          })
        }
        inventoryState={inventory.state}
        autoPotionConfig={autoPotion.config}
        onUpdateAutoPotionRule={autoPotion.updateRule}
        recentNotifications={notifications.list}
        huntingActive={huntingActive}
        onToggleHunting={setHuntingActive}
        autoHunt={autoHunt}
        bossAttemptsToday={characterStateHook.getBossAttemptsToday(
          currentRegion.id,
        )}
        bossLastAttemptAtMs={characterStateHook.getBossLastAttemptAt(
          currentRegion.id,
        )}
        onConsumeBossAttempt={() =>
          characterStateHook.consumeBossAttempt(currentRegion.id)
        }
        bossCooldownReductionPct={bossCooldownReductionPct}
      />
    </div>
  );
}
