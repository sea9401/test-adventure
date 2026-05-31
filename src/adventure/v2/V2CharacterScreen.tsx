"use client";

import { useCallback, useEffect, useState } from "react";
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
  V2_SELECTABLE_CLASSES,
  parseV2Class,
  tier1ClassOf,
  tier2ClassOf,
  type V2Class,
} from "@/adventure/data/v2/classes";
import {
  V2_ELEMENT_LABEL,
  V2_PLAYER_ELEMENTS,
  parseV2Element,
  type V2Element,
} from "@/adventure/data/v2/elements";
import {
  advanceGoldCost,
  isClassChange,
  isPaidRespec,
  respecGoldCost,
} from "@/adventure/data/v2/respec";

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
  combat?: { atk: number; def: number; spd: number; magicAtk?: number } | null;
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

      {character && (
        <ClassElementPicker
          currentClass={parseV2Class(character.class)}
          currentElement={parseV2Element(character.element)}
          level={character.level}
          gold={character.gold}
          onChanged={refresh}
        />
      )}

      {stats && combat && (
        <Card padding="md">
          <StatsPanel
            stats={stats.base}
            totalStats={stats.total}
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

// PR-6 전투 재설계 — 직업·속성 선택/전직 UI. 첫 선택 무료, 변경은 골드+쿨다운(비용 전직).
function ClassElementPicker({
  currentClass,
  currentElement,
  level,
  gold,
  onChanged,
}: {
  currentClass: V2Class;
  currentElement: V2Element;
  level: number;
  gold: number;
  onChanged: () => void;
}) {
  // 드롭다운은 직업군(1차) 단위. 2차 캐릭은 자기 군 1차로 매핑해 표시.
  const [cls, setCls] = useState<V2Class>(
    currentClass === "none" ? V2_SELECTABLE_CLASSES[0] : tier1ClassOf(currentClass),
  );
  const [elem, setElem] = useState<V2Element>(currentElement);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // 같은 직업군 1차를 골라도 현 직업 유지(서버와 동일) → 실제 적용될 직업.
  const effectiveClass: V2Class =
    currentClass === "none" || isClassChange(currentClass, cls)
      ? cls
      : currentClass;
  const dirty = effectiveClass !== currentClass || elem !== currentElement;
  // 비용 전직 — none/neutral 에서의 첫 선택은 무료, 직업군/속성 변경은 골드.
  const paid = isPaidRespec(currentClass, cls, currentElement, elem);
  const cost = respecGoldCost(currentClass, cls, currentElement, elem, level);
  const cantAfford = paid && gold < cost;

  // PR-7 — 2차 전직(advance). 현 1차 직업이 전직 가능한 2차 + 레벨/골드 조건.
  const advanceTo = tier2ClassOf(currentClass);
  const advanceLevel = advanceTo
    ? V2_CLASS_DEFS[advanceTo].advanceLevel ?? Infinity
    : Infinity;
  const advanceCost = advanceGoldCost(level);
  const advanceLevelOk = level >= advanceLevel;

  const advance = async () => {
    if (!advanceTo) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/advance-class", { method: "POST" });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        required?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "level_too_low"
            ? `레벨 부족 (필요 Lv${j.required ?? advanceLevel})`
            : j?.error === "insufficient_gold"
              ? `골드 부족 (필요 ${(j.required ?? advanceCost).toLocaleString()}G)`
              : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      setMsg(
        `✓ ${V2_CLASS_DEFS[advanceTo].name} 전직 완료 (-${advanceCost.toLocaleString()}G)`,
      );
      onChanged();
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const apply = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/class-element", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ class: cls, element: elem }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        required?: number;
        cooldownUntil?: number;
      } | null;
      if (!j?.ok) {
        const label =
          j?.error === "insufficient_gold"
            ? `골드 부족 (필요 ${(j.required ?? cost).toLocaleString()}G)`
            : j?.error === "respec_cooldown"
              ? `전직 쿨다운 중 — ${
                  j.cooldownUntil
                    ? new Date(j.cooldownUntil).toLocaleString()
                    : "잠시"
                } 이후 가능`
              : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
        return;
      }
      setMsg(paid ? `✓ 전직 완료 (-${cost.toLocaleString()}G)` : "✓ 적용됨");
      onChanged();
    } catch (e) {
      setMsg(`✗ ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card padding="md">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold">직업 · 속성</h2>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          현재: {V2_CLASS_DEFS[currentClass].name} ·{" "}
          {V2_ELEMENT_LABEL[currentElement]}
        </span>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <select
          value={cls}
          onChange={(e) => setCls(e.target.value as V2Class)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {V2_SELECTABLE_CLASSES.map((c) => (
            <option key={c} value={c}>
              {V2_CLASS_DEFS[c].name} ({V2_CLASS_DEFS[c].group})
            </option>
          ))}
        </select>
        <select
          value={elem}
          onChange={(e) => setElem(e.target.value as V2Element)}
          className="rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        >
          {V2_PLAYER_ELEMENTS.map((el) => (
            <option key={el} value={el}>
              {V2_ELEMENT_LABEL[el]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={apply}
          disabled={busy || !dirty || cantAfford}
          className="rounded-md border border-indigo-400 bg-indigo-500/10 px-3 py-1.5 text-sm font-medium text-indigo-700 transition-colors hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-indigo-400 dark:text-indigo-300"
        >
          {busy ? "…" : paid ? `변경 (${cost.toLocaleString()}G)` : "적용"}
        </button>
        {msg && (
          <span className="text-xs text-zinc-500 dark:text-zinc-400">{msg}</span>
        )}
      </div>
      {dirty && paid && (
        <p
          className={`mt-2 text-xs ${
            cantAfford
              ? "text-rose-600 dark:text-rose-400"
              : "text-amber-600 dark:text-amber-400"
          }`}
        >
          직업군/속성 변경 비용 {cost.toLocaleString()}G · 변경 후 24시간 쿨다운
          {cantAfford ? ` (보유 ${gold.toLocaleString()}G — 부족)` : ""}
        </p>
      )}
      {/* PR-7 — 2차 전직(같은 직업군 단계 승급, 쿨다운 없음). */}
      {advanceTo && (
        <div className="mt-3 rounded-md border border-emerald-300 bg-emerald-50 p-2.5 dark:border-emerald-500/40 dark:bg-emerald-500/10">
          <div className="flex items-center justify-between gap-2">
            <div className="text-xs text-emerald-800 dark:text-emerald-200">
              2차 전직: <b>{V2_CLASS_DEFS[advanceTo].name}</b>
              <span className="text-emerald-700/70 dark:text-emerald-300/70">
                {" "}
                · Lv{advanceLevel} · {advanceCost.toLocaleString()}G
              </span>
            </div>
            <button
              type="button"
              onClick={advance}
              disabled={busy || !advanceLevelOk || gold < advanceCost}
              className="shrink-0 rounded-md border border-emerald-500 bg-emerald-500/15 px-3 py-1 text-xs font-medium text-emerald-700 hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50 dark:border-emerald-400 dark:text-emerald-300"
            >
              전직
            </button>
          </div>
          {!advanceLevelOk ? (
            <p className="mt-1 text-[11px] text-emerald-700/70 dark:text-emerald-300/70">
              Lv{advanceLevel} 부터 전직 가능 (현재 Lv{level})
            </p>
          ) : gold < advanceCost ? (
            <p className="mt-1 text-[11px] text-rose-600 dark:text-rose-400">
              골드 부족 (보유 {gold.toLocaleString()}G)
            </p>
          ) : null}
        </div>
      )}
      <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
        {V2_CLASS_DEFS[effectiveClass].description} · 속성 상성으로 사냥 데미지가 ±됩니다.
      </p>
    </Card>
  );
}
