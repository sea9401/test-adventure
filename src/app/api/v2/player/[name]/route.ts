import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { guildMembers, guilds, savesKv } from "@/db/schema";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { ensureUser } from "@/lib/server/ensureUser";
import { derivePlayerCombatV2 } from "@/lib/server/derivePlayerCombatV2";
import { derivePowerScore } from "@/adventure/data/v2/power";
import {
  parseV2Class,
  tier1ClassOf,
  jobDisplayName,
} from "@/adventure/data/v2/classes";
import { V2_CORE_LOOP_V2 } from "@/adventure/data/v2/coreLoopConfig";
import { parseV2Element } from "@/adventure/data/v2/elements";
import {
  parseProficiencyForChar,
  type V2ProficiencyState,
} from "@/adventure/data/v2/proficiency";
import {
  V2_EQUIPMENT,
  parseEquipmentSave,
} from "@/adventure/data/v2/v2Equipment";
import {
  artisanLevel,
  artisanXpForNextLevel,
  artisanXpIntoLevel,
  parseArtisanState,
} from "@/adventure/data/v2/artisan";
import { parseGuildWorkshopStats } from "@/adventure/data/v2/guildWorkshop";

// GET /api/v2/player/[name] — 다른 모험가의 공개 캐릭터 정보. URL 의 [name] = 닉네임.
//   "내 정보" 화면과 같은 항목(레벨·직업·속성·능력치·전투 스탯·장착 장비·숙련도)을 돌려준다.
//   단 골드/HP/EXP 같은 사적·일시 값은 제외(공개 보기). 로그인 필요. read-only.
//
// /me/state 의 공개 부분만 추린 경량판 — V2CharacterScreen 이 그대로 렌더(StateResponse 호환).

type Ctx = { params: Promise<{ name: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const viewerId = await ensureUser();
  if (!viewerId) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  // Next 가 동적 세그먼트를 이미 URL-디코드해 넘긴다 — 추가 decodeURIComponent 금지
  //   (이름에 '%' 포함 시 URIError). trim 만.
  const { name: rawName } = await ctx.params;
  const lookupName = (rawName ?? "").trim();
  if (!lookupName) {
    return Response.json({ ok: false, error: "bad_request" }, { status: 400 });
  }

  // 닉네임 → userId 해석. **표시 이름과 동일 규칙으로** 찾는다 — game_name 우선, 없으면(빈 문자열
  //   포함) character-profile.v2.name (resolveActor·/api/profile/by-name 과 일치). 채팅·랭킹 등에서
  //   보이는 이름이 game_name 이어도 해석되게 한다(이름은 check-name 가 유니크 보장 · 대소문자 무시).
  const resolved = await db.execute(sql`
    SELECT u.id AS user_id
    FROM users u
    LEFT JOIN saves_kv p
      ON p.user_id = u.id AND p.key = ${PROFILE_STORAGE_KEY}
    WHERE lower(COALESCE(NULLIF(btrim(u.game_name), ''), btrim(p.value->>'name')))
        = lower(${lookupName})
    LIMIT 1
  `);
  const targetId = (resolved.rows[0] as { user_id?: string } | undefined)
    ?.user_id;
  if (!targetId) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  // 대상 유저의 공개 save 들 일괄 조회.
  const rows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, targetId),
        inArray(savesKv.key, [
          "character.v2",
          "character-profile.v2",
          "proficiency.v2",
          "adventure-log.v2",
          "equipment.v2",
          "crafting.v2",
        ]),
      ),
    );
  const byKey = new Map(rows.map((r) => [r.key, r.value]));
  const charSave = byKey.get("character.v2") as
    | Record<string, unknown>
    | undefined;
  if (!charSave) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const combat = await derivePlayerCombatV2(targetId);
  if (!combat) {
    return Response.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const profile = byKey.get("character-profile.v2") as
    | { name?: string; gender?: string }
    | undefined;
  const name = profile?.name?.trim() || "모험가";
  const gender =
    (profile?.gender as string | undefined) ??
    ((charSave.gender as string | undefined) || "male1");

  const level = Math.max(1, Number(charSave.level) || 1);
  const maxHp = combat.maxHp;
  const maxMp = combat.player.maxMp ?? 0;
  const playerClass = parseV2Class(charSave.class);
  const element = parseV2Element(charSave.element);
  // 공개 프로필 직업 표시명 — 캐릭터 카드가 옛 클래스명 대신 직업명(견습 병사·방패병 등)을
  //   쓰도록 동봉(me/state 와 동일 해석). core-loop off 면 null → 카드가 class 직군명 폴백.
  const playerSpec =
    typeof (charSave as { specChoice?: unknown }).specChoice === "string"
      ? ((charSave as { specChoice?: string }).specChoice ?? null)
      : null;
  const classDisplayName = V2_CORE_LOOP_V2
    ? jobDisplayName(playerClass, playerSpec)
    : null;

  // 숙련도 — 현 직군 숙련도/숙달포인트 + 전 스탯 cap(StatsPanel 표기용).
  const prof = parseProficiencyForChar(
    byKey.get("proficiency.v2") as V2ProficiencyState | undefined,
    charSave,
  );
  const group = tier1ClassOf(playerClass);
  const currentGroup = prof.groups[group];

  // 누적 전투 횟수(전적) — monster kills 합 + 패배수.
  const logVal = byKey.get("adventure-log.v2") as {
    monsters?: Record<string, { kills?: number }>;
    battleLosses?: number;
  } | null;
  const battleCount =
    Object.values(logVal?.monsters ?? {}).reduce(
      (sum, m) => sum + (m?.kills ?? 0),
      0,
    ) + (logVal?.battleLosses ?? 0);

  // 길드 — guildMembers 직접 조회(getGuildId 는 tx 전용 타입).
  const memberRow = await db
    .select({ guildId: guildMembers.guildId })
    .from(guildMembers)
    .where(eq(guildMembers.userId, targetId))
    .limit(1);
  const guildId = memberRow[0]?.guildId ?? null;
  let guildName: string | null = null;
  if (guildId != null) {
    const [g] = await db
      .select({ name: guilds.name })
      .from(guilds)
      .where(eq(guilds.id, guildId))
      .limit(1);
    guildName = g?.name ?? null;
  }

  const { owned, equipped } = parseEquipmentSave(byKey.get("equipment.v2"));
  // 공개 보기엔 장착 중인 개체만 내려보낸다(전체 인벤토리 over-share 방지). 카드는 equipped
  // 슬롯의 iid 를 이 목록으로 해석해 표시하므로 이게 충분하다.
  const equippedIids = new Set(Object.values(equipped));
  const ownedPublic = owned
    .filter((o) => equippedIids.has(o.iid))
    // 카드 표시에 필요한 것만(iid·id·굴림·강화·제작자) — locked(즐겨찾기) 등 사적 플래그 제거.
    // 강화(+N)는 뽐내기 목적 그 자체라 공개(2026-06-12 사용자).
    .map(({ iid, id, roll, enhance, craftedBy }) => ({
      iid,
      id,
      roll,
      enhance,
      craftedBy,
    }));
  const selfCraftedEquipped = ownedPublic
    .filter((item) => item.craftedBy?.userId === targetId)
    .map((item) => {
      const def = V2_EQUIPMENT[item.id];
      return def
        ? {
            iid: item.iid,
            id: item.id,
            name: def.name,
            slot: def.slot,
            tier: def.tier,
            enhanceLevel: item.enhance?.level ?? 0,
          }
        : null;
    })
    .filter((item): item is NonNullable<typeof item> => item != null)
    .sort((a, b) => {
      if (b.enhanceLevel !== a.enhanceLevel) {
        return b.enhanceLevel - a.enhanceLevel;
      }
      return b.tier - a.tier;
    });
  const signatureCraft = selfCraftedEquipped[0] ?? null;

  const craftingRaw = byKey.get("crafting.v2") as
    | Record<string, unknown>
    | undefined;
  const artisan = parseArtisanState(craftingRaw?.artisan);
  const blacksmith = artisan.blacksmith ?? { xp: 0, crafts: 0 };
  const workshopStats = parseGuildWorkshopStats(craftingRaw?.workshopStats);

  return Response.json({
    ok: true,
    character: {
      name,
      gender,
      level,
      // 사적·일시 값 비공개 — 공개 보기엔 0/null/풀피로 내려 화면이 골드·EXP·현재HP 를 안 드러냄.
      exp: 0,
      expToNext: null,
      hp: maxHp,
      maxHp,
      mp: maxMp,
      maxMp,
      gold: 0,
      class: playerClass,
      classDisplayName,
      element,
    },
    guild: guildId == null ? null : { name: guildName ?? "—" },
    stats: { base: combat.baseAllocatedStats, total: combat.totalStats },
    combat: {
      atk: combat.player.atk,
      def: combat.player.def,
      spd: combat.player.spd,
      magicAtk: combat.player.magicAtk ?? 0,
      magicDef: combat.player.magicDef ?? 0,
      evasionPct: combat.player.evasionPct,
      accuracyPct: combat.player.accuracyPct,
      critChancePct: combat.player.critChancePct,
      critMult: combat.player.critMult,
      power: derivePowerScore({
        atk: combat.player.atk,
        magicAtk: combat.player.magicAtk ?? 0,
        def: combat.player.def,
        spd: combat.player.spd,
        maxHp,
        maxMp,
      }),
    },
    battleCount,
    proficiency: {
      caps: prof.caps,
      current: {
        group,
        cumLevel: currentGroup?.cumLevel ?? 0,
        // 차수 레벨 캡 산출용 표시값. points/cultivations 는 공개 보기에선 생략(사적).
      },
      // 화면은 groups[g].tier 만 읽는다 — tier 만 내려보내 그룹별 포인트/수행 횟수 누수 차단.
      groups: Object.fromEntries(
        Object.entries(prof.groups).map(([g, v]) => [g, { tier: v.tier }]),
      ),
    },
    artisan: {
      blacksmith: {
        level: artisanLevel(blacksmith),
        xp: blacksmith.xp,
        crafts: blacksmith.crafts,
        xpIntoLevel: artisanXpIntoLevel(blacksmith),
        xpForNext: artisanXpForNextLevel(blacksmith),
        totalCrafts: workshopStats.totalCrafts,
        qualityCrafts: workshopStats.qualityCrafts,
        signatureCraft,
        equippedSelfCrafts: selfCraftedEquipped.length,
      },
    },
    equipment: { owned: ownedPublic, equipped },
  });
}
