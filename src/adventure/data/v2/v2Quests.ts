// v2 가이드 퀘스트 — 튜토리얼 겸 성장 안내. 신규 플레이어를 "첫 전투 → 장비 → 전직 → 전문화 →
// 수행 → 프론티어" 순서로 리드하고, 그 이후 마일스톤(보스·고차수·심층)을 안내한다.
//
// 핵심 설계:
//   ① 완료 판정은 **세이브 상태에서 자동 감지**(QuestCtx). 별도 "수락/제출" 없음 — 자연스럽게
//      달성하면 ✅. 보상만 "받기" 버튼으로 수령(중복 방지 = claimed 집합).
//   ② 라인 = 퀘스트 묶음. sequential 라인(성장의 길)은 앞 퀘스트가 끝나야 다음이 열리는 튜토리얼
//      리드. 비-sequential 라인(정점을 향해)은 각 마일스톤이 독립(조건 충족 시 바로 수령).
//   ③ 순수 함수 — ctx + claimed 집합 → 각 퀘스트 status. 서버/클라 공용, 테스트 가능.
//
// 진행도 source(서버 집계, lib/server/v2QuestContext.ts):
//   level·frontierDepth·specChosen·passivePicks = character.v2 / tier·cultivations = proficiency.v2
//   battleCount·bossKills = adventure-log.v2 / equippedCount = equipment.v2

import type { V2EquipmentId } from "./v2Equipment";

export type QuestLineId = "growth" | "ascend";

export type QuestReward = {
  /** 골드(HP 회복 통화 겸용). */
  gold?: number;
  /** 장비 1개 지급(스타터 장비 — 카탈로그 스탯, 굴림 없음). */
  equip?: V2EquipmentId;
};

// 퀘스트 완료 판정에 쓰는 플레이어 진행 상태. 전부 세이브에서 파생(서버 집계).
export type QuestCtx = {
  level: number;
  /** 현 직군의 도달 차수(1~4). proficiency.v2 groups[group].tier. */
  tier: number;
  /** 전문화(계파) 선택 여부. character.v2.specChoice != null. */
  specChosen: boolean;
  /** 해금한 전문화 패시브 수. character.v2.unlockedPassives.length. */
  passivePicks: number;
  /** 누적 전투 수(킬 + 패배). adventure-log.v2. */
  battleCount: number;
  /** 도달한 사냥터 깊이. character.v2.frontierDepth. */
  frontierDepth: number;
  /** 장착 중인 장비 슬롯 수. equipment.v2.equipped. */
  equippedCount: number;
  /** 수행 횟수. proficiency.v2 groups[group].cultivations. */
  cultivations: number;
  /** 처치한 테마 보스 수(첫 처치 칭호 보유 수). adventure-log.v2.titles. */
  bossKills: number;
};

export type QuestDef = {
  id: string;
  line: QuestLineId;
  title: string;
  /** 무엇을 하면 되는지(행동 안내). */
  desc: string;
  reward: QuestReward;
  /** 완료 판정 — 세이브 파생 ctx 로. */
  check: (c: QuestCtx) => boolean;
};

export type QuestLine = {
  id: QuestLineId;
  name: string;
  subtitle: string;
  /** true = 앞 퀘스트 완료해야 다음이 열림(튜토리얼 리드). false = 마일스톤 독립. */
  sequential: boolean;
};

export const QUEST_LINES: readonly QuestLine[] = [
  {
    id: "growth",
    name: "성장의 길",
    subtitle: "첫 전투부터 전문화 전직까지 — 차례로 따라오세요.",
    sequential: true,
  },
  {
    id: "ascend",
    name: "정점을 향해",
    subtitle: "더 깊은 곳과 높은 차수를 향한 마일스톤.",
    sequential: false,
  },
];

// ── 성장의 길(튜토리얼 리드, 순차) ──────────────────────────────────────────
// 첫 전투 보상으로 쇠사슬 갑옷을 주고 → 다음 퀘스트가 "장착하기"라 자연스러운 학습 루프.
const GROWTH: QuestDef[] = [
  {
    id: "g_first_battle",
    line: "growth",
    title: "첫 발걸음",
    desc: "사냥터에서 첫 전투를 치러보세요.",
    reward: { gold: 80, equip: "v2_chain_mail" },
    check: (c) => c.battleCount >= 1,
  },
  {
    id: "g_equip",
    line: "growth",
    title: "무장하기",
    desc: "인벤토리에서 장비를 장착하세요.",
    reward: { gold: 120 },
    check: (c) => c.equippedCount >= 1,
  },
  {
    id: "g_depth5",
    line: "growth",
    title: "더 깊은 곳으로",
    desc: "사냥터 깊이 5까지 진출하세요.",
    reward: { gold: 200 },
    check: (c) => c.frontierDepth >= 5,
  },
  {
    id: "g_cap1",
    line: "growth",
    title: "1차 정점",
    desc: "레벨 50(1차 한계치)에 도달하세요.",
    reward: { gold: 400 },
    check: (c) => c.level >= 50,
  },
  {
    id: "g_advance2",
    line: "growth",
    title: "2차 전직",
    desc: "성장의 신전에서 다음 차수로 전직하세요.",
    reward: { gold: 600 },
    check: (c) => c.tier >= 2,
  },
  {
    id: "g_spec",
    line: "growth",
    title: "전문화 선택",
    desc: "성장의 신전에서 전문화(계파)를 선택하세요.",
    reward: { gold: 500 },
    check: (c) => c.specChosen,
  },
  {
    id: "g_passive",
    line: "growth",
    title: "전문화 각성",
    desc: "전문화 패시브를 1개 해금하세요.",
    reward: { gold: 500 },
    check: (c) => c.passivePicks >= 1,
  },
  {
    id: "g_cultivate",
    line: "growth",
    title: "수행 입문",
    desc: "성장의 신전에서 수행으로 능력치 한계를 올리세요.",
    reward: { gold: 300 },
    check: (c) => c.cultivations >= 1,
  },
  {
    id: "g_frontier",
    line: "growth",
    title: "프론티어 개척자",
    desc: "프론티어 첫 테마 밴드(깊이 13)에 진입하세요.",
    reward: { gold: 800 },
    check: (c) => c.frontierDepth >= 13,
  },
];

// ── 정점을 향해(마일스톤, 독립) ─────────────────────────────────────────────
const ASCEND: QuestDef[] = [
  {
    id: "a_boss",
    line: "ascend",
    title: "테마 보스 토벌",
    desc: "테마 보스를 처치하세요. (보스 도전)",
    reward: { gold: 1200 },
    check: (c) => c.bossKills >= 1,
  },
  {
    id: "a_advance3",
    line: "ascend",
    title: "3차 전직",
    desc: "3차로 전직하세요.",
    reward: { gold: 1500 },
    check: (c) => c.tier >= 3,
  },
  {
    id: "a_depth25",
    line: "ascend",
    title: "심층 개척",
    desc: "사냥터 깊이 25까지 진출하세요.",
    reward: { gold: 2000 },
    check: (c) => c.frontierDepth >= 25,
  },
  {
    id: "a_apex",
    line: "ascend",
    title: "정점",
    desc: "4차 정점에 도달하세요.",
    reward: { gold: 3000 },
    check: (c) => c.tier >= 4,
  },
];

export const V2_QUESTS: readonly QuestDef[] = [...GROWTH, ...ASCEND];

const QUEST_BY_ID = new Map(V2_QUESTS.map((q) => [q.id, q]));
const LINE_BY_ID = new Map(QUEST_LINES.map((l) => [l.id, l]));

export function questById(id: string): QuestDef | undefined {
  return QUEST_BY_ID.get(id);
}

// claimed   — 이미 보상 수령(서버 영속 guide-quests.v2.claimed).
// claimable — 조건 충족 + (순차 라인이면 앞이 다 열림) + 미수령 → "받기" 가능.
// active    — 열렸지만 조건 미충족 → 지금 향할 목표.
// locked    — 순차 라인에서 앞 퀘스트가 아직 미완(조건 미충족) → 잠김.
export type QuestStatus = "claimed" | "claimable" | "active" | "locked";

export type QuestView = {
  id: string;
  line: QuestLineId;
  title: string;
  desc: string;
  reward: QuestReward;
  status: QuestStatus;
};

// 순차 라인에서 "열림" = 앞 퀘스트들의 check 가 전부 true. 비순차는 항상 열림.
function isUnlocked(def: QuestDef, ctx: QuestCtx): boolean {
  const line = LINE_BY_ID.get(def.line);
  if (!line?.sequential) return true;
  for (const q of V2_QUESTS) {
    if (q.line !== def.line) continue;
    if (q.id === def.id) break; // 자기 자신 앞까지만
    if (!q.check(ctx)) return false;
  }
  return true;
}

export function questStatus(
  def: QuestDef,
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): QuestStatus {
  if (claimed.has(def.id)) return "claimed";
  if (!isUnlocked(def, ctx)) return "locked";
  return def.check(ctx) ? "claimable" : "active";
}

// 수령 가능 여부(서버 검증) — 미수령 + 열림 + 조건 충족.
export function isQuestClaimable(
  def: QuestDef,
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): boolean {
  return questStatus(def, ctx, claimed) === "claimable";
}

export function deriveQuestViews(
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): QuestView[] {
  return V2_QUESTS.map((q) => ({
    id: q.id,
    line: q.line,
    title: q.title,
    desc: q.desc,
    reward: q.reward,
    status: questStatus(q, ctx, claimed),
  }));
}

// 홈 배너용 — 지금 안내할 "현재 목표" 하나. 우선순위: 수령 가능 > 진행 중(성장의 길 먼저).
// 전부 끝났으면 null.
export function currentGuideQuest(
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): QuestView | null {
  const views = deriveQuestViews(ctx, claimed);
  return (
    views.find((v) => v.status === "claimable") ??
    views.find((v) => v.status === "active") ??
    null
  );
}
