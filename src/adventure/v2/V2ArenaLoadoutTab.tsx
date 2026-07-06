"use client";

import { useCallback, useEffect, useState } from "react";
import { LoadErrorBanner } from "@/components/ui/LoadErrorBanner";
import {
  Circle,
  Diamond,
  FloppyDisk,
  HandFist,
  Shield,
  Sneaker,
  Sword,
  Trash,
  type Icon,
} from "@phosphor-icons/react";
import {
  V2_EQUIPMENT,
  type V2EquipInstance,
  type V2EquipSlot,
} from "@/adventure/data/v2/v2Equipment";
import {
  V2ItemCard,
  anchorOf,
  powerNameClass,
  type ItemCardAnchor,
} from "@/adventure/v2/V2ItemCard";

type Loadout = {
  id: string;
  name: string;
  savedAt: string;
  element?: string;
  skills: string[];
  pattern: { blocks?: unknown[] } | null;
  equipment: Record<string, string>;
  summary?: {
    elementLabel: string | null;
    skills: { id: string; name: string; passive: boolean }[];
    equipment: {
      slot: V2EquipSlot;
      slotLabel: string;
      iid: string | null;
      name: string | null;
      inst: V2EquipInstance | null;
    }[];
    patternBlocks: number;
  };
};

const EQUIP_SLOTS: {
  slot: V2EquipSlot;
  label: string;
  Icon: Icon;
  color: string;
}[] = [
  { slot: "weapon", label: "무기", Icon: Sword, color: "text-rose-500" },
  { slot: "armor", label: "갑옷", Icon: Shield, color: "text-sky-500" },
  { slot: "gloves", label: "장갑", Icon: HandFist, color: "text-amber-500" },
  { slot: "boots", label: "신발", Icon: Sneaker, color: "text-emerald-500" },
  { slot: "ring", label: "반지", Icon: Circle, color: "text-violet-500" },
  { slot: "necklace", label: "목걸이", Icon: Diamond, color: "text-pink-500" },
];

function formatKst(iso: string | undefined): string {
  if (!iso) return "-";
  const time = new Date(iso).getTime();
  if (!Number.isFinite(time)) return "-";
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(time));
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-zinc-200 bg-white p-4 shadow-sm dark:border-zinc-700 dark:bg-zinc-900">
      <h3 className="mb-3 text-sm font-bold text-amber-600 dark:text-amber-300">
        {title}
      </h3>
      {children}
    </section>
  );
}

export function V2ArenaLoadoutTab() {
  const [loadout, setLoadout] = useState<Loadout | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [card, setCard] = useState<{
    inst: V2EquipInstance;
    anchor: ItemCardAnchor;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(false);
    try {
      const res = await fetch("/api/v2/arena/loadout");
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        loadout?: Loadout | null;
      } | null;
      if (j?.ok) setLoadout(j.loadout ?? null);
      else setErr(true);
    } catch {
      setErr(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 탭 마운트 1회 fetch
    load();
  }, [load]);

  const post = useCallback(async (payload: Record<string, unknown>) => {
    const res = await fetch("/api/v2/arena/loadout", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    return (await res.json().catch(() => null)) as
      | { ok: true; loadout?: Loadout | null }
      | { ok: false; error: string }
      | null;
  }, []);

  const saveCurrent = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const j = await post({ action: "save" });
    if (j && j.ok) {
      setLoadout(j.loadout ?? null);
      setNotice("현재 세팅을 아레나 전투 템플릿으로 저장했어요.");
    } else {
      setNotice("저장에 실패했어요.");
    }
    setBusy(false);
  }, [busy, post]);

  const remove = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const j = await post({ action: "delete" });
    if (j && j.ok) {
      setLoadout(null);
      setNotice("아레나 전투 템플릿을 삭제했어요.");
    } else {
      setNotice("삭제에 실패했어요.");
    }
    setBusy(false);
  }, [busy, post]);

  if (err) return <LoadErrorBanner onRetry={load} />;

  const skills = loadout?.summary?.skills.filter((s) => s.passive) ?? [];
  const patternSkills = loadout?.summary?.skills.filter((s) => !s.passive) ?? [];
  const equipmentBySlot = new Map(
    (loadout?.summary?.equipment ?? []).map((item) => [item.slot, item]),
  );

  return (
    <section className="space-y-4">
      <div className="space-y-3">
        <p className="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
          현재 장착된 스킬, 전투패턴, 장비를 아레나 전투용 템플릿으로 저장합니다. 아레나에서는
          공격할 때도, 다른 모험가가 나를 상대할 때도 이 템플릿이 사용됩니다. 직업과 현재
          스탯은 저장하지 않습니다.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={saveCurrent}
            className="flex items-center gap-1 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-zinc-400 dark:bg-amber-500 dark:hover:bg-amber-400 dark:disabled:bg-zinc-700"
          >
            <FloppyDisk size={16} /> 현재 세팅 저장
          </button>
          {loadout && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="flex items-center gap-1 rounded-md border border-zinc-300 px-3 py-2 text-sm font-semibold text-zinc-600 transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-300 dark:hover:bg-rose-950/40"
            >
              <Trash size={16} /> 삭제
            </button>
          )}
        </div>
      </div>

      {notice && (
        <div className="rounded-md border border-zinc-200 bg-zinc-50 p-2 text-sm dark:border-zinc-700 dark:bg-zinc-800/60">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-6 text-center text-sm text-zinc-500">불러오는 중...</div>
      ) : !loadout ? (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          저장된 아레나 전투 템플릿이 없어요. 현재 세팅을 저장하면 다음 아레나 전투부터 사용됩니다.
        </div>
      ) : (
        <>
          <div className="text-sm font-semibold text-amber-600 dark:text-amber-300">
            현재 저장된 템플릿 ({formatKst(loadout.savedAt)})
          </div>

          <Section title="스킬">
            {skills.length === 0 ? (
              <div className="text-sm text-zinc-500">저장된 스킬이 없어요.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {skills.map((skill) => (
                  <li key={skill.id} className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{skill.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">항상</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="전투패턴">
            {patternSkills.length === 0 ? (
              <div className="text-sm text-zinc-500">저장된 전투패턴이 없어요.</div>
            ) : (
              <ul className="space-y-2 text-sm">
                {patternSkills.map((skill) => (
                  <li key={skill.id} className="flex items-center justify-between gap-3">
                    <span className="font-semibold">{skill.name}</span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {loadout.summary?.patternBlocks ? "패턴" : "장착"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title="장비">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {EQUIP_SLOTS.map(({ slot, label, Icon, color }) => {
                const saved = equipmentBySlot.get(slot);
                const inst = saved?.inst ?? null;
                const item = inst ? V2_EQUIPMENT[inst.id] : null;
                const inner = (
                  <>
                    <Icon size={18} weight="duotone" className={color} />
                    <div className="text-[10px] text-zinc-500 dark:text-zinc-400">
                      {label}
                    </div>
                    <div
                      className={`flex max-w-full items-baseline justify-center text-xs font-medium ${
                        item
                          ? powerNameClass(item, inst?.roll)
                          : "text-zinc-400 dark:text-zinc-600"
                      }`}
                    >
                      <span className="truncate">
                        {item?.name ?? (saved?.iid ? "보유하지 않은 장비" : "—")}
                      </span>
                      {item && inst?.enhance && inst.enhance.level > 0 ? (
                        <span className="ml-1 shrink-0 text-amber-500">
                          +{inst.enhance.level}
                        </span>
                      ) : null}
                    </div>
                  </>
                );
                return (
                  <div
                    key={slot}
                    className="flex min-h-[6.25rem] flex-col items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 py-2 text-center sm:min-h-[6.75rem] dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    {inst && item ? (
                      <button
                        type="button"
                        onClick={(e) =>
                          setCard({ inst, anchor: anchorOf(e.currentTarget) })
                        }
                        className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-md px-1 transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {inner}
                      </button>
                    ) : (
                      <div className="flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1">
                        {inner}
                      </div>
                    )}
                    <span className="text-[10px] text-zinc-400 dark:text-zinc-600">
                      {saved?.iid ? "저장됨" : "비어있음"}
                    </span>
                  </div>
                );
              })}
            </div>
          </Section>
        </>
      )}
      {card &&
        (() => {
          const item = V2_EQUIPMENT[card.inst.id];
          return (
            <V2ItemCard
              item={item}
              roll={card.inst.roll}
              enhance={card.inst.enhance}
              craftQuality={card.inst.craftQuality}
              craftedBy={card.inst.craftedBy}
              anchor={card.anchor}
              onClose={() => setCard(null)}
            />
          );
        })()}
    </section>
  );
}
