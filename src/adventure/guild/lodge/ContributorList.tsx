import { Coins, Sparkle } from "@phosphor-icons/react";
import type { LodgeContributor } from "@/adventure/data/guildLodge";

function RankedRow({
  index,
  name,
  stardust,
  gold,
  emphasize,
}: {
  index: number;
  name: string;
  stardust: number;
  gold: number;
  emphasize: boolean;
}) {
  return (
    <li
      className={`flex items-center gap-2 rounded-md px-2 py-1 text-sm ${
        emphasize
          ? "bg-violet-50 dark:bg-violet-950/40"
          : ""
      }`}
    >
      <span className="w-5 shrink-0 text-right tabular-nums text-zinc-500 dark:text-zinc-400">
        {index}.
      </span>
      <span className="min-w-0 flex-1 truncate font-medium text-zinc-900 dark:text-zinc-100">
        {name}
      </span>
      <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-violet-700 dark:text-violet-300">
        <Sparkle size={12} weight="fill" />
        {stardust.toLocaleString()}
      </span>
      <span className="inline-flex items-center gap-0.5 text-xs tabular-nums text-yellow-700 dark:text-yellow-400">
        <Coins size={12} weight="fill" />
        {gold.toLocaleString()}
      </span>
    </li>
  );
}

function Section({
  title,
  rows,
  myUserId,
}: {
  title: string;
  rows: { userId: string; name: string; stardust: number; gold: number }[];
  myUserId: string;
}) {
  return (
    <div className="space-y-1">
      <h5 className="text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h5>
      {rows.length === 0 ? (
        <p className="px-2 py-1 text-xs italic text-zinc-500 dark:text-zinc-400">
          아직 봉납한 멤버가 없습니다.
        </p>
      ) : (
        <ol className="space-y-0.5">
          {rows.map((r, i) => (
            <RankedRow
              key={r.userId}
              index={i + 1}
              name={r.name}
              stardust={r.stardust}
              gold={r.gold}
              emphasize={r.userId === myUserId}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

export function ContributorList({
  contributors,
  myUserId,
}: {
  contributors: LodgeContributor[];
  myUserId: string;
}) {
  // 이번주 정렬은 별빛 조각 큰 순, 누계는 서버가 이미 정렬해 보내준 그대로.
  const weekly = contributors
    .filter((c) => c.weekStardust > 0 || c.weekGold > 0)
    .map((c) => ({
      userId: c.userId,
      name: c.name,
      stardust: c.weekStardust,
      gold: c.weekGold,
    }))
    .sort((a, b) =>
      b.stardust !== a.stardust ? b.stardust - a.stardust : b.gold - a.gold,
    );
  const total = contributors.map((c) => ({
    userId: c.userId,
    name: c.name,
    stardust: c.totalStardust,
    gold: c.totalGold,
  }));

  return (
    <section className="space-y-2 border-t border-zinc-200 pt-3 dark:border-zinc-800">
      <Section title="이번주 기여" rows={weekly} myUserId={myUserId} />
      <Section title="누계 기여" rows={total} myUserId={myUserId} />
    </section>
  );
}
