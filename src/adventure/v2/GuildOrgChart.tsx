"use client";
import { PlayerNameLink } from "@/components/ui/PlayerNameLink";

export type OrgMember = {
  userId: string;
  role: string; // "master" | "vice_master" | "manager" | "member"
  joinedAt: string; // ISO date
  name: string;
  level: number;
};

type RoleKey = "master" | "vice_master" | "manager" | "member";

type Tier = {
  role: RoleKey;
  label: string;
  members: OrgMember[];
  variant: "master" | "row" | "grid";
};

const ROLE_LABELS: Record<RoleKey, string> = {
  master: "마스터",
  vice_master: "부마스터",
  manager: "관리자",
  member: "일반",
};

const ROLE_BADGE_CLASSES: Record<RoleKey, string> = {
  master: "bg-amber-400 text-amber-900 dark:bg-amber-400 dark:text-amber-900",
  vice_master: "bg-violet-500 text-white dark:bg-violet-500 dark:text-white",
  manager: "bg-sky-500 text-white dark:bg-sky-500 dark:text-white",
  member: "bg-zinc-200 text-zinc-700 dark:bg-zinc-700 dark:text-zinc-200",
};

function fmtDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("ko-KR", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function MemberCard({
  member,
  role,
  isMaster,
}: {
  member: OrgMember;
  role: RoleKey;
  isMaster?: boolean;
}) {
  const joinedAt = fmtDate(member.joinedAt);

  return (
    <div
      className={[
        "rounded-md border border-zinc-200 bg-zinc-50 text-zinc-900 shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-100",
        isMaster ? "min-w-56 px-5 py-4 text-center" : "min-w-0 px-4 py-3",
      ].join(" ")}
    >
      <div
        className={
          isMaster ? "mb-3 flex justify-center" : "mb-2 flex justify-start"
        }
      >
        <span
          className={`rounded px-2 py-0.5 text-xs font-semibold ${ROLE_BADGE_CLASSES[role]}`}
        >
          {ROLE_LABELS[role]}
        </span>
      </div>
      <div
        className={[
          "flex min-w-0 items-center gap-2 text-zinc-900 dark:text-zinc-100",
          isMaster
            ? "justify-center text-base font-semibold"
            : "text-sm font-medium",
        ].join(" ")}
      >
        <PlayerNameLink name={member.name} />
        <span className="shrink-0 text-zinc-500 dark:text-zinc-400">
          Lv.{member.level}
        </span>
      </div>
      {joinedAt ? (
        <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
          가입 {joinedAt}
        </div>
      ) : null}
    </div>
  );
}

function Connector() {
  return <div className="mx-auto h-6 w-px bg-zinc-300 dark:bg-zinc-700" />;
}

function TierBlock({ tier }: { tier: Tier }) {
  if (tier.members.length === 0) {
    return null;
  }

  if (tier.variant === "master") {
    return (
      <div className="flex justify-center">
        {tier.members.map((member) => (
          <MemberCard
            key={member.userId}
            member={member}
            role={tier.role}
            isMaster
          />
        ))}
      </div>
    );
  }

  if (tier.variant === "grid") {
    return (
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tier.members.map((member) => (
          <MemberCard key={member.userId} member={member} role={tier.role} />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap justify-center gap-3">
      {tier.members.map((member) => (
        <MemberCard key={member.userId} member={member} role={tier.role} />
      ))}
    </div>
  );
}

export function GuildOrgChart({ members }: { members: OrgMember[] }) {
  if (members.length === 0) {
    return null;
  }

  const tiers: Tier[] = [
    {
      role: "master",
      label: ROLE_LABELS.master,
      members: members.filter((member) => member.role === "master"),
      variant: "master",
    },
    {
      role: "vice_master",
      label: ROLE_LABELS.vice_master,
      members: members.filter((member) => member.role === "vice_master"),
      variant: "row",
    },
    {
      role: "manager",
      label: ROLE_LABELS.manager,
      members: members.filter((member) => member.role === "manager"),
      variant: "row",
    },
    {
      role: "member",
      label: ROLE_LABELS.member,
      // 일반 tier 는 catch-all — 알 수 없는 role 도 여기로(아무도 누락 안 되게).
      members: members.filter(
        (member) =>
          !["master", "vice_master", "manager"].includes(member.role),
      ),
      variant: "grid",
    },
  ];

  const visibleTiers = tiers.filter((tier) => tier.members.length > 0);

  if (visibleTiers.length === 0) {
    return null;
  }

  return (
    <section className="w-full">
      {visibleTiers.map((tier, index) => (
        <div key={tier.role}>
          {index > 0 ? <Connector /> : null}
          <TierBlock tier={tier} />
        </div>
      ))}
    </section>
  );
}
