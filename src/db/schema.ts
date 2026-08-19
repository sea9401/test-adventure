import { sql } from "drizzle-orm";
import type { CodexMasteryStage } from "@/adventure/data/v2/codexMasteryTypes";
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
  bigint,
  check,
  numeric,
  doublePrecision,
  foreignKey,
  type AnyPgColumn,
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
    // 제재(밴/정지) enforcement 의 비정규화 필드 — 전체 이력은 user_sanctions 테이블.
    //   null            = 정상
    //   미래 timestamp   = 그 시각까지 차단 (영구 밴은 먼 미래로 세팅)
    // ensureUser 가 매 API 호출에서 PK 읽기로 검사 → 차단 시 null 반환(=401).
    bannedUntil: timestamp("banned_until"),
    banReason: text("ban_reason"),
    // 거래 제재는 계정 제재와 독립적으로 경제 활동만 제한한다.
    tradeSuspendedUntil: timestamp("trade_suspended_until"),
    tradeSuspensionReason: text("trade_suspension_reason"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    // 대소문자 무시 unique. NULL 은 자유롭게 허용 (기존 유저 호환).
    uniqueIndex("users_game_name_lower_idx").on(sql`lower(${t.gameName})`),
  ],
);

// Auth.js 연동 계정 — OAuth 공급자(Google/Kakao)와 users.id 매핑.
// 공급자 이메일만으로 자동 병합하지 않는다. 로그인한 사용자가 명시적으로 시작한
// account_link_intents 를 소비한 경우에만 다른 공급자를 연결한다.
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

// 카카오 이용이 어려운 해외 이용자에게 운영자가 개별 발급하는 로그인 계정.
// 비밀번호 원문은 저장하지 않고 versioned scrypt 해시만 보관한다. login_id 는 표시용,
// normalized_login_id 는 대소문자를 무시한 로그인과 중복 방지의 권위 컬럼이다.
export const passwordCredentials = pgTable(
  "password_credentials",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    loginId: text("login_id").notNull(),
    normalizedLoginId: text("normalized_login_id").notNull(),
    passwordHash: text("password_hash").notNull(),
    disabledAt: timestamp("disabled_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("password_credentials_normalized_login_id_idx").on(
      t.normalizedLoginId,
    ),
  ],
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

// OAuth 계정 연결 의도. 브라우저에는 원문 random token 만 두고 DB에는 SHA-256 hash만
// 저장한다. OAuth callback에서 행을 DELETE ... RETURNING 으로 소비하므로 재사용할 수 없다.
export const accountLinkIntents = pgTable(
  "account_link_intents",
  {
    tokenHash: text("token_hash").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: text("provider").notNull(),
    expiresAt: timestamp("expires_at", { mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    check(
      "account_link_intents_provider_check",
      sql`${t.provider} in ('google', 'kakao')`,
    ),
    index("account_link_intents_expires_idx").on(t.expiresAt),
    index("account_link_intents_user_provider_idx").on(t.userId, t.provider),
  ],
);

// 개인 홍보 링크. 코드는 URL에 노출되는 임의 64-bit hex 값이며 사용자당 하나만 발급한다.
// disabledAt 이 박히면 기존 링크 유입만 중단되고 이미 완료된 홍보 실적은 보존된다.
// 홍보 보상 중복 방지용 로그인 주체 원장. OAuth provider account ID 또는 운영자 계정
// login ID의 원문은 저장하지 않고, 별도 운영 비밀키로 만든 HMAC-SHA-256만 보존한다.
// users FK를 두지 않아 탈퇴·재가입으로 user id가 바뀌어도 같은 로그인 주체를 식별한다.
export const referralRewardIdentities = pgTable(
  "referral_reward_identities",
  {
    identityHash: text("identity_hash").primaryKey(),
    claimedAt: timestamp("claimed_at").defaultNow().notNull(),
  },
);

export const referralCodes = pgTable(
  "referral_codes",
  {
    code: text("code").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    disabledAt: timestamp("disabled_at"),
  },
  (t) => [uniqueIndex("referral_codes_user_idx").on(t.userId)],
);

// 홍보 링크를 통해 신규 캐릭터가 귀속된 기록. 활성 referredUserId UNIQUE가 한 사용자
// ID의 중복 귀속을 막고, 별도 로그인 주체 원장이 탈퇴·재가입 중복을 막는다. 탈퇴 시
// referredUserId는 NULL로 분리하고 이름을 익명화해 추천인의 실적·보상 이력은 보존한다.
// rewardGold/rewardedDepth는 과거 골드 보상 감사 기록으로 보존하고,
// 현재 회복약 보상은 referrerSignupRewardedAt과 completedTutorialTaskIds로 지급 여부를
// 기록한다. rewardedStaminaDepth는 과거 깊이 보상 감사값으로만 보존한다.
// 가입 보상은 귀속 트랜잭션에서 함께 지급하며, 과거 귀속은 NULL로 남긴다.
export const referralConversions = pgTable(
  "referral_conversions",
  {
    id: serial("id").primaryKey(),
    referredUserId: text("referred_user_id")
      .unique()
      .references(() => users.id, { onDelete: "set null" }),
    referrerUserId: text("referrer_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    referralCode: text("referral_code")
      .notNull()
      .references(() => referralCodes.code, { onDelete: "cascade" }),
    referredName: text("referred_name").notNull(),
    referredDeletedAt: timestamp("referred_deleted_at"),
    rewardGold: integer("reward_gold").default(0).notNull(),
    rewardedDepth: integer("rewarded_depth").default(0).notNull(),
    referrerSignupRewardedAt: timestamp("referrer_signup_rewarded_at"),
    rewardedStaminaDepth: integer("rewarded_stamina_depth").default(0).notNull(),
    completedTutorialTaskIds: text("completed_tutorial_task_ids")
      .array()
      .default(sql`ARRAY[]::text[]`)
      .notNull(),
    convertedAt: timestamp("converted_at").defaultNow().notNull(),
  },
  (t) => [
    index("referral_conversions_referrer_created_idx").on(
      t.referrerUserId,
      t.convertedAt,
    ),
    check(
      "referral_conversions_not_self_check",
      sql`${t.referredUserId} <> ${t.referrerUserId}`,
    ),
    check("referral_conversions_reward_nonnegative_check", sql`${t.rewardGold} >= 0`),
    check(
      "referral_conversions_rewarded_depth_check",
      sql`${t.rewardedDepth} in (0, 12, 24, 36)`,
    ),
    check(
      "referral_conversions_rewarded_stamina_depth_check",
      sql`${t.rewardedStaminaDepth} in (0, 6, 12, 18, 24, 36)`,
    ),
    check(
      "referral_conversions_tutorial_tasks_check",
      sql`${t.completedTutorialTaskIds} <@ ARRAY['hunt_depth_24', 'join_guild', 'life_level_5', 'hunt_depth_36', 'life_level_10']::text[] AND cardinality(${t.completedTutorialTaskIds}) <= 5`,
    ),
  ],
);

// 게임 진행 상태는 키별로 분리 저장. localStorage 패턴과 동일.
// 새 키 추가 시 마이그레이션 없이 행만 추가.
// version — 낙관적 동시성 제어. 매 write 마다 증가. PATCH 시 클라이언트가 expectedVersion 을
// 함께 보내고 서버가 일치할 때만 업데이트 (불일치 = 409, 다른 탭/기기에서 쓰기가 있었음).
// ⚠️ 수동 expression index(0053): saves_kv ((value->'lastHuntedOutpost'->>'outpostId'))
//   WHERE key='character.v2' AND ... IS NOT NULL — 침입자 추적 JSON path 조회용.
//   drizzle 스키마로 표현 못 해 custom migration 으로 관리(드랍/변경 시 0053 참조).
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

// 묶음 전투 결과(일괄 사냥·아레나 기록)의 전체 리플레이를 본문 세이브와 분리해 보관한다.
// 목록/결과 응답에는 id가 포함된 가벼운 ReplayPayload만 싣고, 사용자가 실제로 다시보기를
// 열 때 단건 조회한다. expiresAt 이후 행은 ops-retention cron이 삭제한다.
export const battleReplays = pgTable(
  "battle_replays",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    payload: jsonb("payload").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("battle_replays_user_created_idx").on(t.userId, t.createdAt),
    index("battle_replays_expires_idx").on(t.expiresAt),
  ],
);

// 광장 게시판 글. 영구 보관 — cleanup cron 없음 (자동 삭제 정책 제거됨).
// guildId NULL = 공개 글, 값 있음 = 해당 길드원만 볼 수 있는 길드 전용 글.
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
    guildId: integer("guild_id").references(() => guilds.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    className: text("class_name").notNull(),
    category: text("category").notNull().default("free"),
    title: text("title"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // 작성자 수정 시각 — 미수정 글은 NULL. UI 의 "(수정됨)" 표기 근거.
    updatedAt: timestamp("updated_at"),
  },
  (t) => [
    index("bulletin_posts_created_at_idx").on(t.createdAt),
    // POST 의 rate-limit 조회("내 마지막 글" lookup) 가 매번 userId 로 seqscan+sort 했었다.
    index("bulletin_posts_user_created_at_idx").on(t.userId, t.createdAt),
    // 카테고리 탭별 최신순 조회 — (category, createdAt DESC).
    index("bulletin_posts_category_created_at_idx").on(t.category, t.createdAt),
    // 길드 전용 게시판 최신순 조회.
    index("bulletin_posts_guild_created_at_idx").on(t.guildId, t.createdAt),
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

// 게시판 조회 — (postId, userId) composite PK 로 1유저 1조회(고유 조회수).
// 같은 유저 재방문은 onConflictDoNothing 으로 흡수. 카운트는 매 조회마다 COUNT 집계.
export const bulletinViews = pgTable(
  "bulletin_views",
  {
    postId: integer("post_id")
      .notNull()
      .references(() => bulletinPosts.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.postId, t.userId] })],
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
    // 한 단계 답글. 원댓글 삭제 시 그 아래 답글도 함께 정리한다.
    parentId: integer("parent_id").references(
      (): AnyPgColumn => bulletinComments.id,
      { onDelete: "cascade" },
    ),
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
    // 원댓글별 답글 조회·cascade 삭제 보조.
    index("bulletin_comments_parent_id_idx").on(t.parentId),
  ],
);

// 사용자 채팅방. visibility='private' 가 기본이며 공개방만 둘러보기에서 노출된다.
// ownerId 삭제 시 방과 멤버·초대·메시지가 모두 cascade 로 정리된다.
export const chatRooms = pgTable(
  "chat_rooms",
  {
    id: serial("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    visibility: text("visibility").notNull().default("private"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("chat_rooms_visibility_created_idx").on(t.visibility, t.createdAt),
    index("chat_rooms_owner_idx").on(t.ownerId),
    check(
      "chat_rooms_visibility_check",
      sql`${t.visibility} in ('public', 'private')`,
    ),
    check(
      "chat_rooms_name_length_check",
      sql`char_length(${t.name}) between 2 and 24`,
    ),
  ],
);

// 채팅방 참여자. owner/member 역할은 방 관리 권한과 나가기 정책에 사용한다.
export const chatRoomMembers = pgTable(
  "chat_room_members",
  {
    roomId: integer("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull().default("member"),
    joinedAt: timestamp("joined_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roomId, t.userId] }),
    index("chat_room_members_user_joined_idx").on(t.userId, t.joinedAt),
    check("chat_room_members_role_check", sql`${t.role} in ('owner', 'member')`),
  ],
);

// 비공개 채팅방 초대. 공개방도 소유자가 직접 초대할 수 있으나 참여는 초대 없이 가능하다.
// 동일 방·수신자의 pending 초대는 하나만 유지하며 7일 뒤 만료로 취급한다.
export const chatRoomInvites = pgTable(
  "chat_room_invites",
  {
    id: serial("id").primaryKey(),
    roomId: integer("room_id")
      .notNull()
      .references(() => chatRooms.id, { onDelete: "cascade" }),
    fromUserId: text("from_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    toUserId: text("to_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: text("status").notNull().default("pending"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
  },
  (t) => [
    uniqueIndex("chat_room_invites_pending_unique_idx")
      .on(t.roomId, t.toUserId)
      .where(sql`${t.status} = 'pending'`),
    index("chat_room_invites_recipient_idx")
      .on(t.toUserId, t.createdAt)
      .where(sql`${t.status} = 'pending'`),
    check(
      "chat_room_invites_status_check",
      sql`${t.status} in ('pending', 'accepted', 'declined', 'expired')`,
    ),
  ],
);

// 채팅 메시지. channel='global' 은 전체 채팅, channel='trade' 는 거래 채팅,
// channel='guild' 는 guildId 길드원 전용, channel='room' 은 roomId 참여자 전용이다.
// 3일 후 cron 으로 일괄 삭제.
// name/className/title 은 전송 시점 스냅샷 — 이후 사용자가 바뀌어도 과거 메시지는 그대로.
// title 은 미장착 시 NULL.
export const messages = pgTable(
  "messages",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channel: text("channel").notNull().default("global"),
    guildId: integer("guild_id").references(() => guilds.id, {
      onDelete: "cascade",
    }),
    roomId: integer("room_id").references(() => chatRooms.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    className: text("class_name").notNull(),
    title: text("title"),
    content: text("content").notNull(),
    // 채팅에 첨부한 장비의 전송 시점 공개 스냅샷. 서버가 보유 iid를 검증해 만든다.
    itemLink: jsonb("item_link"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("messages_created_at_idx").on(t.createdAt),
    index("messages_channel_created_at_idx").on(t.channel, t.createdAt),
    index("messages_guild_created_at_idx").on(t.guildId, t.createdAt),
    index("messages_room_created_at_idx").on(t.roomId, t.createdAt),
    // POST 의 rate-limit 조회용 — userId 로 본인 마지막 메시지 시각.
    index("messages_user_created_at_idx").on(t.userId, t.createdAt),
    check(
      "messages_channel_scope_check",
      sql`(${t.channel} IN ('global', 'trade') AND ${t.guildId} IS NULL AND ${t.roomId} IS NULL) OR (${t.channel} = 'guild' AND ${t.guildId} IS NOT NULL AND ${t.roomId} IS NULL) OR (${t.channel} = 'room' AND ${t.guildId} IS NULL AND ${t.roomId} IS NOT NULL)`,
    ),
  ],
);

// 유저 건의사항/불편 신고 — 설정 메뉴의 "건의사항" 창구에서 접수한다.
// 운영 처리는 DB/Admin 조회로 이어가며, 유저가 보낸 원문과 당시 표시 이름을 보존한다.
export const feedbackReports = pgTable(
  "feedback_reports",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    actorName: text("actor_name").notNull(),
    category: text("category").notNull().default("suggestion"),
    content: text("content").notNull(),
    imageKey: text("image_key"),
    path: text("path"),
    status: text("status").notNull().default("open"),
    adminNote: text("admin_note"),
    adminReply: text("admin_reply"),
    reviewedAt: timestamp("reviewed_at"),
    repliedAt: timestamp("replied_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at"),
  },
  (t) => [
    index("feedback_reports_user_created_idx").on(t.userId, t.createdAt),
    index("feedback_reports_status_created_idx").on(t.status, sql`${t.id} DESC`),
  ],
);

// 사용자 제작 콘텐츠(게시글·댓글·채팅) 신고. 원본 콘텐츠는 삭제되거나 채팅 보존
// 기간이 지나도 운영자가 판단할 수 있도록 접수 시점의 표시 이름과 내용을 보존한다.
// 계정 삭제 시 신고자/대상 UUID만 익명화하고 신고 기록 자체는 운영 감사용으로 남긴다.
export const ugcReports = pgTable(
  "ugc_reports",
  {
    id: serial("id").primaryKey(),
    reporterUserId: text("reporter_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reporterName: text("reporter_name").notNull(),
    // content = 해당 콘텐츠 자체 신고, user = 콘텐츠 작성자 신고.
    subjectType: text("subject_type").notNull(),
    sourceType: text("source_type").notNull(),
    // 숫자 PK 콘텐츠와 UUID/이름 기반 프로필을 같은 신고 흐름에서 참조한다.
    sourceId: text("source_id").notNull(),
    targetUserId: text("target_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    targetName: text("target_name").notNull(),
    reason: text("reason").notNull(),
    details: text("details"),
    contentSnapshot: text("content_snapshot").notNull(),
    contextSnapshot: jsonb("context_snapshot")
      .$type<Record<string, unknown>>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    status: text("status").notNull().default("open"),
    adminNote: text("admin_note"),
    resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    reviewedAt: timestamp("reviewed_at"),
    resolvedAt: timestamp("resolved_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("ugc_reports_status_created_idx").on(t.status, t.createdAt),
    index("ugc_reports_target_user_created_idx").on(
      t.targetUserId,
      t.createdAt,
    ),
    index("ugc_reports_reporter_created_idx").on(
      t.reporterUserId,
      t.createdAt,
    ),
    uniqueIndex("ugc_reports_active_duplicate_idx")
      .on(t.reporterUserId, t.subjectType, t.sourceType, t.sourceId)
      .where(sql`${t.status} IN ('open', 'reviewing')`),
    check(
      "ugc_reports_subject_type_check",
      sql`${t.subjectType} IN ('content', 'user')`,
    ),
    check(
      "ugc_reports_source_type_check",
      sql`${t.sourceType} IN ('bulletin_post', 'bulletin_comment', 'chat_message', 'inbox_message', 'profile', 'guild_profile', 'chat_room', 'marketplace_trade')`,
    ),
    check(
      "ugc_reports_reason_check",
      sql`${t.reason} IN ('harassment', 'hate', 'sexual', 'violence', 'spam', 'fraud', 'personal_info', 'abnormal_price', 'market_manipulation', 'real_money_trade', 'other')`,
    ),
    check(
      "ugc_reports_status_check",
      sql`${t.status} IN ('open', 'reviewing', 'resolved', 'dismissed')`,
    ),
    check(
      "ugc_reports_details_length_check",
      sql`${t.details} IS NULL OR char_length(${t.details}) <= 500`,
    ),
  ],
);

// 사용자 차단은 단방향이다. blocker가 보는 UGC에서 blocked 작성자의 콘텐츠를 숨기고,
// 두 사용자 사이의 새 쪽지와 채팅방 초대도 서버에서 거절한다.
export const userBlocks = pgTable(
  "user_blocks",
  {
    blockerUserId: text("blocker_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedUserId: text("blocked_user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    blockedName: text("blocked_name").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.blockerUserId, t.blockedUserId] }),
    index("user_blocks_blocked_user_idx").on(t.blockedUserId, t.createdAt),
    check(
      "user_blocks_not_self_check",
      sql`${t.blockerUserId} <> ${t.blockedUserId}`,
    ),
  ],
);

// UGC 약관은 버전별로 명시적 동의를 보존한다. 정책 내용이 실질적으로 바뀌면
// 애플리케이션의 UGC_POLICY_VERSION을 올려 기존 사용자에게 다시 동의를 받는다.
export const ugcPolicyConsents = pgTable(
  "ugc_policy_consents",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    version: text("version").notNull(),
    acceptedAt: timestamp("accepted_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.version] })],
);

// R2 객체 삭제 재시도 큐. 회원 탈퇴처럼 DB 행이 먼저 사라지는 흐름에서 외부 저장소가
// 일시 실패해도 삭제 대상을 잃지 않도록, 같은 트랜잭션에 target 을 남긴다.
// kind 별 target: profile_user=user UUID, feedback_image=객체 키, guild=길드 id 문자열.
export const storageDeletionQueue = pgTable(
  "storage_deletion_queue",
  {
    id: serial("id").primaryKey(),
    kind: text("kind").notNull(),
    target: text("target").notNull(),
    attempts: integer("attempts").notNull().default(0),
    lastError: text("last_error"),
    lastAttemptAt: timestamp("last_attempt_at", { mode: "date" }),
    nextAttemptAt: timestamp("next_attempt_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    createdAt: timestamp("created_at", { mode: "date" })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    uniqueIndex("storage_deletion_queue_kind_target_idx").on(t.kind, t.target),
    index("storage_deletion_queue_next_attempt_idx").on(t.nextAttemptAt),
    check(
      "storage_deletion_queue_kind_check",
      sql`${t.kind} in ('profile_user', 'feedback_image', 'guild')`,
    ),
  ],
);

// 전체 소식 (서버 피드) — 서버 전체에 흘러가는 "자랑거리" 한 줄 (유실된 명품 획득, 걸작 제작 성공 등).
// 글로벌 채팅과 분리 — 대화용 vs 전광판용. 모험탭 하단 패널에서 최근 N개만 노출.
// append-only — insert 시 보관기간(FEED_RETENTION_MS=약 6개월) 지난 행을 잘라낸다 (cron 없음).
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
// item_kind: 'equip' | 'material' | 'consumable' — 인벤토리 카테고리 매핑.
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
//   buy_order_equipment:{ order_id, item_id, instance_payload }                     — 장비 구매 주문 체결
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
    readAt: timestamp("read_at"),
    claimedAt: timestamp("claimed_at"),
  },
  (t) => [
    // 미확인 우편 — 상단 배지와 받은 우편 강조 조회.
    index("inbox_unread_idx")
      .on(t.userId, t.createdAt)
      .where(sql`${t.readAt} IS NULL`),
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

// 정식 오픈·이벤트용 1회성 쿠폰 캠페인. reward 는 admin_gift 우편 payload 와 같은
// 형태로 저장해 쿠폰 입력 시 우편함에 안전하게 적재하고, 실제 자원 반영은 기존 claim
// 트랜잭션이 담당한다. 코드는 평문을 저장하지 않고 SHA-256 hash 만 보관한다.
export const couponCampaigns = pgTable(
  "coupon_campaigns",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    reward: jsonb("reward").notNull(),
    message: text("message"),
    startsAt: timestamp("starts_at", { mode: "date" }).notNull(),
    // NULL이면 만료 없음. 정식 오픈 감사 쿠폰처럼 시작 시각만 필요한 캠페인을 지원한다.
    endsAt: timestamp("ends_at", { mode: "date" }),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("coupon_campaigns_slug_idx").on(t.slug),
    check(
      "coupon_campaigns_period_check",
      sql`${t.endsAt} IS NULL OR ${t.endsAt} > ${t.startsAt}`,
    ),
  ],
);

// issuedForUserId 는 발급 대상 감사·재실행 멱등성용이고, restrictedUserId 는 실제 사용
// 계정 제한용이다. 정식 오픈 때 계정을 초기화한다면 발급 스크립트의 --transferable 로
// restrictedUserId 만 NULL 로 두되 issuedForUserId 는 유지할 수 있다.
export const couponCodes = pgTable(
  "coupon_codes",
  {
    id: serial("id").primaryKey(),
    campaignId: integer("campaign_id")
      .notNull()
      .references(() => couponCampaigns.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    codeSuffix: text("code_suffix").notNull(),
    issuedForUserId: text("issued_for_user_id"),
    restrictedUserId: text("restricted_user_id"),
    redeemedByUserId: text("redeemed_by_user_id"),
    redeemedAt: timestamp("redeemed_at", { mode: "date" }),
    createdAt: timestamp("created_at", { mode: "date" }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("coupon_codes_hash_idx").on(t.codeHash),
    uniqueIndex("coupon_codes_campaign_issued_user_idx")
      .on(t.campaignId, t.issuedForUserId)
      .where(sql`${t.issuedForUserId} IS NOT NULL`),
    index("coupon_codes_campaign_redeemed_idx").on(t.campaignId, t.redeemedAt),
    check(
      "coupon_codes_redeemed_pair_check",
      sql`(${t.redeemedAt} IS NULL AND ${t.redeemedByUserId} IS NULL) OR (${t.redeemedAt} IS NOT NULL AND ${t.redeemedByUserId} IS NOT NULL)`,
    ),
  ],
);

// v2 거래소 listing — V1 marketplaceListings(grade c±N/dN, V1 인벤 모델)와 별개 신규 테이블.
//   v2 장비는 개체(instance) 모델({iid,id,roll})·재료는 스택(charSave.materials). grade 개념 없음.
// kind:  'equip'(장비 개체, quantity=1) | 'material'(재료 스택, quantity=N).
// itemId: V2EquipmentId | V2MaterialId. itemName/sellerName 은 등록 시점 스냅샷.
// price:  정수 골드 — listing 전체 가격(단가 아님). 성사 시 판매세 차감분만 판매자에 정산(우편).
// instancePayload: equip 인스턴스 roll 스냅샷(V2EquipRoll, iid 제외) — 구매 시 새 개체로 복원. material=null.
// status: active→sold|cancelled|expired (활성/종료 모두 보관, 감사).
// 에스크로: 등록 시 판매자 save 에서 빠져 이 행으로 묶임 → 구매=구매자 save 합류, 취소=판매자 반환.
export const marketplaceListingsV2 = pgTable(
  "marketplace_listings_v2",
  {
    id: serial("id").primaryKey(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    sellerName: text("seller_name").notNull(),
    kind: text("kind").notNull(), // 'equip' | 'material' | 'consumable'(레어맵·음식 등)
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    quantity: integer("quantity").notNull(),
    price: integer("price").notNull(),
    instancePayload: jsonb("instance_payload"),
    status: text("status").notNull().default("active"), // 'active'|'sold'|'cancelled'
    createdAt: timestamp("created_at").defaultNow().notNull(),
    bidEndsAt: timestamp("bid_ends_at").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    highestBid: integer("highest_bid"),
    highestBidderId: text("highest_bidder_id").references(() => users.id, {
      onDelete: "set null",
    }),
    bidCount: integer("bid_count").notNull().default(0),
    bidResolvedAt: timestamp("bid_resolved_at"),
    closedAt: timestamp("closed_at"),
    buyerId: text("buyer_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    // 활성 매물 둘러보기(종류·최신순).
    index("listings_v2_browse_idx")
      .on(t.kind, t.createdAt)
      .where(sql`${t.status} = 'active'`),
    // 내 매물 / 슬롯 카운트.
    index("listings_v2_seller_idx").on(t.sellerId, t.status, t.createdAt),
    // 최근 거래(체결 내역, closedAt desc) + 시세 집계 — status='sold' 부분 인덱스.
    index("listings_v2_sold_idx")
      .on(t.closedAt)
      .where(sql`${t.status} = 'sold'`),
    // 활성 최고 입찰의 입찰자별 정리와 잠금 조회.
    index("listings_v2_active_highest_bidder_idx")
      .on(t.highestBidderId, t.id)
      .where(sql`${t.status} = 'active' AND ${t.highestBidderId} IS NOT NULL`),
    check(
      "listings_v2_kind_valid",
      sql`${t.kind} IN ('equip','material','consumable')`,
    ),
    check(
      "listings_v2_status_valid",
      sql`${t.status} IN ('active','sold','cancelled','expired')`,
    ),
    check("listings_v2_qty_pos", sql`${t.quantity} > 0`),
    check("listings_v2_price_pos", sql`${t.price} > 0`),
    check("listings_v2_bid_count_nonneg", sql`${t.bidCount} >= 0`),
    check(
      "listings_v2_bid_pair_check",
      sql`(${t.highestBid} IS NULL AND ${t.highestBidderId} IS NULL) OR (${t.highestBid} > 0 AND ${t.highestBidderId} IS NOT NULL)`,
    ),
    check("listings_v2_time_order_check", sql`${t.expiresAt} > ${t.bidEndsAt}`),
  ],
);

// 공개 입찰 이력. bidder_id는 서버 감사·에스크로 정산에만 사용하고 공개 API에는 내보내지 않는다.
// 금액·시각은 공개되며, listing 행의 highest_bid/highest_bidder_id가 현재 선두의 권위 캐시다.
export const marketplaceBidsV2 = pgTable(
  "marketplace_bids_v2",
  {
    id: serial("id").primaryKey(),
    listingId: integer("listing_id")
      .notNull()
      .references(() => marketplaceListingsV2.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("marketplace_bids_v2_listing_created_idx").on(
      t.listingId,
      t.createdAt,
    ),
    index("marketplace_bids_v2_bidder_created_idx").on(
      t.bidderId,
      t.createdAt,
    ),
    check("marketplace_bids_v2_amount_pos", sql`${t.amount} > 0`),
  ],
);

// v2 스택 품목 구매 주문 — 구매 골드를 미리 에스크로하고 판매 매물과 자동 체결한다.
// 잔여 수량·골드는 부분 체결마다 감소하며, 완료/취소/만료 시 감사 기록으로 보존한다.
export const marketplaceBuyOrdersV2 = pgTable(
  "marketplace_buy_orders_v2",
  {
    id: serial("id").primaryKey(),
    buyerId: text("buyer_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // equip | material | consumable(음식·거래 가능 캐시 아이템)
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    unitPrice: integer("unit_price").notNull(),
    quantityInitial: integer("quantity_initial").notNull(),
    quantityRemaining: integer("quantity_remaining").notNull(),
    goldEscrow: integer("gold_escrow").notNull(),
    // 장비 구매 주문 조건. 비장비 주문에서는 null이며 장비 주문은 quantity=1이다.
    minPower: integer("min_power"),
    minQualityPct: integer("min_quality_pct"),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    closedAt: timestamp("closed_at"),
  },
  (t) => [
    index("marketplace_buy_orders_v2_match_idx")
      .on(t.kind, t.itemId, t.unitPrice, t.createdAt)
      .where(sql`${t.status} = 'active'`),
    index("marketplace_buy_orders_v2_buyer_idx").on(
      t.buyerId,
      t.status,
      t.createdAt,
    ),
    check(
      "marketplace_buy_orders_v2_kind_valid",
      sql`${t.kind} IN ('equip','material','consumable')`,
    ),
    check(
      "marketplace_buy_orders_v2_status_valid",
      sql`${t.status} IN ('active','filled','cancelled','expired')`,
    ),
    check("marketplace_buy_orders_v2_unit_price_pos", sql`${t.unitPrice} > 0`),
    check("marketplace_buy_orders_v2_qty_initial_pos", sql`${t.quantityInitial} > 0`),
    check("marketplace_buy_orders_v2_qty_remaining_nonneg", sql`${t.quantityRemaining} >= 0`),
    check("marketplace_buy_orders_v2_escrow_nonneg", sql`${t.goldEscrow} >= 0`),
    check(
      "marketplace_buy_orders_v2_equip_criteria_valid",
      sql`(${t.kind} = 'equip' AND ${t.quantityInitial} = 1 AND ${t.minPower} IS NOT NULL AND ${t.minPower} >= 1 AND ${t.minQualityPct} IS NOT NULL AND ${t.minQualityPct} BETWEEN 0 AND 100) OR (${t.kind} <> 'equip' AND ${t.minPower} IS NULL AND ${t.minQualityPct} IS NULL)`,
    ),
    check("marketplace_buy_orders_v2_expires_after_create", sql`${t.expiresAt} > ${t.createdAt}`),
  ],
);

// 종료된 거래소 원본 행을 60일 뒤 정리하기 전에 남기는 일별 시세 집계.
// 원본 매물/입찰 JSON은 지워도 장기 시세 추이는 작은 고정 폭 행으로 유지한다.
export const marketplacePriceDaily = pgTable(
  "marketplace_price_daily",
  {
    dateKey: text("date_key").notNull(), // UTC YYYY-MM-DD
    kind: text("kind").notNull(),
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    trades: integer("trades").notNull().default(0),
    quantity: integer("quantity").notNull().default(0),
    grossGold: numeric("gross_gold", { precision: 30, scale: 0 })
      .notNull()
      .default("0"),
    minUnitPrice: integer("min_unit_price").notNull(),
    maxUnitPrice: integer("max_unit_price").notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.dateKey, t.kind, t.itemId] }),
    index("marketplace_price_daily_item_date_idx").on(
      t.kind,
      t.itemId,
      t.dateKey,
    ),
  ],
);

// 60일이 지난 체결 원본을 지운 뒤에도 '거래 경험' 같은 평생 신호가 사라지지 않도록
// 유저별 매수/매도 횟수만 압축 보존한다. 최근 60일은 원본 매물과 합쳐서 조회한다.
export const marketplaceUserTradeTotals = pgTable(
  "marketplace_user_trade_totals",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    purchases: integer("purchases").notNull().default(0),
    sales: integer("sales").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
);

// 지정 개당 가격 이하 매물이 생겼을 때 한 번 울리는 가격 알림.
export const marketplacePriceAlertsV2 = pgTable(
  "marketplace_price_alerts_v2",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    itemId: text("item_id").notNull(),
    itemName: text("item_name").notNull(),
    targetUnitPrice: integer("target_unit_price").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    triggeredAt: timestamp("triggered_at"),
  },
  (t) => [
    index("marketplace_price_alerts_v2_match_idx")
      .on(t.kind, t.itemId, t.targetUnitPrice)
      .where(sql`${t.status} = 'active'`),
    index("marketplace_price_alerts_v2_user_idx").on(
      t.userId,
      t.status,
      t.createdAt,
    ),
    uniqueIndex("marketplace_price_alerts_v2_user_item_active_idx")
      .on(t.userId, t.kind, t.itemId)
      .where(sql`${t.status} = 'active'`),
    check(
      "marketplace_price_alerts_v2_kind_valid",
      sql`${t.kind} IN ('material','consumable')`,
    ),
    check(
      "marketplace_price_alerts_v2_status_valid",
      sql`${t.status} IN ('active','triggered','cancelled')`,
    ),
    check("marketplace_price_alerts_v2_target_pos", sql`${t.targetUnitPrice} > 0`),
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

// 유저 자치 길드 — 명성·금고를 소비하는 수동 레벨별 정원, 마스터 초대제, 자동 해체 정책.
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
    // 길드 레벨 — 관리자가 사용 가능 명성+길드 금고 골드를 소비해 수동 승급.
    level: integer("level").notNull().default(1),
    // 누적 명성 — 영구 활동 지표. 길드 레벨과 무관하며 소비되지 않는다.
    fameTotal: integer("fame_total").notNull().default(0),
    // 사용 가능 명성 — 누적과 동일하게 시작, 길드 버프 업그레이드에 소비.
    fameAvailable: integer("fame_available").notNull().default(0),
    // 마스터가 자유롭게 적는 짧은 소개글. 최대 120자(앱단 검증). NULL = 미설정.
    description: text("description"),
    // 길드 엠블럼 — 서버가 생성한 Cloudflare R2 객체 키(guild-emblems/{guildId}/{uuid}.webp).
    // NULL/알 수 없는 값 = 커스텀 이미지 미설정(화면에 안전한 기본 엠블럼 표시).
    emblem: text("emblem"),
    // 길드 고유색 — 팔레트 키(guildColors 카탈로그). 활성 길드끼리 유니크(선착순). NULL = 미설정.
    color: text("color"),
    // 가입 신청을 받는지 — 마스터 토글. false 면 둘러보기에서 "신청" 비활성.
    acceptingRequests: boolean("accepting_requests").notNull().default(true),
    // 운영 검증용 길드. 실제 콘텐츠는 정상 이용하되 공개 길드 목록·길드 랭킹 집계에서 제외한다.
    // 이름(test 등)으로 판별하지 않고 명시적 플래그를 사용해 일반 길드 오탐을 막는다.
    isTest: boolean("is_test").notNull().default(false),
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
    // 국가 선포 — 대도시 등급 마을 보유 시 마스터가 1회 선포. NULL = 미선포.
    //   선포 시 길드가 성장(정원 +NATION_MEMBER_BONUS 등). 이름은 길드가 직접 짓는다.
    nationName: text("nation_name"),
    nationDeclaredAt: timestamp("nation_declared_at"),
  },
  (t) => [
    check("guilds_level_check", sql`${t.level} between 1 and 5`),
    uniqueIndex("guilds_name_lower_idx").on(sql`lower(${t.name})`),
    // 활성 길드끼리 색 중복 금지(선착순). 해산/미설정(NULL)은 제외 — 부분 유니크 인덱스.
    uniqueIndex("guilds_color_active_idx")
      .on(t.color)
      .where(sql`${t.disbandedAt} is null and ${t.color} is not null`),
  ],
);

// 길드 소속. 1인 1길드 — userId 유니크 인덱스로 enforce.
// role: 'master' | 'manager' | 'member'.
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

// 길드 창고 입출고 권한. 마스터·관리자는 이 표와 무관하게 항상 허용하고,
// 일반 길드원만 관리자가 명시적으로 권한을 부여한다. 길드 탈퇴 시 멤버 FK cascade로 자동 회수.
export const guildWarehousePermissions = pgTable(
  "guild_warehouse_permissions",
  {
    guildId: integer("guild_id").notNull(),
    userId: text("user_id").notNull(),
    grantedBy: text("granted_by").references(() => users.id, {
      onDelete: "set null",
    }),
    grantedAt: timestamp("granted_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.guildId, t.userId] }),
    foreignKey({
      columns: [t.guildId, t.userId],
      foreignColumns: [guildMembers.guildId, guildMembers.userId],
    }).onDelete("cascade"),
  ],
);

// 길드원 활동 내역 — 가입·역할 임명·금고 입금·국가 선포·창단 등. 길드 정보 탭에 최근 N건 표시.
//   이름은 저장 안 하고 userId 만(읽을 때 batch 해석 — 현재 닉네임 기준). meta=금액/역할/국가명.
export const guildActivityLog = pgTable(
  "guild_activity_log",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    // "member_join" | "role_change" | "gold_deposit" | "nation_declare" | "guild_create"
    type: text("type").notNull(),
    actorUserId: text("actor_user_id"),
    targetUserId: text("target_user_id"),
    meta: jsonb("meta"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("guild_activity_log_guild_created_idx").on(t.guildId, t.createdAt),
    index("guild_activity_log_actor_created_idx").on(
      t.actorUserId,
      t.createdAt,
    ),
  ],
);

// 길드 기여도 불변 원장. 활동 로그와 1:0..1로 연결해 동일 활동의 중복 적립을 막고,
// 점수 규칙이 바뀌어도 이미 획득한 주간·누적 점수는 다시 계산하지 않는다.
export const guildContributionEvents = pgTable(
  "guild_contribution_events",
  {
    id: serial("id").primaryKey(),
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    activityLogId: integer("activity_log_id")
      .notNull()
      .references(() => guildActivityLog.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    category: text("category").notNull(),
    points: integer("points").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("guild_contribution_events_activity_unique_idx").on(
      t.activityLogId,
    ),
    index("guild_contribution_events_guild_created_idx").on(
      t.guildId,
      t.createdAt,
    ),
    index("guild_contribution_events_guild_user_created_idx").on(
      t.guildId,
      t.userId,
      t.createdAt,
    ),
    check("guild_contribution_events_points_positive", sql`${t.points} > 0`),
  ],
);

// 길드 활동 원본은 길드당 최근 500건만 보관한다. 잘려 나간 활동의 업적 횟수·기여 점수·
// 입금액은 source/category 단위로 압축해 누적 및 월별 통계가 계속 유지되게 한다.
// periodKey: 'lifetime' | UTC 'YYYY-MM'. 원본에 actor가 없는 시스템 활동은 집계하지 않는다.
export const guildActivityRollups = pgTable(
  "guild_activity_rollups",
  {
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    source: text("source").notNull(),
    category: text("category").notNull().default(""),
    periodKey: text("period_key").notNull(),
    eventCount: integer("event_count").notNull().default(0),
    contributionPoints: numeric("contribution_points", {
      precision: 30,
      scale: 0,
    })
      .notNull()
      .default("0"),
    goldAmount: numeric("gold_amount", { precision: 30, scale: 0 })
      .notNull()
      .default("0"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({
      columns: [t.guildId, t.userId, t.source, t.category, t.periodKey],
    }),
    index("guild_activity_rollups_guild_period_idx").on(
      t.guildId,
      t.periodKey,
    ),
    index("guild_activity_rollups_user_period_idx").on(
      t.userId,
      t.periodKey,
    ),
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

// (옛 guild_quest_instances 테이블 — 길드 의뢰 시스템 제거로 삭제. drizzle 0070 migration.)

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
    // v2 협동 보스 — 소환자 표시명 스냅샷(같은 종류 동시 다수 소환 시 인스턴스 구분 라벨).
    // v1 시간 리젠 보스/기존 행은 NULL.
    summonedByName: text("summoned_by_name"),
    // 코어루프 협동보스 리워크 — 소환자 식별(비공개 가시성) + 소환 시점 길드(길드 가시성).
    // 기존 행/v1 은 NULL(가시성 public 폴백). 공격 권한·목록 필터에 사용.
    summonerId: text("summoner_id"),
    summonerGuildId: integer("summoner_guild_id"),
    // 가시성/공격권한 — 'public'(공개·기본) | 'guild_only'(길드원만) | 'summoner_only'(소환자만).
    visibility: text("visibility").notNull().default("public"),
    // 하드 보스 조건부 발악 상태. 현재는 흉포한 산군 50% 발악 약화 여부만 사용한다.
    hardEnrageWeakened: boolean("hard_enrage_weakened")
      .notNull()
      .default(false),
    // 보스별 숨겨진 기믹 상태. 예: 공유 MP 잔량.
    mechanicState: jsonb("mechanic_state")
      .notNull()
      .default(sql`'{}'::jsonb`),
  },
  (t) => [
    // 활성 세션 조회용(kind + defeatedAt IS NULL) — 같은 종류 동시 다수 소환 허용으로
    // 옛 partial unique(coop_boss_active_region_idx)를 일반 partial index 로 강등(#714).
    index("coop_boss_active_region_lookup_idx")
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
// log: ReplayPayload 저장 — 카드에서 펼치면 실제 전투 흐름 (강공격, 크리, 회피 등).
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

// 길드 토벌전 — 모든 길드가 한 주 동안 같은 단계형 보스를 공격하는 전역 이벤트.
// 일반 협동 보스의 소환/공개/기여 보상 수명주기와 분리하고 전투 엔진·리플레이만 공유한다.
export const guildRaidEvents = pgTable(
  "guild_raid_events",
  {
    id: text("id").primaryKey(),
    weekKey: text("week_key").notNull(),
    bossKind: text("boss_kind").notNull(),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    status: text("status").notNull().default("active"),
    stage: integer("stage").notNull().default(1),
    hp: bigint("hp", { mode: "number" }).notNull(),
    maxHp: bigint("max_hp", { mode: "number" }).notNull(),
    mechanicState: jsonb("mechanic_state")
      .notNull()
      .default(sql`'{}'::jsonb`),
    settledAt: timestamp("settled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("guild_raid_events_week_unique_idx").on(t.weekKey),
    index("guild_raid_events_status_end_idx").on(t.status, t.endsAt),
    check("guild_raid_events_stage_positive", sql`${t.stage} > 0`),
    check("guild_raid_events_hp_positive", sql`${t.hp} > 0`),
    check("guild_raid_events_max_hp_positive", sql`${t.maxHp} > 0`),
    check(
      "guild_raid_events_status_valid",
      sql`${t.status} IN ('active','settled')`,
    ),
  ],
);

// 이벤트별 길드 누적 피해. 길드가 해산돼도 과거 순위를 남기기 위해 guildId 는 스냅샷이며
// guilds FK 를 두지 않는다.
export const guildRaidGuildScores = pgTable(
  "guild_raid_guild_scores",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => guildRaidEvents.id, { onDelete: "cascade" }),
    guildId: integer("guild_id").notNull(),
    guildNameSnapshot: text("guild_name_snapshot").notNull(),
    guildEmblemSnapshot: text("guild_emblem_snapshot"),
    damage: bigint("damage", { mode: "number" }).notNull().default(0),
    finalRank: integer("final_rank"),
    settledAt: timestamp("settled_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.guildId] }),
    index("guild_raid_guild_scores_rank_idx").on(
      t.eventId,
      sql`${t.damage} DESC`,
    ),
    check("guild_raid_guild_scores_damage_nonnegative", sql`${t.damage} >= 0`),
  ],
);

// 첫 유효 공격 시 길드가 고정되는 개인 주간 상태 + KST 일일 공격 횟수.
export const guildRaidParticipants = pgTable(
  "guild_raid_participants",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => guildRaidEvents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    guildId: integer("guild_id").notNull(),
    nameSnapshot: text("name_snapshot").notNull(),
    damage: bigint("damage", { mode: "number" }).notNull().default(0),
    attackCount: integer("attack_count").notNull().default(0),
    dayKey: text("day_key").notNull(),
    dailyAttackCount: integer("daily_attack_count").notNull().default(0),
    eligibleAtSettlement: boolean("eligible_at_settlement"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index("guild_raid_participants_guild_damage_idx").on(
      t.eventId,
      t.guildId,
      sql`${t.damage} DESC`,
    ),
    check("guild_raid_participants_damage_nonnegative", sql`${t.damage} >= 0`),
    check("guild_raid_participants_attacks_nonnegative", sql`${t.attackCount} >= 0`),
    check(
      "guild_raid_participants_daily_attacks_nonnegative",
      sql`${t.dailyAttackCount} >= 0`,
    ),
  ],
);

// 공격 1회당 전투 결과. requestId 고유 제약으로 네트워크 재시도 시 같은 결과를 반환한다.
export const guildRaidAttackLogs = pgTable(
  "guild_raid_attack_logs",
  {
    id: serial("id").primaryKey(),
    eventId: text("event_id")
      .notNull()
      .references(() => guildRaidEvents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    guildId: integer("guild_id").notNull(),
    requestId: text("request_id").notNull(),
    name: text("name").notNull(),
    damageDealt: bigint("damage_dealt", { mode: "number" }).notNull(),
    damageTaken: bigint("damage_taken", { mode: "number" }).notNull(),
    diedEarly: boolean("died_early").notNull().default(false),
    stageBefore: integer("stage_before").notNull(),
    stageAfter: integer("stage_after").notNull(),
    hpBefore: bigint("hp_before", { mode: "number" }).notNull(),
    hpAfter: bigint("hp_after", { mode: "number" }).notNull(),
    replay: jsonb("replay").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("guild_raid_attack_logs_request_unique_idx").on(
      t.eventId,
      t.userId,
      t.requestId,
    ),
    index("guild_raid_attack_logs_recent_idx").on(t.eventId, t.createdAt),
    check("guild_raid_attack_logs_damage_nonnegative", sql`${t.damageDealt} >= 0`),
    check("guild_raid_attack_logs_damage_taken_nonnegative", sql`${t.damageTaken} >= 0`),
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

// 주간 아레나 일요일 토너먼트. 자정에 대진·전투 스냅샷을 동결하고 정오부터 5분마다
// bracket 의 다음 경기를 확정한다. snapshots 는 서버 전용이며 API 응답에 노출하지 않는다.
export const pvpTournaments = pgTable(
  "pvp_tournaments",
  {
    seasonId: text("season_id")
      .primaryKey()
      .references(() => pvpSeasons.id, { onDelete: "cascade" }),
    bracketSize: integer("bracket_size").notNull(),
    status: text("status").notNull(),
    bracket: jsonb("bracket").notNull(),
    snapshots: jsonb("snapshots").notNull().default(sql`'{}'::jsonb`),
    championUserId: text("champion_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    rewardsGrantedAt: timestamp("rewards_granted_at"),
    // 30일 뒤 bracket.games[*].replay와 snapshots만 제거하고 대진/우승 요약은 유지한다.
    replaysTrimmedAt: timestamp("replays_trimmed_at"),
  },
  (t) => [
    index("pvp_tournaments_created_at_idx").on(t.createdAt),
    check(
      "pvp_tournaments_status_valid",
      sql`${t.status} IN ('scheduled','in_progress','completed','not_enough_players')`,
    ),
  ],
);

// 챔피언십 경기별 유저 풀 베팅. 한 유저는 경기당 한 번만 베팅할 수 있고,
// 경기 row 대신 시즌 row를 먼저 잠가 경기 확정과 베팅 마감의 race를 막는다.
export const pvpTournamentBets = pgTable(
  "pvp_tournament_bets",
  {
    seasonId: text("season_id")
      .notNull()
      .references(() => pvpTournaments.seasonId, { onDelete: "cascade" }),
    matchId: text("match_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    chosenUserId: text("chosen_user_id").notNull(),
    amount: integer("amount").notNull(),
    status: text("status").notNull().default("pending"),
    payout: integer("payout").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    settledAt: timestamp("settled_at"),
  },
  (t) => [
    primaryKey({ columns: [t.seasonId, t.matchId, t.userId] }),
    index("pvp_tournament_bets_match_idx").on(t.seasonId, t.matchId),
    index("pvp_tournament_bets_user_idx").on(t.userId, t.createdAt),
    check(
      "pvp_tournament_bets_amount_valid",
      sql`${t.amount} BETWEEN 100 AND 1500000`,
    ),
    check(
      "pvp_tournament_bets_status_valid",
      sql`${t.status} IN ('pending','won','lost','refunded')`,
    ),
    check("pvp_tournament_bets_payout_valid", sql`${t.payout} >= 0`),
  ],
);

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
    // 다음 NPC 정기 공격 예정 시각. 점령 시 tier 기반 interval 으로 설정.
    // cron 또는 lazy 평가가 nextAttackAt < now 인 거점들을 처리.
    nextAttackAt: timestamp("next_attack_at").defaultNow().notNull(),
    // 거점 공성(성벽 HP) — docs/v2-outpost-siege-plan.md. 점령 시도 승리마다 깎이고 0이면 함락.
    // 성벽은 fortUpdatedAt 기준 lazy 재생. 기존 행은 default 로 풀성벽·보호막 없음(즉시 공성).
    fortHp: integer("fort_hp").notNull().default(100),
    fortMaxHp: integer("fort_max_hp").notNull().default(100),
    fortUpdatedAt: timestamp("fort_updated_at").defaultNow().notNull(),
    // 함락 직후 재공성 금지 시각. 기본 now() = 기존 점령은 즉시 공성 가능.
    protectedUntil: timestamp("protected_until").defaultNow().notNull(),
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
    // 전투 리플레이 봉투(StoredReplayEnvelope) — 공격 기록 "다시보기"용. 거점당 최신
    // N 건만 보존(insert 시 오래된 행 null 트림 — outpostAttackLog.trimAttackReplays).
    // 3:3 토너먼트 등 1v1 리플레이 없는 시도는 null.
    replay: jsonb("replay"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("outpost_claim_attempts_outpost_idx").on(t.outpostId, t.createdAt),
    index("outpost_claim_attempts_attacker_idx").on(t.attackerUserId, t.createdAt),
  ],
);

// v2 길드 공용 자원 풀. 옛 stone/scrolls/soldiers 자원 경제는 폐기 — 거점 세금
// 회수로 누적되는 공용 gold 풀만 남음. 1인 길드도 같은 테이블 — 마스터 = 본인 자원.
export const v2GuildResources = pgTable("v2_guild_resources", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  // 거점 세금 회수 시 90% 가 누적되는 길드 공용 골드 풀. 회수자 본인 10% 와 별개.
  gold: integer("gold").notNull().default(0),
  // 길드 정착지 재화 풀 — 기초 목재/광석은 crop/ore, 상위 생활 재료는 재료 ID 키로 저장한다.
  // 길드원이 전환한 재료가 누적되고 마을·영지 건축물 업그레이드에 소비된다. 종류 추가 시 마이그 불요(jsonb).
  settlement: jsonb("settlement").notNull().default({}),
  // 길드 창고 상태({ materials, equipment }). 정착지 업그레이드 재화와 분리해
  // 입출고만으로 시설 비용이 바뀌지 않는다. 구버전 flat 재료 맵은 서버에서 호환 파싱한다.
  warehouse: jsonb("warehouse").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 길드 제작소 주간 의뢰 진행도. 주차가 바뀌면 lazy reset 으로 같은 row 를 새 weekKey 로 덮는다.
export const guildWorkshopWeekly = pgTable("guild_workshop_weekly", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  weekKey: text("week_key").notNull(),
  craftCount: integer("craft_count").notNull().default(0),
  qualityCount: integer("quality_count").notNull().default(0),
  claimed: jsonb("claimed").notNull().default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 길드 탐사 본부 주간 의뢰 진행도. 주차가 바뀌면 lazy reset 으로 같은 row 를 새 weekKey 로 덮는다.
// progress 는 100 = 1회분으로 저장해 탐사 본부 진척 보너스(+%)를 정수로 반영한다.
export const guildExplorationWeekly = pgTable("guild_exploration_weekly", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  weekKey: text("week_key").notNull(),
  coopEpicProgress: integer("coop_epic_progress").notNull().default(0),
  huntWinProgress: integer("hunt_win_progress").notNull().default(0),
  deepHuntWinProgress: integer("deep_hunt_win_progress").notNull().default(0),
  fishingCatchProgress: integer("fishing_catch_progress").notNull().default(0),
  woodcuttingSuccessProgress: integer("woodcutting_success_progress")
    .notNull()
    .default(0),
  farmHarvestProgress: integer("farm_harvest_progress").notNull().default(0),
  claimed: jsonb("claimed").notNull().default(sql`'[]'::jsonb`),
  content: jsonb("content").notNull().default(sql`'{}'::jsonb`),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 길드 식당의 주간 공동 준비 상태. 식재료 종류와 메뉴는 애플리케이션 등록부가 관리하고,
// DB는 확장 가능한 ID 배열과 점수만 보관한다. 주차가 바뀌면 첫 조회에서 lazy reset 한다.
export const guildDiningWeekly = pgTable("guild_dining_weekly", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  weekKey: text("week_key").notNull(),
  selectedMenuIds: jsonb("selected_menu_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'["hearty_stew"]'::jsonb`),
  pantryPoints: integer("pantry_points").notNull().default(0),
  targetPoints: integer("target_points").notNull().default(20),
  eligibleUserIds: jsonb("eligible_user_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 길드 교역소 공동 상태. tokens 는 주차가 바뀌어도 유지되는 길드 공동 잔고다.
// purchases 와 계약 품목·진척·완료 목록, 참여 가능 길드원 스냅샷은 주차마다 교체한다.
// 품목 추가에 마이그레이션이 필요 없도록 계약 데이터는 JSONB로 보관한다.
export const guildTradeWeekly = pgTable("guild_trade_weekly", {
  guildId: integer("guild_id")
    .primaryKey()
    .references(() => guilds.id, { onDelete: "cascade" }),
  weekKey: text("week_key").notNull(),
  contractIds: jsonb("contract_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  progress: jsonb("progress")
    .$type<Record<string, number>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  completedIds: jsonb("completed_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  eligibleUserIds: jsonb("eligible_user_ids")
    .$type<string[]>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  tokens: integer("tokens").notNull().default(0),
  purchases: jsonb("purchases")
    .$type<Record<string, number>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  // 이전 구매 권한 정책 호환용. 신규 로직에서는 사용하지 않는다.
  memberPurchasesEnabled: boolean("member_purchases_enabled")
    .notNull()
    .default(true),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 길드 영지 건축물 보관 레벨 — 슬롯 압박/전쟁 점령으로 건물이 사라져도 같은 길드가 같은 건물을
// 다시 배치하면 최고 보관 레벨로 복구한다. 길드 해산 시에는 cascade 로 함께 제거된다.
export const guildSettlementBuildingLevels = pgTable(
  "guild_settlement_building_levels",
  {
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    buildingId: text("building_id").notNull(),
    level: integer("level").notNull().default(1),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.buildingId] })],
);

// 길드 시설의 다음 레벨 재료 기부 진행도. 시설이 Lv.1~4인 동안 항상 열려 있으며,
// 길드원들이 개인 생활 재료를 함께 채운다. targetLevel 로 레벨 변경 뒤 남은 진행도를
// 잘못 재사용하지 않도록 하고, materials 는 재료 종류 추가 시 마이그 없이 확장한다.
export const guildFacilityUpgradeDonations = pgTable(
  "guild_facility_upgrade_donations",
  {
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    buildingId: text("building_id").notNull(),
    targetLevel: integer("target_level").notNull(),
    materials: jsonb("materials").notNull().default({}),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.guildId, t.buildingId] })],
);

// 마을 공공기관인 모험가 협회의 시설 진행도. 협회 시설은 처음부터 Lv.1로
// 열려 있고 모든 이용자가 개인 생활 재료와 골드를 기부한다. 목표를 모두
// 채우면 별도 관리자 승인 없이 기부 트랜잭션 안에서 즉시 다음 레벨이 된다.
// 길드 창고는 공공시설 대상이 아니므로 이 테이블에 저장하지 않는다.
export const adventurerAssociationFacilities = pgTable(
  "adventurer_association_facilities",
  {
    buildingId: text("building_id").primaryKey(),
    level: integer("level").notNull().default(1),
    targetLevel: integer("target_level").notNull().default(2),
    materials: jsonb("materials").notNull().default({}),
    gold: integer("gold").notNull().default(0),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    check(
      "adventurer_association_facilities_level_check",
      sql`${t.level} BETWEEN 1 AND 5`,
    ),
    check(
      "adventurer_association_facilities_target_level_check",
      sql`${t.targetLevel} BETWEEN 2 AND 5`,
    ),
    check("adventurer_association_facilities_gold_check", sql`${t.gold} >= 0`),
  ],
);

// 협회 식당의 서버 공용 주간 식재료 준비 상태. 식권·기여도·식사 효과는
// 개인 세이브에 두고, 여기에는 메뉴와 공용 준비도만 둔다.
export const adventurerAssociationDiningWeekly = pgTable(
  "adventurer_association_dining_weekly",
  {
    id: text("id").primaryKey().default("global"),
    weekKey: text("week_key").notNull(),
    selectedMenuIds: jsonb("selected_menu_ids")
      .$type<string[]>()
      .notNull()
      .default(sql`'["hearty_stew"]'::jsonb`),
    pantryPoints: integer("pantry_points").notNull().default(0),
    targetPoints: integer("target_points").notNull().default(400),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    check(
      "adventurer_association_dining_weekly_points_check",
      sql`${t.pantryPoints} >= 0 AND ${t.targetPoints} > 0`,
    ),
  ],
);

// 협회 교역소의 서버 공용 주간 계약 진행도. 토큰과 상품 구매 횟수는
// 이용자 개인 세이브에 두어 선착순 공동 잔고 소진을 원천 차단한다.
export const adventurerAssociationTradeWeekly = pgTable(
  "adventurer_association_trade_weekly",
  {
    id: text("id").primaryKey().default("global"),
    weekKey: text("week_key").notNull(),
    contractIds: jsonb("contract_ids").$type<string[]>().notNull().default([]),
    progress: jsonb("progress").notNull().default({}),
    completedIds: jsonb("completed_ids").$type<string[]>().notNull().default([]),
    target: integer("target").notNull().default(400),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    check(
      "adventurer_association_trade_weekly_target_check",
      sql`${t.target} > 0`,
    ),
  ],
);

export const artisanLeaderboardSnapshots = pgTable(
  "artisan_leaderboard_snapshots",
  {
    weekKey: text("week_key").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    totalCrafts: integer("total_crafts").notNull().default(0),
    qualityCrafts: integer("quality_crafts").notNull().default(0),
    weeklyXp: integer("weekly_xp").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    rewardClaimedAt: timestamp("reward_claimed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.weekKey, t.userId] }),
    index("artisan_leaderboard_snapshots_week_rank_idx").on(t.weekKey, t.rank),
  ],
);

// 솔로(무길드) 정착지 생산 재화 풀 — 길드 풀(v2_guild_resources.settlement)의 1인 버전.
//   { crop, ore, fish }. 솔로 마을 수확물이 누적되고 솔로 마을 업그레이드에 소비된다.
//   골드는 별도 풀 없이 플레이어 본인 골드(character.v2.gold)를 쓴다(슬롯 해금). 종류 추가=jsonb.
export const userSettlementResources = pgTable("user_settlement_resources", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  settlement: jsonb("settlement").notNull().default({}),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// v2 정착지 — 길드가 점령한 거점에 세운 "마을"(단계·이름·건축물 슬롯 상태).
//   outpostId = data/v2/outposts.ts 의 Outpost.id (정적 데이터라 FK X).
//   소유 길드가 사라지면 마을도 제거(cascade). jobs = 슬롯(문자열 인덱스) → ProductionJob.
//   단계별 슬롯 수는 data/v2/settlement MAX_SLOTS_BY_TIER. 명명(name)=건설 흐름.
export const outpostVillages = pgTable("outpost_villages", {
  outpostId: text("outpost_id").primaryKey(),
  // 소유 — 길드 마을이면 guildId, 솔로(무길드) 타일 정착지면 ownerUserId. 정확히 하나만 set.
  //   옛 행(거점 마을)은 전부 guildId(ownerUserId NULL). 솔로 지원으로 guildId NOT NULL 완화(T1b).
  guildId: integer("guild_id").references(() => guilds.id, {
    onDelete: "cascade",
  }),
  ownerUserId: text("owner_user_id").references(() => users.id, {
    onDelete: "cascade",
  }),
  tier: text("tier").notNull().default("village"),
  name: text("name"),
  // [레거시] 옛 마을 특화 종류(crop|ore|fish) — 한 마을 한 종류 모델의 잔재. 신규 마을은 NULL.
  //   이제 종류는 칸마다 해금 시 선택(slotKinds). 옛 마을은 parse 가 이 값으로 slotKinds 를 소급.
  productionKind: text("production_kind"),
  // 해금된 건축물 슬롯 수 — 건설 직후 0, 길드 골드로 한 칸씩 해금(MAX_SLOTS_BY_TIER 범위).
  unlockedSlots: integer("unlocked_slots").notNull().default(1),
  // 칸별 생산 종류 — { "0":"crop", "1":"ore", … }. 해금 시 그 칸에서 키울 종류를 고른다(영구).
  //   생산은 슬롯의 종류만 — 옛 마을은 parse 가 productionKind 로 소급.
  slotKinds: jsonb("slot_kinds").notNull().default({}),
  // 건축물 슬롯 — { "0":"guild_smithy" }. 1슬롯 정책의 실제 선택지를 저장한다.
  buildings: jsonb("buildings").notNull().default({}),
  jobs: jsonb("jobs").notNull().default({}),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 정착지 전쟁 — 참여형 수비 등록 큐. 길드원이 점령 거점에 수비 등록하면 등록순(registeredAt)으로
//   배치돼 공격자를 순차로 막는다(약탈=1번 격파, 정복=전원 격파+성벽). 패배 시 행 삭제(건강도 소진).
//   설계: docs/v2-settlement-warfare-plan.md §2.2. PR-2(플래그 V2_SETTLEMENT_WARFARE 뒤·미배선).
//   (outpostId, userId) 복합 PK = 한 거점에 한 유저 1회 등록. guildId = 등록 당시 점령 길드.
export const outpostDefenders = pgTable(
  "outpost_defenders",
  {
    outpostId: text("outpost_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    guildId: integer("guild_id")
      .notNull()
      .references(() => guilds.id, { onDelete: "cascade" }),
    registeredAt: timestamp("registered_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.outpostId, t.userId] })],
);

// 정착지 전쟁 — 거점 영주. 거점당 1인(outpostId PK). 점령 길드 마스터/관리자가 임명.
//   세금이 거점 금고(outpost_treasury)에 누적되고, 영주만 6h 쿨다운으로 수확(10% 개인/90% 길드).
//   설계: docs/v2-settlement-warfare-plan.md §2.4. PR-4(플래그 V2_SETTLEMENT_WARFARE 뒤).
//   guildId = 임명 당시 점령 길드(거점 양도 시 스테일 — 읽기에서 현재 점령길드로 필터).
export const outpostLords = pgTable("outpost_lords", {
  outpostId: text("outpost_id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  guildId: integer("guild_id")
    .notNull()
    .references(() => guilds.id, { onDelete: "cascade" }),
  lastHarvestAt: timestamp("last_harvest_at"),
});

// 자유 타일 지도(V2_FREEFORM_TILES) — 플레이어가 빈 땅에 세운 개척 정착지. (col,row) 복합 PK
//   = 칸당 하나. tier: frontier(개척마을·땅 미보유) → village(마을·영지 획득) → city → metropolis.
//   설계: docs 없음(자유 타일 지도 에픽 Phase 3). 플래그 뒤에서만 쓰기 — 라이브(flag off)는
//   이 테이블을 읽지도 쓰지도 않는다(빈 테이블). userId = 세운 사람(개인 소유·길드 영지 PvP는 후속).
export const tileSettlements = pgTable(
  "tile_settlements",
  {
    col: integer("col").notNull(),
    row: integer("row").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tier: text("tier").notNull().default("frontier"),
    name: text("name"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.col, t.row] })],
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

// 위험 해역 거대어 — 6시간 동안 서버 전체가 비동기로 체력을 누적해서 깎는다.
// status: active | defeated | expired. 활성 partial unique 로 동시 발견 중복 생성을 막는다.
export const dangerousFishingBossEvents = pgTable(
  "dangerous_fishing_boss_events",
  {
    id: text("id").primaryKey(),
    bossId: text("boss_id").notNull(),
    discovererId: text("discoverer_id").references(() => users.id, {
      onDelete: "set null",
    }),
    maxStamina: integer("max_stamina").notNull(),
    stamina: integer("stamina").notNull(),
    status: text("status").notNull().default("active"),
    spawnedAt: timestamp("spawned_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    defeatedAt: timestamp("defeated_at"),
    lastHaulUserId: text("last_haul_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    uniqueIndex("dangerous_fishing_boss_one_active_idx")
      .on(t.status)
      .where(sql`${t.status} = 'active'`),
    index("dangerous_fishing_boss_active_expiry_idx").on(
      t.status,
      t.expiresAt,
    ),
  ],
);

// 거대어 이벤트별 개인 누적 기여와 보상 수령 멱등 마커. 순위 노출 용도가 아니므로
// 기여량 내림차순 인덱스는 두지 않고 본인 조회용 user 인덱스만 둔다.
export const dangerousFishingBossContributions = pgTable(
  "dangerous_fishing_boss_contributions",
  {
    eventId: text("event_id")
      .notNull()
      .references(() => dangerousFishingBossEvents.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    totalContribution: integer("total_contribution").notNull().default(0),
    successfulAttempts: integer("successful_attempts").notNull().default(0),
    firstContributedAt: timestamp("first_contributed_at").notNull(),
    lastContributedAt: timestamp("last_contributed_at").notNull(),
    rewardClaimedAt: timestamp("reward_claimed_at"),
  },
  (t) => [
    primaryKey({ columns: [t.eventId, t.userId] }),
    index("dangerous_fishing_boss_contribution_user_idx").on(
      t.userId,
      t.lastContributedAt,
    ),
  ],
);

// v2 전용 알림 — 전쟁(거점 피격/함락/토벌당함) 등 개인 타겟 사건. 우편함(아이템·정산
// 첨부)과 분리된 "읽고 끝" 채널 — docs/v2-war-visibility-plan.md PR-5. 타입은 범용이라
// 추후 아레나/길드 가입신청 알림으로 확장 가능. insert 시 유저당 NOTIF_MAX_PER_USER
// 초과분 trim (serverFeed 관례 미러 — cron 없음).
export const v2Notifications = pgTable(
  "v2_notifications",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull(),
    // null = 미읽음. POST /api/v2/notifications/read 가 일괄로 채운다.
    readAt: timestamp("read_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // 내 알림 최신순 조회 + 미읽음 카운트 둘 다 이 인덱스로.
    index("v2_notifications_user_idx").on(t.userId, sql`${t.id} DESC`),
  ],
);

// Web Push 구독 — 브라우저/TWA 설치 단위로 한 행. endpoint 는 Push Service 가 발급하는
// 고유 주소이며 계정 삭제 시 함께 제거한다. 같은 브라우저에서 계정을 바꾸면 endpoint
// unique 충돌을 upsert 하며 새 userId 로 소유권을 옮긴다.
export const pushSubscriptions = pgTable(
  "push_subscriptions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    endpoint: text("endpoint").notNull(),
    p256dh: text("p256dh").notNull(),
    auth: text("auth").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("push_subscriptions_endpoint_idx").on(t.endpoint),
    index("push_subscriptions_user_idx").on(t.userId),
  ],
);

// 타이머형 알림 멱등 마커. 자동 벌목·채광 세션과 농장 planting 단위 eventKey 를 남겨
// 매분 cron 이 같은 완료 알림을 반복 발송하지 않게 한다.
export const pushDeliveries = pgTable(
  "push_deliveries",
  {
    eventKey: text("event_key").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("push_deliveries_user_created_idx").on(t.userId, t.createdAt)],
);

// 유저 제재 이력 — 밴/정지/경고의 append-only 로그. 현재 차단 여부는 users.bannedUntil
// (비정규화)로 빠르게 검사하고, 이 테이블은 누가·언제·왜·얼마나 + 해제 이력을 보존한다.
//   type:       'ban'(영구) | 'suspend'(기간) | 'warn'(경고, enforcement 없음)
//   expiresAt:  suspend 만료 시각. ban=먼 미래, warn=null.
//   acknowledgedAt: 유저가 경고 팝업 내용을 확인한 시각. warn 에서만 사용.
//   liftedAt:   관리자가 조기 해제하면 채워짐(이력 유지 — row 삭제 안 함).
export const userSanctions = pgTable(
  "user_sanctions",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    reason: text("reason").notNull().default(""),
    expiresAt: timestamp("expires_at"),
    createdByEmail: text("created_by_email").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    acknowledgedAt: timestamp("acknowledged_at"),
    liftedAt: timestamp("lifted_at"),
    liftedByEmail: text("lifted_by_email"),
  },
  (t) => [
    // 유저별 제재 이력 최신순.
    index("user_sanctions_user_idx").on(t.userId, sql`${t.id} DESC`),
  ],
);

// 운영 이상 행동 로그 — rate limit 초과, 반복 bad_request/stale/no_session 등 abuse 후보 이벤트.
// 핫패스에서는 best-effort 로 기록한다. 실패해도 본 요청 처리를 막지 않는다.
export const abuseEvents = pgTable(
  "abuse_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    ip: text("ip"),
    action: text("action").notNull(),
    reason: text("reason").notNull(),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("abuse_events_created_idx").on(sql`${t.id} DESC`),
    index("abuse_events_created_at_idx").on(sql`${t.createdAt} DESC`),
    index("abuse_events_user_created_idx").on(t.userId, sql`${t.id} DESC`),
    index("abuse_events_ip_created_idx").on(t.ip, sql`${t.id} DESC`),
    index("abuse_events_action_created_idx").on(t.action, sql`${t.id} DESC`),
    index("abuse_events_reason_created_idx").on(t.reason, sql`${t.id} DESC`),
  ],
);

// 경제 이벤트 로그 — 거래소/상점/보상 등 골드·아이템 유입/유출 감사용.
// 게임 진행을 막지 않도록 기록 실패는 서버 유틸에서 best-effort 로 처리한다.
export const economyEvents = pgTable(
  "economy_events",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    counterpartyUserId: text("counterparty_user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    eventType: text("event_type").notNull(),
    goldDelta: integer("gold_delta").notNull().default(0),
    itemKind: text("item_kind"),
    itemId: text("item_id"),
    quantity: integer("quantity"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("economy_events_created_idx").on(sql`${t.id} DESC`),
    index("economy_events_created_at_idx").on(sql`${t.createdAt} DESC`),
    index("economy_events_user_created_idx").on(t.userId, sql`${t.id} DESC`),
    index("economy_events_type_created_idx").on(t.eventType, sql`${t.id} DESC`),
    index("economy_events_item_created_idx").on(t.itemKind, t.itemId, sql`${t.id} DESC`),
  ],
);

// 운영 설정 — 핫타임/이벤트 배율/운영 토글처럼 코드 배포 없이 조정할 값을 key-value 로 보관.
// value 는 설정별 JSON 계약을 각 admin API 에서 검증한다.
export const opsSettings = pgTable("ops_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedByEmail: text("updated_by_email"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// 일별 DB/테이블 실사용량 스냅샷. 최근 30일만 유지하며 급증·할당량 임계치 경고에 사용한다.
export const dbStorageMetrics = pgTable("db_storage_metrics", {
  dateKey: text("date_key").primaryKey(), // UTC YYYY-MM-DD
  databaseBytes: numeric("database_bytes", { precision: 30, scale: 0 }).notNull(),
  tableBytes: jsonb("table_bytes")
    .$type<Record<string, number>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// 관리자 감사 로그 — admin API 의 모든 변경 행동을 append-only 로 기록(누가·무엇을·대상).
//   action:       'sanction.ban' / 'grant.v2' / 'reset-character' / 'season-ops.war-rollover' 등.
//   targetUserId: 대상 유저(있으면). detail: 자유형 컨텍스트(JSON).
export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: serial("id").primaryKey(),
    adminEmail: text("admin_email").notNull(),
    action: text("action").notNull(),
    targetUserId: text("target_user_id"),
    detail: jsonb("detail"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    // 최신순 조회.
    index("admin_audit_log_created_idx").on(sql`${t.id} DESC`),
    index("admin_audit_log_admin_created_idx").on(t.adminEmail, sql`${t.id} DESC`),
    index("admin_audit_log_action_created_idx").on(t.action, sql`${t.id} DESC`),
    index("admin_audit_log_target_created_idx").on(t.targetUserId, sql`${t.id} DESC`),
  ],
);

// 도감 숙련도 항목별 진행 — 사용자/분야/항목 복합키로 한 항목의 단조 진행을 보관한다.
export const codexMasteryProgress = pgTable(
  "codex_mastery_progress",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    entryId: text("entry_id").notNull(),
    count: bigint("count", { mode: "number" }).notNull().default(0),
    bestValue: doublePrecision("best_value"),
    currentTier: text("current_tier").notNull().default("none"),
    sealIds: jsonb("seal_ids").$type<string[]>().notNull().default([]),
    tierAchievedAt: jsonb("tier_achieved_at")
      .$type<Partial<Record<CodexMasteryStage, string>>>()
      .notNull()
      .default({}),
    scoreMilli: bigint("score_milli", { mode: "number" }).notNull().default(0),
    firstRecordedAt: timestamp("first_recorded_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.category, t.entryId] }),
    index("codex_mastery_progress_user_category_tier_idx").on(
      t.userId,
      t.category,
      t.currentTier,
    ),
    check("codex_mastery_progress_count_nonnegative", sql`${t.count} >= 0`),
    check("codex_mastery_progress_score_nonnegative", sql`${t.scoreMilli} >= 0`),
  ],
);

// 도감 숙련도 요약 — 공개 랭킹과 사용자별 총점 조회를 위한 사용자당 한 행이다.
export const codexMasterySummary = pgTable(
  "codex_mastery_summary",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    totalScoreMilli: bigint("total_score_milli", { mode: "number" })
      .notNull()
      .default(0),
    equipmentScoreMilli: bigint("equipment_score_milli", { mode: "number" })
      .notNull()
      .default(0),
    fishScoreMilli: bigint("fish_score_milli", { mode: "number" })
      .notNull()
      .default(0),
    monsterScoreMilli: bigint("monster_score_milli", { mode: "number" })
      .notNull()
      .default(0),
    cookingScoreMilli: bigint("cooking_score_milli", { mode: "number" })
      .notNull()
      .default(0),
    lifeScoreMilli: bigint("life_score_milli", { mode: "number" })
      .notNull()
      .default(0),
    jobScoreMilli: bigint("job_score_milli", { mode: "number" })
      .notNull()
      .default(0),
    bronzeCount: integer("bronze_count").notNull().default(0),
    silverCount: integer("silver_count").notNull().default(0),
    goldCount: integer("gold_count").notNull().default(0),
    platinumCount: integer("platinum_count").notNull().default(0),
    diamondCount: integer("diamond_count").notNull().default(0),
    legendaryCount: integer("legendary_count").notNull().default(0),
    sealCount: integer("seal_count").notNull().default(0),
    scoreReachedAt: timestamp("score_reached_at"),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("codex_mastery_summary_total_score_rank_idx").on(
      sql`${t.totalScoreMilli} DESC`,
      sql`${t.scoreReachedAt} DESC`,
      t.userId,
    ),
    index("codex_mastery_summary_equipment_score_rank_idx").on(
      sql`${t.equipmentScoreMilli} DESC`,
      sql`${t.scoreReachedAt} DESC`,
      t.userId,
    ),
    index("codex_mastery_summary_fish_score_rank_idx").on(
      sql`${t.fishScoreMilli} DESC`,
      sql`${t.scoreReachedAt} DESC`,
      t.userId,
    ),
    index("codex_mastery_summary_monster_score_rank_idx").on(
      sql`${t.monsterScoreMilli} DESC`,
      sql`${t.scoreReachedAt} DESC`,
      t.userId,
    ),
    index("codex_mastery_summary_cooking_score_rank_idx").on(
      sql`${t.cookingScoreMilli} DESC`,
      sql`${t.scoreReachedAt} DESC`,
      t.userId,
    ),
    index("codex_mastery_summary_life_score_rank_idx").on(
      sql`${t.lifeScoreMilli} DESC`,
      sql`${t.scoreReachedAt} DESC`,
      t.userId,
    ),
    index("codex_mastery_summary_job_score_rank_idx").on(
      sql`${t.jobScoreMilli} DESC`,
      sql`${t.scoreReachedAt} DESC`,
      t.userId,
    ),
  ],
);
