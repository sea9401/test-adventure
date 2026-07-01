"use client";

import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { ReplayBattleScene } from "@/adventure/v2/ReplayBattleScene";
import { useSparring } from "@/adventure/v2/useSparring";
import type { Gender } from "@/adventure/profile/avatars";
import {
  DEFAULT_SPAR_DUMMY_CONFIG,
  SPARRING_DUMMY_FIELD_LIMITS,
  SPARRING_DUMMY_FIELD_ORDER,
  SPARRING_DUMMY_PRESETS,
  sanitizeSparringDummyConfig,
  type SparringDummyConfig,
  type SparringDummyField,
  type SparringDummyPresetId,
} from "@/adventure/data/v2/sparringDummy";

const numberFormatter = new Intl.NumberFormat("ko-KR");

function draftFromConfig(
  config: SparringDummyConfig,
): Record<SparringDummyField, string> {
  return {
    hp: String(config.hp),
    atk: String(config.atk),
    def: String(config.def),
    spd: String(config.spd),
    accuracy: String(config.accuracy),
    evasionPct: String(config.evasionPct),
    critPct: String(config.critPct),
    critMult: String(config.critMult),
    maxTurns: String(config.maxTurns),
  };
}

// 훈련장 허수아비치기 — 라이브 SparringView 의 v2 화면. 보상도 손실도 없는 모의전이고,
// 전투 결과는 사냥과 동일하게 ReplayBattleScene(리플레이 로그)으로 표시한다.
export function V2SparringView({
  playerName,
  gender,
  onBack,
  playerSubtitle,
}: {
  playerName: string;
  gender: Gender;
  onBack: () => void;
  // 전투 장면 플레이어 부제(레벨·직업·속성).
  playerSubtitle?: string;
}) {
  const { busy, lastResult, error, spar } = useSparring();
  const [round, setRound] = useState(0);
  const [preset, setPreset] = useState<SparringDummyPresetId | "custom">(
    "sandbag",
  );
  const [dummyDraft, setDummyDraft] = useState<
    Record<SparringDummyField, string>
  >(draftFromConfig(DEFAULT_SPAR_DUMMY_CONFIG));
  const currentDummy = sanitizeSparringDummyConfig(dummyDraft);

  const handleSpar = async () => {
    const r = await spar(currentDummy);
    if (r) setRound((n) => n + 1);
  };

  const applyPreset = (id: SparringDummyPresetId) => {
    const next = SPARRING_DUMMY_PRESETS.find((p) => p.id === id);
    if (!next) return;
    setPreset(id);
    setDummyDraft(draftFromConfig(next.config));
  };

  const updateDummyField = (field: SparringDummyField, value: string) => {
    setPreset("custom");
    setDummyDraft((prev) => ({ ...prev, [field]: value }));
  };

  const normalizeDummyDraft = () => {
    setDummyDraft((prev) => draftFromConfig(sanitizeSparringDummyConfig(prev)));
  };

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="훈련장" onBack={onBack} />
      <Card padding="md">
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5">
          {SPARRING_DUMMY_PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => applyPreset(p.id)}
              aria-pressed={preset === p.id}
              className="rounded-md border border-zinc-200 px-2 py-1.5 text-xs font-medium transition-colors data-[selected=true]:border-emerald-500 data-[selected=true]:bg-emerald-50 data-[selected=true]:text-emerald-800 dark:border-zinc-700 dark:data-[selected=true]:border-emerald-500 dark:data-[selected=true]:bg-emerald-950/40 dark:data-[selected=true]:text-emerald-100"
              data-selected={preset === p.id ? "true" : "false"}
              disabled={busy}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {SPARRING_DUMMY_FIELD_ORDER.map((field) => {
            const limit = SPARRING_DUMMY_FIELD_LIMITS[field];
            return (
              <label
                key={field}
                className="block rounded-md border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs dark:border-zinc-800 dark:bg-zinc-950/40"
              >
                <span className="mb-1 block text-zinc-500 dark:text-zinc-400">
                  {limit.label}
                </span>
                <input
                  type="number"
                  min={limit.min}
                  max={limit.max}
                  step={limit.step}
                  value={dummyDraft[field]}
                  onChange={(e) => updateDummyField(field, e.target.value)}
                  onBlur={normalizeDummyDraft}
                  disabled={busy}
                  className="w-full rounded border border-zinc-200 bg-white px-2 py-1 text-right text-sm tabular-nums text-zinc-900 outline-none transition focus:border-emerald-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </label>
            );
          })}
        </div>

        <button
          type="button"
          onClick={handleSpar}
          disabled={busy}
          className="mt-3 w-full rounded-md border border-emerald-600 bg-emerald-600 px-4 py-3 text-base font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy
            ? "대련 중…"
            : lastResult
              ? "다시 대련하기"
              : "허수아비치기 시작"}
        </button>
        {error && (
          <p className="mt-2 text-xs text-rose-600 dark:text-rose-400">
            ✗ {error}
          </p>
        )}
        {lastResult && !busy && (
          <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
            {lastResult.won
              ? `허수아비를 ${lastResult.turns}턴 만에 쓰러뜨렸다.`
              : `${lastResult.turns}턴 동안 허수아비에게 ${(
                  lastResult.damageDealt ?? 0
                ).toLocaleString()} 데미지를 입혔다.`}
            {` HP ${numberFormatter.format(
              lastResult.dummy?.hp ?? currentDummy.hp,
            )}`}
          </p>
        )}
      </Card>

      {lastResult?.replay && (
        <ReplayBattleScene
          key={round}
          payload={lastResult.replay}
          startPlayerHp={lastResult.startPlayerHp}
          playerName={playerName}
          gender={gender}
          exp={0}
          maxExp={1}
          playerSubtitle={playerSubtitle}
        />
      )}
    </main>
  );
}
