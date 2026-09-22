import "server-only";
import { and, count, eq, gt } from "drizzle-orm";
import { db } from "@/db";
import { marketplaceInbox } from "@/db/schema";
import { chuseokAttacks, chuseokEvents, chuseokParticipants } from "@/db/chuseokSchema";
import { CHUSEOK_CLEAR_REWARD, CHUSEOK_DAILY_ATTACKS, CHUSEOK_EVENT_ID, chuseokAttendance, chuseokMaxHp, chuseokPhase, chuseokWindow, type ChuseokAttackResult, type ChuseokState } from "@/adventure/data/v2/chuseokEvent";
import { applyGuildRaidDamage } from "@/adventure/data/v2/guildRaid";
import { isProfileComplete } from "@/adventure/profile/profileValue";
import { grantStaminaPotions, STAMINA_POTIONS_KEY } from "@/adventure/v2/staminaPotions";
import { kstDayKey } from "@/lib/kst";
import { simulateChuseokBattle } from "./guildRaidBattle";
import { lockSaveForUpdate, readSave, upsertSave, type DbExecutor } from "./savesKv";
import { inboxValues } from "./inboxPayload";

type Event = typeof chuseokEvents.$inferSelect;
type EventError = { ok: false; error: "event_pending" | "event_ended" | "no_character" | "already_claimed" | "attendance_complete" | "daily_limit" | "bad_request_id" };
const eventWhere = eq(chuseokEvents.id, CHUSEOK_EVENT_ID);
const participantWhere = (userId: string) => and(eq(chuseokParticipants.eventId, CHUSEOK_EVENT_ID), eq(chuseokParticipants.userId, userId));
const attackWhere = (userId: string, requestId: string) => and(eq(chuseokAttacks.eventId, CHUSEOK_EVENT_ID), eq(chuseokAttacks.userId, userId), eq(chuseokAttacks.requestId, requestId));
const windowFor = (event: Event) => ({ startsAt: event.startsAt.getTime(), endsAt: event.endsAt.getTime() });

export function validChuseokRequestId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,64}$/.test(value);
}

export function createChuseokEventService({
  database = db, now = Date.now, startsAt = () => process.env.CHUSEOK_EVENT_STARTS_AT,
  simulate = simulateChuseokBattle,
}: { database?: typeof db; now?: () => number; startsAt?: () => string | undefined; simulate?: typeof simulateChuseokBattle } = {}) {
  async function ensureEvent(): Promise<Event | null> {
    const [existing] = await database.select().from(chuseokEvents).where(eventWhere);
    if (existing) return existing;
    const window = chuseokWindow(startsAt());
    if (!window) return null;
    await database.insert(chuseokEvents).values({ id: CHUSEOK_EVENT_ID, startsAt: new Date(window.startsAt), endsAt: new Date(window.endsAt) }).onConflictDoNothing();
    const [event] = await database.select().from(chuseokEvents).where(eventWhere);
    return event ?? null;
  }

  function gate(event: Event | null): EventError | null {
    const phase = chuseokPhase(event ? windowFor(event) : null, now());
    return phase === "active" ? null : { ok: false, error: phase === "pending" ? "event_pending" : "event_ended" };
  }

  async function participant(tx: DbExecutor, userId: string) {
    await tx.insert(chuseokParticipants).values({ eventId: CHUSEOK_EVENT_ID, userId }).onConflictDoNothing();
    const [row] = await tx.select().from(chuseokParticipants).where(participantWhere(userId)).for("update");
    if (!row) throw new Error("chuseok participant missing");
    return row;
  }

  async function characterExists(tx: DbExecutor, userId: string) {
    // Shared save lock order: character first, then event/participant, then potions.
    const character = await lockSaveForUpdate(tx, userId, "character.v2", null);
    const profile = await readSave(tx, userId, "character-profile.v2", null);
    return character != null && isProfileComplete(profile);
  }

  async function read(userId: string): Promise<ChuseokState> {
    const event = await ensureEvent();
    const window = event ? windowFor(event) : null;
    const [mine] = event ? await database.select().from(chuseokParticipants).where(participantWhere(userId)) : [];
    const [total] = event ? await database.select({ count: count() }).from(chuseokParticipants).where(and(eq(chuseokParticipants.eventId, CHUSEOK_EVENT_ID), gt(chuseokParticipants.attackCount, 0))) : [];
    const at = now();
    const used = mine?.dayKey === kstDayKey(new Date(at)) ? mine.dailyAttackCount : 0;
    return {
      ok: true, window, phase: chuseokPhase(window, at),
      attendance: chuseokAttendance(mine?.attendanceDays ?? [], window, at),
      raid: {
        stage: event?.stage ?? 1, hp: event?.hp ?? chuseokMaxHp(1), maxHp: event?.maxHp ?? chuseokMaxHp(1),
        myDamage: mine?.damage ?? 0, attacksRemaining: Math.max(0, CHUSEOK_DAILY_ATTACKS - used), participantCount: total?.count ?? 0,
      },
    };
  }

  async function attend(userId: string): Promise<{ ok: true; reward: number } | EventError> {
    const event = await ensureEvent();
    const denied = gate(event);
    if (denied || !event) return denied ?? { ok: false, error: "event_pending" };
    return database.transaction(async (tx) => {
      if (!(await characterExists(tx, userId))) return { ok: false, error: "no_character" };
      const mine = await participant(tx, userId);
      const status = chuseokAttendance(mine.attendanceDays, windowFor(event), now());
      const closed = gate(event);
      if (closed) return closed;
      if (status.claimedToday) return { ok: false, error: "already_claimed" };
      if (status.complete || status.nextReward == null) return { ok: false, error: "attendance_complete" };
      const potions = await lockSaveForUpdate(tx, userId, STAMINA_POTIONS_KEY, {});
      await upsertSave(tx, userId, STAMINA_POTIONS_KEY, grantStaminaPotions(potions, status.nextReward));
      await tx.update(chuseokParticipants).set({ attendanceDays: [...mine.attendanceDays, status.todayKey] }).where(participantWhere(userId));
      return { ok: true, reward: status.nextReward };
    });
  }

  async function attack(userId: string, requestId: string): Promise<ChuseokAttackResult | EventError> {
    if (!validChuseokRequestId(requestId)) return { ok: false, error: "bad_request_id" };
    const event = await ensureEvent();
    if (!event) return { ok: false, error: "event_pending" };
    return database.transaction(async (tx) => {
      if (!(await characterExists(tx, userId))) return { ok: false, error: "no_character" };
      const [existing] = await tx.select().from(chuseokAttacks).where(attackWhere(userId, requestId));
      if (existing) return existing.result;
      const denied = gate(event);
      if (denied) return denied;
      // Character lock serializes this user's attendance and attacks even on the first request.
      const mine = await participant(tx, userId);
      const dayKey = kstDayKey(new Date(now()));
      const used = mine.dayKey === dayKey ? mine.dailyAttackCount : 0;
      if (used >= CHUSEOK_DAILY_ATTACKS) return { ok: false, error: "daily_limit" };
      const battle = await simulate({ tx, userId });
      if (!battle) return { ok: false, error: "no_character" };
      // Participant inserts hold an FK KEY SHARE lock on this event. NO KEY UPDATE
      // serializes HP writers without deadlocking simultaneous first participants.
      const [progress] = await tx.select().from(chuseokEvents).where(eventWhere).for("no key update");
      if (!progress) throw new Error("chuseok event missing");
      // Recheck after simulation and lock wait so an in-flight request cannot pass the deadline.
      const closed = gate(progress);
      if (closed) return closed;
      const committedDay = kstDayKey(new Date(now()));
      const committedUsed = mine.dayKey === committedDay ? mine.dailyAttackCount : 0;
      const applied = applyGuildRaidDamage(progress, battle.damageDealt, chuseokMaxHp);
      await tx.update(chuseokParticipants).set({
        damage: mine.damage + battle.damageDealt, attackCount: mine.attackCount + 1,
        dayKey: committedDay, dailyAttackCount: committedUsed + 1,
      }).where(participantWhere(userId));
      await tx.update(chuseokEvents).set({ stage: applied.stage, hp: applied.hp, maxHp: applied.maxHp }).where(eventWhere);
      if (mine.attackCount === 0 && progress.stage > 1) {
        // Use the locked progress before this attack, excluding new clears below.
        // The participant update, mail and request record commit together, so retries
        // and simultaneous first attacks cannot grant this catch-up reward twice.
        const amount = (progress.stage - 1) * CHUSEOK_CLEAR_REWARD;
        await tx.insert(marketplaceInbox).values(inboxValues({
          userId,
          message: `추석 복주머니 참여 전 1~${progress.stage - 1}단계 보상: 스태미나 회복약 ${amount}개`,
          payload: { kind: "admin_gift", gold: 0, materials: [], items: [], staminaPotions: amount, museunCoins: 0, cashItems: [], adventureSupportDays: 0 },
        }));
      }
      if (applied.stagesCleared > 0) {
        // No recipient save locks: rewards use the existing claimable inbox transaction.
        const recipients = await tx.select({ userId: chuseokParticipants.userId }).from(chuseokParticipants).where(and(eq(chuseokParticipants.eventId, CHUSEOK_EVENT_ID), gt(chuseokParticipants.attackCount, 0)));
        const amount = applied.stagesCleared * CHUSEOK_CLEAR_REWARD;
        for (let offset = 0; offset < recipients.length; offset += 500) {
          await tx.insert(marketplaceInbox).values(recipients.slice(offset, offset + 500).map(({ userId: recipientId }) => inboxValues({
            userId: recipientId,
            message: `추석 복주머니 ${progress.stage}~${applied.stage - 1}단계 처치 보상: 스태미나 회복약 ${amount}개`,
            payload: { kind: "admin_gift", gold: 0, materials: [], items: [], staminaPotions: amount, museunCoins: 0, cashItems: [], adventureSupportDays: 0 },
          })));
        }
      }
      const result: ChuseokAttackResult = { ok: true, damageDealt: battle.damageDealt, stagesCleared: applied.stagesCleared, stage: applied.stage, hp: applied.hp, maxHp: applied.maxHp, replay: battle.replay };
      await tx.insert(chuseokAttacks).values({ eventId: CHUSEOK_EVENT_ID, userId, requestId, result });
      return result;
    });
  }
  return { read, attend, attack };
}

export const chuseokEventService = createChuseokEventService();
