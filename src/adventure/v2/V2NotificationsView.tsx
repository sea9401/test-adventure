"use client";

// 통합 알림 센터 — 읽고 끝나는 일반 알림과 수령/응답이 필요한 우편을 한 화면에서 제공한다.
// 저장소와 API는 서로의 의미가 달라 분리 유지하고, 화면과 상단 배지만 합친다.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Bell,
  ChatCenteredText,
  Crown,
  Envelope,
  Flag,
  Handshake,
  Plant,
  ShieldWarning,
  Skull,
  Sword,
  UsersThree,
} from "@phosphor-icons/react";
import { fetchInbox, type InboxItem } from "@/adventure/marketplace/api";
import { acknowledgeFarmReadyNotification } from "@/adventure/v2/farmReadyNotificationClient";
import { V2InboxView } from "@/adventure/v2/V2InboxView";
import { Card } from "@/components/ui/Card";
import { SubViewHeader } from "@/components/ui/SubViewHeader";
import { formatRelative } from "@/lib/notifications";
import {
  unreadV2Notifications,
  type V2NotificationEntry,
  type V2NotificationType,
} from "@/lib/v2-notification-config";

export type NotificationCenterTab = "all" | "notifications" | "mail";

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
  feedback_replied: (
    <ChatCenteredText
      size={16}
      weight="duotone"
      className="shrink-0 text-sky-500 dark:text-sky-400"
    />
  ),
  farm_ready: (
    <Plant
      size={16}
      weight="duotone"
      className="shrink-0 text-emerald-600 dark:text-emerald-400"
    />
  ),
};

const MAIL_KIND_LABEL: Record<InboxItem["kind"], string> = {
  user_message: "쪽지",
  sale_proceeds: "판매 대금",
  bid_refund: "입찰금 반환",
  buy_order_refund: "구매 주문 환불",
  buy_order_item: "구매 주문 체결",
  price_alert: "시세 알림",
  purchase_item: "구매 물품",
  cancel_return: "취소 반환",
  recipe_gift: "제작서 선물",
  listing_expired: "매물 만료",
  guild_invite: "길드 초대",
  guild_quest_reward: "길드 의뢰 보상",
  season_reward: "순위 보상",
  admin_gift: "운영자 우편",
};

function mailBody(item: InboxItem): string {
  if (item.kind === "user_message") {
    const text = item.payload.text;
    return typeof text === "string" && text.length > 0 ? text : "(내용 없음)";
  }
  if (item.kind === "price_alert") {
    const text = item.payload.text;
    return typeof text === "string" && text.length > 0
      ? text
      : (item.message ?? MAIL_KIND_LABEL[item.kind]);
  }
  if (item.kind === "guild_invite") {
    const guildName = item.payload.guild_name;
    if (typeof guildName === "string" && guildName.length > 0) {
      return `${guildName} 길드에서 초대했어요.`;
    }
  }
  return item.message ?? MAIL_KIND_LABEL[item.kind];
}

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
  if (n.type === "feedback_replied") {
    const p = n.payload as { feedbackId: number };
    return (
      <>
        내 건의 <span className="font-medium">#{p.feedbackId}</span>에 관리자
        답변이 등록되었습니다
      </>
    );
  }
  if (n.type === "farm_ready") {
    const p = n.payload as { readyCount: number };
    return (
      <>
        농장에 수확 가능한 작물이 {p.readyCount}개 있습니다. 눌러서 확인해
        주세요
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

function NotificationRow({
  item,
  onOpenOutpost,
  onOpenFeedback,
  onOpenFarm,
}: {
  item: V2NotificationEntry;
  onOpenOutpost: (outpostId: string) => void;
  onOpenFeedback: (feedbackId: number) => void;
  onOpenFarm: () => void;
}) {
  const outpostId = (item.payload as { outpostId?: string }).outpostId;
  const feedbackId =
    item.type === "feedback_replied"
      ? (item.payload as { feedbackId: number }).feedbackId
      : null;
  const farmReady = item.type === "farm_ready";
  const actionable = Boolean(outpostId || feedbackId || farmReady);

  return (
    <button
      type="button"
      onClick={() => {
        if (outpostId) onOpenOutpost(outpostId);
        else if (feedbackId) onOpenFeedback(feedbackId);
        else if (farmReady) {
          void acknowledgeFarmReadyNotification();
          onOpenFarm();
        }
      }}
      disabled={!actionable}
      className="flex w-full items-start gap-2 px-3 py-2.5 text-left disabled:cursor-default"
    >
      <span className="mt-0.5">{TYPE_ICON[item.type]}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm text-zinc-700 dark:text-zinc-200">
          {entryText(item)}
        </span>
        <span className="mt-0.5 block text-[11px] text-zinc-400 dark:text-zinc-500">
          {formatRelative(item.createdAt)}
        </span>
      </span>
    </button>
  );
}

function PrimaryTabButton({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
        active
          ? "border-amber-600 text-zinc-900 dark:border-amber-400 dark:text-zinc-100"
          : "border-transparent text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200"
      }`}
    >
      {label}
      {count && count > 0 ? ` (${count})` : ""}
    </button>
  );
}

type CombinedEntry =
  | { kind: "notification"; timestamp: number; item: V2NotificationEntry }
  | { kind: "mail"; timestamp: number; item: InboxItem };

export function V2NotificationsView({
  onBack,
  onOpenOutpost,
  onOpenFeedback,
  onOpenFarm,
  initialTab = "all",
}: {
  onBack: () => void;
  onOpenOutpost: (outpostId: string) => void;
  onOpenFeedback: (feedbackId: number) => void;
  onOpenFarm: () => void;
  initialTab?: NotificationCenterTab;
}) {
  const [tab, setTab] = useState<NotificationCenterTab>(initialTab);
  const [notifications, setNotifications] = useState<
    V2NotificationEntry[] | null
  >(null);
  const [mail, setMail] = useState<InboxItem[] | null>(null);
  const readMarkedRef = useRef(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/v2/notifications");
        const json = (await res.json()) as {
          ok?: boolean;
          notifications?: V2NotificationEntry[];
        };
        if (alive) {
          setNotifications(
            json.ok ? unreadV2Notifications(json.notifications ?? []) : [],
          );
        }
      } catch {
        if (alive) setNotifications([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  const loadMail = useCallback(async () => {
    try {
      const result = await fetchInbox();
      setMail(result.items);
    } catch {
      setMail([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 최초 우편 목록 로드
    void loadMail();
    const refresh = () => void loadMail();
    window.addEventListener("v2inbox:refresh", refresh);
    return () => window.removeEventListener("v2inbox:refresh", refresh);
  }, [loadMail]);

  useEffect(() => {
    if (tab === "mail" || notifications === null || readMarkedRef.current) {
      return;
    }
    readMarkedRef.current = true;
    void (async () => {
      try {
        const hasFarmReady = notifications.some(
          (item) => item.type === "farm_ready",
        );
        const res = await fetch("/api/v2/notifications/read", {
          method: "POST",
        });
        if (!res.ok) throw new Error("notification read failed");
        const farmReadyRead = hasFarmReady
          ? await acknowledgeFarmReadyNotification()
          : false;
        const readAt = Date.now();
        setNotifications((current) =>
          current?.map((item) =>
            item.readAt === null &&
            (item.type !== "farm_ready" || farmReadyRead)
              ? { ...item, readAt }
              : item,
          ) ?? [],
        );
        window.dispatchEvent(new Event("v2notif:read"));
      } catch {
        readMarkedRef.current = false;
      }
    })();
  }, [notifications, tab]);

  const combined = useMemo<CombinedEntry[]>(() => {
    if (notifications === null || mail === null) return [];
    return [
      ...notifications.map((item) => ({
        kind: "notification" as const,
        timestamp: item.createdAt,
        item,
      })),
      ...mail.map((item) => ({
        kind: "mail" as const,
        timestamp: Date.parse(item.createdAt),
        item,
      })),
    ]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 30);
  }, [mail, notifications]);

  const loading = notifications === null || mail === null;
  const mailCount = mail?.length ?? 0;

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

      <div
        role="tablist"
        aria-label="알림 분류"
        className="flex gap-1 border-b border-zinc-200 dark:border-zinc-700"
      >
        <PrimaryTabButton
          active={tab === "all"}
          label="전체"
          onClick={() => setTab("all")}
        />
        <PrimaryTabButton
          active={tab === "notifications"}
          label="알림"
          onClick={() => setTab("notifications")}
        />
        <PrimaryTabButton
          active={tab === "mail"}
          label="우편"
          count={mailCount}
          onClick={() => setTab("mail")}
        />
      </div>

      {tab === "mail" ? (
        <V2InboxView embedded />
      ) : loading ? (
        <p className="text-center text-sm text-zinc-500">불러오는 중…</p>
      ) : tab === "notifications" ? (
        notifications.length === 0 ? (
          <Card padding="md">
            <p className="text-center text-xs text-zinc-500">알림이 없습니다</p>
          </Card>
        ) : (
          <Card padding="none">
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {notifications.map((item) => (
                <li key={item.id}>
                  <NotificationRow
                    item={item}
                    onOpenOutpost={onOpenOutpost}
                    onOpenFeedback={onOpenFeedback}
                    onOpenFarm={onOpenFarm}
                  />
                </li>
              ))}
            </ul>
          </Card>
        )
      ) : combined.length === 0 ? (
        <Card padding="md">
          <p className="text-center text-xs text-zinc-500">
            도착한 알림과 우편이 없습니다
          </p>
        </Card>
      ) : (
        <Card padding="none">
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {combined.map((entry) =>
              entry.kind === "notification" ? (
                <li key={`notification-${entry.item.id}`}>
                  <NotificationRow
                    item={entry.item}
                    onOpenOutpost={onOpenOutpost}
                    onOpenFeedback={onOpenFeedback}
                    onOpenFarm={onOpenFarm}
                  />
                </li>
              ) : (
                <li key={`mail-${entry.item.id}`}>
                  <button
                    type="button"
                    onClick={() => setTab("mail")}
                    className="flex w-full items-start gap-2 px-3 py-2.5 text-left"
                  >
                    <Envelope
                      size={16}
                      weight="duotone"
                      className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-300"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium text-amber-700 dark:text-amber-300">
                        {MAIL_KIND_LABEL[entry.item.kind]}
                        {entry.item.fromName ? ` · ${entry.item.fromName}` : ""}
                      </span>
                      <span className="mt-0.5 line-clamp-2 block text-sm text-zinc-700 dark:text-zinc-200">
                        {mailBody(entry.item)}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-zinc-400 dark:text-zinc-500">
                        {formatRelative(entry.timestamp)} · 미수령
                      </span>
                    </span>
                  </button>
                </li>
              ),
            )}
          </ul>
        </Card>
      )}
    </main>
  );
}
