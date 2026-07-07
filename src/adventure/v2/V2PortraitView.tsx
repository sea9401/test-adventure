"use client";

import { useState } from "react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import {
  CHARACTER_AVATARS,
  avatarImageSrc,
  type Avatar,
} from "@/adventure/profile/avatars";
import { useSystemMessageState } from "./RewardToastProvider";

// 화공의 공방 — 「화공 공방 입장권」으로 입장. 초상화 변경 1회(성공 시 입장권 소모).
// 서버(/api/v2/me/portrait)가 입장권 소유를 권위 검증.

export function V2PortraitView({
  mapIid,
  currentAvatar,
  onBack,
  onChanged,
}: {
  mapIid: string;
  currentAvatar: Avatar;
  onBack: () => void;
  onChanged: (avatar: Avatar) => void;
}) {
  const [selected, setSelected] = useState<Avatar | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useSystemMessageState();

  async function submit() {
    if (!selected || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/portrait", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ map: mapIid, avatar: selected }),
      });
      const j = (await res.json().catch(() => null)) as {
        ok?: boolean;
        error?: string;
        avatar?: string;
      } | null;
      if (j?.ok && j.avatar) {
        setMsg("✓ 초상화를 새로 그렸습니다.");
        onChanged(j.avatar as Avatar);
      } else {
        const label =
          j?.error === "no_map"
            ? "유효한 「화공 공방 입장권」이 필요합니다"
            : j?.error === "same_avatar"
              ? "지금 초상화와 같습니다"
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
      <SubViewHeader title="화공의 공방" onBack={onBack} />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        초상화를 새로 그립니다 — 입장권은 한 번 쓰면 사라집니다.
      </p>

      <Card padding="md" className="space-y-3">
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {CHARACTER_AVATARS.map((a) => {
            const isCurrent = a === currentAvatar;
            const isSelected = a === selected;
            return (
              <button
                key={a}
                type="button"
                disabled={busy || isCurrent}
                onClick={() => setSelected(a)}
                className={`relative overflow-hidden rounded-md border-2 transition ${
                  isSelected
                    ? "border-violet-500"
                    : isCurrent
                      ? "cursor-not-allowed border-zinc-300 opacity-50 dark:border-zinc-700"
                      : "border-transparent hover:border-zinc-300 dark:hover:border-zinc-600"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={avatarImageSrc(a)}
                  alt={a}
                  className="aspect-square w-full object-cover"
                />
                {isCurrent && (
                  <span className="absolute inset-x-0 bottom-0 bg-zinc-900/70 py-0.5 text-center text-[10px] text-white">
                    현재
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={submit}
            disabled={busy || !selected}
            className="rounded-md border border-violet-700 bg-violet-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "그리는 중…" : "이 초상화로 변경"}
          </button>
          {msg && (
            <span
              className={`text-xs ${
                msg.startsWith("✓")
                  ? "text-emerald-600 dark:text-emerald-400"
                  : "text-rose-600 dark:text-rose-400"
              }`}
            >
              {msg}
            </span>
          )}
        </div>
      </Card>
    </main>
  );
}
