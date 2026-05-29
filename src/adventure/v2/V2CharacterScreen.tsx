"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import { V2CharacterCard } from "./V2CharacterCard";
import type { StatKey } from "@/adventure/data/stats";
import type {
  V2EquipmentId,
  V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

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
  };
  guild?: { name: string };
  stats?: {
    base: Record<StatKey, number>;
    total: Record<StatKey, number>;
  } | null;
  combat?: { atk: number; def: number; spd: number } | null;
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
          <button
            type="button"
            onClick={onBack}
            className="text-xs text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
          >
            ← 캐릭터로
          </button>
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

      {stats && combat && (
        <Card padding="md">
          <StatsPanel stats={stats.base} totalStats={stats.total} combat={combat} />
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
