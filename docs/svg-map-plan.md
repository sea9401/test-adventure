# SVG 지도 구현 계획

> 상태: ✅ **구현 완료** — SVG 지도(#460 등) 출고. 이 문서는 설계 기록.

모험 탭 > 지도 서브뷰의 자리표시자를 SVG 기반 노드 맵으로 대체.
지역(노드)과 길(엣지)로 구성된 시각적 월드맵을 클릭/탭으로 탐색.

## 목표

- 텍스트 카드 리스트 대신 시각적 위치 감각 제공.
- 지역 간 연결 관계를 한눈에 파악 (어디서 어디로 갈 수 있는지).
- 모바일에서도 조작 가능 (탭으로 노드 선택, 핀치 줌은 v1에서 제외 가능).
- 진행도에 따라 해금되는 노드 표현.
- 기존 subView 패턴 안에서 자연스럽게 통합.

## 데이터 모델

```ts
type RegionId =
  | "village"     // 시작 마을
  | "plains"      // 평야
  | "forest"      // 숲
  | "cave"        // 동굴
  | "...";

type Region = {
  id: RegionId;
  name: string;          // "평야"
  description: string;   // 짧은 한 줄 설명
  position: { x: number; y: number }; // SVG 좌표 (viewBox 안에서)
  unlock?: {
    // 미설정 시 시작부터 해금
    requires?: RegionId[];     // 사전 해금 필요 노드
    minLevel?: number;
    minBattles?: number;
  };
};

type RegionEdge = {
  from: RegionId;
  to: RegionId;
  // 양방향 기본. 단방향이 필요해지면 옵션 추가.
};

type WorldMap = {
  viewBox: { width: number; height: number }; // 예: 800 × 500
  regions: Region[];
  edges: RegionEdge[];
};
```

위치(`position`)는 디자이너가 보기 좋게 직접 좌표를 잡는 방식.
자동 레이아웃(force-directed 등)은 v1에선 도입하지 않음 — 노드 수가
적을 때는 수작업이 더 깔끔하고 예측 가능.

## 상태 (localStorage 영속)

```ts
type MapProgress = {
  currentRegionId: RegionId;       // 현재 위치
  unlockedRegionIds: RegionId[];   // 해금된 노드 목록
  visitedRegionIds: RegionId[];    // 방문 이력 (시각 효과용)
};
```

저장 키: `map.v1`. 기존 `training.v1` / `characterProfile.v1` 패턴 재사용.

## 노드 시각 상태

| 상태 | 표현 |
|------|------|
| 현재 위치 | 강조 색 + 펄스 애니메이션 |
| 해금됨 + 방문 가능 | 일반 색, 클릭 활성 |
| 해금됨 + 방문함 | 일반 색에 체크/표시 |
| 잠김 | 흐리게 + 자물쇠 아이콘, 클릭 시 해금 조건 툴팁 |

엣지(길)는 양 끝 모두 해금된 경우 실선, 하나라도 잠겨 있으면 점선/흐림.

## 컴포넌트 구조

```
src/app/page.tsx                  # 지도 서브뷰 라우팅
src/adventure/MapView.tsx         # SVG 맵 컨테이너 (props로 진행 상태)
src/adventure/MapNode.tsx         # 단일 노드 SVG (circle + label)
src/adventure/MapEdge.tsx         # 단일 엣지 SVG (line/path)
src/adventure/RegionDetail.tsx    # 노드 클릭 시 하단 패널 (이름·설명·이동 버튼)
src/adventure/data/world.ts       # WorldMap 정적 데이터
src/lib/map-progress.ts           # localStorage 로드/저장, 해금 조건 평가
```

## 인터랙션

- **클릭/탭**: 노드 선택 → 하단 RegionDetail 패널에 이름·설명·이동 버튼.
- **이동 버튼**: 현재 노드와 엣지로 연결되어 있고 해금된 경우에만 활성.
  눌렀을 때 `currentRegionId` 갱신, `visitedRegionIds`에 추가.
- **잠긴 노드 클릭**: 자물쇠 + "Lv.5 필요" 같은 해금 조건 표시.
- **호버 (데스크톱)**: 노드 위 작은 라벨 표시 (이미 라벨이 보이면 생략).
- **줌/팬**: v1 제외. 노드를 viewBox 안에 다 담는 디자인. 노드가 많아지면
  v2에서 `react-zoom-pan-pinch` 같은 라이브러리 도입 검토.

## SVG 레이아웃 가이드

- 기본 viewBox: `0 0 800 500` (가로형). `preserveAspectRatio="xMidYMid meet"`로
  컨테이너에 fit. CSS는 `width: 100%; height: auto`.
- 모바일 세로 모드에서도 가로 비율 유지 → 컨테이너에 `max-h-[60vh]` 정도로
  과도하게 커지지 않게.
- 노드 반지름 ~24px, 터치 hit-area 보장 위해 투명 원 + 큰 반지름(40px) 추가.
- 엣지는 노드 중심 좌표로 그리되 노드 반지름만큼 안쪽에서 시작/끝나도록 보정
  (선이 노드 안에 들어가지 않게).

## 다크 모드

기존 zinc 팔레트 톤에 맞춤:
- 노드 채움: light `bg-zinc-50`, dark `bg-zinc-900` (= `fill="currentColor"` + 클래스)
- 노드 테두리: `stroke="currentColor"` + light `text-zinc-300` / dark `text-zinc-700`
- 현재 위치 강조: emerald 계열로 통일 (`text-emerald-500`).
- 엣지: 비활성 light `text-zinc-300` / dark `text-zinc-700`, 활성은 한 단계 진하게.

## 구현 단계

1. **데이터**: `src/adventure/data/world.ts`에 첫 5~7개 노드와 엣지 정의 (수동 좌표).
2. **저장 계층**: `src/lib/map-progress.ts`에 로드/저장/해금 평가 함수, `map.v1` 키.
3. **MapEdge / MapNode**: 정적 SVG 렌더 (상태별 className 분기).
4. **MapView**: viewBox 컨테이너 + 노드 선택 상태(useState). 노드 클릭 시 선택 갱신.
5. **RegionDetail**: 선택된 노드 정보 + 이동 버튼 (`onMove(regionId)`).
6. **page.tsx 통합**: 모험 > 지도 subView에 `<MapView>` 렌더, page 단의 진행 상태와
   콜백 연결. `now` 같은 외부 상태가 필요 없으면 MapView 자체에 진행 상태를 둬도 됨.
7. **해금/이동 로직**: 이동 시 `currentRegionId` 갱신, 인접 잠금 노드의 해금 조건
   재평가 후 `unlockedRegionIds`에 추가.
8. **시각 효과**: 현재 위치 펄스 애니메이션, 방문 노드 표시, 잠긴 엣지 점선.

## v1 범위 (먼저 만들 것)

- 정적 좌표 노드 5~7개, 엣지 6~8개.
- 클릭·이동·해금만 구현. 노드 호버 라벨, 펄스 애니메이션 정도.
- 적/보스/전투 진입은 별도 — RegionDetail에서 "이 지역 탐색"
  버튼만 두고 실제 전투 통합은 후속.

## v2 이후 (나중에 보강)

- 줌/팬, 노드 그룹(대륙 단위), 안개·발견 효과(아직 안 가본 노드는 윤곽만).
- 자동 레이아웃(force-directed)으로 노드 추가 시 좌표 자동 배치.
- 길찾기(여러 노드 거쳐 자동 이동), 이동 시간/스태미나 소비.
- 지도 위 동적 마커(이벤트 발생 중인 지역, 일일 보스 등).

## 열린 질문

- 첫 v1에 들어갈 지역 이름·이야기 톤은? (시작 마을 + 평야 + 숲 + 동굴 + 폐허 정도?)
- 시작 위치는 "마을" 고정 vs 캐릭터 생성 시 선택?
- 이동에 시간/비용을 넣을지, 아니면 즉시 이동(클릭 즉시 위치 변경)?
- 전투/이벤트 시스템과 어떤 식으로 결합할지 — 지역 진입이 곧 인카운터인지,
  아니면 지역 안에서 별도 "탐색" 액션이 필요한지.
