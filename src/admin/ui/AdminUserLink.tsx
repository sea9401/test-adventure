import Link from "next/link";

export function AdminUserLink({
  userId,
  gameName,
  email,
  compact = false,
}: {
  userId: string;
  gameName?: string | null;
  email?: string | null;
  compact?: boolean;
}) {
  const primary = gameName?.trim() || email?.trim() || `유저 ${userId.slice(0, 8)}`;
  return (
    <Link
      href={`/admin?tab=users&q=${encodeURIComponent(userId)}`}
      title={`유저 ID: ${userId}`}
      className="inline-flex min-w-0 flex-col text-sky-700 hover:underline dark:text-sky-300"
    >
      <span className="max-w-40 truncate font-medium">{primary}</span>
      {!compact ? (
        <span className="font-mono text-[9px] text-zinc-400 no-underline">
          {userId.slice(0, 8)}
        </span>
      ) : null}
    </Link>
  );
}
