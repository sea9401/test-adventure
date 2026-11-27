import Image from "next/image";
import {
  Brain,
  Clover,
  Drop,
  FlowerLotus,
  HandFist,
  Heart,
  Lightning,
  Plus,
  Shield,
  type Icon as PhosphorIcon,
} from "@phosphor-icons/react";
import type { EmblemGrade, EmblemKind } from "@/adventure/data/v2/emblems";

// 문장은 종류를 그림으로, 등급을 육각 테두리와 바탕 색으로 알아본다.
//   그림은 종류마다 한 장(`public/images/emblem/<kind>.webp`)이고 테두리는 여기서 그린다.
//   은신 모드와 터미널 모드에서는 globals.css가 그림을 숨기고 아래 선 아이콘을 대신 보여 준다.
const KIND_ICONS: Record<EmblemKind, PhosphorIcon> = {
  hp: Heart,
  mp: Drop,
  str: HandFist,
  dex: Lightning,
  vit: Shield,
  int: Brain,
  spi: FlowerLotus,
  luk: Clover,
};

/** viewBox 100 기준 정육각형(꼭짓점이 위아래). */
const HEX_POINTS = "50,5 88.97,27.5 88.97,72.5 50,95 11.03,72.5 11.03,27.5";

/** 등급 색: 1 회색 · 2 하늘 · 3 보라 · 4 금 · 5 진홍. 바탕이 밝아 다크 모드에서도 같은 색을 쓴다. */
const GRADE_FRAME: Record<EmblemGrade, string> = {
  1: "fill-zinc-100 stroke-zinc-400",
  2: "fill-sky-100 stroke-sky-500",
  3: "fill-violet-100 stroke-violet-500",
  4: "fill-amber-100 stroke-amber-500",
  5: "fill-rose-100 stroke-rose-600",
};

const GRADE_STAR: Record<EmblemGrade, string> = {
  1: "text-zinc-600 dark:text-zinc-300",
  2: "text-sky-700 dark:text-sky-300",
  3: "text-violet-700 dark:text-violet-300",
  4: "text-amber-700 dark:text-amber-300",
  5: "text-rose-700 dark:text-rose-300",
};

export const EMBLEM_GRADES: readonly EmblemGrade[] = [1, 2, 3, 4, 5];

function sizeStyle(size: number, fluid: boolean) {
  return fluid ? { width: "100%", maxWidth: size } : { width: size };
}

/**
 * 문장 한 개의 그림. `fluid`면 칸 너비에 맞춰 줄어들고 `size`가 최대 크기가 된다.
 * 이름과 등급은 옆 글자가 알려 주므로 그림 자체는 읽기 프로그램에서 건너뛴다.
 */
export function EmblemBadge({
  kind,
  grade,
  size,
  fluid = false,
}: {
  kind: EmblemKind;
  grade: EmblemGrade;
  size: number;
  fluid?: boolean;
}) {
  const Icon = KIND_ICONS[kind];
  return (
    <span aria-hidden className="relative block aspect-square shrink-0" style={sizeStyle(size, fluid)}>
      <svg viewBox="0 0 100 100" className="ui-emblem-art absolute inset-0 size-full">
        <polygon points={HEX_POINTS} className={GRADE_FRAME[grade]} strokeWidth={8} strokeLinejoin="round" />
      </svg>
      <Image
        src={`/images/emblem/${kind}.webp`}
        alt=""
        width={size}
        height={size}
        className="ui-emblem-art absolute left-[21%] top-[21%] size-[58%] object-contain"
      />
      <span className="ui-emblem-fallback absolute inset-0 hidden items-center justify-center rounded-lg border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-800 dark:bg-zinc-950 dark:text-violet-300">
        <Icon size={Math.round(size * 0.5)} weight="duotone" />
      </span>
    </span>
  );
}

/** 비어 있는 장착 칸. 점선 육각 안에 더하기 표시. */
export function EmblemEmptyBadge({ size, fluid = false }: { size: number; fluid?: boolean }) {
  return (
    <span aria-hidden className="relative flex aspect-square shrink-0 items-center justify-center text-zinc-500 dark:text-zinc-400" style={sizeStyle(size, fluid)}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 size-full">
        <polygon
          points={HEX_POINTS}
          className="fill-zinc-50 stroke-zinc-400 dark:fill-zinc-900 dark:stroke-zinc-500"
          strokeWidth={3}
          strokeDasharray="7 6"
          strokeLinejoin="round"
        />
      </svg>
      <Plus size={20} className="relative" />
    </span>
  );
}

/** 등급 색 안내에 쓰는 작은 육각 견본. */
export function EmblemGradeSwatch({ grade }: { grade: EmblemGrade }) {
  return (
    <svg aria-hidden viewBox="0 0 100 100" className="size-3.5 shrink-0">
      <polygon points={HEX_POINTS} className={GRADE_FRAME[grade]} strokeWidth={16} strokeLinejoin="round" />
    </svg>
  );
}

/** 등급 1~5를 등급 색 별로 표시한다. 읽기 프로그램에는 "n등급"만 읽힌다. */
export function EmblemGradeStars({ grade, className = "" }: { grade: EmblemGrade; className?: string }) {
  return (
    <span className={`tabular-nums tracking-[1px] ${GRADE_STAR[grade]} ${className}`.trim()}>
      <span aria-hidden>{"★".repeat(grade)}</span>
      <span className="sr-only">{grade}등급</span>
    </span>
  );
}
