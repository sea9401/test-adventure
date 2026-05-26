// v2 아레나 봇 — 실유저 매칭 풀이 비었을 때 폴백 (PR-8a).
//
// 봇은 라이브 PvP 의 NPC 데이터를 이식하지 않는다 (라이브 코드 영향 0 룰).
// 6 스탯 분배 + 레벨만 가진 가벼운 템플릿. derivePlayerCombat 으로 PlayerCombat
// 변환 — 장비/룬/스킬/파라곤 모두 비워서 라이브 시스템 의존 0.
//
// INT 가 임계값 이상이면 자동 학습 마법 (PR-5 의 normalizeEquippedSpells 와 같은 규칙).

import { baseCharacter } from "@/adventure/character/defaults";
import {
  derivePlayerCombat,
  type DerivedPlayerCombat,
} from "@/adventure/character/derivePlayerCombat";
import type { StatKey } from "@/adventure/data/stats";
import { learnedSpellsForInt } from "@/adventure/data/v2/spells";

export type BotTemplate = {
  /** 안정적 식별자 — recentOpponents 매칭에 사용. */
  id: string;
  name: string;
  /** 주력 스탯에 60% 배분. */
  focus: StatKey;
  /** 보조 스탯에 30% 배분. 남은 10% 는 vit 로. */
  secondary: StatKey;
};

export const BOT_TEMPLATES: ReadonlyArray<BotTemplate> = [
  { id: "bot-veno-warrior", name: "유랑 전사", focus: "str", secondary: "vit" },
  { id: "bot-veno-rogue", name: "그림자 적", focus: "dex", secondary: "spd" },
  { id: "bot-veno-mage", name: "방랑 술사", focus: "int", secondary: "luk" },
  { id: "bot-veno-duelist", name: "결투가", focus: "spd", secondary: "str" },
  { id: "bot-veno-templar", name: "맹세의 기수", focus: "vit", secondary: "str" },
  { id: "bot-veno-gambler", name: "행운의 검", focus: "luk", secondary: "dex" },
  { id: "bot-veno-mystic", name: "별빛 신탁자", focus: "int", secondary: "vit" },
];

export type ArenaBot = {
  id: string;
  name: string;
  level: number;
  /** 매칭 가중치 산정용 가짜 점수 — 봇은 항상 0. */
  score: number;
  combat: DerivedPlayerCombat;
  /** 자동 학습된 마법 (INT 임계값). */
  equippedSpells: ReturnType<typeof learnedSpellsForInt>;
};

function emptyStatRecord(): Record<StatKey, number> {
  return { str: 0, dex: 0, vit: 0, spd: 0, luk: 0, int: 0 };
}

/**
 * 단련 포인트 배분: 레벨 N 캐릭의 총 보유 포인트는 N (1당 1pt 가정 — hunt 라우트가
 * 레벨업당 1pt 발급). 60/30/10 으로 focus/secondary/vit 에 배분.
 *
 * 음수 클램프 (level <= 1 = 포인트 0).
 */
function allocatePoints(
  totalPoints: number,
  template: BotTemplate,
): Record<StatKey, number> {
  const allocated = emptyStatRecord();
  if (totalPoints <= 0) return allocated;
  const focusPts = Math.floor(totalPoints * 0.6);
  const secondaryPts = Math.floor(totalPoints * 0.3);
  const vitPts = totalPoints - focusPts - secondaryPts;
  allocated[template.focus] += focusPts;
  if (template.secondary === template.focus) {
    // focus 와 secondary 가 우연히 같으면 secondary 를 vit 로 (단, vit 가 focus 인
    // 템플릿이면 luk 로). 현재 BOT_TEMPLATES 에는 없지만 안전망.
    allocated[template.focus === "vit" ? "luk" : "vit"] += secondaryPts;
  } else {
    allocated[template.secondary] += secondaryPts;
  }
  // 잔여는 vit. focus/secondary 가 vit 면 luk 로.
  if (template.focus !== "vit" && template.secondary !== "vit") {
    allocated.vit += vitPts;
  } else {
    allocated.luk += vitPts;
  }
  return allocated;
}

export function buildBot(template: BotTemplate, level: number): ArenaBot {
  const lv = Math.max(1, Math.floor(level));
  const allocated = allocatePoints(lv, template);
  const combat = derivePlayerCombat({
    level: lv,
    baseStats: baseCharacter.stats,
    allocatedStats: allocated,
    equipped: { weapon: null, armor: null, accessory: null },
    equippedSkills: [],
    equippedFeats: [],
    equippedRunes: undefined,
    learnedAPSkills: undefined,
    apSkillConditions: undefined,
    storyFlagIds: new Set<string>(),
    paragonAllocations: {},
    hp: 99999, // derive 가 maxHp 로 클램프
  });
  const intStat = combat.totalStats.int ?? 0;
  const slots = combat.layout.normalSlots;
  const learnable = learnedSpellsForInt(intStat).slice(0, slots);
  return {
    id: `${template.id}-l${lv}`,
    name: template.name,
    level: lv,
    score: 0,
    combat,
    equippedSpells: learnable,
  };
}

/**
 * 본인 레벨 ±BOT_LEVEL_BAND 안의 봇 변종을 모두 생성. 각 템플릿마다 level 변종 1개씩.
 * 빈 배열 반환 X (테스트 가능하도록 항상 ≥ 1 — playerLevel 자체로 1개씩 생성 보장).
 */
export function buildBotsAroundLevel(
  playerLevel: number,
  band: number,
): ArenaBot[] {
  const lvLow = Math.max(1, Math.floor(playerLevel - band));
  const lvHigh = Math.max(lvLow, Math.floor(playerLevel + band));
  const out: ArenaBot[] = [];
  for (const t of BOT_TEMPLATES) {
    // 각 템플릿마다 [lvLow, lvHigh] 범위에서 3개 변종 (low/mid/high) — 너무 많아도 가중치
    // 계산만 늘어나니 3개로 제한. 같은 레벨이 겹치면 dedupe (한 변종만 생성).
    const levels = new Set<number>();
    levels.add(lvLow);
    levels.add(Math.floor((lvLow + lvHigh) / 2));
    levels.add(lvHigh);
    for (const lv of levels) {
      out.push(buildBot(t, lv));
    }
  }
  return out;
}
