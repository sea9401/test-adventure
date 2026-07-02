// savesKv 키 리터럴의 SSOT — 그동안 "character.v2" 등이 원시 문자열로 85+파일에 산재했고,
// 키 오타/오기가 조용한 데이터 분기 사고로 직결됐다(#1322: 우편 지급이 죽은 키 inventory.v2 에
// 써서 미반영). 일괄 치환은 diff 폭발이라 신규/수정 코드부터 점진 전환한다.
//
// V2 SSOT 규약: 장비 = equipment.v2 의 개체(iid) 목록 · 재료 = character.v2.materials.

export const CHARACTER_V2_KEY = "character.v2";
export const EQUIPMENT_V2_KEY = "equipment.v2";
