import type { ReactNode } from "react";

// 카드 안 섹션 제목 공용 컴포넌트. 클래식에서는 흔한 섹션 제목(text-sm font-bold) 그대로이고,
//   금빛 화면 스타일에서는 globals.css가 ui-* 훅으로 명조 제목·짧은 금색 선·금색 분류 라벨을 덧입힌다.
//   🔑 제목 글꼴이나 장식을 화면마다 직접 만들지 말고 이 컴포넌트를 쓴다.
export function SectionHeading({
  title,
  eyebrow,
  right,
  as: Tag = "h2",
  className,
}: {
  title: ReactNode;
  // 제목 위의 분류 글자(예: 아이템 종류). 없으면 렌더하지 않는다.
  eyebrow?: ReactNode;
  // 제목 오른쪽 액션(예: "전체 보기" 버튼).
  right?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
}) {
  return (
    <div
      className={["flex items-end justify-between gap-2", className]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0">
        {eyebrow && (
          <p className="ui-eyebrow text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
            {eyebrow}
          </p>
        )}
        <Tag className="ui-heading ui-section-title text-sm font-bold text-zinc-900 dark:text-zinc-100">
          {title}
        </Tag>
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </div>
  );
}
