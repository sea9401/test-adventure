import { sql } from "drizzle-orm";
import {
  bigint,
  check,
  index,
  integer,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { users } from "./schema";

// 일 단위 복권 회차. drawSecret 은 판매 중 서버만 보관하고, 마감 뒤 API 가 공개해
// commitHash 와 추첨 결과를 재현할 수 있게 한다.
export const lotteryRounds = pgTable(
  "lottery_rounds",
  {
    id: serial("id").primaryKey(),
    status: text("status").notNull().default("open"),
    startsAt: timestamp("starts_at").notNull(),
    endsAt: timestamp("ends_at").notNull(),
    ticketPrice: integer("ticket_price").notNull(),
    totalTickets: integer("total_tickets").notNull().default(0),
    grossPool: bigint("gross_pool", { mode: "number" }).notNull().default(0),
    carryIn: bigint("carry_in", { mode: "number" }).notNull().default(0),
    feeAmount: bigint("fee_amount", { mode: "number" }).notNull().default(0),
    prizePool: bigint("prize_pool", { mode: "number" }).notNull().default(0),
    commitHash: text("commit_hash").notNull(),
    drawSecret: text("draw_secret").notNull(),
    settledAt: timestamp("settled_at"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("lottery_rounds_starts_at_unique_idx").on(t.startsAt),
    index("lottery_rounds_status_ends_at_idx").on(t.status, t.endsAt),
    check(
      "lottery_rounds_status_check",
      sql`${t.status} IN ('open','settled','refunded','rolled_over')`,
    ),
    check("lottery_rounds_ticket_price_check", sql`${t.ticketPrice} > 0`),
    check("lottery_rounds_total_tickets_check", sql`${t.totalTickets} >= 0`),
    check("lottery_rounds_carry_in_check", sql`${t.carryIn} >= 0`),
  ],
);

// 구매 요청별 영수증. (userId, requestId) 고유키가 네트워크 재시도 중복 차감을 막는다.
// firstTicketNumber + ticketCount 로 회차 내 연속 티켓 번호 범위를 보존한다.
export const lotteryPurchases = pgTable(
  "lottery_purchases",
  {
    id: serial("id").primaryKey(),
    roundId: integer("round_id")
      .notNull()
      .references(() => lotteryRounds.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    requestId: text("request_id").notNull(),
    actorName: text("actor_name").notNull(),
    ticketCount: integer("ticket_count").notNull(),
    firstTicketNumber: integer("first_ticket_number").notNull(),
    amountPaid: bigint("amount_paid", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex("lottery_purchases_user_request_unique_idx").on(
      t.userId,
      t.requestId,
    ),
    index("lottery_purchases_round_created_idx").on(t.roundId, t.createdAt),
    index("lottery_purchases_round_user_idx").on(t.roundId, t.userId),
    check(
      "lottery_purchases_ticket_count_check",
      sql`${t.ticketCount} BETWEEN 1 AND 10`,
    ),
    check(
      "lottery_purchases_first_ticket_check",
      sql`${t.firstTicketNumber} > 0`,
    ),
    check("lottery_purchases_amount_check", sql`${t.amountPaid} > 0`),
  ],
);

// 마감 결과 영구 감사 기록. user 삭제 뒤에도 이름·당첨 번호·금액은 남긴다.
export const lotteryWinners = pgTable(
  "lottery_winners",
  {
    roundId: integer("round_id")
      .notNull()
      .references(() => lotteryRounds.id, { onDelete: "cascade" }),
    rank: integer("rank").notNull(),
    purchaseId: integer("purchase_id").references(() => lotteryPurchases.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => users.id, {
      onDelete: "set null",
    }),
    actorName: text("actor_name").notNull(),
    ticketNumber: integer("ticket_number").notNull(),
    prizeAmount: bigint("prize_amount", { mode: "number" }).notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.roundId, t.rank] }),
    index("lottery_winners_user_created_idx").on(t.userId, t.createdAt),
    check("lottery_winners_rank_check", sql`${t.rank} BETWEEN 1 AND 3`),
    check("lottery_winners_ticket_check", sql`${t.ticketNumber} > 0`),
    check("lottery_winners_prize_check", sql`${t.prizeAmount} >= 0`),
  ],
);
