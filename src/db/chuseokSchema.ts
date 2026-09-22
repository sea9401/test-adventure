import { bigint, integer, jsonb, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import { users } from "./schema";
import type { ChuseokAttackResult } from "@/adventure/data/v2/chuseokEvent";

export const chuseokEvents = pgTable("chuseok_events", {
  id: text("id").primaryKey(),
  startsAt: timestamp("starts_at").notNull(),
  endsAt: timestamp("ends_at").notNull(),
  stage: integer("stage").notNull().default(1),
  hp: bigint("hp", { mode: "number" }).notNull().default(100_000_000),
  maxHp: bigint("max_hp", { mode: "number" }).notNull().default(100_000_000),
});

export const chuseokParticipants = pgTable("chuseok_participants", {
  eventId: text("event_id").notNull().references(() => chuseokEvents.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  attendanceDays: jsonb("attendance_days").$type<string[]>().notNull().default([]),
  damage: bigint("damage", { mode: "number" }).notNull().default(0),
  attackCount: integer("attack_count").notNull().default(0),
  dayKey: text("day_key").notNull().default(""),
  dailyAttackCount: integer("daily_attack_count").notNull().default(0),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId] })]);

export const chuseokAttacks = pgTable("chuseok_attacks", {
  eventId: text("event_id").notNull().references(() => chuseokEvents.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  requestId: text("request_id").notNull(),
  result: jsonb("result").$type<ChuseokAttackResult>().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
}, (t) => [primaryKey({ columns: [t.eventId, t.userId, t.requestId] })]);
