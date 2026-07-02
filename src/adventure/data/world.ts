// V1 월드 그래프(지역 데이터·이동 엣지·지도 좌표)는 은퇴 — 런타임 export 참조 0 확인 후
// 2026-07 정리. 남은 것은 RegionId 타입뿐: 협동 보스 스폰 좌표(coop/data.ts·lib/server/coopRespawn.ts)와
// NPC 카탈로그(data/npcs.ts)가 type-only 로 사용한다. 라이브 v2 지도는 TileMap(자유 타일 보드).
export type RegionId =
  | "village"
  | "plains"
  | "forest"
  | "cave"
  | "deep_cave"
  | "lake"
  | "diola"
  | "ruins"
  | "quarry"
  | "highland"
  | "canyon"
  | "unhyang"
  | "cloud_plain"
  | "windvale"
  | "ashen_pass"
  | "phoenix_ridge"
  | "volcanic_badlands"
  | "skyreach"
  | "starspire"
  | "star_corridor"
  | "star_haven"
  | "skyfolk_ruins"
  | "throne_road"
  | "apex_throne"
  // 해안 지선 (디올라에서 남쪽으로 갈라지는 막다른 라인)
  | "tideflats"
  | "saltmarsh"
  | "reef_isle"
  // 서편 옛길 (시작 마을에서 서쪽으로 갈라지는 막다른 라인 — 동쪽 모험길의 반대편)
  | "westgate"
  | "dustford"
  | "oldwall_keep"
  // 용비늘 라인 (바람골 역참 남쪽으로 갈라지는 막다른 라인 — 서양 판타지 톤의 고룡 묘지)
  | "bone_marches"
  | "scalefall_barrows"
  // 용비늘 묘지 너머 — 월드 보스 "태고의 노룡" 둥지.
  | "dragon_nest"
  // 엔드컨텐츠 — 솔로 무한 탑(고탑) 지역.
  | "tower_foot"
  // 5막 「빈 옥좌의 시대」 별빛 지역들.
  | "starfall_cave"
  | "starlit_canyon"
  | "starlit_reef"
  | "starlit_keep"
  // 별빛 권역 중앙 허브.
  | "starlit_crossroads"
  // 6막 「별을 잊은 것」 — 상시 협동(월드) 레이드 아레나.
  | "forgotten_seal";
