"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { V2_UNEXPLORED } from "@/adventure/data/v2/coreLoopConfig";
import { V2DungeonFloorView } from "./V2DungeonFloorView";
import { useGameState } from "./GameStateProvider";
import type { UnexploredClientSnapshot } from "./unexploredTreeModel";
import { unexploredSnapshotToHuntSummary } from "./unexploredHuntPageModel";
import { Card } from "@/components/ui/Card";
import { Button, buttonClassName } from "@/components/ui/Button";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { GameIcon } from "./GameIcon";

type LoadState =
  | { kind: "loading" }
  | { kind: "error" }
  | { kind: "ready"; snapshot: UnexploredClientSnapshot };

export function V2UnexploredHuntPage() {
  const router = useRouter();
  const [state, setState] = useState<LoadState>(
    V2_UNEXPLORED ? { kind: "loading" } : { kind: "error" },
  );
  const {
    viewerName,
    viewerGender,
    viewerLevel,
    viewerLevelCap,
    viewerJobTier,
    viewerClass,
    viewerExp,
    viewerExpToNext,
    playerSubtitle,
    viewerProficiency,
    stamina,
    staminaMax,
    adventureSupportActive,
    setStamina,
    hpCharges,
    mpCharges,
    hp,
    setHp,
    mp,
    setMp,
    playerCombat,
    frontierDepth,
    setFrontierDepth,
    refreshGameState,
    applyResourcePatch,
    combatCooldown,
    setCombatCooldown,
  } = useGameState();

  useEffect(() => {
    if (!V2_UNEXPLORED) return;
    const controller = new AbortController();
    void fetch("/api/v2/unexplored", { signal: controller.signal })
      .then(async (response) => {
        const data = (await response.json().catch(() => null)) as {
          ok?: boolean;
          snapshot?: UnexploredClientSnapshot;
        } | null;
        if (!response.ok || !data?.ok || !data.snapshot) {
          setState({ kind: "error" });
          return;
        }
        setState({ kind: "ready", snapshot: data.snapshot });
      })
      .catch((error: unknown) => {
        if ((error as { name?: string }).name !== "AbortError") {
          setState({ kind: "error" });
        }
      });
    return () => controller.abort();
  }, []);

  if (state.kind === "loading") {
    return <UnexploredPageStatus kind="loading" onBack={() => router.push("/battle/dungeon")} />;
  }
  if (state.kind === "error") {
    return <UnexploredPageStatus kind="error" onBack={() => router.push("/battle/dungeon")} />;
  }

  const snapshot = state.snapshot;
  if (!snapshot.eligible) {
    return (
      <UnexploredAccessPanel
        kind="level"
        level={snapshot.level}
        onBack={() => router.push("/battle/dungeon")}
        onOpenNetwork={() => router.push("/character/unexplored")}
      />
    );
  }
  if (!snapshot.selectedNodeIds.includes("start")) {
    return (
      <UnexploredAccessPanel
        kind="start"
        level={snapshot.level}
        onBack={() => router.push("/battle/dungeon")}
        onOpenNetwork={() => router.push("/character/unexplored")}
      />
    );
  }

  const summary = unexploredSnapshotToHuntSummary(snapshot);
  return (
    <V2DungeonFloorView
      floorId={summary.difficulty}
      huntMode="unexplored"
      unexploredSummary={summary}
      outpostId="unexplored"
      outpostName="전용 사냥터"
      playerName={viewerName}
      playerGender={viewerGender}
      currentLevel={viewerLevel}
      currentLevelCap={viewerLevelCap}
      currentJobTier={viewerJobTier}
      initialExp={viewerExp}
      initialMaxExp={viewerExpToNext}
      initialHpCharges={hpCharges}
      initialMpCharges={mpCharges}
      playerSubtitle={playerSubtitle}
      playerProficiency={viewerProficiency}
      stamina={stamina}
      staminaMax={staminaMax}
      adventureSupportActive={adventureSupportActive}
      setStamina={setStamina}
      hp={hp}
      setHp={setHp}
      mp={mp}
      setMp={setMp}
      playerCombat={playerCombat}
      playerPrimaryAttack={viewerClass === "mage" ? "magic" : "physical"}
      onSeekHealing={() => router.push("/town/healing")}
      onBack={() => router.push("/battle/dungeon")}
      frontierDepth={frontierDepth}
      onFrontierUnlocked={(depth) =>
        setFrontierDepth(Math.max(frontierDepth, depth))
      }
      onLevelUp={refreshGameState}
      combatCooldown={combatCooldown}
      setCombatCooldown={setCombatCooldown}
      setAtRiskGold={(gold) => applyResourcePatch({ atRiskGold: gold })}
      onGoldChange={(gold) => applyResourcePatch({ gold })}
      onProficiencyChange={(proficiency) =>
        applyResourcePatch({ viewerProficiency: proficiency })
      }
      onExperienceChange={applyResourcePatch}
      onRecoveryChargesChange={applyResourcePatch}
      onRefresh={refreshGameState}
    />
  );
}

function UnexploredPageStatus({
  kind,
  onBack,
}: {
  kind: "loading" | "error";
  onBack: () => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="미개척지" onBack={onBack} />
      <Card padding="lg" className="text-center">
        <GameIcon
          name={kind === "loading" ? "Compass" : "Warning"}
          size={32}
          className="mx-auto text-violet-500"
        />
        <p className="mt-3 text-sm font-medium">
          {kind === "loading"
            ? "탐사 상태를 불러오는 중입니다."
            : "탐사 상태를 불러오지 못했습니다."}
        </p>
        {kind === "error" && (
          <Button className="mt-4" onClick={onBack}>
            사냥터 목록으로
          </Button>
        )}
      </Card>
    </main>
  );
}

export function UnexploredAccessPanel({
  kind,
  level,
  onBack,
  onOpenNetwork,
}: {
  kind: "level" | "start";
  level: number;
  onBack: () => void;
  onOpenNetwork: () => void;
}) {
  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="미개척지" onBack={onBack} />
      <Card padding="lg" className="text-center">
        <GameIcon
          name={kind === "level" ? "Lock" : "Compass"}
          size={36}
          className="mx-auto text-violet-500"
        />
        <h1 className="mt-3 text-lg font-semibold">
          {kind === "level"
            ? "100레벨 달성 후 다시 입장할 수 있습니다"
            : "탐사 시작 노드가 필요합니다"}
        </h1>
        <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400">
          {kind === "level"
            ? `현재 레벨 ${level} · 재전직 후에는 다시 100레벨을 달성해야 합니다.`
            : "캐릭터의 미개척지 탐사망에서 중앙 노드를 먼저 활성화해 주세요."}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          <Button onClick={onBack}>사냥터 목록으로</Button>
          <Link
            href="/character/unexplored"
            onClick={(event) => {
              event.preventDefault();
              onOpenNetwork();
            }}
            className={buttonClassName({ variant: "primary", size: "sm" })}
          >
            미개척지 탐사망 열기
          </Link>
        </div>
      </Card>
    </main>
  );
}
