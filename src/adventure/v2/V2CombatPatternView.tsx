"use client";

import { useCallback, useEffect, useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  V2_SKILLS,
  smartDefaultPatternFromEquipped,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { STAT_LABELS, type StatKey } from "@/adventure/data/stats";
import {
  V2_COMBAT_PATTERN_MAX_PRESETS,
  V2_COMBAT_PRESET_NAME_MAXLEN,
  type V2CombatBlock,
  type V2CombatCondition,
  type V2CombatPreset,
} from "@/adventure/v2/combat/combatPattern";

// "전투 패턴"(갬빗) 에디터 — 우선순위 {조건→행동} 블록을 배열하면 전투에서 위에서부터 조건 맞는
// 첫 스킬을 발동(procChance 은퇴=확정). 조건 어휘는 1:1 자동전투 기준(내HP/MP/버프·적HP/상태·턴).
// 행동은 장착 스킬 사용(스킬은 캐릭터>스킬 탭에서 장착). 저장 = POST /api/v2/me/combat-pattern.

const STAT_KEYS: StatKey[] = ["str", "dex", "vit", "spd", "luk", "int"];

type CondKind = V2CombatCondition["kind"];
const COND_KINDS: { value: CondKind; label: string }[] = [
  { value: "always", label: "항상" },
  { value: "self_hp", label: "내 HP" },
  { value: "self_mp", label: "내 MP" },
  { value: "self_buff", label: "내 버프" },
  { value: "enemy_hp", label: "적 HP" },
  { value: "enemy_status", label: "적 상태" },
  { value: "turn", label: "턴" },
];

// kind 변경 시 기본 파라미터.
function defaultCondition(kind: CondKind): V2CombatCondition {
  switch (kind) {
    case "always":
      return { kind: "always" };
    case "self_hp":
      return { kind: "self_hp", op: "below", pct: 50 };
    case "self_mp":
      return { kind: "self_mp", op: "below", pct: 30 };
    case "self_buff":
      return { kind: "self_buff", stat: "str", active: false };
    case "enemy_hp":
      return { kind: "enemy_hp", op: "below", pct: 30 };
    case "enemy_status":
      return { kind: "enemy_status", tag: "bleed", op: "atLeast", stacks: 1 };
    case "turn":
      return { kind: "turn", op: "atMost", value: 1 };
  }
}

type StateShape = {
  ok?: boolean;
  skills?: {
    equipped?: string[];
    pattern?: { blocks?: V2CombatBlock[] } | null;
    presets?: V2CombatPreset[] | null;
  };
};

const sel =
  "rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-900";
const num =
  "w-16 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900";

export function V2CombatPatternView({ onBack }: { onBack: () => void }) {
  const [blocks, setBlocks] = useState<V2CombatBlock[]>([]);
  const [equipped, setEquipped] = useState<string[]>([]);
  const [presets, setPresets] = useState<V2CombatPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/v2/me/state");
        const j = (await res.json().catch(() => null)) as StateShape | null;
        const eq = j?.skills?.equipped ?? [];
        setEquipped(eq);
        setPresets(j?.skills?.presets ?? []);
        const saved = j?.skills?.pattern?.blocks;
        if (saved && saved.length > 0) {
          setBlocks(saved);
        } else {
          // 기본 — 장착 스킬 종류별 스마트 조건(엔진과 동일 소스). 유틸은 매 턴 스팸 안 함.
          setBlocks(smartDefaultPatternFromEquipped(eq).blocks);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const skillName = (id: string) => V2_SKILLS[id as V2SkillId]?.name ?? id;

  const update = useCallback((i: number, next: Partial<V2CombatBlock>) => {
    setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...next } : b)));
    setMsg(null);
  }, []);
  const move = useCallback((i: number, dir: -1 | 1) => {
    setBlocks((prev) => {
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    setMsg(null);
  }, []);
  const remove = useCallback((i: number) => {
    setBlocks((prev) => prev.filter((_, idx) => idx !== i));
    setMsg(null);
  }, []);
  const add = useCallback(() => {
    setBlocks((prev) => [
      ...prev,
      {
        condition: { kind: "always" },
        action: { kind: "skill", skillId: equipped[0] ?? "" },
      },
    ]);
    setMsg(null);
  }, [equipped]);

  const save = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/combat-pattern", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ blocks }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        pattern?: { blocks?: V2CombatBlock[] };
      } | null;
      if (j?.ok) {
        if (j.pattern?.blocks) setBlocks(j.pattern.blocks);
        setMsg("✓ 저장 완료");
      } else {
        setMsg("✗ 저장 실패");
      }
    } catch (err) {
      setMsg(`✗ ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [blocks]);

  // 프리셋 라이브러리 전체를 서버에 영속(항목 추가/삭제 후 호출). 성공 시 정규화된 결과로 동기화.
  const persistPresets = useCallback(
    async (next: V2CombatPreset[]): Promise<boolean> => {
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/combat-pattern/presets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ presets: next }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          presets?: V2CombatPreset[];
        } | null;
        if (j?.ok) {
          setPresets(j.presets ?? next);
          return true;
        }
        setMsg("✗ 프리셋 저장 실패");
        return false;
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  // 현재 편집 중인 블록을 이름 붙여 프리셋으로 저장(같은 이름 = 덮어쓰기).
  const savePreset = useCallback(async () => {
    const name = presetName.trim().slice(0, V2_COMBAT_PRESET_NAME_MAXLEN);
    if (!name) {
      setMsg("✗ 프리셋 이름을 입력하세요");
      return;
    }
    const exists = presets.some((p) => p.name === name);
    if (!exists && presets.length >= V2_COMBAT_PATTERN_MAX_PRESETS) {
      setMsg(`✗ 프리셋은 최대 ${V2_COMBAT_PATTERN_MAX_PRESETS}개`);
      return;
    }
    const entry: V2CombatPreset = { name, pattern: { blocks } };
    const next = exists
      ? presets.map((p) => (p.name === name ? entry : p))
      : [...presets, entry];
    if (await persistPresets(next)) {
      setPresetName("");
      setMsg(`✓ 프리셋 '${name}' 저장`);
    }
  }, [blocks, presetName, presets, persistPresets]);

  // 프리셋 불러오기 = 그 블록을 에디터에 싣고 활성 패턴으로 즉시 적용(빠른 스왑).
  const loadPreset = useCallback(
    async (p: V2CombatPreset) => {
      const next = p.pattern.blocks ?? [];
      setBlocks(next);
      setBusy(true);
      setMsg(null);
      try {
        const res = await fetch("/api/v2/me/combat-pattern", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blocks: next }),
        });
        const j = (await res.json().catch(() => null)) as {
          ok?: boolean;
          pattern?: { blocks?: V2CombatBlock[] };
        } | null;
        if (j?.ok) {
          if (j.pattern?.blocks) setBlocks(j.pattern.blocks);
          setMsg(`✓ '${p.name}' 적용됨`);
        } else {
          setMsg("✗ 적용 실패");
        }
      } catch (err) {
        setMsg(`✗ ${(err as Error).message}`);
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const deletePreset = useCallback(
    async (name: string) => {
      const next = presets.filter((p) => p.name !== name);
      if (await persistPresets(next)) setMsg(`✓ 프리셋 '${name}' 삭제`);
    },
    [presets, persistPresets],
  );

  return (
    <main className="mx-auto max-w-[640px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="전투 패턴" onBack={onBack} />
      <p className="text-xs text-zinc-500 dark:text-zinc-400">
        위에서부터 조건이 맞는 첫 블록의 스킬을 발동합니다. 맨 아래에 「항상」 블록을 두면
        다른 조건이 안 맞을 때의 기본기로 쓰입니다. 스킬은 캐릭터 &gt; 스킬에서 장착하세요.
      </p>

      {loading ? (
        <p className="text-sm text-zinc-500">불러오는 중…</p>
      ) : (
        <>
          <section className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                프리셋 ({presets.length}/{V2_COMBAT_PATTERN_MAX_PRESETS})
              </span>
              <span className="text-[11px] text-zinc-400">불러오면 바로 적용됩니다</span>
            </div>
            {presets.length === 0 ? (
              <p className="text-xs text-zinc-400">
                저장된 프리셋이 없습니다. 아래에서 현재 패턴을 이름 붙여 저장하면 빠르게 바꿔 끼울 수 있습니다.
              </p>
            ) : (
              <ul className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <li
                    key={p.name}
                    className="flex items-center gap-1 rounded-md border border-zinc-300 bg-white py-1 pl-2 pr-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
                  >
                    <span className="max-w-[140px] truncate font-medium">{p.name}</span>
                    <button type="button" onClick={() => loadPreset(p)} disabled={busy}
                      className="rounded px-1.5 text-indigo-600 hover:bg-indigo-100 disabled:opacity-40 dark:text-indigo-400 dark:hover:bg-indigo-950">불러오기</button>
                    <button type="button" onClick={() => deletePreset(p.name)} disabled={busy}
                      className="rounded px-1.5 text-rose-500 hover:bg-rose-100 disabled:opacity-40 dark:hover:bg-rose-950">✕</button>
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-2 flex items-center gap-2">
              <input
                type="text"
                value={presetName}
                maxLength={V2_COMBAT_PRESET_NAME_MAXLEN}
                onChange={(e) => setPresetName(e.target.value)}
                placeholder="현재 패턴 이름 (예: 보스용)"
                className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1 text-sm dark:border-zinc-700 dark:bg-zinc-950"
              />
              <button type="button" onClick={savePreset} disabled={busy}
                className="shrink-0 rounded-md border border-zinc-300 px-3 py-1 text-sm text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
                프리셋으로 저장
              </button>
            </div>
          </section>

          <ul className="space-y-2">
            {blocks.map((b, i) => (
              <li
                key={i}
                className="rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-900"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                    우선순위 {i + 1}
                  </span>
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0}
                      className="rounded px-1.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800">↑</button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === blocks.length - 1}
                      className="rounded px-1.5 text-zinc-500 hover:bg-zinc-200 disabled:opacity-30 dark:hover:bg-zinc-800">↓</button>
                    <button type="button" onClick={() => remove(i)}
                      className="rounded px-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950">✕</button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-8 text-zinc-500 dark:text-zinc-400">조건</span>
                  <select
                    className={sel}
                    value={b.condition.kind}
                    onChange={(e) =>
                      update(i, { condition: defaultCondition(e.target.value as CondKind) })
                    }
                  >
                    {COND_KINDS.map((c) => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <ConditionParams
                    condition={b.condition}
                    onChange={(condition) => update(i, { condition })}
                  />
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                  <span className="w-8 text-zinc-500 dark:text-zinc-400">행동</span>
                  <span className="text-zinc-400">스킬 사용</span>
                  <select
                    className={sel}
                    value={b.action.skillId}
                    onChange={(e) =>
                      update(i, { action: { kind: "skill", skillId: e.target.value } })
                    }
                  >
                    {equipped.length === 0 && <option value="">(장착 스킬 없음)</option>}
                    {equipped.map((id) => (
                      <option key={id} value={id}>{skillName(id)}</option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={add}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
              + 블록 추가
            </button>
            <button type="button" onClick={save} disabled={busy}
              className="rounded-md border border-indigo-500 bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-600 disabled:opacity-50">
              {busy ? "저장 중…" : "저장"}
            </button>
          </div>

          {msg && (
            <div className={`rounded-md border px-3 py-1.5 text-xs ${
              msg.startsWith("✓")
                ? "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                : "border-rose-300 bg-rose-50 text-rose-700 dark:border-rose-700 dark:bg-rose-950 dark:text-rose-300"
            }`}>{msg}</div>
          )}
        </>
      )}
    </main>
  );
}

// 조건 kind 별 파라미터 입력. 변경 시 같은 kind 유지하며 파라미터만 갱신.
function ConditionParams({
  condition: c,
  onChange,
}: {
  condition: V2CombatCondition;
  onChange: (c: V2CombatCondition) => void;
}) {
  switch (c.kind) {
    case "always":
      return null;
    case "self_hp":
    case "self_mp":
    case "enemy_hp":
      return (
        <>
          <select className={sel} value={c.op}
            onChange={(e) => onChange({ ...c, op: e.target.value as "below" | "above" })}>
            <option value="below">이하</option>
            <option value="above">이상</option>
          </select>
          <input type="number" min={0} max={100} className={num} value={c.pct}
            onChange={(e) => onChange({ ...c, pct: clampPct(e.target.value) })} />
          <span className="text-zinc-400">%</span>
        </>
      );
    case "self_buff":
      return (
        <>
          <select className={sel} value={c.stat}
            onChange={(e) => onChange({ ...c, stat: e.target.value as StatKey })}>
            {STAT_KEYS.map((s) => (
              <option key={s} value={s}>{STAT_LABELS[s]}</option>
            ))}
          </select>
          <select className={sel} value={c.active ? "y" : "n"}
            onChange={(e) => onChange({ ...c, active: e.target.value === "y" })}>
            <option value="n">없을 때</option>
            <option value="y">있을 때</option>
          </select>
        </>
      );
    case "enemy_status":
      return (
        <>
          <select className={sel} value={c.tag}
            onChange={(e) => onChange({ ...c, tag: e.target.value as "bleed" | "poison" | "vuln" })}>
            <option value="bleed">출혈</option>
            <option value="poison">중독</option>
            <option value="vuln">취약</option>
          </select>
          <select className={sel} value={c.op}
            onChange={(e) => onChange({ ...c, op: e.target.value as "atLeast" | "none" })}>
            <option value="atLeast">스택 이상</option>
            <option value="none">없을 때</option>
          </select>
          {c.op === "atLeast" && (
            <input type="number" min={1} className={num} value={c.stacks}
              onChange={(e) => onChange({ ...c, stacks: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
          )}
        </>
      );
    case "turn":
      return (
        <>
          <select className={sel} value={c.op}
            onChange={(e) => onChange({ ...c, op: e.target.value as "atMost" | "atLeast" | "every" })}>
            <option value="atMost">이하</option>
            <option value="atLeast">이상</option>
            <option value="every">매 (배수)</option>
          </select>
          <input type="number" min={1} className={num} value={c.value}
            onChange={(e) => onChange({ ...c, value: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} />
          <span className="text-zinc-400">턴</span>
        </>
      );
  }
}

function clampPct(v: string): number {
  return Math.max(0, Math.min(100, Math.floor(Number(v) || 0)));
}
