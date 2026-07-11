"use client";

import { useMemo, useRef, useState } from "react";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import {
  MAX_FRONTIER_DEPTH,
  depthName,
  enemiesForDepth,
} from "@/adventure/data/v2/dungeon";
import { V2_ELEMENT_LABEL } from "@/adventure/data/v2/elements";
import type { ReplayPayload } from "@/adventure/data/v2/replayPayload";
import type { Gender } from "@/adventure/profile/avatars";

type PreviewResult = {
  outcome: "win" | "lose";
  turns: number;
  depth: number;
  depthName: string;
  availableDepth: number;
  enemyName: string;
  enemyKey: string;
  elementMatchup: "advantage" | "disadvantage" | "neutral";
  replay: ReplayPayload;
  startPlayerHp: number;
  profile: { name: string; gender: Gender; level: number; job: string };
  combat: {
    maxHp: number;
    maxMp: number;
    atk: number;
    magicAtk: number;
    def: number;
    magicDef: number;
    spd: number;
    accuracyPct: number;
    evasionPct: number;
    critPct: number;
  };
};

const ERROR_LABEL: Record<string, string> = {
  unauthorized: "관리자 권한이 필요합니다.",
  user_not_found: "대상 유저를 찾을 수 없습니다.",
  no_character: "아직 생성된 캐릭터가 없습니다.",
  depth_locked: "대상 캐릭터가 아직 도달하지 못한 깊이입니다.",
  monster_not_found: "체험할 몬스터를 찾을 수 없습니다.",
};

export function CharacterPreviewSection({
  userId,
  initialDepth,
}: {
  userId: string;
  initialDepth: number;
}) {
  const maxAvailableDepth = Math.min(
    MAX_FRONTIER_DEPTH,
    Math.max(1, Math.floor(initialDepth)),
  );
  const [depth, setDepth] = useState(maxAvailableDepth);
  const [enemyKey, setEnemyKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PreviewResult | null>(null);
  const [round, setRound] = useState(0);
  const inFlight = useRef(false);

  const enemies = useMemo(() => enemiesForDepth(depth), [depth]);
  const selectedEnemyKey = enemies.some((enemy) => enemy.key === enemyKey)
    ? enemyKey
    : (enemies[0]?.key ?? "");

  async function preview() {
    if (inFlight.current || !selectedEnemyKey) return;
    inFlight.current = true;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/users/character-preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId, depth, enemyKey: selectedEnemyKey }),
      });
      const json = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        result?: PreviewResult;
      } | null;
      if (!res.ok || !json?.ok || !json.result) {
        setError(ERROR_LABEL[json?.error ?? ""] ?? `체험 전투 실패 (HTTP ${res.status})`);
        return;
      }
      setResult(json.result);
      setRound((value) => value + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "체험 전투 요청에 실패했습니다.");
    } finally {
      setBusy(false);
      inFlight.current = false;
    }
  }

  return (
    <section className="rounded-md border border-cyan-300 bg-cyan-50/50 p-3 dark:border-cyan-900 dark:bg-cyan-950/20">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-cyan-900 dark:text-cyan-100">
            캐릭터 체험
          </h2>
          <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
            실제 장비·숙련·스킬로 모의 사냥합니다. 만전 상태로 시작하며 대상의
            HP·스태미나·보상·진척은 변경되지 않습니다.
          </p>
        </div>
        <span className="rounded-full border border-cyan-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-cyan-800 dark:border-cyan-800 dark:bg-zinc-900 dark:text-cyan-200">
          읽기 전용
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-[130px_1fr_auto] sm:items-end">
        <label className="text-xs text-zinc-600 dark:text-zinc-300">
          <span className="mb-1 block">사냥터 깊이</span>
          <input
            type="number"
            min={1}
            max={maxAvailableDepth}
            value={depth}
            disabled={busy}
            onChange={(event) =>
              setDepth(
                Math.min(
                  maxAvailableDepth,
                  Math.max(1, Math.floor(Number(event.target.value) || 1)),
                ),
              )
            }
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm tabular-nums dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>
        <label className="text-xs text-zinc-600 dark:text-zinc-300">
          <span className="mb-1 block">
            몬스터 · {depthName(depth)}
          </span>
          <select
            value={selectedEnemyKey}
            disabled={busy || enemies.length === 0}
            onChange={(event) => setEnemyKey(event.target.value)}
            className="w-full rounded border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {enemies.map((enemy) => (
              <option key={enemy.key} value={enemy.key}>
                {enemy.name} · {V2_ELEMENT_LABEL[enemy.element ?? "neutral"]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          disabled={busy || !selectedEnemyKey}
          onClick={() => void preview()}
          className="rounded border border-cyan-700 bg-cyan-700 px-3 py-1.5 text-sm font-semibold text-white hover:bg-cyan-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-cyan-500 dark:bg-cyan-600"
        >
          {busy ? "체험 중…" : result ? "다시 체험" : "전투 체험"}
        </button>
      </div>
      <div className="mt-1 text-[11px] text-zinc-500 dark:text-zinc-400">
        대상 캐릭터가 입장 가능한 최대 깊이 {maxAvailableDepth} · 물약 미사용 · 보상 없음
      </div>

      {error ? (
        <div className="mt-2 rounded border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs text-rose-700 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {result ? (
        <div className="mt-3 space-y-3">
          <div className="rounded border border-zinc-200 bg-white p-2 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <strong className={result.outcome === "win" ? "text-emerald-700 dark:text-emerald-300" : "text-rose-700 dark:text-rose-300"}>
                {result.outcome === "win" ? "승리" : "패배"} · {result.turns}행동
              </strong>
              <span className="text-zinc-500 dark:text-zinc-400">
                {result.depthName} · {result.enemyName}
              </span>
            </div>
            <div className="mt-2 grid grid-cols-3 gap-1.5 text-center text-[11px] sm:grid-cols-6">
              {[
                ["HP", result.combat.maxHp],
                ["MP", result.combat.maxMp],
                ["공격", result.combat.atk],
                ["마공", result.combat.magicAtk],
                ["방어", result.combat.def],
                ["속도", result.combat.spd],
              ].map(([label, value]) => (
                <div key={label} className="rounded bg-zinc-50 px-1 py-1 dark:bg-zinc-800">
                  <div className="text-zinc-400">{label}</div>
                  <div className="font-semibold tabular-nums">{Number(value).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-hidden rounded border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
            <ReplayBattleScene
              key={round}
              payload={result.replay}
              startPlayerHp={result.startPlayerHp}
              playerName={result.profile.name}
              gender={result.profile.gender}
              exp={0}
              maxExp={1}
              playerSubtitle={`Lv ${result.profile.level} · ${result.profile.job} · 체험 모드`}
              elementMatchup={result.elementMatchup}
              playerCombat={{
                atk: result.combat.atk,
                def: result.combat.def,
                spd: result.combat.spd,
                magicAtk: result.combat.magicAtk,
                evasionPct: result.combat.evasionPct,
                critChancePct: result.combat.critPct,
              }}
              outcome={result.outcome}
            />
          </div>
        </div>
      ) : null}
    </section>
  );
}
