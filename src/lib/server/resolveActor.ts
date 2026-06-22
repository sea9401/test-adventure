// 채팅·광장·온라인 표시용 actor 신원 — 서버 권위로 해석한다.
// (클라가 보낸 name/className/title 을 그대로 저장하면 임퍼소네이션 가능 —
//  "관리자"/"운영자" 닉네임 사칭, 미보유 칭호 노출 등.)
//
// 출처:
//   - name: users.gameName → character-profile.v2.name → "이름 없는 모험가"
//   - className: character.v2.className → "모험가"
//   - title: character.v2.equippedTitleId 로 TITLES 룩업 → null.
//     ⚠️ 보유 검증까지 한다 — adventure-log.v2.titles 에 없는 칭호를 (세이브 변조로)
//        장착했더라도 채팅/접속자엔 노출하지 않는다(미보유 칭호 사칭 차단).
//
// 호출당 2 query (users 1 + savesKv 1 with IN(...)).

import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { savesKv, users } from "@/db/schema";
import { TITLES } from "@/adventure/data/titles";
import { ownedTitleIdsOf } from "@/lib/server/grantTitle";

export type ResolvedActor = {
  name: string;
  className: string;
  title: string | null;
};

const DEFAULT_NAME = "이름 없는 모험가";
const DEFAULT_CLASS = "모험가";

export async function resolveActor(userId: string): Promise<ResolvedActor> {
  const [u] = await db
    .select({ gameName: users.gameName })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const saveRows = await db
    .select({ key: savesKv.key, value: savesKv.value })
    .from(savesKv)
    .where(
      and(
        eq(savesKv.userId, userId),
        inArray(savesKv.key, [
          "character.v2",
          "character-profile.v2",
          "adventure-log.v2",
        ]),
      ),
    );
  const byKey: Record<string, unknown> = {};
  for (const r of saveRows) byKey[r.key] = r.value;
  const character = byKey["character.v2"] as
    | { className?: unknown; equippedTitleId?: unknown }
    | undefined;
  const profile = byKey["character-profile.v2"] as
    | { name?: unknown }
    | undefined;

  let name = u?.gameName?.trim() ?? "";
  if (!name && typeof profile?.name === "string") name = profile.name.trim();
  if (!name) name = DEFAULT_NAME;

  const className =
    typeof character?.className === "string" && character.className.trim()
      ? character.className.trim()
      : DEFAULT_CLASS;

  const titleId =
    typeof character?.equippedTitleId === "string"
      ? character.equippedTitleId
      : null;
  // 보유한 칭호만 노출 — 미보유 id 를 장착해도(변조) null 처리.
  const owned = new Set(ownedTitleIdsOf(byKey["adventure-log.v2"]));
  const title =
    titleId && TITLES[titleId] && owned.has(titleId)
      ? TITLES[titleId].name
      : null;

  return { name, className, title };
}
