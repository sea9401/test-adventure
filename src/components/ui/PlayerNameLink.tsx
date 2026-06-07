"use client";

import Link from "next/link";

// 유저 닉네임 → 공개 캐릭터 페이지(/character/<닉네임>) 링크. 이름이 보이는 곳 어디서나 공통 사용.
//   빈 이름/null 이면 링크 없이 fallback 텍스트만. 클릭 가능한 행/카드 안에 들어갈 때를 대비해
//   클릭 전파를 멈춘다(부모 onClick 과 충돌 방지).
export function PlayerNameLink({
  name,
  className,
  fallback = "모험가",
}: {
  name?: string | null;
  className?: string;
  fallback?: string;
}) {
  const trimmed = (name ?? "").trim();
  if (!trimmed) {
    return <span className={className}>{fallback}</span>;
  }
  return (
    <Link
      href={`/character/${encodeURIComponent(trimmed)}`}
      onClick={(e) => e.stopPropagation()}
      className={(className ? className + " " : "") + "hover:underline"}
    >
      {trimmed}
    </Link>
  );
}
