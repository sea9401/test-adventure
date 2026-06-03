"use client";

import { useCallback, useEffect, useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { Card } from "@/components/ui/Card";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import { V2CharacterCard } from "./V2CharacterCard";
import {
  V2_STAT_KEYS,
  V2_STAT_LABELS,
  type V2StatKey,
} from "@/adventure/data/v2/v2StatKeys";
import type {
  V2EquipmentId,
  V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2_CLASS_DEFS,
  parseV2Class,
  tier1ClassOf,
} from "@/adventure/data/v2/classes";

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
  } | null;
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
  };
};

type EquipmentResponse = {
  ok?: boolean;
  equipped?: Partial<Record<V2EquipSlot, V2EquipmentId>>;
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
    refresh();
  }, [refresh]);

  const character = state?.character;
  const guild = state?.guild;
  const stats = state?.stats;
  const combat = state?.combat;
  const equipped = equipment?.equipped ?? {};

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
          equipped={equipped}
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

      {character && state?.proficiency && (
        <Card padding="md">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">직업 숙달</h2>
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              현 직업군:{" "}
              {V2_CLASS_DEFS[
                tier1ClassOf(parseV2Class(character.class))
              ]?.group ?? "—"}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2 text-sm">
            <ProficiencyStat
              label="직군 누적 레벨"
              value={state.proficiency.current?.cumLevel ?? 0}
              tone="violet"
            />
            <ProficiencyStat
              label="숙달 포인트"
              value={state.proficiency.current?.points ?? 0}
              tone="emerald"
            />
            <ProficiencyStat
              label="수행 횟수"
              value={state.proficiency.current?.cultivations ?? 0}
              tone="zinc"
            />
          </div>
          <p className="mt-2 text-[11px] text-zinc-500 dark:text-zinc-400">
            직군 누적 레벨(레벨업당 +1)이 능력치 저점·전직을 좌우. 숙달 포인트는 사냥으로 적립(킬당 +2),
            마을 「수행」·「학습」에서 능력치 한계·스킬에 사용.
          </p>
        </Card>
      )}

      {stats && combat && (
        <Card padding="md">
          <StatsPanel
            stats={stats.base}
            caps={state?.proficiency?.caps}
            combat={combat}
            statKeys={V2_STAT_KEYS}
            statLabels={V2_STAT_LABELS}
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

// 숙련도 수치 1칸 — 캐릭터 정보 패널용.
function ProficiencyStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "violet" | "emerald" | "zinc";
}) {
  const toneClass =
    tone === "violet"
      ? "text-violet-600 dark:text-violet-400"
      : tone === "emerald"
        ? "text-emerald-700 dark:text-emerald-400"
        : "text-zinc-700 dark:text-zinc-300";
  return (
    <div className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900">
      <div className="text-[11px] text-zinc-500 dark:text-zinc-400">{label}</div>
      <div className={`mt-0.5 font-semibold tabular-nums ${toneClass}`}>
        {value.toLocaleString()}
      </div>
    </div>
  );
}
