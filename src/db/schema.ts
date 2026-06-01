import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  timestamp,
  jsonb,
  primaryKey,
  serial,
  integer,
  index,
  uniqueIndex,
  boolean,
  check,
  numeric,
  doublePrecision,
} from "drizzle-orm/pg-core";

// Auth.js(NextAuth) 와 게임 사용자 1:1 매핑.
// Auth.js DrizzleAdapter 가 name/email/emailVerified/image 를 관리.
// gameName: 인게임 닉네임. 중복 방지용 권위적(authoritative) 컬럼 — 최초 설정 시 등록.
// activeSessionId: 현재 활성 디바이스의 임의 토큰. 새 디바이스 로그인 시 새 토큰을
//   claim → 기존 디바이스의 다음 PATCH/GET 가 410 으로 거절돼 강제 로그아웃.
export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(),
    // Auth.js 표준 필드 — OAuth 공급자 프로필에서 자동 설정.
    name: text("name"),
    email: text("email").notNull().unique(),
    emailVerified: timestamp("email_verified", { mode: "date" }),
    image: text("image"),
    // 인게임 닉네임 — profile/setup API 로 사용자가 직접 설정.
    gameName: text("game_name"),
    activeSessionId: text("active_session_id"),
    // 자동 사냥(타이머형 6시간 원정) 상태 — POST /api/hunt/dispatch 가 박고,
    // POST /api/hunt/collect 가 simMs=min(경과,6시간) 만큼 sim·적용 후 NULL 로 종료.
    //   huntActive            = 위탁 진행 중 여부
    //   huntBaselineAt        = 위탁 시작 시각 (서버 소유 — 클라 시계 skew·위변조 무관)
    //   huntRegion            = 위탁 사냥 지역
    //   huntBaselineHp        = 위탁 시작 시점 HP (sim 시작 HP)
    //   huntPredictedDeathAt  = dispatch 시 pre-sim 으로 예측한 사망 시각 (사망 안 함 → NULL).
    //                           클라 알림 발화 시각 — collect 시 다시 sim 으로 같은 결정적 결과 검증.
    // (컬럼명은 옛 "오프라인 사냥/서버 권위" 모델 잔재 — 이름 그대로 재활용.)
    huntActive: boolean("hunt_active").notNull().default(false),
    huntRegion: text("hunt_region"),
    huntBaselineHp: integer("hunt_baseline_hp"),
    huntBaselineAt: timestamp("hunt_baseline_at"),
    huntPredictedDeathAt: timestamp("hunt_predicted_death_at"),
    // lastClaimResult — 마지막 collect 결과 캐시. 응답 손실 후 재클릭 시 그대로 replay.
    // 새 dispatch 시작 시 NULL 로 리셋. lastClaimId 는 "collected" 마커로만 사용 (옛 잔재).
    lastClaimId: text("last_claim_id"),
    lastClaimResult: jsonb("last_claim_result"),
    // 전체 소식(서버 피드)에 내 자랑거리(유실된 명품·걸작 제작)를 흘릴지 여부.
    // 송신자 opt-out — false 면 insertFeedEntry 가 이 유저 이벤트를 건너뛴다. 기본 ON.
    shareFeed: boolean("share_feed").notNull().default(true),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // 대소문자 무시 unique. NULL 은 자유롭게 허용 (기존 유저 호환).
    uniqueIndex("users_game_name_lower_idx").on(sql`lower(${t.gameName})`),
  ],
);

// Auth.js 연동 계정 — OAuth 공급자(Google/Kakao)와 users.id 매핑.
// allowDangerousEmailAccountLinking 으로 같은 이메일의 복수 공급자를 한 계정에 연동.
export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

// Auth.js DB 세션 — JWT 전략 사용 시 미사용. 스키마만 유지 (adapter 요구).
export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

// 이메일 인증 토큰 — 매직 링크 사용 시. OAuth 전용 구성에선 미사용이나 adapter 요구.
export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

// 게임 진행 상태는 키별로 분리 저장. localStorage 패턴과 동일.
// 새 키 추가 시 마이그레이션 없이 행만 추가.
// version — 낙관적 동시성 제어. 매 write 마다 증가. PATCH 시 클라이언트가 expectedVersion 을
// 함께 보내고 서버가 일치할 때만 업데이트 (불일치 = 409, 다른 탭/기기에서 쓰기가 있었음).
export const savesKv = pgTable(
  "saves_kv",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    version: integer("version").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

// 광장 게시판 글. 영구 보관 — cleanup cron 없음 (자동 삭제 정책 제거됨).
// category — "notice" | "free" | "guide". 작성 시 BULLETIN_CATEGORIES 로 검증.
//   - notice: admin 만 작성 가능 (서버에서 검증)
//   - free/guide: 일반 유저도 작성 가능
// name/className/title 은 전송 시점 스냅샷.
export const bulletinPosts = pgTable(
  "bulletin_posts",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    className: text("class_name").notNull(),
    category: text("category").notNull().default("free"),
    title: text("title"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("bulletin_posts_created_at_idx").on(t.createdAt),
    // POST 의 rate-limit 조회("내 마지막 글" lookup) 가 매번 userId 로 seqscan+sort 했었다.
    index("bulletin_posts_user_created_at_idx").on(t.userId, t.createdAt),
    // 카테고리 탭별 최신순 조회 — (category, createdAt DESC).
    index("bulletin_posts_category_created_at_idx").on(t.category, t.createdAt),
  ],
);

// 게시판 좋아요 — (postId, userId) composite PK 로 1유저 1좋아요 강제.
// 글 삭제 시 cascade. 카운트는 매 조회마다 COUNT 집계 (글당 평균 likes 가 적어 OK).
export const bulletinLikes = pgTable(
  "bulletin_likes",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => bulletinPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.postId, t.userId] }),
    // 카운트/조회 — postId 만으로도 충분, composite PK 의 왼쪽 컬럼이라 별도 인덱스 생략 가능.
  ],
);

// 게시판 댓글 — name/className 스냅샷, 글 삭제 시 cascade.
export const bulletinComments = pgTable(
  "bulletin_comments",
  {
    id: serial("id").primaryKey(),
    postId: integer("post_id")
      .notNull()
      .references(() => bulletinPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    className: text("class_name").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // 댓글 펼침 시 (postId, createdAt ASC) 정렬.
    index("bulletin_comments_post_created_at_idx").on(t.postId, t.createdAt),
    // rate-limit 조회 — userId 마지막 댓글.
    index("bulletin_comments_user_created_at_idx").on(t.userId, t.createdAt),
  ],
);

// 글로벌 채팅 메시지. 3일 후 cron 으로 일괄 삭제.
// name/className/title 은 전송 시점 스냅샷 — 이후 사용자가 바뀌어도 과거 메시지는 그대로.
// title 은 미장착 시 NULL.
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    className: text("class_name").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("messages_created_at_idx").on(t.createdAt),
    // POST 의 rate-limit 조회용 — userId 로 본인 마지막 메시지 시각.
    index("messages_user_created_at_idx").on(t.userId, t.createdAt),
  ],
);

// 전체 소식 (서버 피드) — 서버 전체에 흘러가는 "자랑거리" 한 줄 (유실된 명품 획득, 걸작 제작 성공 등).
// 글로벌 채팅과 분리 — 대화용 vs 전광판용. 모험탭 하단 패널에서 최근 N개만 노출.
// append-only — insert 시 FEED_MAX_ROWS 초과분을 잘라낸다 (cron 없음).
// actorName 은 발생 시점 닉네임 스냅샷 (이후 닉네임이 바뀌어도 과거 항목은 그대로).
// type: 'unique_drop' | 'masterpiece' (v2 에서 'milestone' 등 추가). payload 는 type 별 형태.
export const serverFeed = pgTable(
  "server_feed",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorName: text("actor_name").notNull(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // 디바운스 조회용 — 같은 유저+type 의 최근 항목이 있는지.
    index("server_feed_user_type_idx").on(t.userId, t.type, t.createdAt),
  ],
);

// 현재 접속 중인 유저 — 클라이언트가 주기적으로 하트비트(POST /api/presence)
// 보내 last_seen_at 갱신. "최근 X 초 이내 본 유저"가 온라인으로 간주된다.
// 행은 누적되지만 GET 시 시간 필터로 제외 — 별도 cleanup 불필요.
export const presence = pgTable(
  "presence",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    className: text("class_name").notNull(),
    title: text("title"),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  },
  (t) => [
    // GET 의 lastSeenAt > since 윈도우 필터 + ORDER BY — 인덱스 없으면 매 폴마다
    // presence 전체 seqscan + sort. 폴 빈도가 높아 누적 비용이 크다.
    index("presence_last_seen_at_idx").on(t.lastSeenAt),
  ],
);

// 거래소 listing — 활성/판매됨/취소됨 모두 보관 (분석/감사용).
// item_kind: 'equip' | 'material' — 인벤토리 카테고리 매핑.
// item_name/seller_name 은 등록 시점 스냅샷 (이후 닉네임 변경되어도 표시 안정).
// price 는 정수 골드 (최대 999,999,999 < 2^31 이라 integer 충분).
// grade: 'base'|'c-2'|'c-1'|'c1'|'c2'|'d1'|'d2' — equip 만 의미 있음 (다른 kind 는 항상 'base').
//        vault variant 키와 동일 규약. base = equipment[], c±N = craftedEquipment, dN = droppedEquipment.
export const marketplaceListings = pgTable(
  "marketplace_listings",
  {
    id: serial("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sellerName: text("seller_name").notNull(),
    itemKind: text("item_kind").notNull(), // 'equip' | 'material'
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    grade: text("grade").notNull().default("base"),
    quantity: integer("quantity").notNull(),
    price: integer("price").notNull(),
    status: text("status").notNull().default("active"), // 'active'|'sold'|'cancelled'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    closedAt: timestamp("closed_at"),
    buyerId: text("buyer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    // 인스턴스 매물(강화·부여된 별빛 무구/고리)의 EquipmentInstance 스냅샷(instanceId 제외).
    // null 이면 일반 스택형 매물. non-null 이면 quantity=1, grade 는 craftTier 파생.
    instancePayload: jsonb("instance_payload"),
  },
  (t) => [
    // 활성 listing 의 아이템 종류·가격 검색용 partial index.
    index("listings_active_idx")
      .on(t.itemKind, t.itemId, t.price)
      .where(sql`${t.status} = 'active'`),
    // 내 등록 목록 / 슬롯 카운트.
    index("listings_seller_idx").on(t.sellerId, t.status, t.createdAt),
    // grade 는 vault variant 키와 동일 — 잘못된 값(예: 'rare', '+5') 이 들어가지 않도록.
    check(
      "listings_grade_valid",
      sql`${t.grade} IN ('base','c-2','c-1','c1','c2','d1','d2')`,
    ),
  ],
);

// 거래 결과 + 유저 간 쪽지 + 길드 알림 우편함. 사용자가 마을에서 "수령/확인" 누를 때까지 대기.
// kind 와 payload 형식 (정의·검증·빌더는 src/lib/server/inboxPayload.ts):
//   sale_proceeds:      { gold: number }                                            — 매물 판매 대금
//   purchase_item:      { item_kind, item_id, grade, quantity }                     — 구매한 아이템 수령
//   cancel_return:      { item_kind, item_id, grade, quantity }                     — 본인/admin 취소 환불
//   listing_expired:    { item_kind, item_id, grade, quantity }                     — TTL 유찰 환불
//   user_message:       { text: string }                                            — 유저 간 쪽지
//   recipe_gift:        { recipe_id, recipe_name }                                  — 제작서 선물
//   guild_invite:       { invite_id, guild_id, guild_name, expires_at }             — 길드 초대
//   guild_quest_reward: { quest_id, quest_name, gold, materials[], items[] }        — 길드 의뢰 보상
// fromUserId/fromName 은 user_message·recipe_gift·guild_invite 등 사람·길드 발송분 — 시스템 발송은 NULL.
export const marketplaceInbox = pgTable(
  "marketplace_inbox",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    message: text("message"),
    listingId: integer("listing_id").references(() => marketplaceListings.id, {
      onDelete: "set null",
    }),
    fromUserId: text("from_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    fromName: text("from_name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    claimedAt: timestamp("claimed_at"),
  },
  (t) => [
    // 미수령 우편 — 가장 빈번한 쿼리.
    index("inbox_unclaimed_idx")
      .on(t.userId, t.createdAt)
      .where(sql`${t.claimedAt} IS NULL`),
    // 발송자 rate limit 조회용 partial index.
    index("inbox_from_user_idx")
      .on(t.fromUserId, t.createdAt)
      .where(sql`${t.fromUserId} IS NOT NULL`),
  ],
);

// 랭킹 — opt-in. 사용자가 명시적으로 등록한 경우에만 row 가 존재한다.
// 갱신은 수동 (RankingsView 의 '갱신' 버튼). DELETE 로 빠질 수 있음.
// name 은 등록/갱신 시점 스냅샷 — 이후 닉네임 변경되면 다음 갱신에서 반영.
export const rankings = pgTable(
  "rankings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    level: integer("level").notNull(),
    fame: integer("fame").notNull(),
    battleCount: integer("battle_count").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("rankings_level_idx").on(t.level),
    index("rankings_fame_idx").on(t.fame),
    index("rankings_battle_count_idx").on(t.battleCount),
  ],
);

// 길드 버프 슬롯 — JSONB 저장용 row 형 (id/tier 검증은 서버 핸들러에서 수행).
export type GuildBuffSlotRow = {
  buffId: string;
  tier: number;
  installedAt: string;
};

// 유저 자치 길드 — 정원 3명, 마스터 초대제, 자동 해체 정책.
// disbandedAt != NULL 이면 tombstone — 30일 후 cron 이 hard delete (이름 재사용 차단 기간).
// 활성 + tombstone 모두 unique 이므로 자연스레 30일 cooldown 이 됨.
export const guilds = pgTable(
  "guilds",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    masterId: text("master_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    disbandedAt: timestamp("disbanded_at"),
    // 누적 명성 — 영구, 등급(G~S) 결정. 길드 의뢰 보상 + 멤버 개인 명성 적립분.
    fameTotal: integer("fame_total").notNull().default(0),
    // 사용 가능 명성 — 누적과 동일하게 시작, 길드 버프 업그레이드에 소비.
    fameAvailable: integer("fame_available").notNull().default(0),
    // 마스터가 자유롭게 적는 짧은 소개글. 최대 120자(앱단 검증). NULL = 미설정.
    description: text("description"),
    // 가입 신청을 받는지 — 마스터 토글. false 면 둘러보기에서 "신청" 비활성.
    acceptingRequests: boolean("accepting_requests").notNull().default(true),
    // 길드 버프 슬롯 — { buffId, tier, installedAt }[]. 슬롯 수 한도는 등급 산식.
    buffs: jsonb("buffs")
      .$type<GuildBuffSlotRow[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    // 길드 회관 등급 — 0=미건립, 1~5=★ 단계. 봉납 누계 임계 도달 시 마스터가 trigger.
    // 능력 수치 영향 X (power-free) — 사회적 정체성 + sink 만.
    lodgeRank: integer("lodge_rank").notNull().default(0),
    // 마스터 자유 텍스트, 회관 첫 줄 표시. ≤80자(앱단 검증). NULL = 미설정.
    lodgeSlogan: text("lodge_slogan"),
  },
  (t) => [
    uniqueIndex("guilds_name_lower_idx").on(sql`lower(${t.name})`),
  ],
);

// 길드 소속. 1인 1길드 — userId 유니크 인덱스로 enforce.
// role: 'master' | 'member'.
export const guildMembers = pgTable(
  "guild_members",
  {
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
    uniqueIndex("guild_members_user_unique_idx").on(t.userId),
  ],
);

// 길드 초대장. 7일 유효, 만료 시 cron 이 status='expired' 처리.
// status: 'pending' | 'accepted' | 'declined' | 'expired'.
// (guild, target) 쌍의 pending 중복은 partial unique 로 막음.
export const guildInvites = pgTable(
  "guild_invites",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status").notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("guild_invites_pending_unique_idx")
      .on(t.guildId, t.toUserId)
      .where(sql`${t.status} = 'pending'`),
    index("guild_invites_recipient_idx")
      .on(t.toUserId, t.createdAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

// 길드 가입 신청 (둘러보기 → 신청). 7일 유효, 만료 시 cron 이 status='expired'.
// status: 'pending' | 'accepted' | 'declined' | 'cancelled' | 'expired'.
// 유저당 pending 1건만 — 다른 길드에 신청하려면 먼저 취소. (guild, user) pending 도 partial unique.
export const guildJoinRequests = pgTable(
  "guild_join_requests",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    status: text("status").notNull().default("pending"),
  },
  (t) => [
    uniqueIndex("guild_join_requests_user_pending_unique_idx")
      .on(t.userId)
      .where(sql`${t.status} = 'pending'`),
    index("guild_join_requests_guild_idx")
      .on(t.guildId, t.createdAt)
      .where(sql`${t.status} = 'pending'`),
  ],
);

// 길드 탈퇴/추방 후 7일 쿨다운 — 다른 길드 가입 차단.
export const guildLeaveCooldown = pgTable("guild_leave_cooldown", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  cooldownUntil: timestamp("cooldown_until").notNull(),
});

// 길드 회관 봉납 로그. 멤버가 별빛/골드를 봉납하면 row 1개 INSERT — kind 별로 별도 row.
// 같은 트랜잭션에서 guild_lodge_state 의 누계 캐시를 UPSERT 해 hot read 경로를 단순화.
// 봉납은 비가역 — 길드 해체(tombstone) 시 cascade 로 같이 사라진다.
export const guildLodgeDonations = pgTable(
  "guild_lodge_donations",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // 이번주/누계 집계 — guildId × createdAt 으로 멤버별 GROUP BY 가 hot path.
    index("guild_lodge_donations_guild_created_idx").on(t.guildId, t.createdAt),
    check(
      "guild_lodge_donations_kind_valid",
      sql`${t.kind} IN ('stardust','gold')`,
    ),
    check(
      "guild_lodge_donations_amount_positive",
      sql`${t.amount} > 0`,
    ),
  ],
);

// 회관 누계 캐시 — 봉납 row 가 source of truth, 이쪽은 derived.
// 매 봉납 트랜잭션 안에서 같이 UPSERT 하므로 정합성 손실 위험 없음.
// 등급 임계 비교 / 회관 메인 표시에 hot read 라 SUM 매번 돌리는 대신 캐시.
export const guildLodgeState = pgTable("guild_lodge_state", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  stardustTotal: integer("stardust_total").notNull().default(0),
  goldTotal: integer("gold_total").notNull().default(0),
  lastDonationAt: timestamp("last_donation_at"),
});

// 길드 주간 의뢰 인스턴스. 매주 월 00:00 KST cron 으로 길드별 후보 3건 생성,
// 마스터가 1건 수락 → 활성. 일 23:59 KST 마감 cron 으로 미완료/미수락 → expired.
// status: 'proposed' | 'active' | 'completed' | 'dismissed' | 'expired'.
// 3개 동시 활성 체제 — 주간 발행 시 즉시 active, partial unique 없음.
export const guildQuestInstances = pgTable(
  "guild_quest_instances",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    weekStart: timestamp("week_start").notNull(),
    questDefId: text("quest_def_id").notNull(),
    grade: text("grade").notNull(), // 발행 시점 등급 스냅샷 G/F/E/D/C/B/A/S
    status: text("status").notNull(),
    progress: integer("progress").notNull().default(0),
    target: integer("target").notNull(),
    activatedAt: timestamp("activated_at"),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("guild_quest_guild_week_idx").on(t.guildId, t.weekStart),
  ],
);

// 협동 보스 세션 — region 별 활성 인스턴스 1개 (uniqueIndex 로 enforce).
// hp 가 0 이 되거나 expiresAt 이 지나면 비활성. nextSpawnAt 후 cron 이 새 세션 생성.
//
// regen_per_min > 0 인 월드 보스는 GET/attack 진입 시 lazy 로 hp 를 회복시킨다 —
// 다인 누적 데미지 대비 baseline sustain 으로 "꾸준히 깎아야 잡힌다" 를 강제.
export const coopBossSessions = pgTable(
  "coop_boss_sessions",
  {
    id: text("id").primaryKey(),
    regionId: text("region_id").notNull(),
    bossName: text("boss_name").notNull(),
    hp: integer("hp").notNull(),
    maxHp: integer("max_hp").notNull(),
    spawnedAt: timestamp("spawned_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    defeatedAt: timestamp("defeated_at"),
    nextSpawnAt: timestamp("next_spawn_at"),
    // 분당 자연회복량. 0(default) 면 비-월드보스 — regen 로직 자체가 스킵.
    regenPerMin: integer("regen_per_min").notNull().default(0),
    // 마지막으로 lazy regen 이 적용된 시각. 0 인 보스는 NULL 유지. spawn 시 now.
    lastRegenAt: timestamp("last_regen_at"),
  },
  (t) => [
    // region 당 활성 세션은 1개만 (defeatedAt IS NULL && expiresAt > now 가 활성).
    // 부분 unique 인덱스로 활성 세션만 제약.
    uniqueIndex("coop_boss_active_region_idx")
      .on(t.regionId)
      .where(sql`${t.defeatedAt} IS NULL`),
    index("coop_boss_next_spawn_idx").on(t.nextSpawnAt),
  ],
);

// 유저별 누적 데미지 + claim 상태.
export const coopBossContributors = pgTable(
  "coop_boss_contributors",
  {
    sessionId: text("session_id")
      .notNull()
      .references(() => coopBossSessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    damage: integer("damage").notNull().default(0),
    attackCount: integer("attack_count").notNull().default(0),
    lastAttackAt: timestamp("last_attack_at"),
    claimedAt: timestamp("claimed_at"),
    claimedTier: text("claimed_tier"),
    // 적용된 보상 스냅샷 — ResolvedCoopReward 그대로. 트랜잭션 안에서 saves_kv 와
    // 함께 박힌다. 응답 손실 후 retry 시 같은 reward 를 그대로 반환해 보상이 사라지지
    // 않게 한다 (HOTFIX-D 의 claim race full fix — audit #9).
    claimedRewardSnapshot: jsonb("claimed_reward_snapshot"),
  },
  (t) => [
    primaryKey({ columns: [t.sessionId, t.userId] }),
    index("coop_boss_contributors_user_idx").on(t.userId),
    // GET /api/coop/[region] 의 "기여자 top 5" 정렬용 — 인덱스 없으면 세션당
    // 전체 기여자 seqscan + ORDER BY damage DESC. 인기 보스는 수십~수백 명.
    index("coop_boss_contributors_session_damage_idx").on(
      t.sessionId,
      sql`${t.damage} DESC`,
    ),
  ],
);

export type User = typeof users.$inferSelect;
export type RankingRow = typeof rankings.$inferSelect;
export type GuildRow = typeof guilds.$inferSelect;
// 공격마다 1줄씩 기록되는 협동 보스 전투 로그.
// 모든 참여자의 공격을 시간순으로 모아 보스 카드 밑에 노출 — "다른 사람들 공격도 같이 본다".
// session 삭제 시 cascade. session 당 최근 N개만 의미가 있어 GET 에서 LIMIT.
// log: BattleLogEntry[] 그대로 저장 — 카드에서 펼치면 실제 전투 흐름 (강공격, 크리, 회피 등).
export const coopBossAttackLog = pgTable(
  "coop_boss_attack_log",
  {
    id: serial("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => coopBossSessions.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    damageDealt: integer("damage_dealt").notNull(),
    damageTaken: integer("damage_taken").notNull(),
    diedEarly: boolean("died_early").notNull().default(false),
    log: jsonb("log").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("coop_boss_attack_log_session_idx").on(t.sessionId, t.createdAt),
  ],
);

// PvP 시즌 — 주간 (월요일 00:00 KST 시작). id 는 ISO 주차 키 (예: "2026-W20").
// status: 'active' | 'closed'. closedAt 은 cron 이 다음 시즌 시작할 때 셋.
// 보상 지급은 시즌 종료 시점에 cron 이 일괄 (rewardsGrantedAt 으로 idempotent).
export const pvpSeasons = pgTable("pvp_seasons", {
  id: text("id").primaryKey(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  status: text("status").notNull().default("active"),
  closedAt: timestamp("closed_at"),
  rewardsGrantedAt: timestamp("rewards_granted_at"),
});

// 시즌별 유저 Elo 레이팅. (userId, seasonId) 1 row.
// dailyEarned / dailyResetAt 은 일일 화폐 캡 — 무제한 도전 + 철회화폐 조합의 농사
// 인플레 방지. PR-3 매칭 API 에서 갱신.
export const pvpRatings = pgTable(
  "pvp_ratings",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seasonId: text("season_id")
      .notNull()
      .references(() => pvpSeasons.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull().default(1000),
    wins: integer("wins").notNull().default(0),
    losses: integer("losses").notNull().default(0),
    draws: integer("draws").notNull().default(0),
    dailyEarned: integer("daily_earned").notNull().default(0),
    dailyResetAt: timestamp("daily_reset_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.seasonId] }),
    // 시즌 순위표 — rating 내림차순 인덱스. 동률은 wins 내림차순으로 자연 정렬.
    index("pvp_ratings_season_rating_idx").on(
      t.seasonId,
      sql`${t.rating} DESC`,
    ),
  ],
);

// PvP 매치 결과 로그. 시즌별 누적. log 는 PvPBattleState.log 그대로 jsonb.
// outcome: 'a_win' (attacker) | 'd_win' (defender) | 'draw'.
// 양쪽 rating before/after 를 같이 저장 — 사후 분석/UI 표시용.
export const pvpMatches = pgTable(
  "pvp_matches",
  {
    id: serial("id").primaryKey(),
    seasonId: text("season_id")
      .notNull()
      .references(() => pvpSeasons.id, { onDelete: "cascade" }),
    attackerId: text("attacker_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    defenderId: text("defender_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    outcome: text("outcome").notNull(), // 'a_win' | 'd_win' | 'draw'
    attackerRatingBefore: integer("attacker_rating_before").notNull(),
    defenderRatingBefore: integer("defender_rating_before").notNull(),
    attackerRatingAfter: integer("attacker_rating_after").notNull(),
    defenderRatingAfter: integer("defender_rating_after").notNull(),
    log: jsonb("log").notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // 본인 매치 이력 — 최근 N개. attacker / defender 양쪽 모두 인덱스 필요.
    index("pvp_matches_attacker_idx").on(t.attackerId, t.createdAt),
    index("pvp_matches_defender_idx").on(t.defenderId, t.createdAt),
    // outcome / status 별 검색은 빈번도 낮아 별도 인덱스 X.
    check(
      "pvp_matches_outcome_valid",
      sql`${t.outcome} IN ('a_win','d_win','draw')`,
    ),
  ],
);

// 길드 영지(Fiefdom) — 별빛 권역의 길드 단위 비대칭 PvP 콘텐츠 (실험).
// 길드당 1행. state 는 FiefdomState 직렬화 그대로(빌딩/유닛/자원/영웅 등).
// guildId 가 PK 이자 FK — 길드 해체 시 cascade 로 같이 사라짐.
// shieldUntil: 마지막으로 공격 받은 시각 + 4시간. 그 사이엔 공격자가 POST /attack 시 410 거절.
//
// 본토 게임 UI 와는 분리 — /dev/fiefdom-live 라우트만 사용. 다른 라우트/스크린은 이 테이블을
// 일체 참조하지 않으며, 일반 유저 경험에 노출되지 않는다.
export const fiefdoms = pgTable("fiefdoms", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  state: jsonb("state").notNull(),
  shieldUntil: timestamp("shield_until"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// v2 거점 점령 상태. row 가 있으면 점령된 거점, 없으면 NPC 운영(비점령).
// outpostId = data/v2/outposts.ts 의 Outpost.id (코드 정적 데이터라 FK X).
// occupiedByUserId/Guild — 둘 다 nullable. 솔로 점령은 user 만, 길드 점령은 guild 만.
// policy/taxRate — 점령자가 설정. 입장 정책 + 사냥 골드 세금.
export const outpostOccupations = pgTable(
  "outpost_occupations",
  {
    outpostId: text("outpost_id").primaryKey(),
    occupiedByUserId: text("occupied_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    occupiedByGuildId: integer("occupied_by_guild_id").references(
      () => guilds.id,
      { onDelete: "set null" },
    ),
    occupiedAt: timestamp("occupied_at").defaultNow().notNull(),
    policy: text("policy").notNull().default("open"),
    // 0.000 ~ 1.000. open 정책에서 거점 사냥 골드의 % 점령자 징수.
    taxRate: numeric("tax_rate", { precision: 4, scale: 3 })
      .notNull()
      .default("0"),
    // 자원 산출 lazy 계산 anchor. 수확 시 갱신. 광산만 의미 있음.
    lastHarvestedAt: timestamp("last_harvested_at").defaultNow().notNull(),
    // 다음 NPC 정기 공격 예정 시각. 점령 시 tier 기반 interval 으로 설정.
    // cron 또는 lazy 평가가 nextAttackAt < now 인 거점들을 처리.
    nextAttackAt: timestamp("next_attack_at").defaultNow().notNull(),
  },
  (t) => [
    // cron 의 due 검색 효율 (WHERE next_attack_at <= now AND occupied_by_user_id IS NOT NULL).
    index("outpost_occupations_next_attack_at_idx").on(t.nextAttackAt),
  ],
);

// v2 거점 금고 — 미점령(NPC 운영) 거점에 누적된 NPC 세금.
// 점령자가 없는 거점에서 사냥 시 15% 가 여기 쌓인다. 추후 전쟁 보상으로 사용 예정.
// outpostId = data/v2/outposts.ts 의 Outpost.id (FK X, 정적 데이터).
export const outpostTreasury = pgTable("outpost_treasury", {
  outpostId: text("outpost_id").primaryKey(),
  gold: integer("gold").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// v2 거점 점령 시도 기록 (성공/실패 모두). claim attempt log — 분석/표시용.
// 1대1 일기토 결과 1행. 길드 3:3 토너먼트는 3행 (라운드 별).
export const outpostClaimAttempts = pgTable(
  "outpost_claim_attempts",
  {
    id: serial("id").primaryKey(),
    outpostId: text("outpost_id").notNull(),
    // 공격자가 user 면 user.id, NPC 정기 공격이면 null.
    attackerUserId: text("attacker_user_id").references(() => users.id, {
      onDelete: "cascade",
    }),
    // 공격측 길드 (솔로면 null).
    attackerGuildId: integer("attacker_guild_id").references(() => guilds.id, {
      onDelete: "set null",
    }),
    // 수비자 표기 — 일반 claim 시 NPC 챔피언 이름, NPC 공격 시 점령자(영웅) 이름.
    defenderName: text("defender_name").notNull(),
    defenderUserId: text("defender_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    won: boolean("won").notNull(),
    turns: integer("turns").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("outpost_claim_attempts_outpost_idx").on(t.outpostId, t.createdAt),
    index("outpost_claim_attempts_attacker_idx").on(t.attackerUserId, t.createdAt),
  ],
);

// v2 길드 공용 자원 풀 — 길드별 stone/병사. 라이브에서는 마스터 개인 saves_kv 의
// v2-resources 였으나 길드전 컨셉 정합 위해 길드 자원으로 통일.
// 1인 길드도 같은 테이블 — 마스터 = 본인 자원.
export const v2GuildResources = pgTable("v2_guild_resources", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  stone: integer("stone").notNull().default(0),
  soldiers: integer("soldiers").notNull().default(0),
  // 주문서 — 마탑(tower) 거점에서 산출. claim 시 1 소비하면 본 전쟁 power +20%.
  scrolls: integer("scrolls").notNull().default(0),
  // v2 PR-6 — 활성화된 주문서 만료 시점. null = 비활성. 활성 시 길드원의 토너먼트/
  // 본 병사 전쟁에 buff (atk +10%). claim 시 단발 소비(PR #57)와 별개 메커닉.
  activeScrollExpiresAt: timestamp("active_scroll_expires_at"),
  // 거점 세금 회수 시 90% 가 누적되는 길드 공용 골드 풀. 회수자 본인 10% 와 별개.
  gold: integer("gold").notNull().default(0),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// v2 길드 3:3 토너먼트 라인업 — 길드별 (마스터 설정).
// memberUserIds: 1~3명, 순서대로 1번 / 2번 / 3번. 길드원만 가능.
// 미설정 길드는 row 없음 → 토너먼트 sim 시 default = 마스터 1명.
export const v2GuildLineups = pgTable("v2_guild_lineups", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  memberUserIds: text("member_user_ids").array().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 공격 감사 로그. 누가 누구를 언제 공격했고 결과/약탈 얼만큼 나갔는지.
// won=true 면 lootGold/Wood/Food 가 실제 공격자에게 이전된 양 (cap 20% 적용 후).
// 패배는 0/0/0. defender 측은 raid 알림에서 이 row 를 읽어 표시.
export const fiefdomRaids = pgTable(
  "fiefdom_raids",
  {
    id: serial("id").primaryKey(),
    attackerGuildId: integer("attacker_guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    defenderGuildId: integer("defender_guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    initiatorUserId: text("initiator_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    won: boolean("won").notNull(),
    lootGold: integer("loot_gold").notNull().default(0),
    lootWood: integer("loot_wood").notNull().default(0),
    lootFood: integer("loot_food").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // 본인 길드 raid 이력 (양방향) — 최근 N개.
    index("fiefdom_raids_defender_idx").on(t.defenderGuildId, t.createdAt),
    index("fiefdom_raids_attacker_idx").on(t.attackerGuildId, t.createdAt),
  ],
);

// 낚시 주간 기록 — (userId, seasonId, fishId) 당 개인 최대어 1행. 종별 주간 리더보드의 원천.
// seasonId 는 PvP 와 동일한 ISO 주차 키(월 00:00 KST 시작). 캐스팅 성공 시 더 크면 upsert.
// 시즌 라이프사이클 테이블 + 코인 정산은 후속(PR-5) — 여기선 seasonId 를 순수 계산해 박는다.
export const fishingRecords = pgTable(
  "fishing_records",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    seasonId: text("season_id").notNull(),
    fishId: text("fish_id").notNull(),
    // 길이(cm). 0.1 단위라 부동소수 — 순위/비교는 사이즈 내림차순.
    bestSize: doublePrecision("best_size").notNull(),
    caughtAt: timestamp("caught_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.seasonId, t.fishId] }),
    // 종별 주간 순위 — 시즌·어종 묶어 사이즈 내림차순.
    index("fishing_records_leaderboard_idx").on(
      t.seasonId,
      t.fishId,
      sql`${t.bestSize} DESC`,
    ),
  ],
);

// 낚시 주간 시즌 정산 마커 — 종별 순위 코인 지급의 멱등성(시즌당 1회). id 는 ISO 주차.
// 시즌은 fishing_records.seasonId 로 순수 계산되므로 startAt/endAt 은 불필요 —
// 이 테이블의 유일한 역할은 rewardsGrantedAt 으로 중복 정산을 막는 것(+정산 요약).
export const fishingSeasons = pgTable("fishing_seasons", {
  id: text("id").primaryKey(),
  rewardsGrantedAt: timestamp("rewards_granted_at"),
  winners: integer("winners").notNull().default(0),
  totalCoins: integer("total_coins").notNull().default(0),
});

