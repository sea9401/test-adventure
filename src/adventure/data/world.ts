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
  // 용비늘 묘지 너머 — 월드 보스 "태고의 노룡" 이 깨어 있는 둥지. 입장은 wyrm_warden_felled 필수.
  | "dragon_nest"
  // 엔드컨텐츠 — 옛 변경 성채 너머에 잡몹 없이 솔로 무한 탑(고탑) 도전만 있는 지역.
  | "tower_foot"
  // 5막 「빈 옥좌의 시대」 — 황제가 쓰러진 뒤 별빛이 옛 광맥으로 떨어진 자리.
  // 깊은 동굴 안쪽으로 endgame_apex_defeated flag 가 켜져야 길이 드러난다. Lv100.
  | "starfall_cave"
  // 5막 PR-B1 — 운무 협곡 옆으로 별빛이 떨어진 자리. starfall_warden_felled (Ch 26) 가
  // 켜져야 길이 드러난다. 운봉의 거인의 별빛 잔영이 협동 보스로 등장. Lv102.
  | "starlit_canyon"
  // 5막 PR-B2 — 산호초 섬 옆/옛 변경 성채 옆. 같은 게이트(starfall_warden_felled).
  // 수심의 메아리 / 성문지기 잔영이 협동 보스로 등장. Lv104 / Lv106.
  | "starlit_reef"
  | "starlit_keep"
  // 별빛 권역 중앙 허브 — NPC·퀘스트 없는 town 기능 노드(회복·빠른이동·네 지역 연결).
  | "starlit_crossroads"
  // 6막 「별을 잊은 것」 — 별빛 교차로 아래 더 오래된 봉인. 상시 협동(월드) 레이드 아레나.
  | "forgotten_seal"
  // 길드 영지 시스템 진입점 — 별빛 권역의 미개척지. 별빛 교차로 북쪽에 위치.
  // 클릭 시 FiefdomView 로 전이(피처 플래그 ON 일 때만). enemies/boss 없음 — 순수 진입 노드.
  | "fiefdom_hall";

// 권역 — 맵 뷰를 묶어서 보여주기 위한 그룹. 이동 그래프(edges)와 무관한 표시/네비게이션 전용.
// MapCanvas 가 활성 권역에 속한 지역들의 bounds 로 자동 줌/포커스한다.
export type ZoneId =
  | "homeland" // 본토 — 시작 마을 ~ 천공 성지 메인 모험길
  | "coast" // 디올라 해안 지선
  | "westroad" // 서편 옛길
  | "dragonscale" // 용비늘 묘지 라인
  | "skythrone" // 천공·옥좌 (4막)
  | "starlit" // 별빛 권역 (5막 + 6막 선천)
  | "tower"; // 고탑

// 권역 탭 순서·라벨. UI 가 이 순서대로 탭을 깐다.
export const ZONES: ReadonlyArray<{ id: ZoneId; label: string }> = [
  { id: "homeland", label: "본토" },
  { id: "coast", label: "디올라 해안" },
  { id: "westroad", label: "서편 옛길" },
  { id: "dragonscale", label: "용비늘" },
  { id: "skythrone", label: "천공·옥좌" },
  { id: "starlit", label: "별빛 권역" },
  { id: "tower", label: "고탑" },
];

// 지역 → 권역 매핑. Record 라 RegionId 가 빠지면 TS 가 잡는다 (exhaustive).
export const REGION_ZONE: Record<RegionId, ZoneId> = {
  village: "homeland",
  plains: "homeland",
  forest: "homeland",
  cave: "homeland",
  deep_cave: "homeland",
  lake: "homeland",
  diola: "homeland",
  ruins: "homeland",
  quarry: "homeland",
  highland: "homeland",
  canyon: "homeland",
  unhyang: "homeland",
  cloud_plain: "homeland",
  windvale: "homeland",
  ashen_pass: "homeland",
  phoenix_ridge: "homeland",
  volcanic_badlands: "homeland",
  skyreach: "homeland",
  tideflats: "coast",
  saltmarsh: "coast",
  reef_isle: "coast",
  westgate: "westroad",
  dustford: "westroad",
  oldwall_keep: "westroad",
  bone_marches: "dragonscale",
  scalefall_barrows: "dragonscale",
  dragon_nest: "dragonscale",
  starspire: "skythrone",
  star_corridor: "skythrone",
  star_haven: "skythrone",
  skyfolk_ruins: "skythrone",
  throne_road: "skythrone",
  apex_throne: "skythrone",
  starfall_cave: "starlit",
  starlit_canyon: "starlit",
  starlit_reef: "starlit",
  starlit_keep: "starlit",
  starlit_crossroads: "starlit",
  forgotten_seal: "starlit",
  fiefdom_hall: "starlit",
  tower_foot: "tower",
};

export function getZone(regionId: RegionId): ZoneId {
  return REGION_ZONE[regionId];
}

// ── 맵(map) 분할 ──────────────────────────────────────────────────────────
// 이동 그래프(WORLD_MAP.regions/edges)는 단일로 유지하되, "그리는 면"을 둘로 나눈다.
// 본토 맵과 별빛 맵은 각자의 viewBox(좌표계)·배경을 가진 별개의 SVG 로 렌더되고,
// 한 번에 하나만 화면에 뜬다. PoE 의 Act 분리와 같은 모델 — 두 맵이 동시에 안 그려지므로
// Region.position 은 "소속 맵 안의 로컬 좌표" 로 해석된다(전역 유일성 불필요).
//
// 본토↔별빛을 잇는 게이트 엣지(deep_cave→starfall_cave 등)는 cross-map 엣지가 되며,
// getMap(from) !== getMap(to) 로 파생된다(데이터에 따로 표시하지 않음). 이동 로직은 그대로:
// 게이트를 넘으면 currentRegion 이 바뀌고 활성 맵만 그걸 따라 전환된다.
export type MapId =
  | "world" // 본토 — 시작 마을 ~ 천공 옥좌, 해안·서편·용비늘·고탑까지 전부
  | "starlit"; // 별빛 권역 (5막 + 향후 6막 선천)

export type GameMap = {
  id: MapId;
  label: string;
  // 이 맵 전용 SVG viewBox(좌표계). MapCanvas 가 이 영역으로 팬/줌을 클램프한다.
  viewBox: { x?: number; y?: number; width: number; height: number };
  // 노드 뒤에 깔리는 배경 이미지 경로(`/images/...`). 미지정이면 평면 배경.
  // 에셋이 준비되면 채운다 — 없는 파일을 참조하면 check-images 가 빌드를 막으므로 비워둔다.
  background?: string;
};

// 맵 선택자 탭 순서·라벨.
export const MAPS: ReadonlyArray<GameMap> = [
  { id: "world", label: "본토", viewBox: { y: -440, width: 2440, height: 1260 } },
  { id: "starlit", label: "별빛 권역", viewBox: { width: 1000, height: 760 } },
];

const MAP_BY_ID: Record<MapId, GameMap> = Object.fromEntries(
  MAPS.map((m) => [m.id, m]),
) as Record<MapId, GameMap>;

export function getGameMap(mapId: MapId): GameMap {
  return MAP_BY_ID[mapId];
}

// 지역 → 소속 맵. REGION_ZONE(exhaustive Record)에서 파생하므로 자동으로 전 지역을 덮는다
// — 새 지역은 REGION_ZONE 에 추가될 때 TS 가 강제하고, 그러면 여기도 자동 반영된다.
// 별빛 권역(zone)에 속한 지역만 별빛 맵으로, 나머지는 전부 본토 맵.
export const REGION_MAP: Record<RegionId, MapId> = Object.fromEntries(
  (Object.keys(REGION_ZONE) as RegionId[]).map((id) => [
    id,
    REGION_ZONE[id] === "starlit" ? "starlit" : "world",
  ]),
) as Record<RegionId, MapId>;

export function getMap(regionId: RegionId): MapId {
  return REGION_MAP[regionId];
}

export type Biome =
  | "village"
  | "plains"
  | "forest"
  | "cave"
  | "lake"
  | "ruins"
  | "mountain"
  | "coast";

// "town"  — 마을(전투 풀 없음, NPC dialogue 호스트)
// "tower" — 고탑 진입 전용 지역(전투 풀 없음, AdventureHome 에 TowerPage 진입 카드 노출)
export type RegionTag = "town" | "tower";

export type Region = {
  id: RegionId;
  name: string;
  description: string;
  position: { x: number; y: number };
  biome: Biome;
  enemies: string[];
  /**
   * 등장 가중치. 키는 enemies 의 항목명, 값은 양수.
   * 미지정/0/누락된 항목은 1로 취급. 모든 가중치가 0이면 첫 번째 적 반환.
   * 예: { "골렘": 20, "망령": 40, "늑대": 40 } → 골렘은 평균보다 적게 등장.
   */
  encounterWeights?: Partial<Record<string, number>>;
  /**
   * 보스 인카운터 — 별도 도전 버튼으로 진입. 일반 자동 사냥 풀에서 제외된다.
   * 누진 쿨다운 (도전 횟수가 늘수록 길어짐) 이 있으며 자정 기준 reset.
   * boss.monsterName 은 MONSTERS 의 키.
   */
  boss?: {
    monsterName: string;
  };
  tags?: RegionTag[];
  recommendedLevel?: number;
};

// 지역 간 이동에 걸리는 선행 조건. 방향성이 있으며 edge 의 from→to 진행에만 적용된다.
// 종류별 kind 로 구분 — 한 엣지에는 한 종류만 붙는다.
//
// 현재 구현된 종류:
// - "bestiary": 지정 지역의 모든 몬스터를 조우(encountered=true) 했어야 함.
// - "trial":   이동 시도 시 자동 전투 N전을 치러 모두 이겨야 함. 한 번 통과하면 영구 해금.
// - "story":   특정 storyFlag 가 켜져야 통과. NPC 대화 분기로 해금하는 지역.
//
// 향후 확장 후보 (구현 X — 명칭만 예약):
// - "level":  최소 캐릭터 레벨.
// - "quest":  특정 퀘스트 완료.
// - "kills":  특정 몬스터 누적 처치 수.
// - "item":   특정 아이템 보유 (consume 옵션).
// - "fame":   최소 명성.
export type EdgeRequirement =
  | { kind: "bestiary"; regionId: RegionId }
  | { kind: "trial"; battles: number; enemiesFrom: RegionId }
  | { kind: "story"; flagId: string; reason?: string }
  // "visited" — 마을 간 직통 이동용. 목적지를 한 번이라도 정상 진입한 적이 있어야 통과.
  // 발견 전에는 "도달 가능" 표시도 되지 않게 MapView 의 reachability 스캔에서 제외된다.
  | { kind: "visited"; regionId: RegionId }
  // "locked" — 영원히 통과 불가 (현재 미구현 지역, 콘텐츠 가림용).
  // reason 으로 UI 에 보여줄 한 줄 이유를 지정.
  | { kind: "locked"; reason?: string };

export type EdgeRequirementKind = EdgeRequirement["kind"];

export type RegionEdge = {
  from: RegionId;
  to: RegionId;
  requires?: EdgeRequirement;
};

export type WorldMap = {
  // SVG viewBox 호환 — x/y 미지정이면 원점 (0,0). 북쪽으로 추가된 영역을 표현하기 위해
  // 음수 y 시작도 가능(예: y=-440, height=1260 → y 범위 [-440, 820]).
  viewBox: { x?: number; y?: number; width: number; height: number };
  regions: Region[];
  edges: RegionEdge[];
};

export const WORLD_MAP: WorldMap = {
  // 폐허(680, 400) 동쪽으로 산기슭(880)→협곡(1080)→운향(1280) 추가로 width 800→1400 확장.
  // 운향(1280) 동쪽으로 운저 평원(1460)→바람골 역참(1640)→잿빛 협로(1820) 다리 구간 +
  // 봉황령(2000)→화산 지대(2180)→천공 성지(2360) 추가로 width 1400→2440 확장.
  // 운향까지의 기존 region 좌표는 그대로 유지 (봉황령 라인은 다리 삽입으로 동쪽으로 밀림).
  // 디올라(660,80)에서 북쪽으로 갈라지는 해안 지선(조수 갯벌→소만→산호초 섬). 디올라 바로
  // 위에는 빈 공간이 없어 viewBox 를 음수 y 쪽으로 440 확장 — y=-440 시작 / height 820→1260.
  // 라인 모양(zigzag dx)은 기존 남쪽 배치 그대로 두고 y 만 디올라 기준으로 미러링.
  // 시작 마을(160,380)에서 서쪽-아래로 갈라지는 서편 옛길(옛길→마른나루→옛 변경 성채)을 좌하단
  // 빈 공간에 깔면서 height 640→700 확장.
  // 천공 성지(2360, 150) 에서 남쪽으로 꺾어 starspire/star_corridor/star_haven/skyfolk_ruins/
  // throne_road/apex_throne 까지 부드러운 S-자 곡선으로 내려가며 height 700→820 확장.
  // (직선 일렬 대신 별바다 근처에서 서쪽으로 휘었다가 옥좌로 동쪽으로 돌아온다.)
  // 바람골 역참(1640,410) 남쪽 빈 공간으로 뼈무덤 황야(Lv47) → 용비늘 묘지(Lv75) 막다른 라인
  // 추가. 서양 판타지 톤의 고룡 묘지 — 방어 중심 무구 라인.
  viewBox: { y: -440, width: 2440, height: 1260 },
  regions: [
    {
      id: "village",
      name: "시작 마을",
      description: "평화로운 작은 마을. 모든 모험의 시작점.",
      position: { x: 160, y: 380 },
      biome: "village",
      enemies: ["주정뱅이"],
      tags: ["town"],
      recommendedLevel: 1,
    },
    {
      id: "plains",
      name: "평야",
      description: "넓고 한가로운 풀밭. 들쥐와 슬라임이 어슬렁거린다.",
      position: { x: 380, y: 360 },
      biome: "plains",
      enemies: ["슬라임", "들개", "두더지"],
      recommendedLevel: 1,
    },
    {
      id: "cave",
      name: "동굴",
      description: "축축하고 어두운 광맥 동굴.",
      position: { x: 270, y: 200 },
      biome: "cave",
      enemies: ["박쥐", "동굴뱀"],
      recommendedLevel: 3,
    },
    {
      id: "deep_cave",
      name: "깊은 동굴",
      description:
        "동굴 안쪽으로 파고들면 광맥이 두꺼워지고 공기가 차가워진다. 무언가 광물을 두른 것이 잠들어 있다.",
      position: { x: 140, y: 130 },
      biome: "cave",
      enemies: ["박쥐", "동굴뱀", "작은 광물 골렘"],
      encounterWeights: {
        박쥐: 35,
        동굴뱀: 35,
        "작은 광물 골렘": 30,
      },
      boss: { monsterName: "광맥의 수호자" },
      recommendedLevel: 6,
    },
    {
      id: "forest",
      name: "외곽 숲",
      description: "햇빛이 새지 않는 짙은 숲.",
      position: { x: 580, y: 240 },
      biome: "forest",
      enemies: ["거미", "들개", "산적"],
      recommendedLevel: 5,
    },
    {
      id: "lake",
      name: "안개 호수",
      description: "잔잔한 수면 너머 무언가 보이는 호수.",
      position: { x: 440, y: 110 },
      biome: "lake",
      enemies: ["호수 님프"],
      recommendedLevel: 7,
    },
    {
      id: "diola",
      name: "디올라 마을",
      description: "안개 호수 가장자리에 자리한 작은 어촌. 호수에서 잡은 물고기로 살아간다.",
      position: { x: 660, y: 80 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 6,
    },
    {
      id: "ruins",
      name: "옛 폐허",
      description: "잊힌 문명의 흔적. 위험한 기운이 감돈다.",
      position: { x: 680, y: 400 },
      biome: "ruins",
      enemies: ["부서진 골렘", "떠도는 망령", "폐허 늑대"],
      encounterWeights: {
        "폐허 늑대": 40,
        "떠도는 망령": 40,
        "부서진 골렘": 20,
      },
      recommendedLevel: 9,
    },
    {
      id: "quarry",
      name: "버려진 채석장",
      description:
        "폐허 동쪽, 산기슭으로 오르는 길목에 버려진 옛 채석장. 깨진 석재가 비탈을 이루고, 무너진 갱도에서 찬 바람이 새어 나온다.",
      position: { x: 800, y: 350 },
      biome: "ruins",
      enemies: ["채석터 들개", "버려진 광부", "돌부스러기 골렘"],
      encounterWeights: {
        "채석터 들개": 45,
        "버려진 광부": 35,
        "돌부스러기 골렘": 20,
      },
      recommendedLevel: 13,
    },
    {
      id: "highland",
      name: "북풍 산기슭",
      description:
        "채석장 너머로 솟은 비탈. 바람이 거칠고 돌투성이라 발 디딜 곳을 골라야 한다.",
      position: { x: 880, y: 380 },
      biome: "mountain",
      enemies: ["산양", "바위 두꺼비"],
      encounterWeights: { 산양: 60, "바위 두꺼비": 40 },
      recommendedLevel: 18,
    },
    {
      id: "canyon",
      name: "운무 협곡",
      description:
        "구름이 낮게 깔리는 좁은 협곡. 발소리가 메아리치고, 무언가 거대한 것이 안쪽을 막고 있다.",
      position: { x: 1080, y: 320 },
      biome: "mountain",
      enemies: ["절벽 늑대", "돌풍 정령", "늑대 무리장"],
      encounterWeights: {
        "절벽 늑대": 50,
        "돌풍 정령": 35,
        "늑대 무리장": 15,
      },
      boss: { monsterName: "운봉의 거인" },
      recommendedLevel: 20,
    },
    {
      id: "unhyang",
      name: "운향",
      description:
        "구름이 발치에 깔리는 산정의 작은 도시. 산악을 피해 모인 장인과 순례자들이 산다.",
      position: { x: 1280, y: 260 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 22,
    },
    // ── 다리 구간 (cloud_plain → windvale → ashen_pass) ─────────────────────
    // 운향(Lv22)과 봉황령(Lv40) 사이를 잇는다.
    {
      id: "cloud_plain",
      name: "운저 평원",
      description:
        "운향의 구름층 아래로 펼쳐진 너른 들녘. 들소 떼가 풀을 뜯고, 초원 매가 하늘을 가른다.",
      position: { x: 1460, y: 340 },
      biome: "plains",
      enemies: ["들소", "초원 매", "떠돌이 약탈자"],
      encounterWeights: {
        들소: 50,
        "초원 매": 30,
        "떠돌이 약탈자": 20,
      },
      recommendedLevel: 28,
    },
    {
      id: "windvale",
      name: "바람골 역참",
      description:
        "평원 한가운데 자리한 대상(隊商) 역참. 산정과 화염 능선 사이를 오가는 이들이 짐을 풀고 쉬어 간다.",
      position: { x: 1640, y: 410 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 30,
    },
    {
      id: "ashen_pass",
      name: "잿빛 협로",
      description:
        "봉황령으로 이어지는 메마른 협로. 발밑에 잿가루가 쌓이고, 바람에 불씨 냄새가 섞여 든다.",
      position: { x: 1820, y: 300 },
      biome: "mountain",
      enemies: ["재먼지 골렘", "잿빛 들개", "불씨 도롱뇽"],
      encounterWeights: {
        "재먼지 골렘": 40,
        "잿빛 들개": 35,
        "불씨 도롱뇽": 25,
      },
      recommendedLevel: 34,
    },
    // ── 봉황령 라인 (phoenix_ridge → volcanic_badlands → skyreach) ──────────
    {
      id: "phoenix_ridge",
      name: "봉황령",
      description:
        "불길이 서린 협곡 너머의 험준한 능선. 거센 열기 속에 불꽃 독수리와 화염 도마뱀이 둥지를 튼다.",
      position: { x: 2000, y: 140 },
      biome: "mountain",
      enemies: ["불꽃 독수리", "화염 도마뱀", "산악 기사"],
      encounterWeights: {
        "불꽃 독수리": 40,
        "화염 도마뱀": 40,
        "산악 기사": 20,
      },
      recommendedLevel: 40,
    },
    {
      id: "volcanic_badlands",
      name: "화산 지대",
      description:
        "지각이 갈라진 황무지. 용암이 발밑에서 흐르고, 불꽃 골렘과 용암 슬라임이 들끓는다.",
      position: { x: 2180, y: 260 },
      biome: "mountain",
      enemies: ["용암 슬라임", "화산 두꺼비", "불꽃 골렘"],
      encounterWeights: {
        "용암 슬라임": 40,
        "화산 두꺼비": 35,
        "불꽃 골렘": 25,
      },
      boss: { monsterName: "화산의 심장" },
      recommendedLevel: 55,
    },
    {
      id: "skyreach",
      name: "천공 성지",
      description:
        "화산 지대 너머 높은 절벽 위에 자리한 고대 성지. 하늘을 향해 솟은 첨탑이 구름을 뚫고 선다.",
      position: { x: 2360, y: 150 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 60,
    },
    // 천공 성지 남쪽 라인 — starspire → star_corridor → star_haven(town) → skyfolk_ruins
    //   → throne_road → apex_throne. skyreach(2360,150) 에서 남쪽으로 부드러운 S-자
    //   곡선: 살짝 동쪽으로 내려갔다가 별바다(town) 근처에서 서쪽으로 깊이 휜 뒤 옥좌로
    //   돌아오는 형태. y 는 ~95 간격 유지.
    {
      id: "starspire",
      name: "별의 첨탑",
      description:
        "천공 성지의 옛 문이 다시 열리며 드러난, 별빛을 떠받친다 전해지는 천공 첨탑. 구름층 너머에 떠 있는 옛 천공인의 군도와 첨탑 정상에는 봉인된 수호자가 잠들어 있다.",
      position: { x: 2380, y: 250 },
      biome: "mountain",
      enemies: ["별점술사 잔영", "구름 사냥꾼", "운명 직조자"],
      encounterWeights: {
        "별점술사 잔영": 35,
        "구름 사냥꾼": 40,
        "운명 직조자": 25,
      },
      boss: { monsterName: "별을 지키는 자" },
      recommendedLevel: 70,
    },
    {
      id: "star_corridor",
      name: "별빛 회랑",
      description:
        "별의 첨탑 정상에서 폐도로 이어지는 별빛의 회랑. 첨탑의 별빛이 끊긴 자리에 옛 천공인의 흔적이 떠도는 사냥터.",
      position: { x: 2310, y: 340 },
      biome: "mountain",
      enemies: ["떠도는 시녀", "별빛 망령", "별궤도 자율기"],
      encounterWeights: {
        "떠도는 시녀": 35,
        "별빛 망령": 40,
        "별궤도 자율기": 25,
      },
      recommendedLevel: 75,
    },
    {
      id: "star_haven",
      name: "별바다",
      description:
        "별빛 회랑 끝에 남은 마지막 천공인 정거장. 별을 보살피던 자들의 후예가 작은 등을 켜 두고 폐도로 향하는 자들을 맞이한다.",
      position: { x: 2210, y: 425 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 80,
    },
    {
      id: "skyfolk_ruins",
      name: "선인의 폐도",
      description:
        "별바다 너머 옛 천공인의 폐도. 별빛으로 살아남은 마지막 잔재들이 무너진 첨탑 사이를 떠돌며 침입자의 발을 잡는다.",
      position: { x: 2170, y: 525 },
      biome: "ruins",
      enemies: ["천공인 사관", "천공인 전사", "폐허의 거상"],
      encounterWeights: {
        "천공인 사관": 30,
        "천공인 전사": 40,
        "폐허의 거상": 30,
      },
      boss: { monsterName: "천공인의 왕" },
      recommendedLevel: 80,
    },
    {
      id: "throne_road",
      name: "옥좌의 길",
      description:
        "폐도 너머 옥좌로 이어지는 옛 황성의 길. 봉인의 파편이 굴러다니고 호위병의 잔재가 길목마다 일어선다. 길 끝. 후드의 자취가 검을 들고 기다린다.",
      position: { x: 2240, y: 630 },
      biome: "ruins",
      enemies: ["황성 의장기수", "황성 호위병", "봉인 파편"],
      encounterWeights: {
        "황성 의장기수": 35,
        "황성 호위병": 40,
        "봉인 파편": 25,
      },
      boss: { monsterName: "순례자의 분신" },
      recommendedLevel: 85,
    },
    {
      id: "apex_throne",
      name: "창공의 옥좌",
      description:
        "옥좌의 길 끝, 옛 천공인 마지막 황제가 별빛 자체를 봉인했다는 옥좌. 마지막 시험을 통과한 자에게만 별빛이 완전히 열린다.",
      position: { x: 2340, y: 735 },
      biome: "mountain",
      enemies: ["별빛 사도", "옥좌의 검신", "잠든 황좌 거인"],
      encounterWeights: {
        "별빛 사도": 30,
        "옥좌의 검신": 40,
        "잠든 황좌 거인": 30,
      },
      boss: { monsterName: "창공의 주재" },
      recommendedLevel: 90,
    },
    // ── 해안 지선 (diola → tideflats → saltmarsh → reef_isle) ───────────────
    // 폐허(Lv9)~산기슭(Lv18) 구간에 산으로 가는 길과 나란히 놓인 막다른 바닷길.
    // 디올라(660,80) 북쪽으로 올라가는 막다른 라인. y 는 디올라 기준 미러링
    // (원래 +420/+480/+520 → -420/-480/-520), x 는 그대로 둬 라인 모양 유지.
    {
      id: "tideflats",
      name: "조수 갯벌",
      description:
        "안개 호수가 바다로 빠지는 너른 하구. 썰물이면 갯벌과 갯바위가 드러나고, 집게발 든 것들이 진흙 위를 기어다닌다.",
      position: { x: 760, y: -340 },
      biome: "coast",
      enemies: ["집게발 게", "갯도요", "진흙 미꾸라지"],
      encounterWeights: {
        "집게발 게": 45,
        갯도요: 30,
        "진흙 미꾸라지": 25,
      },
      recommendedLevel: 10,
    },
    {
      id: "saltmarsh",
      name: "소만",
      description:
        "갯벌 끝에 소금밭과 젓갈 창고가 늘어선 작은 포구. 디올라 어부들과 물자를 주고받고, 뱃사공이 난바다로 나가는 배를 댄다.",
      position: { x: 640, y: -400 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 13,
    },
    {
      id: "reef_isle",
      name: "산호초 섬",
      description:
        "안개 너머에 떠 있는 작은 섬과 그 둘레를 두른 암초. 산호 가시에 긁히는 소리 사이로 사이렌의 노래가 섞여 든다.",
      position: { x: 840, y: -440 },
      biome: "coast",
      enemies: ["산호초 사이렌", "갑각 약탈자", "가시 산호 골렘"],
      encounterWeights: {
        "산호초 사이렌": 40,
        "갑각 약탈자": 35,
        "가시 산호 골렘": 25,
      },
      // 산호초 섬 보스 — 별도 도전 버튼. 일반 인카운터 풀에선 제외, 자정 기준 일일 3회.
      boss: { monsterName: "수심의 것" },
      recommendedLevel: 18,
    },
    // ── 서편 옛길 (village → westgate → dustford → oldwall_keep) ────────────
    // 동쪽 모험길의 반대편 — 시작 마을 서쪽으로 난, 아무도 다니지 않는 옛 변경길.
    // 시작 마을(160,380) 좌하단의 빈 공간을 따라 내려가며, height 를 700 으로 늘려 자리를 만든다.
    {
      id: "westgate",
      name: "서편 옛길",
      description:
        "시작 마을 서문 밖으로 난, 마른 억새에 반쯤 묻힌 옛 수레길. 무너진 이정표가 옛 변경이 시작되던 자리를 가리킨다. 까마귀와 들고양이, 길에 눌러앉은 노상강도가 어슬렁거린다.",
      position: { x: 55, y: 480 },
      biome: "plains",
      enemies: ["들까마귀 떼", "갈대 살쾡이", "노상강도"],
      encounterWeights: {
        "들까마귀 떼": 45,
        "갈대 살쾡이": 30,
        노상강도: 25,
      },
      recommendedLevel: 3,
    },
    {
      id: "dustford",
      name: "마른나루",
      description:
        "옛길 한가운데, 한때 강을 건너던 여울이 말라붙은 자리에 선 작은 역참 마을. 교역로가 비껴간 뒤로 거의 비었지만, 떠나길 거부한 몇 집이 우물과 메마른 밭을 붙들고 산다.",
      position: { x: 130, y: 580 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 7,
    },
    {
      id: "oldwall_keep",
      name: "옛 변경 성채",
      description:
        "옛길 끝, 무너진 성벽 위에 버려진 변경 요새. 녹슨 성문과 주저앉은 막사 사이로, 한 세대 전 침공을 막으라 세워진 성문지기 자동인형이 아직도 빈 성벽을 지키며 깨어난다.",
      position: { x: 40, y: 660 },
      biome: "ruins",
      enemies: ["폐성벽 까마귀", "탈영 약탈자", "녹슨 자동인형"],
      encounterWeights: {
        "폐성벽 까마귀": 35,
        "탈영 약탈자": 35,
        "녹슨 자동인형": 30,
      },
      // 옛 변경 성채 보스 — 별도 도전 버튼. 일반 인카운터 풀에선 제외, 자정 기준 일일 3회.
      boss: { monsterName: "옛 성문지기" },
      recommendedLevel: 13,
    },
    // ── 용비늘 라인 (windvale → bone_marches → scalefall_barrows) ───────────
    // 바람골 역참 남쪽으로 내려가는 막다른 두 지역. 서양 판타지 톤의 고룡 묘지 라인 — 도굴꾼과
    // 뼈비늘 짐승이 묘를 파헤치고, 안쪽에서 옛 노룡이 다시 깨어난다. 방어 중심 무구가 떨어진다.
    {
      id: "bone_marches",
      name: "뼈무덤 황야",
      description:
        "바람골 역참 남쪽으로 펼쳐진 메마른 황야. 옛 무덤이 풍화되어 뼛조각이 모래에 섞이고, 도굴꾼과 뼈를 핥는 짐승이 어슬렁거린다. 묘지 너머 더 깊은 곳에 무엇이 잠들어 있는지 아는 자는 드물다.",
      position: { x: 1740, y: 540 },
      biome: "ruins",
      enemies: ["용골 광신도", "역병 하이에나", "묘지 그렘린"],
      encounterWeights: {
        "용골 광신도": 40,
        "역병 하이에나": 35,
        "묘지 그렘린": 25,
      },
      recommendedLevel: 47,
    },
    {
      id: "scalefall_barrows",
      name: "용비늘 묘지",
      description:
        "황야 안쪽, 오래전 죽은 용의 뼈와 비늘이 광야에 쌓인 묘. 떨어진 비늘이 햇빛에 잿빛으로 굳고, 안쪽에서 무언가가 다시 일어서 묘를 걸어 다닌다.",
      position: { x: 1840, y: 670 },
      biome: "ruins",
      enemies: ["타락한 묘지기사", "잿빛 와이번", "용골 리치"],
      encounterWeights: {
        "타락한 묘지기사": 30,
        "잿빛 와이번": 40,
        "용골 리치": 30,
      },
      // 용비늘 묘지 보스 — 솔로 도전, 자정 기준 일일 3회.
      boss: { monsterName: "뼈비늘 노룡" },
      recommendedLevel: 75,
    },
    // ── 용의 둥지 (scalefall_barrows 너머 월드 보스 맵) ───────────────────────────
    // 뼈비늘 노룡을 한 번 잡은 자(wyrm_warden_felled) 만 들어설 수 있다. 잡몹 없이
    // 월드 보스 "태고의 노룡" 한 마리가 깨어 있고, 모든 모험가의 누적 데미지로만
    // 쓰러뜨릴 수 있다. 죽으면 7일 휴면 후 다시 깨어남.
    {
      id: "dragon_nest",
      name: "용의 둥지",
      description:
        "묘지 더 안쪽, 죽은 줄 알았던 노룡의 어미가 잿빛 비늘을 한 겹 더 두른 채 깨어 있는 자리. 어미의 등에서 옛 시대의 무게가 그대로 흘러내린다. 어느 한 자루로 잡을 수 있는 자는 없다.",
      position: { x: 1980, y: 800 },
      biome: "ruins",
      enemies: [],
      recommendedLevel: 90,
    },
    // ── 고탑 입구 (oldwall_keep 너머) ──────────────────────────────────────────
    // 잡몹/보스 없이 솔로 무한 탑(고탑) 도전 입구만 있는 지역. 옛 성문지기를 한 번
    // 처치해야(gatekeeper_felled) 길이 열린다. 권장 Lv70+.
    {
      id: "tower_foot",
      name: "고탑의 발치",
      description:
        "옛 변경 성채 너머, 풍화된 평지 한가운데 천 길 첨탑이 솟아 있다. 바닥은 평평한 돌판으로 깔려 있고, 위로는 끝이 보이지 않는다. 멈춰 선 흔적 외에 다른 발자국이 없다.",
      position: { x: 60, y: 770 },
      biome: "ruins",
      enemies: [],
      tags: ["tower"],
      recommendedLevel: 70,
    },
    // ── 5막 도입 — 별빛 갱도 (깊은 동굴 안쪽) ───────────────────────────────
    // 옥좌의 주재가 쓰러진 뒤 별빛 한 점이 옛 광맥 안쪽으로 떨어졌다. 깊은 동굴의
    // 광맥 너머에서 별빛에 데워진 잡것들이 다시 깨어났다. 입장은 endgame_apex_defeated
    // flag 가 켜져야 — 즉 Ch 25 「옥좌의 주재」 협동전 클리어 후. Lv100 권장.
    {
      id: "starfall_cave",
      name: "별빛 갱도",
      description:
        "깊은 동굴 안쪽, 광맥이 끊긴 자리에 별빛 한 점이 가라앉아 있다. 천 길 아래로 떨어진 별의 흔적. 광맥의 옛 잡것들이 그 빛에 데워져 다시 깨어났다.",
      // 별빛 맵 전용 좌표(viewBox 1000×760). 본토 맵과 별개의 SVG 라 본토 좌표와 안 겹쳐도 된다.
      // 권장 레벨 순으로 좌상→우상→좌하→우하 배치. 진입 게이트(edges)는 본토 지역에서 그대로.
      position: { x: 260, y: 230 },
      biome: "cave",
      enemies: ["별빛 박쥐", "별빛 동굴뱀", "별빛 광물 골렘"],
      encounterWeights: {
        "별빛 박쥐": 35,
        "별빛 동굴뱀": 35,
        "별빛 광물 골렘": 30,
      },
      boss: { monsterName: "별빛 광맥 수호자" },
      recommendedLevel: 100,
    },
    // ── 5막 PR-B1 — 별빛 협곡 (운무 협곡 옆) ────────────────────────────────
    // Ch 26 「별이 떨어진 자리」 완료(starfall_warden_felled) 후 협곡 안쪽으로 별빛이
    // 떨어진 자리가 드러난다. 운봉의 거인의 잔영이 솔로 region.boss 로 등장. Lv102 권장.
    {
      id: "starlit_canyon",
      name: "별빛 협곡",
      description:
        "운무 협곡 안쪽, 옛 거인이 잠들었던 자리에 별빛 한 점이 가라앉아 있다. 떼지어 도망쳤던 절벽 늑대들이 별빛에 데워져 다시 돌아와 있고, 협곡 깊은 자리에서 잔영 하나가 두 발을 박아 넣는다.",
      position: { x: 740, y: 230 },
      biome: "mountain",
      enemies: ["별빛 절벽 늑대", "별빛 돌풍 정령", "별빛 늑대 무리장"],
      encounterWeights: {
        "별빛 절벽 늑대": 45,
        "별빛 돌풍 정령": 35,
        "별빛 늑대 무리장": 20,
      },
      boss: { monsterName: "별빛 거인 잔영" },
      recommendedLevel: 102,
    },
    // ── 5막 PR-B2 — 별빛 산호초 (산호초 섬 옆) ─────────────────────────────
    // 같은 게이트(starfall_warden_felled). 수심의 것의 메아리가 솔로 region.boss 로 등장.
    {
      id: "starlit_reef",
      name: "별빛 산호초",
      description:
        "산호초 섬 너머 안개 한가운데, 옛 수심의 것이 가라앉았던 자리에 별빛 한 점이 떠 있다. 사이렌이 옛 노래 사이에 새 음절을 섞어 부르고, 갑각 약탈자들이 한낮에도 한기를 두른 채 떠다닌다.",
      position: { x: 260, y: 540 },
      biome: "coast",
      enemies: ["별빛 산호초 사이렌", "별빛 갑각 약탈자", "별빛 가시 산호 골렘"],
      encounterWeights: {
        "별빛 산호초 사이렌": 40,
        "별빛 갑각 약탈자": 35,
        "별빛 가시 산호 골렘": 25,
      },
      boss: { monsterName: "수심의 메아리" },
      recommendedLevel: 104,
    },
    // ── 5막 PR-B2 — 별빛 성채 (옛 변경 성채 옆) ────────────────────────────
    // 같은 게이트(starfall_warden_felled). 옛 성문지기의 잔영이 솔로 region.boss 로 등장.
    {
      id: "starlit_keep",
      name: "별빛 성채",
      description:
        "옛 변경 성채 안쪽, 성문지기 자동인형이 멈춰 섰던 자리에 별빛 한 점이 가라앉아 있다. 폐성벽의 까마귀들이 별빛을 두른 채 깃을 떨구고, 빗장이 다시 한 번 들렸다 떨어진다.",
      position: { x: 740, y: 540 },
      biome: "ruins",
      enemies: ["별빛 폐성벽 까마귀", "별빛 탈영 약탈자", "별빛 녹슨 자동인형"],
      encounterWeights: {
        "별빛 폐성벽 까마귀": 35,
        "별빛 탈영 약탈자": 35,
        "별빛 녹슨 자동인형": 30,
      },
      boss: { monsterName: "성문지기 잔영" },
      recommendedLevel: 106,
    },
    // 별빛 권역 중앙 허브 — 네 별빛 지역(갱도·협곡·산호초·성채)을 한가운데서 잇는다.
    // NPC·퀘스트 없이 town 기능만 제공: 회복소 + 빠른이동 목적지 + 안전 지대. 좌표는
    // 네 지역(260/740 × 230/540)의 정중앙. 배경 이미지는 ui/starlit_crossroads.webp
    // fallback (없으면 RegionBackground 가 graceful 처리 — 추후 추가).
    {
      id: "starlit_crossroads",
      name: "별빛 교차로",
      description:
        "별빛이 떨어진 네 자리의 한가운데. 흩어진 길목이 여기서 만난다. 별먼지에 덮인 옛 보급 거점이 남아 있어 지친 몸을 추스르고 어디로든 다시 나설 수 있다.",
      position: { x: 500, y: 385 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 102,
    },
    // 6막 「별을 잊은 것」 — 별빛 교차로 바로 아래, 별빛보다 더 오래된 봉인이 가라앉은 자리.
    // 상시 협동(월드) 레이드 보스 아레나. 일반 사냥(enemies) 없이 보스 도전만 — COOP_BOSSES
    // 가 BossSubView 에 협동 카드를 띄운다. 배경은 ui/forgotten_seal.webp fallback(추후).
    {
      id: "forgotten_seal",
      name: "잊힌 봉인",
      description:
        "별빛 교차로 발치가 갈라진 틈. 별이 떨어지기 한참 전부터 무언가가 여기 봉인되어 있었다. 빛도 온기도 닿지 않는 바닥에서, 잊힌 것이 천천히 숨을 고른다.",
      position: { x: 500, y: 690 },
      biome: "ruins",
      enemies: [],
      recommendedLevel: 108,
    },
    // 길드 영지 진입점 — 별빛 교차로 북쪽. 별빛 맵(1000×760) 상단 중앙(500, 130) 배치.
    // 기존 노드: 모서리 4개 (260/740 × 230/540), 교차로 (500, 385), 잊힌 봉인 (500, 690).
    // tags: ["town"] 으로 마을 노드 시각 적용. enemies/boss 없어 전투/보스 카드는 안 뜸.
    // 진입은 AdventureHome 의 fiefdom_hall 전용 분기(피처 플래그 ON 시)로 처리.
    {
      id: "fiefdom_hall",
      name: "영주의 회관",
      description:
        "별빛 권역의 미개척지 한가운데. 길드의 이름으로 영지를 일구려는 영주들이 모이는 곳. 별먼지 위로 깃발이 하나둘 올라간다.",
      position: { x: 500, y: 130 },
      biome: "village",
      enemies: [],
      tags: ["town"],
      recommendedLevel: 100,
    },
  ],
  edges: [
    { from: "village", to: "plains" },
    {
      from: "plains",
      to: "cave",
      requires: { kind: "trial", battles: 5, enemiesFrom: "cave" },
    },
    {
      from: "plains",
      to: "forest",
      requires: { kind: "trial", battles: 5, enemiesFrom: "forest" },
    },
    {
      from: "cave",
      to: "lake",
      requires: { kind: "trial", battles: 5, enemiesFrom: "lake" },
    },
    {
      from: "cave",
      to: "deep_cave",
      requires: {
        kind: "story",
        flagId: "jimmy_deep_cave_quest",
        reason: "나무꾼 지미가 동굴 안쪽에서 본 무언가에 대해 들려주지 않았다.",
      },
    },
    {
      from: "forest",
      to: "lake",
      requires: { kind: "trial", battles: 5, enemiesFrom: "lake" },
    },
    { from: "lake", to: "diola" },
    {
      from: "forest",
      to: "ruins",
      requires: {
        kind: "story",
        flagId: "stranger_ruins_guide",
        reason: "아직 길을 알지 못한다. 디올라의 후드 쓴 손님이 안다고 한다.",
      },
    },
    // 운향 라인 (quarry → highland → canyon → unhyang).
    {
      from: "ruins",
      to: "quarry",
      requires: { kind: "trial", battles: 5, enemiesFrom: "quarry" },
    },
    {
      from: "quarry",
      to: "highland",
      requires: { kind: "trial", battles: 5, enemiesFrom: "highland" },
    },
    {
      from: "highland",
      to: "canyon",
      requires: { kind: "trial", battles: 5, enemiesFrom: "canyon" },
    },
    // 솔로 region.boss 운봉의 거인에 한 번이라도 도전하면 unlock (참여 flag).
    // peak_giant_defeated 가 아닌 peak_giant_engaged — 처치까진 안 가도 진입 가능.
    // engage flag 는 monsters.ts 의 onEngageFlag → BossSubView.onBossAttempt 가 set.
    {
      from: "canyon",
      to: "unhyang",
      requires: {
        kind: "story",
        flagId: "peak_giant_engaged",
        reason: "운봉의 거인과 한 번이라도 맞붙어야 길목이 열린다.",
      },
    },
    // 다리 구간 (unhyang → cloud_plain → windvale → ashen_pass) → 봉황령 라인.
    {
      from: "unhyang",
      to: "cloud_plain",
      requires: { kind: "trial", battles: 5, enemiesFrom: "cloud_plain" },
    },
    { from: "cloud_plain", to: "windvale" },
    {
      from: "windvale",
      to: "ashen_pass",
      requires: { kind: "trial", battles: 5, enemiesFrom: "ashen_pass" },
    },
    {
      from: "ashen_pass",
      to: "phoenix_ridge",
      requires: { kind: "trial", battles: 5, enemiesFrom: "phoenix_ridge" },
    },
    {
      from: "phoenix_ridge",
      to: "volcanic_badlands",
      requires: { kind: "trial", battles: 5, enemiesFrom: "volcanic_badlands" },
    },
    {
      from: "volcanic_badlands",
      to: "skyreach",
      requires: {
        kind: "story",
        flagId: "volcano_heart_defeated",
        reason: "화산의 심장을 쓰러뜨려야 성지로 가는 길이 열린다.",
      },
    },
    // 천공 성지 남쪽 라인 — skyreach → starspire → star_corridor → star_haven (마을)
    //   → skyfolk_ruins → throne_road → apex_throne. 사냥터마다 trial 5, 마을 진입은 직접.
    {
      from: "skyreach",
      to: "starspire",
      requires: { kind: "trial", battles: 5, enemiesFrom: "starspire" },
    },
    {
      from: "starspire",
      to: "star_corridor",
      requires: { kind: "trial", battles: 5, enemiesFrom: "star_corridor" },
    },
    // 별빛 회랑 → 별바다 (town) — 마을 진입은 trial 없이 직접.
    { from: "star_corridor", to: "star_haven" },
    // 별바다 → 선인의 폐도 — 마을 출발 후 다시 trial 5.
    {
      from: "star_haven",
      to: "skyfolk_ruins",
      requires: { kind: "trial", battles: 5, enemiesFrom: "skyfolk_ruins" },
    },
    {
      from: "skyfolk_ruins",
      to: "throne_road",
      requires: { kind: "trial", battles: 5, enemiesFrom: "throne_road" },
    },
    {
      from: "throne_road",
      to: "apex_throne",
      requires: { kind: "trial", battles: 5, enemiesFrom: "apex_throne" },
    },
    // 해안 지선 (diola → tideflats → saltmarsh → reef_isle).
    // 산호초 섬은 뱃사공 해랑이 배를 내줘야 — 소만 원로 여울의 신임을 얻고(saltmarsh_vouched),
    // 해랑에게 게딱지를 모아다 주면(ferryman_reef_passage) 길이 열린다. (HaerangDialogue 참고)
    {
      from: "diola",
      to: "tideflats",
      requires: { kind: "trial", battles: 5, enemiesFrom: "tideflats" },
    },
    { from: "tideflats", to: "saltmarsh" },
    {
      from: "saltmarsh",
      to: "reef_isle",
      requires: {
        kind: "story",
        flagId: "ferryman_reef_passage",
        reason: "소만의 뱃사공 해랑이 아직 난바다로 가는 배를 내주지 않았다.",
      },
    },
    // 서편 옛길 (village → westgate → dustford → oldwall_keep).
    // 옛 변경 성채는 옛 수비대장 무진이 무너진 북쪽 벽으로 가는 길을 열어줘야 — 마른나루 사람들의
    // 신임을 얻고(dustford_vouched), 무진에게 옛길 노상강도를 솎아 주면(oldwall_keep_unsealed)
    // 길이 열린다. (MujinDialogue 참고)
    {
      from: "village",
      to: "westgate",
      requires: { kind: "trial", battles: 5, enemiesFrom: "westgate" },
    },
    { from: "westgate", to: "dustford" },
    {
      from: "dustford",
      to: "oldwall_keep",
      requires: {
        kind: "story",
        flagId: "oldwall_keep_unsealed",
        reason: "옛 수비대장 무진이 아직 무너진 성벽으로 가는 길을 열어주지 않았다.",
      },
    },
    // 용비늘 라인 (windvale → bone_marches → scalefall_barrows).
    {
      from: "windvale",
      to: "bone_marches",
      requires: { kind: "trial", battles: 5, enemiesFrom: "bone_marches" },
    },
    {
      from: "bone_marches",
      to: "scalefall_barrows",
      requires: { kind: "trial", battles: 5, enemiesFrom: "scalefall_barrows" },
    },
    // 용의 둥지 — 뼈비늘 노룡을 한 번 잡은 자만 들어선다. 그 안쪽에서 어미가 깨어 있다.
    {
      from: "scalefall_barrows",
      to: "dragon_nest",
      requires: {
        kind: "story",
        flagId: "wyrm_warden_felled",
        reason: "뼈비늘 노룡을 한 번 쓰러뜨려야 그 안쪽 둥지의 어미가 자네를 알아본다.",
      },
    },
    // 고탑 입구 — 옛 성문지기를 한 번 쓰러뜨려야 열린다.
    {
      from: "oldwall_keep",
      to: "tower_foot",
      requires: {
        kind: "story",
        flagId: "gatekeeper_felled",
        reason: "옛 성문지기를 쓰러뜨려야 그 너머의 봉인된 길이 열린다.",
      },
    },
    // 5막 도입 — 별빛 갱도. 옥좌의 주재 협동전 클리어 후에 깊은 동굴 안쪽으로 길이 드러난다.
    {
      from: "deep_cave",
      to: "starfall_cave",
      requires: {
        kind: "story",
        flagId: "endgame_apex_defeated",
        reason: "황제가 쓰러진 뒤에야 광맥 안쪽으로 별빛이 떨어진 자리가 드러난다.",
      },
    },
    // 5막 PR-B1 — 별빛 협곡. Ch 26 「별이 떨어진 자리」 완료 후에 협곡 깊은 자리가 드러난다.
    {
      from: "canyon",
      to: "starlit_canyon",
      requires: {
        kind: "story",
        flagId: "starfall_warden_felled",
        reason: "별이 떨어진 첫 자리(별빛 갱도)를 정리한 뒤에야 협곡으로도 별빛이 새어 든다.",
      },
    },
    // 5막 PR-B2 — 별빛 산호초 / 별빛 성채. 같은 게이트(starfall_warden_felled).
    {
      from: "reef_isle",
      to: "starlit_reef",
      requires: {
        kind: "story",
        flagId: "starfall_warden_felled",
        reason: "별이 떨어진 첫 자리(별빛 갱도)를 정리한 뒤에야 안개 너머로 별빛이 새어 든다.",
      },
    },
    {
      from: "oldwall_keep",
      to: "starlit_keep",
      requires: {
        kind: "story",
        flagId: "starfall_warden_felled",
        reason: "별이 떨어진 첫 자리(별빛 갱도)를 정리한 뒤에야 성벽 안쪽으로 별빛이 새어 든다.",
      },
    },
    // 별빛 권역 중앙 허브 ↔ 네 지역. 각 지역은 본토 게이트로 처음 들어가야 하고(진행 우회
    // 방지), 한 번 방문한 지역과는 교차로를 통해 자유로이 오간다 — "visited" 게이트로 자기-제한.
    {
      from: "starfall_cave",
      to: "starlit_crossroads",
      requires: { kind: "visited", regionId: "starfall_cave" },
    },
    {
      from: "starlit_canyon",
      to: "starlit_crossroads",
      requires: { kind: "visited", regionId: "starlit_canyon" },
    },
    {
      from: "starlit_reef",
      to: "starlit_crossroads",
      requires: { kind: "visited", regionId: "starlit_reef" },
    },
    {
      from: "starlit_keep",
      to: "starlit_crossroads",
      requires: { kind: "visited", regionId: "starlit_keep" },
    },
    // 별빛 교차로 → 잊힌 봉인(6막 레이드 아레나). 교차로를 거쳐야 닿는다. 보스 자격 게이트는
    // COOP_BOSSES.requiredFlag(별빛 잔영 정리) 가 보스 카드에서 따로 건다 — 길은 열려 있되
    // 자격 없으면 잠금 카드만 보이는 dragon_nest 패턴과 동일.
    {
      from: "starlit_crossroads",
      to: "forgotten_seal",
      requires: { kind: "visited", regionId: "starlit_crossroads" },
    },
    // 별빛 교차로 → 영주의 회관(길드 영지 진입점). 교차로 방문 시 인접 reachable 노드로 표시됨.
    // 회관 자체는 NPC/전투 없는 town 노드 — AdventureHome 의 영지 카드 분기로 진입.
    {
      from: "starlit_crossroads",
      to: "fiefdom_hall",
      requires: { kind: "visited", regionId: "starlit_crossroads" },
    },
    // 마을 간 직통 이동 (fast-travel) — 양쪽 마을을 모두 발견했을 때만 통행.
    { from: "village", to: "diola", requires: { kind: "visited", regionId: "diola" } },
    { from: "diola", to: "village", requires: { kind: "visited", regionId: "village" } },
    { from: "village", to: "unhyang", requires: { kind: "visited", regionId: "unhyang" } },
    { from: "unhyang", to: "village", requires: { kind: "visited", regionId: "village" } },
    { from: "diola", to: "unhyang", requires: { kind: "visited", regionId: "unhyang" } },
    { from: "unhyang", to: "diola", requires: { kind: "visited", regionId: "diola" } },
    { from: "village", to: "windvale", requires: { kind: "visited", regionId: "windvale" } },
    { from: "windvale", to: "village", requires: { kind: "visited", regionId: "village" } },
    { from: "diola", to: "windvale", requires: { kind: "visited", regionId: "windvale" } },
    { from: "windvale", to: "diola", requires: { kind: "visited", regionId: "diola" } },
    { from: "unhyang", to: "windvale", requires: { kind: "visited", regionId: "windvale" } },
    { from: "windvale", to: "unhyang", requires: { kind: "visited", regionId: "unhyang" } },
    { from: "village", to: "skyreach", requires: { kind: "visited", regionId: "skyreach" } },
    { from: "skyreach", to: "village", requires: { kind: "visited", regionId: "village" } },
    { from: "diola", to: "skyreach", requires: { kind: "visited", regionId: "skyreach" } },
    { from: "skyreach", to: "diola", requires: { kind: "visited", regionId: "diola" } },
    { from: "unhyang", to: "skyreach", requires: { kind: "visited", regionId: "skyreach" } },
    { from: "skyreach", to: "unhyang", requires: { kind: "visited", regionId: "unhyang" } },
    { from: "windvale", to: "skyreach", requires: { kind: "visited", regionId: "skyreach" } },
    { from: "skyreach", to: "windvale", requires: { kind: "visited", regionId: "windvale" } },
    // 소만 — 다른 마을들과 직통 이동.
    { from: "village", to: "saltmarsh", requires: { kind: "visited", regionId: "saltmarsh" } },
    { from: "saltmarsh", to: "village", requires: { kind: "visited", regionId: "village" } },
    { from: "diola", to: "saltmarsh", requires: { kind: "visited", regionId: "saltmarsh" } },
    { from: "saltmarsh", to: "diola", requires: { kind: "visited", regionId: "diola" } },
    { from: "unhyang", to: "saltmarsh", requires: { kind: "visited", regionId: "saltmarsh" } },
    { from: "saltmarsh", to: "unhyang", requires: { kind: "visited", regionId: "unhyang" } },
    { from: "windvale", to: "saltmarsh", requires: { kind: "visited", regionId: "saltmarsh" } },
    { from: "saltmarsh", to: "windvale", requires: { kind: "visited", regionId: "windvale" } },
    { from: "skyreach", to: "saltmarsh", requires: { kind: "visited", regionId: "saltmarsh" } },
    { from: "saltmarsh", to: "skyreach", requires: { kind: "visited", regionId: "skyreach" } },
    // 마른나루 — 다른 마을들과 직통 이동.
    { from: "village", to: "dustford", requires: { kind: "visited", regionId: "dustford" } },
    { from: "dustford", to: "village", requires: { kind: "visited", regionId: "village" } },
    { from: "diola", to: "dustford", requires: { kind: "visited", regionId: "dustford" } },
    { from: "dustford", to: "diola", requires: { kind: "visited", regionId: "diola" } },
    { from: "saltmarsh", to: "dustford", requires: { kind: "visited", regionId: "dustford" } },
    { from: "dustford", to: "saltmarsh", requires: { kind: "visited", regionId: "saltmarsh" } },
    { from: "unhyang", to: "dustford", requires: { kind: "visited", regionId: "dustford" } },
    { from: "dustford", to: "unhyang", requires: { kind: "visited", regionId: "unhyang" } },
    { from: "windvale", to: "dustford", requires: { kind: "visited", regionId: "dustford" } },
    { from: "dustford", to: "windvale", requires: { kind: "visited", regionId: "windvale" } },
    { from: "skyreach", to: "dustford", requires: { kind: "visited", regionId: "dustford" } },
    { from: "dustford", to: "skyreach", requires: { kind: "visited", regionId: "skyreach" } },
    // 별바다 — 다른 마을들과 직통 이동 (천공 라인의 endgame 허브).
    { from: "village", to: "star_haven", requires: { kind: "visited", regionId: "star_haven" } },
    { from: "star_haven", to: "village", requires: { kind: "visited", regionId: "village" } },
    { from: "diola", to: "star_haven", requires: { kind: "visited", regionId: "star_haven" } },
    { from: "star_haven", to: "diola", requires: { kind: "visited", regionId: "diola" } },
    { from: "unhyang", to: "star_haven", requires: { kind: "visited", regionId: "star_haven" } },
    { from: "star_haven", to: "unhyang", requires: { kind: "visited", regionId: "unhyang" } },
    { from: "windvale", to: "star_haven", requires: { kind: "visited", regionId: "star_haven" } },
    { from: "star_haven", to: "windvale", requires: { kind: "visited", regionId: "windvale" } },
    { from: "saltmarsh", to: "star_haven", requires: { kind: "visited", regionId: "star_haven" } },
    { from: "star_haven", to: "saltmarsh", requires: { kind: "visited", regionId: "saltmarsh" } },
    { from: "dustford", to: "star_haven", requires: { kind: "visited", regionId: "star_haven" } },
    { from: "star_haven", to: "dustford", requires: { kind: "visited", regionId: "dustford" } },
    { from: "skyreach", to: "star_haven", requires: { kind: "visited", regionId: "star_haven" } },
    { from: "star_haven", to: "skyreach", requires: { kind: "visited", regionId: "skyreach" } },
  ],
};

export const START_REGION_ID: RegionId = "village";

// 가중치 기반 등장 적 추첨. encounterWeights 미지정 시 균등 분포로 폴백.
export function pickEnemyName(
  region: Region,
  rng: () => number = Math.random,
): string | null {
  if (region.enemies.length === 0) return null;
  const weights = region.enemies.map(
    (name) => Math.max(0, region.encounterWeights?.[name] ?? 1),
  );
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return region.enemies[0];
  let roll = rng() * total;
  for (let i = 0; i < region.enemies.length; i += 1) {
    roll -= weights[i];
    if (roll < 0) return region.enemies[i];
  }
  return region.enemies[region.enemies.length - 1];
}

function buildAdjacencyByRegion(map: WorldMap): Map<RegionId, RegionId[]> {
  const adjacency = new Map<RegionId, RegionId[]>();
  const seenByRegion = new Map<RegionId, Set<RegionId>>();
  const addAdjacent = (from: RegionId, to: RegionId) => {
    let list = adjacency.get(from);
    if (!list) {
      list = [];
      adjacency.set(from, list);
    }
    let seen = seenByRegion.get(from);
    if (!seen) {
      seen = new Set();
      seenByRegion.set(from, seen);
    }
    if (!seen.has(to)) {
      seen.add(to);
      list.push(to);
    }
  };

  for (const edge of map.edges) {
    addAdjacent(edge.from, edge.to);
    addAdjacent(edge.to, edge.from);
  }
  return adjacency;
}

const WORLD_ADJACENCY_BY_REGION = buildAdjacencyByRegion(WORLD_MAP);
const ADJACENCY_BY_MAP = new WeakMap<WorldMap, Map<RegionId, RegionId[]>>([
  [WORLD_MAP, WORLD_ADJACENCY_BY_REGION],
]);

export function getAdjacent(map: WorldMap, regionId: RegionId): RegionId[] {
  let adjacency = ADJACENCY_BY_MAP.get(map);
  if (!adjacency) {
    adjacency = buildAdjacencyByRegion(map);
    ADJACENCY_BY_MAP.set(map, adjacency);
  }
  if (map === WORLD_MAP) {
    return [...(WORLD_ADJACENCY_BY_REGION.get(regionId) ?? [])];
  }
  return [...(adjacency.get(regionId) ?? [])];
}

// id → Region 빠른 조회. WORLD_MAP.regions.find() 가 O(N) 인데,
// MapView 가 edge 마다 두 번씩 호출해 30 regions × 50+ edges = 1500+ 비교/렌더.
// 모듈 로드 시 한 번 빌드 → O(1) 조회.
const REGION_BY_ID: Map<RegionId, Region> = new Map(
  WORLD_MAP.regions.map((r) => [r.id, r]),
);

export function getRegion(id: RegionId | undefined | null): Region | null {
  if (!id) return null;
  return REGION_BY_ID.get(id) ?? null;
}
