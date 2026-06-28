"use client";

import { useCallback, useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import { V2CharacterCard } from "./V2CharacterCard";
import { effectiveLevelCap } from "@/adventure/data/v2/proficiency";
import { dodgeChance } from "@/adventure/data/v2/v2CombatConstants";
import { floorAccuracy } from "@/adventure/data/v2/dungeonLadder";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  V2_STAT_DESCRIPTIONS,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";
import type {
  V2EquipInstance,
  V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import { V2CharacterBasics } from "./V2CharacterBasics";

// v2 캐릭터 "내 정보" 페이지 — 캐릭터 카드(장비 3슬롯 인라인 포함) + StatsPanel.
// 장착/해제는 인벤토리에서.

type StateResponse = {
  ok?: boolean;
  character?: {
    name: string;
    gender?: string;
    level: number;
    exp: number;
    expToNext: number | null;
    hp: number;
    maxHp: number;
    maxMp?: number;
    gold: number;
    class?: string;
    element?: string;
  };
  guild?: { name: string };
  stats?: {
    base: Record<V2StatKey, number>;
    total: Record<V2StatKey, number>;
  } | null;
  combat?: {
    atk: number;
    def: number;
    spd: number;
    magicAtk?: number;
    magicDef?: number;
    evasionPct?: number;
    evaRating?: number; // 회피 대결형 Slice 1b — 캡 없는 raw. 현재 깊이 몹명중과 대결해 실제 dodge% 표시.
    accuracyPct?: number;
    accRating?: number; // 회피 대결형 Slice 2 — 캡 없는 명중레이팅. "명중" 표시에 사용(StatsPanel 폴백).
    critChancePct?: number;
    critMult?: number;
    // 콘텐츠 파워(합성 전투력) — 기본 정보 카드 헤드라인.
    power?: number;
  } | null;
  // 누적 전투 횟수(전적) — 기본 정보 카드.
  battleCount?: number;
  frontierDepth?: number; // 현재 사냥터 최대 깊이 — 회피 대결형 dodge% 표시 기준(몹 명중).
  codex?: { discovered: number; total: number; discoveredIds: string[] };
  proficiency?: {
    // 각 스탯 한계치(cap) — 내 정보 능력치 "값(한계치)" 표기용. 수행 화면과 동일 스케일.
    caps?: Partial<Record<V2StatKey, number>>;
    current?: {
      group: string;
      // 직업 숙련도 — floor·전직 게이트 입력. 사냥 승리당 +1.
      cumLevel?: number;
      // 숙달 포인트 잔액(사용가능). 옛 누적/사용가능 통합.
      points?: number;
      cultivations?: number;
    };
    groups?: Record<string, { tier?: number }>;
  };
};

type EquipmentResponse = {
  ok?: boolean;
  owned?: V2EquipInstance[];
  equipped?: Partial<Record<V2EquipSlot, string>>;
};

export function V2CharacterScreen({
  onBack,
  // 다른 모험가 공개 보기 — 닉네임. 있으면 /api/v2/player/[name] 에서 공개 정보만 받고
  // 골드/EXP 등 사적 값은 숨긴다. 없으면 본인 /me 정보(기존 동작).
  playerName,
}: {
  onBack?: () => void;
  playerName?: string;
}) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [equipment, setEquipment] = useState<EquipmentResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      if (playerName) {
        // 공개 보기 — 단일 응답에 state 필드 + equipment 동봉.
        const res = (await fetch(
          `/api/v2/player/${encodeURIComponent(playerName)}`,
        ).then((r) => (r.ok ? r.json() : null))) as
          | (StateResponse & { equipment?: EquipmentResponse })
          | null;
        if (res?.ok) {
          setState(res);
          setEquipment(
            res.equipment ? { ok: true, ...res.equipment } : null,
          );
        } else {
          setState({ ok: false });
          setEquipment(null);
        }
        return;
      }
      const [stateRes, equipRes] = await Promise.all([
        fetch("/api/v2/me/state").then((r) => (r.ok ? r.json() : null)),
        fetch("/api/v2/me/equipment").then((r) => (r.ok ? r.json() : null)),
      ]);
      setState(stateRes as StateResponse | null);
      setEquipment(equipRes as EquipmentResponse | null);
    } catch {
      setState({ ok: false });
    } finally {
      setLoading(false);
    }
  }, [playerName]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 1회 fetch(refresh 가 setLoading)
    refresh();
  }, [refresh]);

  const character = state?.character;
  const guild = state?.guild;
  const stats = state?.stats;
  const combat = state?.combat;
  const equipped = equipment?.equipped ?? {};
  const currentGroup = state?.proficiency?.current?.group ?? "none";
  const currentTier =
    currentGroup === "none"
      ? null
      : (state?.proficiency?.groups?.[currentGroup]?.tier ?? 1);
  const levelCap = currentTier == null ? null : effectiveLevelCap(currentTier);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={playerName ? `${character?.name ?? "모험가"} 정보` : "내 정보"}
        onBack={onBack}
      />

      {character ? (
        <V2CharacterCard
          character={character}
          guild={guild}
          levelCap={levelCap}
          equipped={equipped}
          owned={equipment?.owned ?? []}
          // 공개 보기엔 골드 숨김(사적 정보).
          showGold={!playerName}
        />
      ) : loading ? (
        <Card padding="md">
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </div>
        </Card>
      ) : (
        <Card padding="md">
          <div className="text-sm text-rose-600 dark:text-rose-400">
            캐릭터 정보를 불러오지 못했어요.
          </div>
        </Card>
      )}

      {character && (
        <V2CharacterBasics
          element={character.element}
          guildName={guild?.name}
          points={state?.proficiency?.current?.points ?? 0}
          battleCount={state?.battleCount ?? 0}
          power={combat?.power ?? 0}
        />
      )}

      {stats && combat && (
        <Card padding="md">
          <StatsPanel
            stats={stats.base}
            caps={state?.proficiency?.caps}
            // 회피 대결형 Slice 1b — "회피"는 현재 깊이 몹 명중과 겨룬 실제 PvE dodge% 로 표시
            //   (캡 evasionPct 가 아니라 evaRating vs floorAccuracy(현재깊이) 대결값).
            combat={
              combat.evaRating != null
                ? {
                    ...combat,
                    evasionPct: dodgeChance(
                      combat.evaRating,
                      floorAccuracy(state?.frontierDepth ?? 2),
                    ),
                  }
                : combat
            }
            statKeys={V2_STAT_KEYS}
            statLabels={V2_STAT_LABELS}
            statDescriptions={V2_STAT_DESCRIPTIONS}
          />
        </Card>
      )}

      {character && stats == null && !loading && (
        <Card padding="md">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            아직 능력치 정보가 없어요. 사냥을 한 번 하면 자동으로 만들어집니다.
          </div>
        </Card>
      )}
    </main>
  );
}
