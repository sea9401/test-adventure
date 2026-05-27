import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { users, savesKv } from "@/db/schema";
import { ensureUser } from "@/lib/server/ensureUser";
import { checkSession } from "@/lib/server/checkSession";
import { upsertSave } from "@/lib/server/savesKv";
import { PROFILE_STORAGE_KEY } from "@/lib/storage-keys";
import { isValidAvatarId, type Avatar } from "@/adventure/profile/avatars";

const NAME_MIN = 1;
const NAME_MAX = 16;

// 트랜잭션 안에서 "이름 중복" 신호용 — Postgres 23505 또는 legacy hit 양쪽을 한곳에서 처리.
class TakenError extends Error {
  constructor() {
    super("taken");
  }
}

// POST /api/profile/setup
// 본문: { name: string, gender: Avatar }
//
// 멱등 + 원자성:
// 1) users.gameName 이 이미 박혀 있으면(권위 컬럼) 절대 덮어쓰지 않음.
//    savesKv 프로필이 비어있거나 name 이 어긋났으면 동기화(자가 치유)만 수행.
//    "다른 디바이스 첫 진입 시 모달이 잘못 떠서 다시 이름을 제출한" 경로 보호.
// 2) 신규(gameName NULL)면 중복 검사 후 users.gameName + savesKv 를 한 트랜잭션에서
//    함께 쓴다 — 한쪽만 성공한 partial state(부분 쓰기) 차단.
//
// 응답:
// 200 { ok: true, profile: { name, gender } } — 성공(신규) 또는 자가 치유. 클라가 이 값으로
//      React state 갱신해야 모달 사라짐 (사용자 입력이 아니라 권위 닉네임을 채택).
// 400 { error: "invalid" } — 유효성 실패
// 409 { error: "taken" } — 다른 유저가 이미 사용 중
export async function POST(req: Request) {
  let userId: string | null;
  try {
    userId = await ensureUser();
  } catch (e) {
    const err = e as { code?: string; name?: string; message?: string };
    console.error("[/api/profile/setup] ensureUser threw", {
      code: err.code,
      name: err.name,
      message: err.message,
    });
    return new Response("server error (auth)", { status: 500 });
  }
  if (!userId) return new Response("unauthorized", { status: 401 });
  const sessionFail = await checkSession(userId, req);
  if (sessionFail) return sessionFail;
  const uid = userId;

  let body: { name?: unknown; gender?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const gender = typeof body.gender === "string" ? body.gender : "";
  if (!isValidAvatarId(gender)) {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
  const submittedGender = gender as Avatar;

  try {
    const finalProfile = await db.transaction(async (tx) => {
      // 권위 컬럼(users.gameName)과 savesKv 프로필을 한 트랜잭션 안에서 조회.
      const userRows = await tx
        .select({ gameName: users.gameName })
        .from(users)
        .where(eq(users.id, uid))
        .limit(1);
      const existingGameName = userRows[0]?.gameName ?? null;

      const profileRows = await tx
        .select({ value: savesKv.value })
        .from(savesKv)
        .where(
          and(eq(savesKv.userId, uid), eq(savesKv.key, PROFILE_STORAGE_KEY)),
        )
        .limit(1);
      const existingProfile = (profileRows[0]?.value ?? null) as
        | { name?: string; gender?: string }
        | null;

      // ── 멱등 경로 — gameName 이 이미 박혀 있다 = 신규가 아님. 절대 덮어쓰지 않음.
      // savesKv 가 비었거나 name 이 어긋났으면 권위값으로 동기화(자가 치유).
      if (existingGameName) {
        const healedGender = isValidAvatarId(existingProfile?.gender ?? "")
          ? (existingProfile!.gender as Avatar)
          : submittedGender;
        const healedProfile = {
          name: existingGameName,
          gender: healedGender,
        };
        const needsHeal =
          !existingProfile || existingProfile.name !== existingGameName;
        if (needsHeal) {
          console.warn("[/api/profile/setup] heal savesKv", {
            userId: uid,
            gameName: existingGameName,
            hadSavesKv: !!existingProfile,
          });
          await upsertSave(tx, uid, PROFILE_STORAGE_KEY, healedProfile);
        }
        return healedProfile;
      }

      // ── 신규 경로 — 중복 검사 후 둘 다 쓰기. 트랜잭션 안에서 진행돼 한쪽만 박히는 일 없음.
      const legacyHit = await tx
        .select({ userId: savesKv.userId })
        .from(savesKv)
        .where(
          sql`${savesKv.key} = ${PROFILE_STORAGE_KEY} and ${savesKv.userId} <> ${uid} and lower(${savesKv.value}->>'name') = lower(${name})`,
        )
        .limit(1);
      if (legacyHit.length > 0) {
        throw new TakenError();
      }

      // users.gameName UNIQUE 위반(23505) → TakenError 로 변환. 트랜잭션은 자동 롤백.
      try {
        await tx
          .update(users)
          .set({ gameName: name, updatedAt: new Date() })
          .where(eq(users.id, uid));
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "23505") throw new TakenError();
        throw e;
      }

      const profile = { name, gender: submittedGender };
      await upsertSave(tx, uid, PROFILE_STORAGE_KEY, profile);
      // v2 시작 장비 — 균형형 세트 (철검 + 가죽갑옷 + 은가락지).
      // equipment.v2 는 SYNCED_KEYS 화이트리스트에 없는 서버 권위 키라 STARTER_SAVES
      // (클라 부트스트랩) 경로로 시드 못 함. 신규 캐릭터 분기에서만 직접 박는다.
      await upsertSave(tx, uid, "equipment.v2", {
        owned: ["v2_iron_sword", "v2_leather_armor", "v2_silver_ring"],
        equipped: {
          weapon: "v2_iron_sword",
          armor: "v2_leather_armor",
          accessory: "v2_silver_ring",
        },
      });
      return profile;
    });

    return Response.json({ ok: true, profile: finalProfile });
  } catch (e) {
    if (e instanceof TakenError) {
      return Response.json({ error: "taken" }, { status: 409 });
    }
    const err = e as { code?: string; message?: string; name?: string };
    console.error("[/api/profile/setup] db failure", {
      userId: uid,
      code: err.code,
      name: err.name,
      message: err.message,
    });
    return new Response("server error", { status: 500 });
  }
}
