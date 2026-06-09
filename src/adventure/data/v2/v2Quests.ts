// v2 가이드 퀘스트 — 튜토리얼 겸 성장 안내. 신규 플레이어를 "첫 전투 → 장비 → 전직 → 전문화 →
// 수행 → 프론티어" 순서로 리드하고, 직업별 계파 단련 + 콘텐츠/사회 시스템 + 고차수 마일스톤을 안내.
//
// 핵심 설계:
//   ① 완료 판정은 **세이브 상태에서 자동 감지**(QuestCtx). 별도 "수락/제출" 없음 — 자연스럽게
//      달성하면 ✅. 보상만 "받기" 버튼으로 수령(중복 방지 = claimed 집합).
//   ② 라인 = 퀘스트 묶음. sequential 라인은 앞 퀘스트가 끝나야 다음이 열리는 리드(성장의 길·직업 라인).
//      비-sequential 라인은 각 마일스톤 독립(정점을 향해·모험가의 길).
//   ③ **직업 전용 라인**(classOnly) — 현 직군의 라인만 보임(다른 직군 라인은 숨김·수령 불가).
//   ④ 순수 함수 — ctx + claimed 집합 → 각 퀘스트 status. 서버/클라 공용, 테스트 가능.
//
// 진행도 source(서버 집계, lib/server/v2QuestContext.ts):
//   level·frontierDepth·specChosen·passivePicks·class = character.v2 / tier·cultivations = proficiency.v2
//   battleCount·bossKills = adventure-log.v2 / equippedCount·uniqueOwned = equipment.v2
//   hasGuild = guildMembers / hasTraded = marketplace_listings_v2 / arenaPlayed = arena-history.v2

import type { V2EquipmentId } from "./v2Equipment";
import type { V2Class } from "./classes";

export type QuestLineId = string;

export type QuestReward = {
  /** 골드(HP 회복 통화 겸용). */
  gold?: number;
  /** 장비 1개 지급(스타터 장비 — 카탈로그 스탯, 굴림 없음). */
  equip?: V2EquipmentId;
};

// 퀘스트 완료 판정에 쓰는 플레이어 진행 상태. 전부 세이브/DB 에서 파생(서버 집계).
export type QuestCtx = {
  /** 현 직군(전사/무도가/마법사/도적/none). 직업 전용 라인 가시성 판정. */
  class: V2Class;
  level: number;
  /** 현 직군의 도달 차수(1~4). proficiency.v2 groups[group].tier. */
  tier: number;
  /** 현 직군의 유효한 전문화(계파)를 선택했는가. character.v2.specChoice ∈ 직군 계파. */
  specChosen: boolean;
  /** 해금한 전문화 패시브 수. character.v2.unlockedPassives.length. */
  passivePicks: number;
  /** 누적 전투 수(킬 + 패배). adventure-log.v2. */
  battleCount: number;
  /** 도달한 사냥터 깊이. character.v2.frontierDepth. */
  frontierDepth: number;
  /** 장착 중인 장비 슬롯 수. equipment.v2.equipped. */
  equippedCount: number;
  /** 보유 유니크 장비 수. equipment.v2.owned 중 rarity:unique. */
  uniqueOwned: number;
  /** 수행 횟수. proficiency.v2 groups[group].cultivations. */
  cultivations: number;
  /** 처치한 테마 보스 수(첫 처치 칭호 보유 수). adventure-log.v2.titles. */
  bossKills: number;
  /** 길드 소속 여부. guildMembers. */
  hasGuild: boolean;
  /** 거래소 거래 성사 경험(구매/판매). marketplace_listings_v2 status='sold'. */
  hasTraded: boolean;
  /** 투기장 전투 기록 ≥1. arena-history.v2. */
  arenaPlayed: boolean;
  /** 투기장 승리 수. arena-history.v2 outcome==='win'. */
  arenaWins: number;
  /** 보유 골드. character.v2.gold. */
  gold: number;
  /** 발견한 거점 수. character.v2.discoveredOutpostIds. */
  outpostsDiscovered: number;
  /** 획득한 칭호 수. adventure-log.v2.titles. */
  titleCount: number;
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
  /** true = 앞 퀘스트 완료해야 다음이 열림(리드). false = 마일스톤 독립. */
  sequential: boolean;
  /** 지정 시 그 직군에게만 보이는 라인(직업 전용). */
  classOnly?: V2Class;
};

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

// ── 직업 전용 라인(직군별, 본인 직군 것만 보임 · 순차) ──────────────────────
// 계파 선택 → 패시브 2개(3차) → 패시브 전부(4차). 그 직군 계파 이름을 안내문에 노출.
const CLASS_INFO: Record<
  "warrior" | "martial" | "mage" | "rogue",
  { name: string; specs: string }
> = {
  warrior: { name: "전사", specs: "광검·기사·검투사" },
  martial: { name: "무도가", specs: "금강·혈권·연환" },
  mage: { name: "마법사", specs: "마도사·워메이지·사제" },
  rogue: { name: "도적", specs: "궁사·자객·독사" },
};
const CLASS_KEYS = Object.keys(CLASS_INFO) as Array<keyof typeof CLASS_INFO>;

const CLASS_LINES: QuestLine[] = CLASS_KEYS.map((cls) => ({
  id: `class_${cls}`,
  name: `${CLASS_INFO[cls].name}의 길`,
  subtitle: `${CLASS_INFO[cls].name}의 계파를 정하고 끝까지 단련하세요.`,
  sequential: true,
  classOnly: cls as V2Class,
}));

const CLASS_QUESTS: QuestDef[] = CLASS_KEYS.flatMap((cls) => {
  const info = CLASS_INFO[cls];
  const line = `class_${cls}`;
  return [
    {
      id: `c_${cls}_spec`,
      line,
      title: `${info.name}의 전문화`,
      desc: `${info.specs} 중 하나의 계파를 선택하세요.`,
      reward: { gold: 600 },
      check: (c: QuestCtx) => c.specChosen,
    },
    {
      id: `c_${cls}_deepen`,
      line,
      title: "계파 심화",
      desc: "전문화 패시브를 2개 해금하세요. (3차 필요)",
      reward: { gold: 1000 },
      check: (c: QuestCtx) => c.passivePicks >= 2,
    },
    {
      id: `c_${cls}_apex`,
      line,
      title: "계파 정점",
      desc: "전문화 패시브를 모두(3개) 해금하세요. (4차 필요)",
      reward: { gold: 2000 },
      check: (c: QuestCtx) => c.passivePicks >= 3,
    },
  ];
});

// ── 모험가의 길(콘텐츠·사회, 마일스톤 독립) ─────────────────────────────────
const SOCIAL: QuestDef[] = [
  {
    id: "s_guild",
    line: "social",
    title: "길드의 일원",
    desc: "길드에 가입하거나 길드를 창단하세요.",
    reward: { gold: 500 },
    check: (c) => c.hasGuild,
  },
  {
    id: "s_trade",
    line: "social",
    title: "첫 거래",
    desc: "거래소에서 거래를 성사시키세요. (구매 또는 판매)",
    reward: { gold: 500 },
    check: (c) => c.hasTraded,
  },
  {
    id: "s_arena",
    line: "social",
    title: "투기장 입문",
    desc: "투기장에서 한 판 겨뤄보세요.",
    reward: { gold: 500 },
    check: (c) => c.arenaPlayed,
  },
  {
    id: "s_arena_win",
    line: "social",
    title: "투기장의 승자",
    desc: "투기장에서 1승을 거두세요.",
    reward: { gold: 700 },
    check: (c) => c.arenaWins >= 1,
  },
];

// ── 수집과 탐험(마일스톤, 독립) ─────────────────────────────────────────────
const COLLECT: QuestDef[] = [
  {
    id: "x_full_gear",
    line: "collect",
    title: "완전 무장",
    desc: "장비 6부위를 모두 장착하세요.",
    reward: { gold: 400 },
    check: (c) => c.equippedCount >= 6,
  },
  {
    id: "x_outposts",
    line: "collect",
    title: "거점 탐험가",
    desc: "거점 10곳을 발견하세요.",
    reward: { gold: 600 },
    check: (c) => c.outpostsDiscovered >= 10,
  },
  {
    id: "x_rich",
    line: "collect",
    title: "재력가",
    desc: "골드 10,000을 보유하세요.",
    reward: { gold: 800 },
    check: (c) => c.gold >= 10000,
  },
  {
    id: "x_titles",
    line: "collect",
    title: "칭호 수집가",
    desc: "칭호 3개를 획득하세요.",
    reward: { gold: 1000 },
    check: (c) => c.titleCount >= 3,
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
    id: "a_unique",
    line: "ascend",
    title: "유니크 수집가",
    desc: "유니크 장비를 1개 이상 획득하세요.",
    reward: { gold: 1500 },
    check: (c) => c.uniqueOwned >= 1,
  },
  {
    id: "a_depth40",
    line: "ascend",
    title: "심연 개척",
    desc: "사냥터 깊이 40까지 진출하세요.",
    reward: { gold: 2500 },
    check: (c) => c.frontierDepth >= 40,
  },
  {
    id: "a_boss_master",
    line: "ascend",
    title: "보스 마스터",
    desc: "테마 보스 3종을 모두 처치하세요.",
    reward: { gold: 3000 },
    check: (c) => c.bossKills >= 3,
  },
  {
    id: "a_unique5",
    line: "ascend",
    title: "유니크 컬렉터",
    desc: "유니크 장비를 5개 이상 수집하세요.",
    reward: { gold: 2500 },
    check: (c) => c.uniqueOwned >= 5,
  },
  {
    id: "a_depth48",
    line: "ascend",
    title: "프론티어의 끝",
    desc: "사냥터 깊이 48(마지막 테마 밴드)까지 진출하세요.",
    reward: { gold: 4000 },
    check: (c) => c.frontierDepth >= 48,
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

// 라인 순서 = 배너 "현재 목표" 우선순위(성장 → 직업 → 사회 → 정점).
export const QUEST_LINES: readonly QuestLine[] = [
  {
    id: "growth",
    name: "성장의 길",
    subtitle: "첫 전투부터 전문화 전직까지 — 차례로 따라오세요.",
    sequential: true,
  },
  ...CLASS_LINES,
  {
    id: "social",
    name: "모험가의 길",
    subtitle: "길드·거래소·투기장 — 모험가의 세계를 경험하세요.",
    sequential: false,
  },
  {
    id: "collect",
    name: "수집과 탐험",
    subtitle: "장비·거점·골드·칭호 — 모으고 누비세요.",
    sequential: false,
  },
  {
    id: "ascend",
    name: "정점을 향해",
    subtitle: "더 깊은 곳과 높은 차수를 향한 마일스톤.",
    sequential: false,
  },
];

export const V2_QUESTS: readonly QuestDef[] = [
  ...GROWTH,
  ...CLASS_QUESTS,
  ...SOCIAL,
  ...COLLECT,
  ...ASCEND,
];

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

// 직업 전용 라인은 현 직군에게만 보임(classOnly 없으면 전원).
function lineVisible(line: QuestLine | undefined, ctx: QuestCtx): boolean {
  if (!line) return false;
  if (!line.classOnly) return true;
  return line.classOnly === ctx.class;
}
function isVisible(def: QuestDef, ctx: QuestCtx): boolean {
  return lineVisible(LINE_BY_ID.get(def.line), ctx);
}

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

// 수령 가능 여부(서버 검증) — 가시(현 직군) + 미수령 + 열림 + 조건 충족.
// isVisible 가드가 타 직군 라인 퀘스트의 교차 수령(specChosen 등 공유 조건)을 차단.
export function isQuestClaimable(
  def: QuestDef,
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): boolean {
  if (!isVisible(def, ctx)) return false;
  return questStatus(def, ctx, claimed) === "claimable";
}

// 현 직군에게 보이는 라인만.
export function questLinesFor(ctx: QuestCtx): QuestLine[] {
  return QUEST_LINES.filter((l) => lineVisible(l, ctx));
}

export function deriveQuestViews(
  ctx: QuestCtx,
  claimed: ReadonlySet<string>,
): QuestView[] {
  return V2_QUESTS.filter((q) => isVisible(q, ctx)).map((q) => ({
    id: q.id,
    line: q.line,
    title: q.title,
    desc: q.desc,
    reward: q.reward,
    status: questStatus(q, ctx, claimed),
  }));
}

// 홈 배너용 — 지금 안내할 "현재 목표" 하나. 우선순위 = 라인 순서(성장→직업→사회→정점) 내
// 수령 가능 > 진행 중. 전부 끝났으면 null.
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
