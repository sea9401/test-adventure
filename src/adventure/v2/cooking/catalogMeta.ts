import type { CookingEffect } from "./types";

export type CookingCodexRecipeView = {
  id: string;
  name: string;
  imageSrc: string;
  description: string;
  effect: CookingEffect;
};

export const COOKING_CODEX_MILESTONES = [
  { goal: 10, title: "첫 조리 연구", points: 10 },
  { goal: 25, title: "주방 연구가", points: 20 },
  { goal: 50, title: "숨은 맛의 탐구자", points: 30 },
  { goal: 75, title: "왕실 조리 연구관", points: 40 },
  { goal: 100, title: "영원의 주방 전설", points: 50 },
  { goal: 150, title: "백미의 기록자", points: 60 },
  { goal: 200, title: "왕국의 조리학자", points: 70 },
  { goal: 300, title: "삼백 가지 맛의 대가", points: 90 },
  { goal: 400, title: "대륙의 미식 현자", points: 120 },
  { goal: 500, title: "오백 레시피의 전설", points: 160 },
] as const;
