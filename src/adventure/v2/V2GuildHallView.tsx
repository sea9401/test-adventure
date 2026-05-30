"use client";

import { useCallback, useEffect, useState } from "react";
import { Shield } from "@phosphor-icons/react";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";

// 길드 회관 — 새 길드 생성 + 자기 길드 정보 (있을 때).

const GUILD_CREATE_MIN_LEVEL = 5;
const GUILD_CREATE_GOLD_COST = 5000;
const NAME_MIN = 2;
const NAME_MAX = 18;

type StateResponse = {
  ok?: boolean;
  character?: { level: number; gold: number };
  guild?: { id: number; name: string } | null;
};

const ERROR_LABEL: Record<string, string> = {
  bad_name: `이름은 ${NAME_MIN}~${NAME_MAX}자.`,
  bad_name_chars: "이름에 사용할 수 없는 문자가 있다.",
  name_taken: "이미 사용 중인 이름이다.",
  already_in_guild: "이미 길드에 속해 있다.",
  level_too_low: `Lv.${GUILD_CREATE_MIN_LEVEL} 이상이어야 한다.`,
  insufficient_gold: `골드가 부족하다 (${GUILD_CREATE_GOLD_COST.toLocaleString()} G 필요).`,
};

export function V2GuildHallView({ onBack }: { onBack: () => void }) {
  const [level, setLevel] = useState<number | null>(null);
  const [gold, setGold] = useState<number | null>(null);
  const [guild, setGuild] = useState<{ id: number; name: string } | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v2/me/state");
      const j = (await res.json().catch(() => null)) as StateResponse | null;
      if (j?.character) {
        setLevel(j.character.level);
        setGold(j.character.gold);
      }
      setGuild(j?.guild ?? null);
    } catch {}
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setErr(null);
    setOk(null);
    try {
      const res = await fetch("/api/v2/guild/create", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        guildId?: number;
      } | null;
      if (!j?.ok) {
        setErr(ERROR_LABEL[j?.error ?? ""] ?? `오류 (${j?.error ?? res.status})`);
        return;
      }
      setOk(`길드 「${name.trim()}」 창단 완료.`);
      setName("");
      await refresh();
    } catch (e) {
      setErr(`네트워크 오류: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }, [name, refresh]);

  const trimmed = name.trim();
  const nameValid = trimmed.length >= NAME_MIN && trimmed.length <= NAME_MAX;
  const levelOk = level != null && level >= GUILD_CREATE_MIN_LEVEL;
  const goldOk = gold != null && gold >= GUILD_CREATE_GOLD_COST;
  const canCreate = !guild && nameValid && levelOk && goldOk && !busy;

  return (
    <main className="mx-auto max-w-[720px] space-y-3 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader title="길드 회관" onBack={onBack} />

      {guild ? (
        <Card padding="md">
          <div className="flex items-center gap-3">
            <Shield size={32} weight="duotone" className="shrink-0 text-indigo-500" />
            <div>
              <div className="text-sm text-zinc-500 dark:text-zinc-400">소속 길드</div>
              <div className="text-lg font-semibold">{guild.name}</div>
            </div>
          </div>
          <p className="mt-3 text-xs text-zinc-500 dark:text-zinc-400">
            한 캐릭터당 하나의 길드. 다른 길드를 만들려면 먼저 탈퇴해야 한다.
          </p>
        </Card>
      ) : (
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
              {(gold ?? 0).toLocaleString()} / {GUILD_CREATE_GOLD_COST.toLocaleString()} G
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
          {ok && <p className="mt-2 text-xs text-emerald-600">{ok}</p>}
        </Card>
      )}
    </main>
  );
}
