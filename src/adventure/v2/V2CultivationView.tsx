"use client";

import { useCallback, useEffect, useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { V2_STAT_LABELS, type V2StatKey } from "@/adventure/data/v2/v2StatKeys";
import {
  V2_CULTIVATE_PROFILE,
  V2_STAT_CAP_BASE,
} from "@/adventure/data/v2/proficiency";
import {
  V2_CLASS_DEFS,
  parseV2Class,
  type V2Class,
} from "@/adventure/data/v2/classes";
import { parseV2Element, type V2Element } from "@/adventure/data/v2/elements";
import { V2ClassGrid, type V2AdvanceInfo } from "./V2ClassGrid";
import { V2JobTree } from "./V2JobTree";
import { TabBar } from "@/components/ui/TabBar";
import { useGameState } from "./GameStateProvider";

// 성장의 신전 내부 탭 — 직업(전직)과 수행(스탯 한계↑)을 분리.
type ShrineTab = "job" | "cultivate";

// v2 수행(修行) — 직업·속성 선택/전직(상단) + 사용 가능 숙련도로 현 직업군 스탯 한계치(cap)↑.
// 옛 "성장의 신전"(수동 스탯 분배) 대체. 분배는 레벨업 랜덤 성장이 담당하고, 여기서는
// 그 성장의 천장(cap)을 직업 프로필대로 끌어올린다. docs/v2-proficiency-redesign.md §4.

type StateShape = {
  ok?: boolean;
  character?: {
    level?: number;
    gold?: number;
    class?: string;
    element?: string;
    // 코어루프 flag-on 전용(off=null).
    classDisplayName?: string | null;
    spec?: string | null;
  };
  codex?: { discovered: number; total: number };
  // stats.base = cap 클램프 후 현 스탯(직업보정 전 — cap 과 같은 스케일). 표시 "현스탯(cap)".
  // stats.total = 효과 스탯(장비 포함) — 코어루프 스탯게이트 판정 기준.
  stats?: {
    base?: Partial<Record<V2StatKey, number>>;
    total?: Partial<Record<V2StatKey, number>>;
  };
  // 코어루프 직업 스탯게이트 — flag on 일 때만(off=null).
  jobUnlock?: { groups: string[]; specs: string[] } | null;
  proficiency?: {
    caps?: Partial<Record<V2StatKey, number>>;
    groups?: Record<string, { tier?: number; cumLevel?: number }>;
    current?: {
      group: string;
      cumLevel: number;
      points: number;
      cultivations: number;
      nextCost: number;
      advance?: V2AdvanceInfo | null;
    };
  };
};

export function V2CultivationView({ onBack }: { onBack: () => void }) {
  const { refreshGameState } = useGameState();
  // 기본 탭 = 직업(사용자 요청 순서). 수행을 기본으로 원하면 "cultivate" 로 바꾸면 됨.
  const [tab, setTab] = useState<ShrineTab>("job");
  const [group, setGroup] = useState<string>("none");
  const [usable, setUsable] = useState(0);
  const [cultivations, setCultivations] = useState(0);
  const [nextCost, setNextCost] = useState(0);
  const [caps, setCaps] = useState<Partial<Record<V2StatKey, number>>>({});
  const [stats, setStats] = useState<Partial<Record<V2StatKey, number>>>({});
  // 직업 그리드용 — 캐릭터 + 6직업군 요약(도달차수·누적레벨) + 현 직업군 전직 가능 여부.
  const [picker, setPicker] = useState<{
    cls: V2Class;
    elem: V2Element;
    level: number;
    gold: number;
    groups: Record<string, { tier?: number; cumLevel?: number }>;
    advance: V2AdvanceInfo | null;
  } | null>(null);
  // 코어루프 직업 트리용(flag-on) — null 이면 flag off → 기존 V2ClassGrid.
  const [coreLoop, setCoreLoop] = useState<{
    jobUnlock: { groups: string[]; specs: string[] };
    classDisplayName: string;
    totalStats: Partial<Record<V2StatKey, number>>;
    currentSpec: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 마운트 1회 로드 — setState 동기 호출을 피하려 loading 초기값(true)에서 시작, 완료 시 해제.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateShape | null;
      const cur = j?.proficiency?.current;
      if (j?.ok && cur) {
        setGroup(cur.group);
        setUsable(cur.points);
        setCultivations(cur.cultivations);
        setNextCost(cur.nextCost);
        setCaps(j.proficiency?.caps ?? {});
        setStats(j.stats?.base ?? {});
        if (j.character) {
          setPicker({
            cls: parseV2Class(j.character.class),
            elem: parseV2Element(j.character.element),
            level: j.character.level ?? 1,
            gold: j.character.gold ?? 0,
            groups: j.proficiency?.groups ?? {},
            advance: cur.advance ?? null,
          });
        }
        // 코어루프 flag-on(jobUnlock 비null)이면 직업 트리 데이터 채움. off 면 null 유지.
        setCoreLoop(
          j.jobUnlock
            ? {
                jobUnlock: j.jobUnlock,
                classDisplayName: j.character?.classDisplayName ?? "모험가",
                totalStats: j.stats?.total ?? {},
                currentSpec: j.character?.spec ?? null,
              }
            : null,
        );
      }
    } catch {}
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const profile = V2_CULTIVATE_PROFILE[group] ?? null;
  const disciplineName =
    group !== "none" ? V2_CLASS_DEFS[group as V2Class]?.group ?? "" : "";
  const canCultivate =
    !!profile && !busy && usable >= nextCost && nextCost > 0;

  const cultivate = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/cultivate", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        spent?: number;
        mult?: number;
        caps?: Partial<Record<V2StatKey, number>>;
        cultivations?: number;
        points?: number;
        nextCost?: number;
        required?: number;
        have?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "no_class"
            ? "직업이 없어요 (먼저 직업을 선택하세요)"
            : j?.error === "insufficient_proficiency"
              ? `숙달 포인트 부족 (필요 ${j.required ?? nextCost}, 보유 ${j.have ?? usable})`
              : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      const crit = (j.mult ?? 1) > 1 ? ` ⭐크리티컬 ×${j.mult}!` : "";
      setMsg(`✓ 수행 완료 (숙달 포인트 -${j.spent ?? nextCost})${crit}`);
      setCaps(j.caps ?? caps);
      setCultivations(j.cultivations ?? cultivations + 1);
      setUsable(j.points ?? Math.max(0, usable - nextCost));
      setNextCost(j.nextCost ?? nextCost);
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [caps, cultivations, usable, nextCost]);

  // 프로필 스탯(앵커 + 관련 2) 을 상승치 큰 순으로.
  const profileStats: V2StatKey[] = profile
    ? (Object.keys(profile) as V2StatKey[]).sort(
        (a, b) => (profile[b] ?? 0) - (profile[a] ?? 0),
      )
    : [];

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel>
        <SubViewHeader title="성장의 신전" onBack={onBack} />
      </HeaderPanel>

      <TabBar
        tabs={[
          { key: "job", label: "직업" },
          { key: "cultivate", label: "수행" },
        ]}
        active={tab}
        onChange={setTab}
        ariaLabel="성장의 신전 탭"
        size="md"
      />

      {/* === 직업 탭 — 코어루프 on=스탯게이트 트리/재전직, off=기존 차수 전직 그리드 === */}
      {tab === "job" &&
        (picker ? (
          coreLoop ? (
            <V2JobTree
              currentClass={picker.cls}
              currentSpec={coreLoop.currentSpec}
              level={picker.level}
              totalStats={coreLoop.totalStats}
              unlockedGroups={coreLoop.jobUnlock.groups}
              unlockedSpecs={coreLoop.jobUnlock.specs}
              classDisplayName={coreLoop.classDisplayName}
              onChanged={async () => {
                await Promise.all([refresh(), refreshGameState()]);
              }}
            />
          ) : (
            <V2ClassGrid
              currentClass={picker.cls}
              currentElement={picker.elem}
              level={picker.level}
              gold={picker.gold}
              groups={picker.groups}
              advance={picker.advance}
              onChanged={async () => {
                await Promise.all([refresh(), refreshGameState()]);
              }}
            />
          )
        ) : (
          <Card padding="md">
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {loading ? "불러오는 중…" : "직업 정보를 불러오지 못했어요."}
            </p>
          </Card>
        ))}

      {/* === 수행 탭 — 숙달 포인트로 스탯 한계치↑ === */}
      {tab === "cultivate" && (
        <>
          <Card padding="md">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">
            {disciplineName ? `${disciplineName} 수행` : "수행"}
          </h2>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">
            숙달 포인트{" "}
            <strong className="tabular-nums text-emerald-700 dark:text-emerald-400">
              {usable}
            </strong>
          </div>
        </div>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          숙달 포인트로 스탯 한계치를 올리면, 레벨업 랜덤 성장이 그 한계까지 채운다.
        </p>

        {loading ? (
          <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-400">
            불러오는 중…
          </p>
        ) : !profile ? (
          <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">
            직업이 없어 수행할 수 없어요. 먼저 직업을 선택하세요.
          </p>
        ) : (
          <ul className="mt-3 space-y-1.5">
            {profileStats.map((k) => {
              const cap = caps[k] ?? V2_STAT_CAP_BASE;
              const cur = stats[k] ?? 0;
              const gain = profile[k] ?? 0;
              return (
                <li
                  key={k}
                  className="flex items-center justify-between gap-3 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-900"
                >
                  <div className="flex min-w-0 items-baseline gap-2">
                    <span className="text-sm font-semibold uppercase">
                      {k.toUpperCase()}
                    </span>
                    <span className="text-xs text-zinc-500 dark:text-zinc-400">
                      {V2_STAT_LABELS[k]}
                    </span>
                  </div>
                  <div className="flex items-baseline gap-2 tabular-nums text-sm">
                    {/* 현스탯(한계) — 예 200(300). 수행은 한계만 올림. */}
                    <span className="font-semibold">
                      {cur}
                      <span className="font-normal text-zinc-500 dark:text-zinc-400">
                        ({cap})
                      </span>
                    </span>
                    <span className="text-emerald-600 dark:text-emerald-400">
                      한계 +{gain}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {profile && (
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              수행 {cultivations}회 · 다음 비용{" "}
              <strong
                className={`tabular-nums ${
                  usable >= nextCost
                    ? "text-emerald-700 dark:text-emerald-400"
                    : "text-rose-600 dark:text-rose-400"
                }`}
              >
                {nextCost}
              </strong>
            </span>
            <button
              type="button"
              onClick={cultivate}
              disabled={!canCultivate}
              className="rounded-md border border-emerald-600 bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "수행 중…" : "수행"}
            </button>
          </div>
        )}
      </Card>

          {msg && (
            <div
              className={`rounded-md border px-3 py-1.5 text-xs ${
                msg.startsWith("✓")
                  ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                  : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
              }`}
            >
              {msg}
            </div>
          )}
        </>
      )}
    </main>
  );
}
