import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  guilds,
  outpostOccupations,
  outpostTreasury,
  savesKv,
} from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { getGuildId } from "@/lib/server/v2EnsureSoloGuild";
import { reconcileV2EquippedSkills } from "@/lib/server/v2Skills";
import { ensureV2Character } from "@/lib/server/v2Character";
import { parseV2SkillsState } from "@/adventure/data/v2/v2Skills";
import {
  parseV2Class,
  tier1ClassOf,
  signaturesForClass,
  signatureClassOf,
  V2_CLASS_DEFS,
} from "@/adventure/data/v2/classes";
import {
  parseProficiency,
  totalEarned,
  groupEarned,
  groupUsable,
  cultivationCount,
  cultivationCost,
  signatureLearnCost,
} from "@/adventure/data/v2/proficiency";
import { parseV2Element } from "@/adventure/data/v2/elements";
import {
  V2_CODEX_TOTAL,
  discoveredMaterialIds,
} from "@/adventure/data/v2/codex";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { readGuildResources } from "@/lib/server/v2GuildResources";
import { requiredExpToNext } from "@/lib/leveling";
import {
  MAX_STAMINA,
  applyRegen,
  parseStaminaFromSave,
} from "@/adventure/v2/stamina";
import { applyHpRegen, parseHpRegenSince } from "@/adventure/v2/hpRegen";
import { OUTPOSTS } from "@/adventure/data/v2/outposts";

// GET /api/v2/me/state — V2GameFlow 의 mount fetch (캐릭+자원+currentOutpost).
//
// 캐릭터(레벨/EXP/HP/스태미너/골드) + 길드(id/name) + 자원풀 한 번에.
// HP·stamina 는 시간 회복 적용한 현재값으로 surface (다음 사냥 진입 시 동기화).

export async function GET() {
  const userId = await ensureUser();
  if (!userId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  // reconcileV2EquippedSkills 는 idempotent — equipped 만 학습분∩현 체인으로 reconcile
  // (시그니처는 learn-skill 라우트로 숙련도 학습; 자동부여 폐지). learned 불변.
  // 길드는 더 이상 자동 생성 X — null 이면 무소속.
  const guildId = await db.transaction(async (tx) => {
    const gid = await getGuildId(tx, userId);
    await reconcileV2EquippedSkills(tx, userId);
    await ensureV2Character(tx, userId);
    return gid;
  });

  const [
    charRow,
    profileRow,
    guildRow,
    combat,
    resources,
    skillsRow,
    proficiencyRow,
  ] = await Promise.all([
      db
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "character.v2")))
        .limit(1)
        .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(
        and(
          eq(savesKv.userId, userId),
          eq(savesKv.key, "character-profile.v2"),
        ),
      )
      .limit(1)
      .then((rows) => rows[0]),
    guildId == null
      ? Promise.resolve(undefined)
      : db
          .select({ name: guilds.name })
          .from(guilds)
          .where(eq(guilds.id, guildId))
          .limit(1)
          .then((rows) => rows[0]),
    derivePlayerCombatV2(userId),
    guildId == null
      ? Promise.resolve(null)
      : db.transaction(async (tx) => readGuildResources(tx, guildId)),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "skills.v2")))
      .limit(1)
      .then((rows) => rows[0]),
    db
      .select({ value: savesKv.value })
      .from(savesKv)
      .where(and(eq(savesKv.userId, userId), eq(savesKv.key, "proficiency.v2")))
      .limit(1)
      .then((rows) => rows[0]),
  ]);

  const charSave = (charRow?.value ?? {}) as {
    level?: number;
    exp?: number;
    hp?: number;
    hpRegenSince?: number;
    stamina?: unknown;
    gold?: number;
    materials?: unknown;
    lastVisitedOutpost?: { outpostId?: string; at?: number };
  };

  // V2TopBar 좌측 표시 — character.v2.lastVisitedOutpost.outpostId → OUTPOSTS lookup.
  // null = 아직 거점 방문 안 함 ("이동 중").
  // PR-outpost-info: V2AdventureHome 의 거점 카드용 occupation (보유 길드/세율/정책/다음 공격)
  // 동봉. row 없으면 occupation=null (NPC 운영). 점령 길드 name 별도 select.
  type OccupationInfo = {
    occupiedByUserId: string | null;
    occupiedByGuildId: number | null;
    occupiedByGuildName: string | null;
    occupiedAt: string;
    policy: string;
    taxRate: string;
    nextAttackAt: string;
  };
  type CurrentOutpost = {
    id: string;
    name: string;
    occupation: OccupationInfo | null;
    // 거점 금고 — 점령 길드원이 회수 가능한 누적 세금. 미점령 거점도 누적될 수 있어 별도 노출.
    treasuryGold: number;
  };
  let currentOutpost: CurrentOutpost | null = null;
  const lastVisitId = charSave.lastVisitedOutpost?.outpostId;
  if (typeof lastVisitId === "string") {
    const o = OUTPOSTS.find((x) => x.id === lastVisitId);
    if (o) {
      const occRow = (
        await db
          .select()
          .from(outpostOccupations)
          .where(eq(outpostOccupations.outpostId, o.id))
          .limit(1)
      )[0];
      let occupation: OccupationInfo | null = null;
      if (occRow) {
        let occGuildName: string | null = null;
        if (occRow.occupiedByGuildId != null) {
          const g = (
            await db
              .select({ name: guilds.name })
              .from(guilds)
              .where(eq(guilds.id, occRow.occupiedByGuildId))
              .limit(1)
          )[0];
          occGuildName = g?.name ?? null;
        }
        occupation = {
          occupiedByUserId: occRow.occupiedByUserId,
          occupiedByGuildId: occRow.occupiedByGuildId,
          occupiedByGuildName: occGuildName,
          occupiedAt: occRow.occupiedAt.toISOString(),
          policy: occRow.policy,
          taxRate: occRow.taxRate,
          nextAttackAt: occRow.nextAttackAt.toISOString(),
        };
      }
      const treasuryRow = (
        await db
          .select({ gold: outpostTreasury.gold })
          .from(outpostTreasury)
          .where(eq(outpostTreasury.outpostId, o.id))
          .limit(1)
      )[0];
      currentOutpost = {
        id: o.id,
        name: o.name,
        occupation,
        treasuryGold: Math.max(0, treasuryRow?.gold ?? 0),
      };
    }
  }
  const profile = (profileRow?.value ?? null) as {
    name?: string;
    gender?: string;
  } | null;
  const name = profile?.name?.trim() || "모험가";
  const gender =
    typeof profile?.gender === "string" && profile.gender.length > 0
      ? profile.gender
      : "male1";
  const guildName = guildRow?.name ?? null;
  const maxHp = combat?.maxHp ?? 100;
  const maxMp = combat?.player.maxMp ?? 0;

  const now = Date.now();
  const stamina = applyRegen(parseStaminaFromSave(charSave.stamina, now), now);

  const hpStored = Math.max(0, charSave.hp ?? maxHp);
  const hpRegenSince = parseHpRegenSince(charSave.hpRegenSince, now);
  const hpRegen = applyHpRegen(hpStored, maxHp, hpRegenSince, now);

  const level = Math.max(1, charSave.level ?? 1);
  const exp = Math.max(0, charSave.exp ?? 0);
  const expToNext = requiredExpToNext(level);

  // V2CharacterScreen 의 StatsPanel 표시용. combat 미생성(캐릭 없음) 시 null.
  const stats = combat
    ? {
        base: combat.baseAllocatedStats,
        total: combat.totalStats,
      }
    : null;
  const combatStats = combat
    ? {
        atk: combat.player.atk,
        def: combat.player.def,
        spd: combat.player.spd,
        // 마법 공격력 — INT 환산. 0(물리 빌드)이면 StatsPanel 이 숨김.
        magicAtk: combat.player.magicAtk ?? 0,
      }
    : null;

  return Response.json({
    ok: true,
    character: {
      name,
      gender,
      level,
      exp,
      expToNext,
      hp: hpRegen.hp,
      maxHp,
      // v2 마법 풀 — derive 가 character.v2.mp 시드, 미지정이면 maxMp 풀충. INT 0 이면 둘 다 0.
      mp: combat?.player.mp ?? maxMp,
      maxMp,
      stamina: {
        current: stamina.current,
        max: MAX_STAMINA,
        lastUpdatedAt: stamina.lastUpdatedAt,
      },
      gold: Math.max(0, charSave.gold ?? 0),
      // PR-1 전투 재설계 — 직업·속성 (캐릭터 화면 헤더 + 피커).
      class: parseV2Class((charSave as { class?: unknown }).class),
      element: parseV2Element((charSave as { element?: unknown }).element),
    },
    stats,
    combat: combatStats,
    guild: guildId == null ? null : { id: guildId, name: guildName ?? "—" },
    resources,
    currentOutpost,
    skills: parseV2SkillsState(skillsRow?.value),
    // 시그니처 학습 현황 — 현 직업 체인의 각 시그니처 + 차수/비용/학습여부(UI 학습 패널용).
    signatures: (() => {
      const cls = parseV2Class((charSave as { class?: unknown }).class);
      const skillsState = parseV2SkillsState(skillsRow?.value);
      const learnedSet = new Set<string>(skillsState.learned);
      return signaturesForClass(cls).map((skillId) => {
        const sigClass = signatureClassOf(skillId) ?? cls;
        const tier = V2_CLASS_DEFS[sigClass].tier;
        return {
          skillId,
          tier,
          cost: signatureLearnCost(tier),
          learned: learnedSet.has(skillId),
        };
      });
    })(),
    // 모험의 서(재료 도감) 진척 — 3·4차 전직 게이트 + 코덱스 UI 표시용.
    codex: (() => {
      const ids = discoveredMaterialIds(charSave.materials);
      return { discovered: ids.length, total: V2_CODEX_TOTAL, discoveredIds: ids };
    })(),
    // 직업 숙련도(직업 마스터리) — 총/직업 + 현 직업군 사용가능. 수행·전직·표시용.
    proficiency: (() => {
      const prof = parseProficiency(proficiencyRow?.value);
      const group = tier1ClassOf(
        parseV2Class((charSave as { class?: unknown }).class),
      );
      return {
        total: totalEarned(prof),
        groups: prof.groups,
        caps: prof.caps,
        current: {
          group,
          earned: groupEarned(prof, group),
          usable: groupUsable(prof, group),
          cultivations: cultivationCount(prof, group),
          nextCost: cultivationCost(cultivationCount(prof, group)),
        },
      };
    })(),
  });
}
