import Link from "next/link";
import { friendlySparringHref } from "@/adventure/v2/friendlySparringLink";

export function FriendlySparringProfileLink({
  name,
  isSelf,
}: {
  name: string;
  isSelf: boolean;
}) {
  if (isSelf) return null;
  return (
    <Link
      href={friendlySparringHref(name)}
      className="block w-full rounded-md border border-sky-600 bg-sky-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-sky-700"
    >
      이 모험가와 친선전
    </Link>
  );
}
