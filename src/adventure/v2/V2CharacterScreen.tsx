"use client";

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import { V2CharacterCard } from "./V2CharacterCard";
import { tierLevelCap } from "@/adventure/data/v2/proficiency";
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
    accuracyPct?: number;
    critChancePct?: number;
    critMult?: number;
    extraAttackChancePct?: number;
    // 콘텐츠 파워(합성 전투력) — 기본 정보 카드 헤드라인.
    power?: number;
  } | null;
  // 누적 전투 횟수(전적) — 기본 정보 카드.
  battleCount?: number;
  codex?: { discovered: number; total: number; discoveredIds: string[] };
  proficiency?: {
    // 각 스탯 한계치(cap) — 내 정보 능력치 "값(한계치)" 표기용. 수행 화면과 동일 스케일.
    caps?: Partial<Record<V2StatKey, number>>;
    current?: {
      group: string;
      // 직군 누적 레벨 — floor·전직 게이트 입력. 레벨업당 +1.
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
}: {
  onBack?: () => void;
}) {
  const [state, setState] = useState<StateResponse | null>(null);
  const [equipment, setEquipment] = useState<EquipmentResponse | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
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
  }, []);

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
  const levelCap = currentTier == null ? null : tierLevelCap(currentTier);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        {onBack && (
          <BackButton onClick={onBack} />
        )}
        <h1 className="mt-1 text-lg font-bold">내 정보</h1>
      </header>

      {character ? (
        <V2CharacterCard
          character={character}
          guild={guild}
          levelCap={levelCap}
          equipped={equipped}
          owned={equipment?.owned ?? []}
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
            combat={combat}
            statKeys={V2_STAT_KEYS}
            statLabels={V2_STAT_LABELS}
            statDescriptions={V2_STAT_DESCRIPTIONS}
          />
        </Card>
      )}

      {character && stats == null && !loading && (
        <Card padding="md">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            능력치 정보가 아직 만들어지지 않았어요. 사냥을 한 번 시도하면 자동 생성됩니다.
          </div>
        </Card>
      )}
    </main>
  );
}
