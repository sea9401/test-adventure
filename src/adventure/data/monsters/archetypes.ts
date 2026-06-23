import type { Monster } from "./types";

// 몬스터 아키타입 프로필 — 태그 하나로 다양성 스탯의 "기본값"을 주입한다.
//   원칙: 몹이 직접 지정한 필드는 절대 덮지 않는다(명시 우선). 미지정 필드에만 프로필 기본값.
//   여기서 주입되는 건 "베이스" 값이고, 깊이 스케일(monsterScale)은 그 위에 적용된다.
//   PR1 범위 = 회피/치명/마법형(matk)뿐. 마법 스킬(v2Skills) 시전은 PR2.

type Archetype = NonNullable<Monster["archetype"]>;

// 각 아키타입의 기본 주입값(미지정 시). brute = 기준(공/방 위주)이라 주입 없음(라벨용).
const ARCHETYPE_PROFILE: Record<Archetype, Partial<Monster>> = {
  brute: {},
  evasive: { evasionPct: 18 },
  crit: { critPct: 18, critMult: 1.6 },
  caster: { atkType: "magic" }, // matk 는 아래서 atk 로 폴백(마법 평타=물리와 같은 스케일)
};

// 아키타입 기본값을 미지정 필드에 채운 새 Monster 를 반환(태그 없으면 원본 그대로).
export function resolveMonsterArchetype(m: Monster): Monster {
  if (!m.archetype) return m;
  const p = ARCHETYPE_PROFILE[m.archetype];
  const out: Monster = { ...m };
  if (p.evasionPct != null && out.evasionPct == null) out.evasionPct = p.evasionPct;
  if (p.critPct != null && out.critPct == null) out.critPct = p.critPct;
  if (p.critMult != null && out.critMult == null) out.critMult = p.critMult;
  if (p.atkType != null && out.atkType == null) out.atkType = p.atkType;
  // 마법형(직접 지정 or caster 프로필)인데 matk 미지정 → atk 폴백(마법 평타 스케일=물리와 동일).
  if (out.atkType === "magic" && out.matk == null) out.matk = out.atk;
  return out;
}
