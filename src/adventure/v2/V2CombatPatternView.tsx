"use client";

import { useCallback, useEffect, useState } from "react";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import {
  V2_SKILLS,
  describeV2Skill,
  smartDefaultPatternFromEquipped,
  type V2SkillId,
} from "@/adventure/data/v2/v2Skills";
import { STAT_LABELS, type StatKey } from "@/adventure/data/stats";
import {
  V2_COMBAT_PATTERN_MAX_PRESETS,
  V2_COMBAT_PATTERN_MAX_SUBCONDITIONS,
  V2_COMBAT_PRESET_NAME_MAXLEN,
  type V2CombatAction,
  type V2CombatBlock,
  type V2CombatCondition,
  type V2CombatPreset,
  type V2CombatRole,
} from "@/adventure/v2/combat/combatPattern";

// "전투 패턴"(갬빗) 에디터 — 우선순위 {조건→행동} 블록을 배열하면 전투에서 위에서부터 조건 맞는
// 첫 스킬을 발동(procChance 은퇴=확정). 조건 어휘는 1:1 자동전투 기준(내HP/MP/버프·적HP/상태·턴).
// 행동은 학습한 스킬 사용(캐릭터>스킬 탭에서 학습). 저장 버튼은 없다 — 편집하면 짧은 디바운스
// 뒤 자동으로 POST /api/v2/me/combat-pattern 한다.

const STAT_KEYS: StatKey[] = ["str", "dex", "vit", "spd", "luk", "int"];

type CondKind = V2CombatCondition["kind"];
type SimpleCondKind = Exclude<CondKind, "all" | "any">;
const COND_KINDS: { value: CondKind; label: string }[] = [
  { value: "always", label: "항상" },
  { value: "all", label: "모두 만족" },
  { value: "any", label: "하나 만족" },
  { value: "self_hp", label: "내 HP" },
  { value: "self_mp", label: "내 MP" },
  { value: "self_shield", label: "내 보호막" },
  { value: "self_buff", label: "내 버프" },
  { value: "self_buff_pct", label: "내 파생버프" },
  { value: "enemy_hp", label: "적 HP" },
  { value: "enemy_status", label: "적 상태" },
  { value: "turn", label: "턴" },
];
const SIMPLE_COND_KINDS: { value: SimpleCondKind; label: string }[] =
  COND_KINDS.filter((c): c is { value: SimpleCondKind; label: string } =>
    c.value !== "all" && c.value !== "any",
  );

const ROLE_OPTIONS: { value: V2CombatRole; label: string }[] = [
  { value: "main_attack", label: "주 공격" },
  { value: "heal", label: "회복" },
  { value: "buff", label: "버프" },
  { value: "debuff", label: "디버프" },
];

// kind 변경 시 기본 파라미터.
function defaultCondition(kind: CondKind): V2CombatCondition {
  switch (kind) {
    case "always":
      return { kind: "always" };
    case "all":
      return {
        kind: "all",
        conditions: [
          { kind: "self_hp", op: "below", pct: 50 },
          { kind: "self_shield", active: false },
        ],
      };
    case "any":
      return {
        kind: "any",
        conditions: [
          { kind: "self_hp", op: "below", pct: 30 },
          { kind: "self_mp", op: "below", pct: 20 },
        ],
      };
    case "self_hp":
      return { kind: "self_hp", op: "below", pct: 50 };
    case "self_mp":
      return { kind: "self_mp", op: "below", pct: 30 };
    case "self_shield":
      return { kind: "self_shield", active: false };
    case "self_buff":
      return { kind: "self_buff", stat: "str", active: false };
    case "self_buff_pct":
      return { kind: "self_buff_pct", target: "evasion", active: false };
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

function actionSkillId(action: V2CombatAction): string | null {
  return action.kind === "skill" ? action.skillId : null;
}

export function V2CombatPatternView({
  onBack,
  embedded = false,
}: {
  onBack: () => void;
  // 스킬 허브(탭)에 끼워질 때 — 자체 헤더/페이지 컨테이너 생략(허브가 제공).
  embedded?: boolean;
}) {
  const [blocks, setBlocks] = useState<V2CombatBlock[]>([]);
  const [equipped, setEquipped] = useState<string[]>([]);
  const [presets, setPresets] = useState<V2CombatPreset[]>([]);
  const [presetName, setPresetName] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // 자동 저장 상태 — idle(아직 편집 없음) → pending(편집됨, 디바운스 대기) → saving → saved/error.
  const [saveState, setSaveState] = useState<
    "idle" | "pending" | "saving" | "saved" | "error"
  >("idle");

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
          // 기본 — 학습한 스킬 종류별 스마트 조건(엔진과 동일 소스). 유틸은 매 턴 스팸 안 함.
          setBlocks(smartDefaultPatternFromEquipped(eq).blocks);
        }
      } catch {}
      setLoading(false);
    })();
  }, []);

  const skillName = (id: string) => V2_SKILLS[id as V2SkillId]?.name ?? id;
  // 패시브 스킬은 캐스트 대상 아님(상시 효과) — 전투패턴 슬롯 후보에서 제외.
  const castableEquipped = equipped.filter(
    (id) => V2_SKILLS[id as V2SkillId]?.category !== "passive",
  );
  const roleCandidate = useCallback(
    (role: V2CombatRole): string | null => {
      for (const id of castableEquipped) {
        const def = V2_SKILLS[id as V2SkillId];
        if (!def) continue;
        if (role === "main_attack" && def.category === "attack") return id;
        if (role !== "main_attack" && def.category === role) return id;
      }
      return null;
    },
    [castableEquipped],
  );

  // 사용자가 패턴을 편집할 때마다 호출 — 자동 저장 디바운스를 깨운다(아래 useEffect 가 처리).
  const markEdited = useCallback(() => {
    setSaveState("pending");
    setMsg(null);
  }, []);

  const update = useCallback(
    (i: number, next: Partial<V2CombatBlock>) => {
      setBlocks((prev) => prev.map((b, idx) => (idx === i ? { ...b, ...next } : b)));
      markEdited();
    },
    [markEdited],
  );
  const move = useCallback(
    (i: number, dir: -1 | 1) => {
      setBlocks((prev) => {
        const j = i + dir;
        if (j < 0 || j >= prev.length) return prev;
        const next = [...prev];
        [next[i], next[j]] = [next[j], next[i]];
        return next;
      });
      markEdited();
    },
    [markEdited],
  );
  const remove = useCallback(
    (i: number) => {
      setBlocks((prev) => prev.filter((_, idx) => idx !== i));
      markEdited();
    },
    [markEdited],
  );
  const add = useCallback(() => {
    setBlocks((prev) => [
      ...prev,
      {
        condition: { kind: "always" },
        action: { kind: "role", role: "main_attack" },
      },
    ]);
    markEdited();
  }, [markEdited]);

  // 자동 저장 — 편집(markEdited→saveState="pending") 후 짧은 정적기 뒤 1회 POST.
  //   디바운스: 편집이 이어지면 blocks 가 바뀌어 이 effect 가 재실행되며 타이머를 리셋한다.
  //   서버 응답으로 blocks 를 덮어쓰지 않는다(저장 중 들어온 편집을 지우는 클로버 방지).
  useEffect(() => {
    if (loading) return; // 최초 로드 시 불러온 값으로는 저장하지 않음
    if (saveState !== "pending") return; // 편집으로 깨어났을 때만 저장
    const t = setTimeout(async () => {
      // 스킬 안 고른 빈 블록은 서버가 조용히 버린다(parseCombatPattern) → 데이터 손실. 저장을
      //   보류하고 경고만 — 사용자가 스킬을 고르거나 블록(✕)을 지우면 다시 깨어나 재시도한다.
      const emptyCount = blocks.filter((b) => b.action.kind === "skill" && !b.action.skillId).length;
      if (emptyCount > 0) {
        setSaveState("error");
        setMsg(`✗ 스킬을 안 고른 블록이 ${emptyCount}개 있습니다 — 스킬을 고르거나 블록(✕)을 지워주세요`);
        return;
      }
      setSaveState("saving");
      try {
        const res = await fetch("/api/v2/me/combat-pattern", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ blocks }),
        });
        const j = (await res.json().catch(() => null)) as { ok?: boolean } | null;
        // 저장 중 새 편집이 들어왔으면(saveState 가 다시 "pending") 그 상태를 보존 —
        //   다음 디바운스가 최신 편집을 마저 저장하도록 둔다.
        setSaveState((s) => (s === "saving" ? (j?.ok ? "saved" : "error") : s));
      } catch {
        setSaveState((s) => (s === "saving" ? "error" : s));
      }
    }, 700);
    return () => clearTimeout(t);
  }, [saveState, blocks, loading]);

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
      // 프리셋 적용은 그 자체로 영속(POST)이므로 자동 저장 디바운스를 깨우지 않는다(saving 으로 고정).
      setSaveState("saving");
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
          setSaveState("saved");
          setMsg(`✓ '${p.name}' 적용됨`);
        } else {
          setSaveState("error");
          setMsg("✗ 적용 실패");
        }
      } catch (err) {
        setSaveState("error");
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

  const Wrapper = embedded ? "div" : "main";
  return (
    <Wrapper
      className={
        embedded
          ? "space-y-3"
          : "mx-auto max-w-[640px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100"
      }
    >
      {!embedded && <SubViewHeader title="스킬 패턴" onBack={onBack} />}
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        위에서부터 조건이 맞는 첫 블록의 스킬을 발동합니다. 맨 아래에 「항상」 블록을 두면
        다른 조건이 안 맞을 때의 기본기로 쓰입니다. 「스킬」 탭에서 스킬을 배우고 장착하세요.
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

          {castableEquipped.length === 0 && (
            <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-sm text-amber-700 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300">
              장착한 스킬이 없어 새 역할 블록은 전투에서 발동하지 않습니다.
              <br />
              <span className="text-amber-600/80 dark:text-amber-400/80">
                기존 특정 스킬 블록은 보존되며, 스킬을 다시 장착하면 그대로 발동합니다.
              </span>
            </div>
          )}

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
                  <select
                    className={sel}
                    value={b.action.kind}
                    onChange={(e) => {
                      const kind = e.target.value as V2CombatAction["kind"];
                      update(i, {
                        action:
                          kind === "role"
                            ? { kind: "role", role: "main_attack" }
                            : { kind: "skill", skillId: castableEquipped[0] ?? "" },
                      });
                    }}
                  >
                    <option value="role">역할 사용</option>
                    <option value="skill">특정 스킬</option>
                  </select>
                  {b.action.kind === "role" ? (
                    <select
                      className={sel}
                      value={b.action.role}
                      onChange={(e) =>
                        update(i, {
                          action: { kind: "role", role: e.target.value as V2CombatRole },
                        })
                      }
                    >
                      {ROLE_OPTIONS.map((r) => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  ) : (
                  <select
                    className={sel}
                    value={b.action.skillId}
                    onChange={(e) =>
                      update(i, { action: { kind: "skill", skillId: e.target.value } })
                    }
                  >
                    {castableEquipped.length === 0 && <option value="">(장착한 스킬 없음)</option>}
                    {b.action.skillId && !castableEquipped.includes(b.action.skillId) && (
                      <option value={b.action.skillId}>
                        {skillName(b.action.skillId)} (미장착)
                      </option>
                    )}
                    {castableEquipped.map((id) => (
                      <option key={id} value={id}>{skillName(id)}</option>
                    ))}
                  </select>
                  )}
                </div>

                {/* 선택 스킬 정보 칩(MP·피해·효과) — 무엇을 발동하는지 한눈에. */}
                {(() => {
                  const selectedSkillId =
                    b.action.kind === "skill" ? b.action.skillId : roleCandidate(b.action.role);
                  const def = selectedSkillId ? V2_SKILLS[selectedSkillId as V2SkillId] : undefined;
                  if (!def) return null;
                  return (
                    <div className="mt-1.5 flex flex-wrap gap-1 pl-10">
                      {describeV2Skill(def).map((chip, ci) => (
                        <span key={ci}
                          className="rounded bg-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                          {chip}
                        </span>
                      ))}
                    </div>
                  );
                })()}
                {b.action.kind === "role" && (
                  <p className="mt-1 pl-10 text-[11px] text-zinc-500 dark:text-zinc-400">
                    현재 장착 기준: {roleCandidate(b.action.role) ? skillName(roleCandidate(b.action.role)!) : "해당 역할 스킬 없음"}
                  </p>
                )}
                {/* 미장착 스킬 경고 — 저장돼도 전투에서 발동 안 함(평타 폴백). */}
                {actionSkillId(b.action) && !equipped.includes(actionSkillId(b.action)!) && (
                  <p className="mt-1 pl-10 text-[11px] text-amber-600 dark:text-amber-400">
                    미장착 스킬 — 이 블록은 전투에서 발동하지 않습니다
                  </p>
                )}
              </li>
            ))}
          </ul>

          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={add}
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm text-zinc-700 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800">
              + 블록 추가
            </button>
            {/* 저장 버튼 없음 — 편집하면 자동 저장된다. 아래는 그 상태 표시. */}
            <span
              role="status"
              className={`text-xs tabular-nums ${
                saveState === "saved"
                  ? "text-emerald-600 dark:text-emerald-400"
                  : saveState === "error"
                    ? "text-rose-600 dark:text-rose-400"
                    : saveState === "pending" || saveState === "saving"
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-zinc-400 dark:text-zinc-500"
              }`}
            >
              {saveState === "saved"
                ? "✓ 저장됨"
                : saveState === "error"
                  ? "✗ 저장 실패"
                  : saveState === "pending" || saveState === "saving"
                    ? "저장 중…"
                    : "변경하면 자동 저장됩니다"}
            </span>
          </div>

          {msg && (
            <StatusBanner
              role={msg.startsWith("✓") ? "status" : "alert"}
              tone={msg.startsWith("✓") ? "success" : "error"}
            >
              {msg}
            </StatusBanner>
          )}
        </>
      )}
    </Wrapper>
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
    case "all":
    case "any":
      return (
        <CompoundConditionParams
          condition={c}
          onChange={onChange}
        />
      );
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
    case "self_shield":
      return (
        <select className={sel} value={c.active ? "y" : "n"}
          onChange={(e) => onChange({ ...c, active: e.target.value === "y" })}>
          <option value="n">없을 때</option>
          <option value="y">있을 때</option>
        </select>
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
    case "self_buff_pct":
      return (
        <>
          <select className={sel} value={c.target}
            onChange={(e) => onChange({ ...c, target: e.target.value as "evasion" | "crit" | "damageReduction" })}>
            <option value="evasion">회피</option>
            <option value="crit">치명</option>
            <option value="damageReduction">받피감</option>
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

function CompoundConditionParams({
  condition: c,
  onChange,
}: {
  condition: Extract<V2CombatCondition, { kind: "all" | "any" }>;
  onChange: (c: V2CombatCondition) => void;
}) {
  const updateChild = (idx: number, child: V2CombatCondition) => {
    onChange({
      ...c,
      conditions: c.conditions.map((prev, i) => (i === idx ? child : prev)),
    });
  };
  const removeChild = (idx: number) => {
    const next = c.conditions.filter((_, i) => i !== idx);
    if (next.length > 0) onChange({ ...c, conditions: next });
  };
  const addChild = () => {
    if (c.conditions.length >= V2_COMBAT_PATTERN_MAX_SUBCONDITIONS) return;
    onChange({
      ...c,
      conditions: [...c.conditions, { kind: "self_hp", op: "below", pct: 50 }],
    });
  };

  return (
    <div className="flex min-w-[240px] flex-1 flex-col gap-1.5">
      {c.conditions.map((child, idx) => (
        <div
          key={idx}
          className="flex flex-wrap items-center gap-1 rounded-md border border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-950"
        >
          <span className="w-10 text-[11px] text-zinc-400">
            {c.kind === "all" ? "AND" : "OR"} {idx + 1}
          </span>
          <select
            className={sel}
            value={child.kind === "all" || child.kind === "any" ? "always" : child.kind}
            onChange={(e) => updateChild(idx, defaultCondition(e.target.value as SimpleCondKind))}
          >
            {SIMPLE_COND_KINDS.map((kind) => (
              <option key={kind.value} value={kind.value}>{kind.label}</option>
            ))}
          </select>
          <ConditionParams condition={child} onChange={(next) => updateChild(idx, next)} />
          {c.conditions.length > 1 && (
            <button
              type="button"
              onClick={() => removeChild(idx)}
              className="rounded px-1.5 text-rose-500 hover:bg-rose-100 dark:hover:bg-rose-950"
            >
              ✕
            </button>
          )}
        </div>
      ))}
      {c.conditions.length < V2_COMBAT_PATTERN_MAX_SUBCONDITIONS && (
        <button
          type="button"
          onClick={addChild}
          className="w-fit rounded-md border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-100 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          + 하위 조건
        </button>
      )}
    </div>
  );
}

function clampPct(v: string): number {
  return Math.max(0, Math.min(100, Math.floor(Number(v) || 0)));
}
