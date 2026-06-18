"use client";

import { useState } from "react";
import { BackButton } from "@/components/ui/BackButton";
import { HeaderPanel } from "@/components/ui/HeaderPanel";
import { Card } from "@/components/ui/Card";

// 개명의 신전 — 「개명의 신전 지도」로 입장. 닉네임 변경 1회(성공 시 지도 소모).
// 서버(/api/v2/me/rename)가 지도 소유/이름 중복을 권위 검증.

export function V2RenameView({
  mapIid,
  currentName,
  onBack,
  onRenamed,
}: {
  mapIid: string;
  currentName: string;
  onBack: () => void;
  // 성공 시 전역 상태 재조회 + 복귀.
  onRenamed: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    const next = name.trim();
    if (next.length === 0 || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map: mapIid, name: next }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        name?: string;
      } | null;
      if (j?.ok && j.name) {
        setMsg(`✓ 이제부터 「${j.name}」 입니다.`);
        onRenamed(j.name);
      } else {
        const label =
          j?.error === "taken"
            ? "이미 사용 중인 이름입니다"
            : j?.error === "same_name"
              ? "지금 이름과 같습니다"
              : j?.error === "no_map"
                ? "유효한 「개명의 신전 지도」가 필요합니다"
                : j?.error === "invalid"
                  ? "이름은 1~16자입니다"
                  : (j?.error ?? `http ${res.status}`);
        setMsg(`✗ ${label}`);
      }
    } catch (err) {
      setMsg(`✗ network: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <HeaderPanel className="space-y-2">
        <BackButton onClick={onBack} />
        <h1 className="text-lg font-bold">개명의 신전</h1>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          새 이름으로 다시 태어납니다 — 지도는 한 번 쓰면 사라집니다.
        </p>
      </HeaderPanel>

      <Card padding="md" className="space-y-3">
        <div className="text-sm">
          현재 이름{" "}
          <span className="font-medium">{currentName || "모험가"}</span>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 이름 (1~16자)"
            maxLength={16}
            disabled={busy}
            className="min-w-0 flex-1 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-zinc-500 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-950 dark:focus:border-zinc-400"
          />
          <button
            type="button"
            onClick={submit}
            disabled={busy || name.trim().length === 0}
            className="shrink-0 rounded-md border border-violet-700 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "변경 중…" : "개명"}
          </button>
        </div>
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
      </Card>
    </main>
  );
}
