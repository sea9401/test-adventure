"use client";

// 알림 — Bell 클릭 착지점. 최근 NOTIF_FETCH_LIMIT 개 목록 + 진입 시 일괄 읽음 처리.
// 읽고 끝 채널(첨부 없음) — 우편함과 분리.

import { useEffect, useState } from "react";
import {
  Bell,
  Crown,
  Flag,
  Handshake,
  ShieldWarning,
  Skull,
  Sword,
  UsersThree,
} from "@phosphor-icons/react";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { Card } from "@/components/ui/Card";
import { formatRelative } from "@/lib/notifications";
import type {
  V2NotificationEntry,
  V2NotificationType,
} from "@/lib/v2-notification-config";

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
  title_unlocked: (
    <Crown
      size={16}
      weight="duotone"
      className="shrink-0 text-amber-500 dark:text-amber-400"
    />
  ),
  guild_join_requested: (
    <UsersThree
      size={16}
      weight="duotone"
      className="shrink-0 text-sky-500 dark:text-sky-400"
    />
  ),
  guild_join_accepted: (
    <Handshake
      size={16}
      weight="duotone"
      className="shrink-0 text-emerald-500 dark:text-emerald-400"
    />
  ),
  guild_join_declined: (
    <UsersThree
      size={16}
      weight="duotone"
      className="shrink-0 text-zinc-500 dark:text-zinc-400"
    />
  ),
  coop_defeated: (
    <Sword
      size={16}
      weight="duotone"
      className="shrink-0 text-violet-500 dark:text-violet-400"
    />
  ),
};

function entryText(n: V2NotificationEntry): React.ReactNode {
  if (n.type === "outpost_attacked") {
    return (
      <>
        이전 길드 시설 알림이 도착했습니다. 길드 화면에서 현재 상태를 확인해
        주세요.
      </>
    );
  }
  if (n.type === "outpost_lost") {
    return (
      <>
        이전 길드 시설 상태가 변경되었습니다. 길드 화면에서 현재 상태를
        확인해 주세요.
      </>
    );
  }
  if (n.type === "title_unlocked") {
    const p = n.payload as {
      titleId: string;
      titleName: string;
      hidden?: boolean;
    };
    return (
      <>
        {p.hidden ? "히든 " : ""}칭호{" "}
        <span className="font-medium text-amber-600 dark:text-amber-300">
          {p.titleName}
        </span>
        을(를) 획득했습니다
      </>
    );
  }
  if (n.type === "guild_join_requested") {
    const p = n.payload as {
      guildName: string;
      applicantName: string;
    };
    return (
      <>
        <span className="font-medium">{p.applicantName}</span> 님이{" "}
        <span className="font-medium">{p.guildName}</span> 길드에 가입을
        신청했습니다
      </>
    );
  }
  if (n.type === "guild_join_accepted") {
    const p = n.payload as { guildName: string };
    return (
      <>
        <span className="font-medium">{p.guildName}</span> 길드 가입 신청이
        수락되었습니다
      </>
    );
  }
  if (n.type === "guild_join_declined") {
    const p = n.payload as { guildName: string };
    return (
      <>
        <span className="font-medium">{p.guildName}</span> 길드 가입 신청이
        거절되었습니다
      </>
    );
  }
  if (n.type === "coop_defeated") {
    const p = n.payload as { bossName: string };
    return (
      <>
        협동 보스 <span className="font-medium">{p.bossName}</span>이(가)
        처치되었습니다. 보상을 수령할 수 있습니다
      </>
    );
  }
  const p = n.payload as { byName?: string; gold?: number };
  return (
    <>
      {p.byName ? <span className="font-medium">{p.byName}</span> : "상대"}와의
      이전 전투 기록이 있습니다
      {p.gold && p.gold > 0 ? (
        <>
          {" "}· <span className="font-medium">{p.gold.toLocaleString()}</span>G
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
