"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Diamond,
  Shield,
  Sword,
  User as UserIcon,
  type Icon,
} from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { StatBar } from "@/components/ui/StatBar";
import { StatsPanel } from "@/adventure/character/StatsPanel";
import { avatarImageSrc, type Gender } from "@/adventure/profile/avatars";
import type { StatKey } from "@/adventure/data/stats";
import {
  V2_EQUIPMENT,
  type V2EquipmentId,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";

// v2 캐릭터 화면 — 라이브 CharacterMini 패턴 차용.
// portrait + 칭호(placeholder) + 이름 + 레벨 + HP/MP/EXP bars + 3 슬롯 + StatsPanel.
// MP 는 v2 에 시스템 없음 — 0/0 placeholder. 칭호도 같음 (있을 때만 표시).

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

const SLOTS: { slot: V2EquipSlot; label: string; Icon: Icon; color: string }[] = [
  { slot: "weapon", label: "무기", Icon: Sword, color: "text-rose-500" },
  { slot: "armor", label: "방어구", Icon: Shield, color: "text-sky-500" },
  {
    slot: "accessory",
    label: "장신구",
    Icon: Diamond,
    color: "text-violet-500",
  },
];

function CharacterPortrait({ gender }: { gender: Gender }) {
  const [errored, setErrored] = useState(false);
  return (
    <div
      aria-label="캐릭터 이미지"
      className="flex aspect-square w-28 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-300 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-900/50 dark:text-zinc-600"
    >
      {errored ? (
        <UserIcon size={56} weight="duotone" />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={avatarImageSrc(gender)}
          alt=""
          onError={() => setErrored(true)}
          className="h-full w-full object-contain"
        />
      )}
    </div>
  );
}

export function V2CharacterScreen({
  onOpenEquipment,
  onOpenInventory,
  onOpenSkills,
}: {
  onOpenEquipment?: () => void;
  onOpenInventory?: () => void;
  onOpenSkills?: () => void;
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
  // 칭호 — v2 에 시스템 없음. placeholder (있을 때만 표시).
  const titleName: string | null = null;
  // MP — v2 에 없음. 사용자 요청에 라이브 톤 맞춰 0/0 placeholder.
  const mp = 0;
  const maxMp = 0;

  return (
    <main className="mx-auto max-w-2xl space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <header>
        <h1 className="text-lg font-bold">내 정보</h1>
      </header>

      <Card padding="md">
        {character ? (
          <>
            <div className="flex items-stretch gap-4">
              <CharacterPortrait gender={(character.gender ?? "male1") as Gender} />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="flex flex-wrap items-baseline gap-2">
                  {titleName && (
                    <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                      {titleName}
                    </span>
                  )}
                  <span className="text-base font-semibold">
                    {character.name}
                  </span>
                  <span className="text-sm text-zinc-400 dark:text-zinc-500">
                    Lv.{character.level}
                  </span>
                  {guild && (
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      · {guild.name}
                    </span>
                  )}
                </div>
                <div className="max-w-sm space-y-1.5">
                  <StatBar
                    label="HP"
                    value={character.hp}
                    max={character.maxHp}
                    color="bg-red-500"
                  />
                  <StatBar
                    label="MP"
                    value={mp}
                    max={maxMp}
                    color="bg-blue-500"
                  />
                  {character.expToNext != null && (
                    <StatBar
                      label="EXP"
                      value={character.exp}
                      max={character.expToNext}
                      color="bg-amber-400"
                    />
                  )}
                </div>
              </div>
            </div>

            {/* 장비 3슬롯 — 클릭 시 V2EquipmentView 진입. */}
            <div className="mt-4 grid grid-cols-3 gap-2">
              {SLOTS.map(({ slot, label, Icon, color }) => {
                const id = equipped[slot];
                const item = id ? V2_EQUIPMENT[id] : null;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={onOpenEquipment}
                    disabled={!onOpenEquipment}
                    className="flex flex-col items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2.5 text-center transition-colors hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900/50 dark:hover:bg-zinc-800 dark:disabled:hover:bg-zinc-900/50"
                  >
                    <Icon size={20} weight="duotone" className={color} />
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {label}
                    </div>
                    <div className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-200">
                      {item?.name ?? "—"}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between text-xs">
              <span className="text-zinc-500 dark:text-zinc-400">골드</span>
              <span className="font-medium tabular-nums text-yellow-600 dark:text-yellow-400">
                {character.gold.toLocaleString()}
              </span>
            </div>
          </>
        ) : loading ? (
          <div className="text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </div>
        ) : (
          <div className="text-sm text-rose-600 dark:text-rose-400">
            캐릭터 정보를 불러오지 못했어요.
          </div>
        )}
      </Card>

      {stats && combat && (
        <Card padding="md">
          <StatsPanel stats={stats.base} totalStats={stats.total} combat={combat} />
        </Card>
      )}

      {/* 캐릭터 탭 내 sub 진입 — 인벤/스킬. 장비는 위의 슬롯 클릭. */}
      {(onOpenInventory || onOpenSkills) && (
        <div className="grid grid-cols-2 gap-2">
          {onOpenInventory && (
            <button
              type="button"
              onClick={onOpenInventory}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              인벤토리
            </button>
          )}
          {onOpenSkills && (
            <button
              type="button"
              onClick={onOpenSkills}
              className="rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-sm font-medium text-zinc-700 hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200 dark:hover:bg-zinc-800"
            >
              스킬
            </button>
          )}
        </div>
      )}

      {stats == null && !loading && (
        <Card padding="md">
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            캐릭터가 아직 만들어지지 않았어요. 거점에서 사냥을 한 번 시도하면
            자동 생성됩니다.
          </div>
        </Card>
      )}
    </main>
  );
}
