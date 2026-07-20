"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { PageShell } from "@/components/ui/PageShell";
import { StatusBanner } from "@/components/ui/StatusBanner";
import { TextInput } from "@/components/ui/TextInput";
import { useSystemMessageState } from "./RewardToastProvider";
import type { MuseunCashItemId } from "@/adventure/data/v2/museunCashItems";

// 개명 신전 — 「개명 신전 입장권」 또는 캐시 「개명 허가증」으로 닉네임 변경 1회.
// 서버(/api/v2/me/rename)가 사용권 소유/이름 중복을 권위 검증.

export function V2RenameView({
  mapIid,
  cashItemId,
  currentName,
  onBack,
  onRenamed,
}: {
  mapIid?: string;
  cashItemId?: MuseunCashItemId;
  currentName: string;
  onBack: () => void;
  // 성공 시 전역 상태 재조회 + 복귀.
  onRenamed: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useSystemMessageState();

  async function submit() {
    const next = name.trim();
    if (next.length === 0 || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v2/me/rename", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(cashItemId ? { cashItemId } : { map: mapIid }),
          name: next,
        }),
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
            : j?.error === "no_ticket"
                ? "유효한 개명 사용권이 필요합니다"
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
    <PageShell className="game-content-readable">
      <SubViewHeader title="개명의 신전" onBack={onBack} />
      <p className="text-center text-xs text-zinc-500 dark:text-zinc-400">
        새 이름으로 다시 태어납니다 — 사용권은 한 번 쓰면 사라집니다.
      </p>

      <Card padding="md" className="space-y-3">
        <div className="text-sm">
          현재 이름{" "}
          <span className="font-medium">{currentName || "모험가"}</span>
        </div>
        <div className="flex gap-2">
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="새 이름 (1~16자)"
            maxLength={16}
            disabled={busy}
            className="flex-1"
          />
          <Button
            onClick={submit}
            disabled={busy || name.trim().length === 0}
            variant="primary"
            size="sm"
            className="shrink-0"
          >
            {busy ? "변경 중…" : "개명"}
          </Button>
        </div>
        {msg && (
          <StatusBanner tone={msg.startsWith("✓") ? "success" : "error"}>
            {msg}
          </StatusBanner>
        )}
      </Card>
    </PageShell>
  );
}
