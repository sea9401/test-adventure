"use client";

// 알림 — Bell 클릭 착지점. 최근 NOTIF_FETCH_LIMIT 개 목록 + 진입 시 일괄 읽음 처리.
// 읽고 끝 채널(첨부 없음) — 우편함과 분리. 거점명 클릭 → 해당 거점 화면.

import { useEffect, useState } from "react";
import { Bell, Flag, ShieldWarning, Skull } from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { OUTPOST_BY_ID } from "@/adventure/data/v2/outposts";
import { formatRelative } from "@/lib/notifications";
import type {
  V2NotificationEntry,
  V2NotificationType,
} from "@/lib/v2-notification-config";

function outpostName(outpostId: string): string {
  return OUTPOST_BY_ID.get(outpostId)?.name ?? outpostId;
}

const TYPE_ICON: Record<V2NotificationType, React.ReactNode> = {
  outpost_attacked: (
    <ShieldWarning
      size={16}
      weight="duotone"
      className="shrink-0 text-amber-500 dark:text-amber-400"
    />
  ),
  outpost_lost: (
    <Flag
      size={16}
      weight="duotone"
      className="shrink-0 text-rose-500 dark:text-rose-400"
    />
  ),
  ejected: (
    <Skull
      size={16}
      weight="duotone"
      className="shrink-0 text-zinc-500 dark:text-zinc-400"
    />
  ),
};

function entryText(n: V2NotificationEntry): React.ReactNode {
  if (n.type === "outpost_attacked") {
    const p = n.payload as {
      outpostId: string;
      fortHp: number;
      fortMaxHp: number;
      attackerLabel?: string | null;
    };
    return (
      <>
        <span className="font-medium">{outpostName(p.outpostId)}</span> 성벽이
        공격받았습니다{" "}
        <span className="tabular-nums text-amber-600 dark:text-amber-400">
          ({p.fortHp}/{p.fortMaxHp})
        </span>
        {p.attackerLabel ? <> — {p.attackerLabel}</> : null}
      </>
    );
  }
  if (n.type === "outpost_lost") {
    const p = n.payload as {
      outpostId: string;
      byNpc?: boolean;
      attackerLabel?: string | null;
    };
    return p.byNpc ? (
      <>
        <span className="font-medium">{outpostName(p.outpostId)}</span> 점령이
        NPC 수비대에 무너졌습니다
      </>
    ) : (
      <>
        <span className="font-medium">{outpostName(p.outpostId)}</span>
        을(를){" "}
        <span className="text-rose-600 dark:text-rose-400">
          {p.attackerLabel ?? "적"}
        </span>
        에게 빼앗겼습니다
      </>
    );
  }
  // ejected
  const p = n.payload as {
    outpostId: string;
    byName: string;
    gold?: number;
    exiledTo?: string;
  };
  return (
    <>
      <span className="font-medium">{p.byName}</span> 님이 당신을{" "}
      <span className="font-medium">{outpostName(p.outpostId)}</span>에서
      토벌했습니다
      {p.gold && p.gold > 0 ? (
        <>
          {" "}
          · 보유 골드{" "}
          <span className="font-medium">{p.gold.toLocaleString()}</span> 압류
        </>
      ) : null}
      {p.exiledTo ? (
        <>
          {" "}
          · <span className="font-medium">{outpostName(p.exiledTo)}</span>로 추방됨
        </>
      ) : null}
    </>
  );
}

export function V2NotificationsView({
  onBack,
  onOpenOutpost,
}: {
  onBack: () => void;
  onOpenOutpost: (outpostId: string) => void;
}) {
  const [items, setItems] = useState<V2NotificationEntry[] | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v2/notifications");
        const json = (await res.json()) as {
          ok?: boolean;
          notifications?: V2NotificationEntry[];
        };
        if (!alive || !json.ok) return;
        setItems(json.notifications ?? []);
        // 진입 = 일괄 읽음 처리 → Bell 뱃지 즉시 갱신 이벤트.
        await fetch("/api/v2/notifications/read", { method: "POST" });
        window.dispatchEvent(new Event("v2notif:read"));
      } catch {
        if (alive) setItems([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-[720px] space-y-4 p-6 text-zinc-900 dark:text-zinc-100">
      <SubViewHeader
        title={
          <>
            <Bell size={18} weight="duotone" />
            알림
          </>
        }
        onBack={onBack}
      />

      {items === null && (
        <p className="text-center text-sm text-zinc-500">불러오는 중…</p>
      )}
      {items !== null && items.length === 0 && (
        <p className="rounded-md border border-zinc-200 px-3 py-6 text-center text-xs text-zinc-500 dark:border-zinc-800">
          알림이 없습니다
        </p>
      )}
      {items !== null && items.length > 0 && (
        <Card padding="none">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {items.map((n) => {
              const outpostId = (n.payload as { outpostId?: string }).outpostId;
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => outpostId && onOpenOutpost(outpostId)}
                    className={`flex w-full items-start gap-2 px-3 py-2.5 text-left ${
                      n.readAt == null
                        ? "bg-amber-50/60 dark:bg-amber-950/20"
                        : ""
                    }`}
                  >
                    <span className="mt-0.5">{TYPE_ICON[n.type]}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm text-zinc-700 dark:text-zinc-200">
                        {entryText(n)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-400 dark:text-zinc-500">
                        {formatRelative(n.createdAt)}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </main>
  );
}
