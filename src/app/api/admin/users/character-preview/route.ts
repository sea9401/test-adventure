import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv, users } from "@/db/schema";
import { requireAdmin, currentAdminEmail } from "@/lib/server/isAdmin";
import { logAdminAction } from "@/lib/server/adminAudit";
import {
  derivePlayerCombatV2FromSaves,
  type SavedCharacterV2,
} from "@/lib/server/derivePlayerCombatV2";
import { sanitizeCombatLoadout } from "@/lib/server/v2Skills";
import { readCodexSpBonus } from "@/lib/server/codexSpBonus";
import { readJobUnlockContext } from "@/lib/server/jobUnlockContext";
import {
  emptyV2SkillsState,
  parseV2SkillsState,
} from "@/adventure/data/v2/v2Skills";
import {
  MAX_FRONTIER_DEPTH,
  depthName,
  enemiesForDepth,
} from "@/adventure/data/v2/dungeon";
import { V2_MONSTERS } from "@/adventure/data/v2/v2Monsters";
import { scaleMonsterForHunt } from "@/adventure/data/v2/monsterScale";
import { resolveBattle } from "@/adventure/v2/combat/engine";
import { pickAutoAction } from "@/adventure/v2/combat/pickAutoAction";
import { toReplayPayload } from "@/adventure/data/v2/replayPayload";
import { readProfileValue } from "@/adventure/profile/profileValue";
import { jobDisplayName, parseV2Class } from "@/adventure/data/v2/classes";

const PREVIEW_KEYS = [
  "character.v2",
  "character-profile.v2",
  "equipment.v2",
  "proficiency.v2",
  "skills.v2",
] as const;

type PreviewCharacter = SavedCharacterV2 & {
  frontierDepth?: number;
  specChoice?: unknown;
};

function clampDepth(raw: unknown): number {
  const depth = Math.floor(Number(raw) || 1);
  return Math.min(MAX_FRONTIER_DEPTH, Math.max(1, depth));
}

// POST /api/admin/users/character-preview
// 대상 유저의 실제 성장 스냅샷을 읽어 전투 엔진만 실행한다. saves_kv 및 게임 진행 데이터에는
// 쓰지 않으며, 실행 사실만 관리자 감사 로그에 기록한다.
export async function POST(req: Request) {
  const gate = await requireAdmin();
  if (gate) return gate;

  let body: { userId?: unknown; depth?: unknown; enemyKey?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return Response.json({ ok: false, error: "missing_user" }, { status: 400 });
  }

  const [target] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) {
    return Response.json({ ok: false, error: "user_not_found" }, { status: 404 });
  }

  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(eq(savesKv.userId, userId), inArray(savesKv.key, [...PREVIEW_KEYS])),
    );
  const saves = new Map(rows.map((row) => [row.key, row.value]));
  const character = saves.get("character.v2") as PreviewCharacter | undefined;
  if (!character) {
    return Response.json({ ok: false, error: "no_character" }, { status: 400 });
  }

  const frontierDepth = Math.min(
    MAX_FRONTIER_DEPTH,
    Math.max(1, Math.floor(Number(character.frontierDepth) || 2)),
  );
  const availableDepth = Math.min(MAX_FRONTIER_DEPTH, frontierDepth + 1);
  const depth = clampDepth(body.depth);
  if (depth > availableDepth) {
    return Response.json(
      { ok: false, error: "depth_locked", availableDepth },
      { status: 400 },
    );
  }

  const enemyPool = enemiesForDepth(depth);
  const requestedKey =
    typeof body.enemyKey === "string" ? body.enemyKey.trim() : "";
  const enemy =
    enemyPool.find((candidate) => candidate.key === requestedKey) ?? enemyPool[0];
  const baseMonster = enemy ? V2_MONSTERS[enemy.key] : undefined;
  if (!enemy || !baseMonster) {
    return Response.json({ ok: false, error: "monster_not_found" }, { status: 400 });
  }

  const equipmentSave = saves.get("equipment.v2");
  const proficiencyRaw = saves.get("proficiency.v2");
  const skillsRaw = saves.get("skills.v2") ?? emptyV2SkillsState();
  const derived = derivePlayerCombatV2FromSaves({
    character,
    equipmentSave,
    proficiencyRaw,
    skillsRaw,
  });
  if (!derived) {
    return Response.json({ ok: false, error: "no_character" }, { status: 400 });
  }

  const storedSkills = parseV2SkillsState(skillsRaw);
  const v2Skills = sanitizeCombatLoadout(
    storedSkills,
    character,
    proficiencyRaw,
    (await readCodexSpBonus(db, userId)).total,
    await readJobUnlockContext(db, userId),
  );
  const profile = readProfileValue(saves.get("character-profile.v2"));
  const playerName = profile?.name ?? "모험가";
  const scaledEnemy = scaleMonsterForHunt(baseMonster, depth);
  const seededMonsterSkills = [enemy.statusSkill, enemy.castSkill].filter(
    (skill): skill is NonNullable<typeof skill> => skill != null,
  );
  const enemyMonster: import("@/adventure/data/monsters/types").Monster = {
    ...scaledEnemy,
    name: enemy.name,
    image: enemy.image ?? baseMonster.image,
    element: "neutral",
    ...(seededMonsterSkills.length > 0
      ? {
          v2Skills: {
            learned: seededMonsterSkills,
            equipped: seededMonsterSkills,
          },
        }
      : {}),
  };
  const playerForBattle = {
    ...derived.player,
    hp: derived.maxHp,
    mp: derived.player.maxMp ?? derived.player.mp ?? 0,
  };

  const battle = resolveBattle(playerForBattle, enemyMonster, playerName, {
    pickAction: (state) => pickAutoAction(state, { rules: [], potions: {} }),
    potions: {},
    v2Skills,
    depth,
  });
  const outcome = battle.outcome === "win" ? "win" : "lose";

  await logAdminAction({
    adminEmail: await currentAdminEmail(),
    action: "character.preview",
    targetUserId: userId,
    detail: { depth, enemyKey: enemy.key, enemyName: enemy.name, outcome, turns: battle.turns },
  });

  return Response.json({
    ok: true,
    result: {
      outcome,
      turns: battle.turns,
      depth,
      depthName: depthName(depth),
      availableDepth,
      enemyName: enemy.name,
      enemyKey: enemy.key,
      replay: toReplayPayload(battle.finalState),
      startPlayerHp: derived.maxHp,
      profile: {
        name: playerName,
        gender: profile?.gender ?? "male1",
        level: Math.max(1, Math.floor(Number(character.level) || 1)),
        job: jobDisplayName(
          parseV2Class(character.class),
          typeof character.specChoice === "string" ? character.specChoice : null,
        ),
      },
      combat: {
        maxHp: derived.maxHp,
        maxMp: derived.player.maxMp ?? 0,
        atk: derived.player.atk,
        magicAtk: derived.player.magicAtk ?? 0,
        def: derived.player.def,
        magicDef: derived.player.magicDef ?? 0,
        spd: derived.player.spd,
        accuracyPct: derived.player.accuracyPct ?? 0,
        evasionPct: derived.player.evasionPct ?? 0,
        critPct: derived.player.critChancePct ?? 0,
      },
    },
  });
}
