// 길드 등급 — 누적 명성에 따라 자동 결정. 알파벳 8단계 G(시작) → S(최고).
// (옛 길드 의뢰 시스템 제거 시 등급/명성 로직만 이 파일로 분리해 남김 — guild browse/
//  profile/rankings 가 gradeForFame 으로 길드 등급을 표시한다.)
export type GuildGrade = "G" | "F" | "E" | "D" | "C" | "B" | "A" | "S";

export const GUILD_GRADE_ORDER: GuildGrade[] = [
  "G",
  "F",
  "E",
  "D",
  "C",
  "B",
  "A",
  "S",
];

// 누적 명성 임계 — 이 값 이상이면 해당 등급. 검색은 위→아래 순회.
// (수치는 과거 길드 의뢰 명성 보상 페이스에 맞춰 보정된 역사값 — 함부로 바꾸지 말 것.)
//
// 📝 TODO(등급 재정리, 추후): fameTotal 은 이제 정착지 전쟁 명성(수비승·골드입금) 으로 적립된다
//   (v2GuildFame.addGuildFame). 임계값은 옛 "길드 의뢰" 보상 페이스 기준이라 새 명성 수입
//   페이스(수비승 10·10만골드당 1)와 안 맞아 등급이 매우 느리게 오를 수 있다. 길드 의뢰는
//   계획에 없으므로 등급 체계는 다른 방식으로 재설계 예정 — 그때 이 임계값을 새 페이스에 맞춰
//   재보정할 것. 일단은 동결 유지(라이브 데이터 수집 후 정리).
export const GUILD_GRADE_THRESHOLDS: Record<GuildGrade, number> = {
  G: 0,
  F: 600,
  E: 1800,
  D: 4500,
  C: 10500,
  B: 24000,
  A: 54000,
  S: 120000,
};

// 누적 명성 → 등급 산출.
export function gradeForFame(fameTotal: number): GuildGrade {
  // 위에서부터 순회 (S → G). 처음 임계 이상인 등급 반환.
  for (let i = GUILD_GRADE_ORDER.length - 1; i >= 0; i--) {
    const g = GUILD_GRADE_ORDER[i];
    if (fameTotal >= GUILD_GRADE_THRESHOLDS[g]) return g;
  }
  return "G";
}
