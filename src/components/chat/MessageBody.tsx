"use client";

// 메시지 본문 — 평문 그대로 렌더. (v2 는 아이템 링크 비활성, 텍스트 채팅만.)
export function MessageBody({ content }: { content: string }) {
  return <>{content}</>;
}
