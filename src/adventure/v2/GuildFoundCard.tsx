"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import {
  GUILD_CREATE_MIN_LEVEL,
  GUILD_CREATE_GOLD_COST,
} from "@/adventure/data/guild";
import { useGameState } from "./GameStateProvider";

// 새 길드 창단 카드 — 무소속일 때 길드 탭에 인라인으로 표시. 레벨·골드 게이트 + 이름 입력.
// 성공 시 onCreated 호출(부모가 state/info refetch → 소속 화면으로 전환).
// 창단 비용 상수는 guild.ts 단일 출처(라우트와 공유).

const NAME_MIN = 2;
const NAME_MAX = 18;

const ERROR_LABEL: Record<string, string> = {
  bad_name: `이름은 ${NAME_MIN}~${NAME_MAX}자.`,
  bad_name_chars: "이름에 사용할 수 없는 문자가 있다.",
  name_taken: "이미 사용 중인 이름이다.",
  already_in_guild: "이미 길드에 속해 있다.",
  level_too_low: `Lv.${GUILD_CREATE_MIN_LEVEL} 이상이어야 한다.`,
  insufficient_gold: `골드가 부족하다 (${GUILD_CREATE_GOLD_COST.toLocaleString()} G 필요).`,
};

type StateResponse = {
  character?: { level: number; gold: number; bankedGold?: number };
};

export function GuildFoundCard({ onCreated }: { onCreated: () => void }) {
  // 지불 게이트 — 코어루프 on 이면 보유+은행(은행에 든 골드로도 창단). 로컬(me/state)로 추적해 신선.
  const { coreLoopOn } = useGameState();
  const [level, setLevel] = useState<number | null>(null);
  const [gold, setGold] = useState<number | null>(null);
  const [bankedGold, setBankedGold] = useState(0);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/v2/me/state")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: StateResponse | null) => {
        if (!alive || !j?.character) return;
        setLevel(j.character.level);
        setGold(j.character.gold ?? 0);
        setBankedGold(j.character.bankedGold ?? 0);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/v2/guild/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
      } | null;
      if (!j?.ok) {
        setErr(ERROR_LABEL[j?.error ?? ""] ?? `오류 (${j?.error ?? res.status})`);
        return;
      }
      setName("");
      onCreated();
    } catch (e) {
      setErr(`네트워크 오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [name, onCreated]);

  const trimmed = name.trim();
  const nameValid = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;
  const levelOk = level != null && level >= GUILD_CREATE_MIN_LEVEL;
  // flag off 면 보유만(현행), on 이면 보유+은행. gold 미로딩(null)이면 게이트 비활성.
  const spendable =
    gold == null ? null : coreLoopOn ? gold + bankedGold : gold;
  const goldOk = spendable != null && spendable >= GUILD_CREATE_GOLD_COST;
  const canCreate = nameValid && levelOk && goldOk && !busy;

  return (
    <Card padding="md">
      <div className="flex items-center gap-3">
        <Shield size={32} weight="duotone" className="shrink-0 text-indigo-500" />
        <div>
          <div className="text-sm font-semibold">새 길드 창단</div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Lv.{GUILD_CREATE_MIN_LEVEL} 이상 · {GUILD_CREATE_GOLD_COST.toLocaleString()} G 소모.
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        <label className="block text-xs text-zinc-500 dark:text-zinc-400">
          길드 이름 ({NAME_MIN}~{NAME_MAX}자)
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={NAME_MAX}
          disabled={busy}
          placeholder="예: 새벽의 기사단"
          className="w-full rounded-md border border-zinc-300 bg-white px-3 py-2 text-sm focus:border-indigo-500 focus:outline-none disabled:opacity-50 dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        <dt className="text-zinc-500 dark:text-zinc-400">현재 레벨</dt>
        <dd className={levelOk ? "" : "text-rose-500"}>
          Lv.{level ?? "—"} (필요 Lv.{GUILD_CREATE_MIN_LEVEL})
        </dd>
        <dt className="text-zinc-500 dark:text-zinc-400">소지 골드</dt>
        <dd className={goldOk ? "" : "text-rose-500"}>
          {(spendable ?? 0).toLocaleString()} / {GUILD_CREATE_GOLD_COST.toLocaleString()} G
        </dd>
      </dl>

      <button
        type="button"
        onClick={handleCreate}
        disabled={!canCreate}
        className="mt-4 w-full rounded-md border border-indigo-600 bg-indigo-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "창단 중..." : `길드 창단 (${GUILD_CREATE_GOLD_COST.toLocaleString()} G)`}
      </button>

      {err && <p className="mt-2 text-xs text-rose-500">{err}</p>}
    </Card>
  );
}
