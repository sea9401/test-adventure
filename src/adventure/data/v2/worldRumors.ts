export type WorldRumorKind = "rumor" | "resource" | "npc";

export type WorldRumorRegionId = "village" | "forest" | "harbor" | "quarry";

export type WorldRumorRegion = {
  id: WorldRumorRegionId;
  name: string;
  shortName: string;
  image: string;
  position: { x: number; y: number };
  kind: WorldRumorKind;
  headline: string;
  summary: string;
  tags: string[];
  action: {
    label: string;
    href: string;
  };
};

export const WORLD_RUMOR_KIND_LABEL: Record<WorldRumorKind, string> = {
  rumor: "소문",
  resource: "자원",
  npc: "인물",
};

export const WORLD_RUMOR_REGIONS: readonly WorldRumorRegion[] = [
  {
    id: "village",
    name: "시작 마을",
    shortName: "마을",
    image: "/images/ui/village.webp",
    position: { x: 30, y: 60 },
    kind: "npc",
    headline: "상점가가 붐빈다",
    summary: "상인들이 새 물품을 들였고, 대장장이가 수리 의뢰를 먼저 받는다.",
    tags: ["상점", "대장간", "의뢰"],
    action: { label: "상점 보기", href: "/town/shop" },
  },
  {
    id: "forest",
    name: "푸른 숲",
    shortName: "숲",
    image: "/images/ui/forest.webp",
    position: { x: 68, y: 36 },
    kind: "resource",
    headline: "약초 군락 발견",
    summary: "숲 안쪽 길목에 약초와 씨앗이 몰려 있다는 보고가 들어왔다.",
    tags: ["채집", "씨앗", "생활"],
    action: { label: "농장 가기", href: "/town/farm" },
  },
  {
    id: "harbor",
    name: "낚시터",
    shortName: "항구",
    image: "/images/ui/fishing.webp",
    position: { x: 72, y: 72 },
    kind: "rumor",
    headline: "희귀 어종 출몰",
    summary: "물살이 바뀌며 평소보다 큰 물고기가 얕은 곳까지 올라왔다.",
    tags: ["낚시", "희귀", "마린"],
    action: { label: "낚시하러 가기", href: "/town/fishing" },
  },
  {
    id: "quarry",
    name: "채석장",
    shortName: "광산",
    image: "/images/ui/quarry.webp",
    position: { x: 42, y: 28 },
    kind: "resource",
    headline: "오래된 광맥 노출",
    summary: "무너진 암벽 사이에서 오래 묻혀 있던 광맥과 유물 흔적이 보인다.",
    tags: ["광석", "발굴", "장비"],
    action: { label: "발굴 감정소", href: "/town/treasure" },
  },
];
