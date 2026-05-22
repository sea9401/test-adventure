# Changelog

> 상태: 📌 **살아있는 문서** — 변경 이력. 지속 갱신.

날짜·해시는 git log 기준. 카테고리 태그:
🏗️ infra · 👤 character · 🗺️ adventure · ⚔️ battle · 🏘️ town · 🤝 npc · 🔔 notify · 🎨 ui · 📦 data · 📝 docs

## 2026-05-13

### 해안·서편 라인 클로저 칭호 2종 (`feat/region-line-titles`)

후속 — 해안/서편 지선 PR 에서 보류했던 라인 클리어 칭호. 디올라의 친구·산정의 벗과 같은 패턴(`questCompletionSideEffects` 의 `ON_COMPLETE`).

- 👤 `saltmarsh_friend` "소만의 식구" — 여울의 `saltmarsh-yeoul-deep-one` 의뢰 완수 시 부여.
- 👤 `dustford_friend` "마른나루의 식구" — 무진의 `dustford-mujin-gatekeeper` 의뢰 완수 시 부여.

### 서편 옛길 — 서편 옛길 · 마른나루 · 옛 변경 성채 (`feat/westgate-region`)

상세 설계: `docs/westgate-plan.md`. 시작 마을(Lv1)에서 **서쪽**으로 갈라지는 막다른 3지역 라인 — 동쪽 모험길의 반대편. 고대·마법의 `옛 폐허`와 달리 "한 세대 전 전쟁의 잔해": 인간 노상강도·탈영병 + 녹슨 전쟁기계 + 까마귀. (해안 지선의 자매편.)

- 🗺️ **신규 지역 3곳**: 서편 옛길(`westgate`, Lv3)·마른나루(`dustford`, Lv7 마을)·옛 변경 성채(`oldwall_keep`, Lv13). viewBox `height` 640→700. 엣지: `village→westgate`(시련 5전)·`westgate→dustford`·`dustford→oldwall_keep`(story `oldwall_keep_unsealed`). 마른나루 fast-travel 6쌍.
- ⚔️ **잡몹 6종 + 보스 1**: 들까마귀 떼(회피)·갈대 살쾡이·노상강도(옛길 Lv3) / 폐성벽 까마귀(회피)·탈영 약탈자(`heavy_blow`)·녹슨 자동인형(`brace`)(옛 변경 성채 Lv13) / **옛 성문지기**(`oldwall_keep.boss`, 일일 3회, `heavy_blow`+phaseTrigger, `onDefeatFlag: gatekeeper_felled`). image 필드는 후속(webp).
- 📦 **재료 3종**: 까마귀 깃(`raven_feather`)·녹슨 쇳조각(`scrap_iron`)·옛 군기 조각(`war_banner_scrap`) (sellPrices 등록). 노상강도/들고양이 무기 재료로 기존 들개 송곳니 재사용.
- 📦 **장비 15종**: 옛길 입문 2(까마귀깃 두건·노상강도의 단검) / 옛 변경 성채 잡몹산 3(수비대 사슬갑옷·톱니 전곡괭이·낡은 군기 망토) / 업그레이드 3(노상강도의 활검·보강한 수비대 사슬갑옷·변경 군기 망토) / 옛 성문지기 보상 5(수비대 무구 4 `recipe_one_of`(atk+6+보조)·성문지기의 핵) / 유실된 명품 `crows_hoard_charm`(들까마귀 떼 0.02%) → 업그레이드 `corvid_fortune_charm`(unique·비거래). 마정석 라인과 운봉 라인 사이. 제작법 14종(recipes.ts) — 잡몹/보스 드랍 + equip 업그레이드 + `crows_hoard_engraving`.
- 🤝 **마른나루 NPC 5명**: 옛 수비대장 무진(`MujinDialogue` 커스텀 — 메인 라인 축, `dustford_vouched` + 옛길 정리 → `oldwall_keep_unsealed` 게이트)·고물장수 두루(`DuruDialogue`, questLine)·역참 주인 나래(`NaraeDialogue`, questLine)·들사냥꾼 솔개(`SolgaeDialogue`, questLine)·역참 아이 보리(`BoriDialogue`, 의뢰 X — 떡밥 대사 분기). 초상화 placeholder(후속 webp). `renderTownNpcDialogue` 디스패치 연결.
- 🗺️ **퀘스트 ~20종**: 두루/나래/솔개 인트로 라인(들개 송곳니·노상강도 단검 제작서·까마귀깃 두건 제작서·약 주머니 +1) → 무진 보증 → 무진 옛길 정리 → 무진 성채 정찰(deliver) → 옛 성문지기 처치(보상 골드 700·명성 22·EXP 1000·작은 회복약 ×8·제작서 `gatekeeper_core`) → 정기 토벌(반복). 마른나루 길드 게시판 5종(성채 2종은 clear-road 선행). `REGION_REPEAT_COOLDOWN_MS.dustford = 4h`. `STORY_QUESTS.dustford_gatekeeper`.
- 🤝 **길드 의뢰 2종**(Phase B 우선 추가): `f_westgate_bandits`(F, 노상강도 ×400)·`e_gatekeeper_decommission`(E, `kill_boss` 옛 성문지기 ×8, 녹슨 쇳조각 ×3). 전체 풀 발란스는 Phase B 에서.
- 📝 `docs/items.md` 동기화(무기 7·방어구 5·장신구 3·재료 3 추가, rarity/유실된 명품 표 갱신) + `docs/westgate-plan.md` 신규.

### 해안 지선 — 조수 갯벌 · 소만 · 산호초 섬 (`feat/new-region`)

상세 설계: `docs/coast-plan.md`. 디올라(Lv6)에서 남쪽으로 갈라지는 막다른 3지역 라인 — 폐허(Lv9)~산기슭(Lv18) 구간에 산으로 가는 길과 나란히 놓인 바닷길. 첫 비(非)내륙 지역 / 물·바다 몹 / 막다른 지선.

- 🗺️ **신규 지역 3곳**: 조수 갯벌(`tideflats`, Lv10)·소만(`saltmarsh`, Lv13 마을)·산호초 섬(`reef_isle`, Lv18). `Biome "coast"` 신설. viewBox `height` 500→640. 엣지: `diola→tideflats`(시련 5전)·`tideflats→saltmarsh`·`saltmarsh→reef_isle`(story `ferryman_reef_passage`). 소만 fast-travel 5쌍.
- ⚔️ **잡몹 6종 + 보스 1**: 집게발 게(`pierce`)·갯도요(회피)·진흙 미꾸라지(갯벌 Lv10) / 산호초 사이렌(회피)·갑각 약탈자(`heavy_blow`)·가시 산호 골렘(`brace`)(산호초 섬 Lv18) / **수심의 것**(`reef_isle.boss`, 일일 3회, `enrage`+phaseTrigger, `onDefeatFlag: the_deep_one_stilled`). image 필드는 후속(webp 추가).
- 📦 **재료 3종**: 게딱지(`crab_shell`)·산호 가시(`coral_spine`)·심해 비늘(`deep_scale`) (sellPrices 등록).
- 📦 **장비 14종**: 갯벌 입문 2(게딱지 손방패·갯벌 각반) / 산호초 섬 잡몹산 3(산호 가시 단검·사이렌 비늘 로브·조수유리 부적) / 업그레이드 3(갑각 보루방패·가시 산호 단검·사이렌 노래 망토) / 수심의 것 보상 5(심연 무구 4 `recipe_one_of`(atk+7+보조)·수심의 핵) / 유실된 명품 `drowned_signet`(진흙 미꾸라지 0.02%) → 업그레이드 `tidelord_signet`(unique·비거래). 마정석 라인 한 단계 위. 제작법 14종(recipes.ts) — 잡몹/보스 드랍 + `crustacean_bulwark`/`barbed_coral_dagger` 등 equip 업그레이드 + `tidelord_signet_engraving`.
- 🤝 **소만 NPC 5명**: 원로 여울(`YeoulDialogue` 커스텀 — 메인 라인 축, `saltmarsh_vouched`)·뱃사공 해랑(`HaerangDialogue` 커스텀 — 선저 덧대기 → `ferryman_reef_passage` 게이트)·소금장수 갈매(`GalmaeDialogue`, questLine)·여각 주인 보말(`BomalDialogue`, questLine)·갯마을 아이 미르(`MireuDialogue`, 의뢰 X — 떡밥 대사 분기). 초상화 placeholder(후속 webp). `renderTownNpcDialogue` 디스패치 연결.
- 🗺️ **퀘스트 ~20종**: 갈매/보말 인트로 라인(게딱지·갯벌 각반 제작서·약 주머니 +1) → 여울 보증 → 해랑 선저 덧대기 → 여울 암초 정찰(deliver) → 수심의 것 처치(보상 골드 900·명성 26·EXP 1300·중간 회복약 ×5·제작서 `abyssal_heart`) → 정기 토벌(반복). 소만 길드 게시판 5종(산호초 섬 2종은 hull-plating 선행). `REGION_REPEAT_COOLDOWN_MS.saltmarsh = 7h`. `STORY_QUESTS.saltmarsh_deep_one`.
- 🤝 **길드 의뢰 2종**(Phase B 우선 추가): `f_tideflats_crabs`(F, 집게발 게 ×400)·`e_deep_one_pacify`(E, `kill_boss` 수심의 것 ×8, 심해 비늘 ×3). 전체 풀 발란스는 Phase B 에서.
- 📝 `docs/items.md` 동기화(무기 8·방어구 3·장신구 4·재료 3 추가, rarity/유실된 명품 표 갱신) + `docs/coast-plan.md` 신규.

### 신규 지역 퀘스트 라인 확장 — `feat/unhyang-quests` (PR #37, merge `41ee2b6`)

- 📦 **신규 지역 퀘스트 라인 확장** (quest-expansion-plan M1~M6 전 항목). 운향 메인(백운·만월) + 천공 성지 메인(해무) + 운향/바람골/봉황령/화산 사이드 의뢰·길드 게시판 + 마을 간 연계(마린↔백운·산하↔노라·지미↔도연·만월↔볼드) + 보스 누적 사냥 hunter ×3 + 순례자 미상 대사 분기 + 히든 퀘스트 8종(`hidden-mole-king`·`-deepest-vein`·`-blacksmith-duel`·`-giants-origin`·`-volcano-relic`·`-lucky-collector`·`-hooded-cipher`·`-pilgrim-trail`).
- 🤝 신규 NPC 3명: 떠돌이 음유시인 / 사미승 운하 / 문지기 청람 (초상화 placeholder — 추후 webp 추가).
- 👤 신규 칭호 8종: `mountain_friend`·`ridge_crosser`·`herbalists_courier`·`boss_hunter`·`caravan_warden`·`lucky_finder`·`cipher_bearer` + (`giant_slayer` 유지).
- 📦 신규 아이템 2종: 월광검(`moonlight_blade`)·용암 정수(`lava_essence`) — 히든 의뢰 보상, rare·비거래. 운봉/봉황 무기 4종씩 만월·해무 의뢰로 확정 루트 추가(보스 `recipe_one_of` 병행).
- 🏗️ 신규 헬퍼: `questLineDialogue`(다단계 의뢰 NPC 공용)·`inventory/ownership`(장비 보유·unique 카운트)·`PilgrimMarkDialogue`(통과 지역 표식 surfacing). 신규 다이얼로그 컴포넌트 ~7개. 기존에 데이터만 있고 노출 안 되던 NPC 의뢰(운향·바람골·천공) 전부 대화에 연결(버그 수정).
- 🏗️ `integrity.test.ts` 보강 — quest target(monsterName/materialId)·requiresQuestCompleted·id 유일성 정합성 검사.
- ⚔️ 보상 보정 — 화산 지대(reqLv 52~55) 사이드·게시판·연금 의뢰 EXP 상향 (1500~2200 → 2300~2900). `L^2.5` 곡선에서 후반 의뢰 EXP가 레벨업 필요량의 2.2~3.3%로 가라앉던 걸 봉황령 tier(~3.7%)에 맞춤. 메인 라인·hunter·히든 보상은 설계대로 유지.
- 🗺️ 봉황령→화산 레벨 공백(reqLv ~42 → 52) 보강 — reqLv 44~50 의뢰 8종 추가: 바람골 게시판 4종(`windvale-board-ridge-knights`·`-flame-lizards-large`·`-ridge-eagles-large`·`-lava-foothills`)·운향 게시판 1종(`unhyang-board-phoenix-ridge-grand`)·한솔 라인 2종(`windvale-pathfinder-deep-ridge`→`-foothills`)·도연 1종(`unhyang-guide-ridge-storm`). 각 ~4%/레벨로 봉황령 tier와 연속.

### 부러진 영웅검 복원 의뢰

- 🤝 **만월 — 부러진 영웅검 복원**(storyQuest `hero_sword_restoration`). 만월 재회(`manwol_bold_reunion_done`) + 천공 성지 보스(`volcano_heart_defeated`) 이후 해금. 폐허 늑대 드랍 unique `hero_broken_sword`(윗동강)를 맡기면 → 운봉석 ×16(검신) → 화염 능선 재료(용암 핵 ×6·화염 비늘 ×8·봉황 깃털 ×3, 날밑) → 벼리기 → 완성. flag 릴레이: `hero_sword_started`→`_ore_done`→`_core_done`→`_forging`→`_restored`. 윗동강 미보유 + 보스 처치 상태면 만월이 떡밥 대사. 윗동강은 드랍 품질 0~2 어느 칸이든 회수, 장착 중이면 안내.
- 📦 신규 아이템 `hero_sword`(영웅검) — 공격력 +18 / 힘 +5, `legendary`, 거래 불가. (서사 최종 보상답게 다른 무기 대비 확실히 위 — 같은 날 +16/속-1 에서 상향.)
- 👤 신규 칭호 `hero_sword_heir`(영웅검의 계승자) — `hero_sword_restored` flag, useTitleGrants.
- 🔔 완성 보상: 영웅검 + 골드 400 + 명성 8 + 칭호.

### 캐릭터 생성 모달 → 전용 `/create` 페이지

- 🏗️ 첫 진입 시 뜨던 캐릭터 생성 모달(`NameSetupModal`, fixed overlay) 제거 → 전용 라우트 `/create`. 폼은 `components/CreateCharacterForm`(모달 chrome 없는 순수 폼)으로 추출, `/create` 가 `SaveProvider` + `CreateCharacterPage` 로 감싸 렌더. 캐릭터 있으면 `/create→/`, 없으면 `/→/create` (needsSetup 단일 기준, 상호배타 → 루프 없음). 인증은 기존 미들웨어가 그대로 가드. 회원가입/온보딩 단계 확장 여지.

### 기존 장비 → 한 단계 위 장비 업그레이드 레시피 11종

- 📦 그동안 못박힌 야구방망이·요정의 가호 둘뿐이던 "장비 자체를 재료로 한 단계 위 장비 제작" 패턴을 11종 추가. 베이스 1개를 `equip` 재료로 소비 + 같은 구간 재료. 결과물도 제작 품질 등급 굴림.
  - 초반/중반(uncommon, 거래 가능): 낡은 가죽갑옷→**덧댄 가죽갑옷**(들개 0.5%) · 산적의 단검→**두목의 단검**(산적 0.3%) · 님프의 반지→**호수 님프의 가호**(호수 님프 0.2%) · 골렘의 망치→**재단조한 골렘 망치**(부서진 골렘 1.5%) · 망령의 망토→**망령왕의 망토**(떠도는 망령 0.2%) · 봉황 망토→**봉황 비행깃 망토**(불꽃 독수리 0.4%).
  - 유실된 명품 업그레이드(unique, **거래 불가** — "손에 맞춰진 보물"): 굳은 용암핵 망치→**용암핵 대망치**(용암 슬라임 0.5%) · 하늘가르개→**창천의 발톱**(초원 매 0.3%) · 거미여왕의 비단갑→**거미여왕의 비단 정갑**(거미 0.2%) · 박쥐떼의 길잡이→**박쥐떼의 인도자**(박쥐 0.3%) · 두더지왕의 드릴→**두더지왕의 굴착드릴**(광맥의 수호자 5%).
- 🏗️ `integrity.test.ts` 보강 — recipe id 유일성 + recipe `ingredients`의 materialId/itemId 존재 + equip→equip 자기참조(무한 루프) 금지 검사 추가 (기존엔 결과 itemId만 검증).
- 📝 `docs/items.md` — `(… 업그레이드)` 표기 안내 + 무기/방어구/장신구 표에 11종 추가, rarity 표 갱신.

### 초반 발판 — 상점 입문 장비

- 🏘️ 상점(`BuyTab`)에 **장비** 칸 추가 — 그동안 물약/재료/소모품만 팔던 데 `EquipItem.shopPrice` 가 지정된 장비를 취급. 서버 권위(`/api/shop` `buy_equipment` 액션) 그대로.
- 📦 신규 입문 장비 2종: 무딘 단검(`worn_dagger`, 공격력 +1) · 누빈 천 조끼(`quilted_vest`, 방어력 +1) — 각 14G, 비거래. 볼드 대장간 라인(야구방망이/낡은 가죽갑옷)을 타기 전이라도 첫 골드로 살 게 생긴다 (곧 그쪽으로 덮이는 잠깐용).
- 🏗️ `shop.test.ts` — `buy_equipment` 케이스(shopPrice 지정/미지정/골드부족) 추가.
- ⚔️ 초반 업그레이드 레시피를 실제 발판이 되도록 튜닝 — `덧댄 가죽갑옷` 제작법 들개 드랍 0.5%→**4%** + 들개 가죽 ×8→**×5**; `두목의 단검` 제작서 산적 드랍 0.3%→**4%**, `산적의 단검` 베이스 드랍 0.5%→**1.5%**, 단단한 수정 ×6→**×4**. (롱테일 파밍 보상 → 한 자릿수 레벨 안에 받을 만한 사다리 칸으로.)

## 2026-05-06

- `a271480` 🏗️ adventure-rpg 프로젝트 분리 — exten에서 adventure UI만 추출.

## 2026-05-07

### 인프라 / 셋업
- `7d64af6` 🏗️ 프로젝트 초기화 — exten 코드 전부 삭제, git/vercel 연결만 유지.
- `9ca93b0` 🏗️ shadcn/ui 초기 설정 + 타입 좁힘.
- `0ecab6f` 🏗️ 캐릭터 탭의 1차/2차 전직 Panel 제거 (게임 컨셉 재시작).
- `05aa8fa` 🏗️ Next.js 16 셋업 + 메인 화면 스켈레톤.

### 캐릭터 / 프로필
- `cb0b692` 👤 헤더에 이름·레벨 + 라이트/다크 토글.
- `9a52da0` 👤 캐릭터 간략 정보창 + 무기/방어구/장신구 슬롯.
- `123fd00` 👤 기본 장비 — 나뭇가지 / 천 옷 / 엄마가 준 부적.
- `37374ab` 👤 이름 설정 모달 + HP 바 빨강.
- `8ed55e8` 👤 장비 호버/탭 툴팁.
- `3c8f392` 👤 메인 탭(모험/마을/캐릭터) + 5대 스탯(힘/민첩/활력/속도/행운).
- `38b30c3` 👤 능력치 별도 패널.
- `1b217ee` 👤 캐릭터 탭 내용을 '내 정보' 풀다운으로 묶기.
- `d668e0f` 👤 외형(남/여) 선택 + 캐릭터 이미지.
- `ec45820` 👤 내 정보 탭에 CharacterMini 재사용.
- `7c43495` 👤 모험가 카드 (소속·전적·명성·골드).
- `2e2f609` 👤 스킬 탭 (빈 상태 안내).
- `38374f2` 👤 EXP 바 (MP 아래) + StatBar 라벨 폭 확대.
- `79d0a8c` 👤 모험의 서 placeholder 항목.
- `6b073ca` 👤 풀다운 → sub-view 네비게이션 패턴으로 전환.

### 모험 / 지도
- `d686d43` 🗺️ 모험 탭에 간략 캐릭터 정보.
- `1ee5d1c` / `7543241` 🗺️ 모험 탭 카드 다듬기.
- `747c7e2` / `5e4c1e8` / `4389d2c` 🗺️ 캐릭터 이미지 자리 / 패딩 조정.
- `c298039` 🗺️ 전투·지도 진입 카드 추가, placeholder 제거.
- `bf3af89` 🗺️ SVG 월드맵 v1 — 노드 6개 / 엣지 7개 + 클릭 이동 + localStorage 진행 저장.
- `d1b003f` 🗺️ 노드에 biome 색 + 도달 가능 노드에 amber 펄스.
- `f0b9615` 🗺️ 우상단 위치 표시를 currentRegion.name과 동기화.
- `dbc958b` 🗺️ 캐릭터 정보 밑에 현재 지역 맵 이미지.
- `8d169b6` 🗺️ 지역 이미지를 전체 화면 배경으로 적용.

### 전투
- `78638a8` ⚔️ 마을에서도 적 목록 + 몬스터 스탯 데이터.
- `595563e` ⚔️ 평야 적 개편 + 칩 스타일.
- `12da3dd` ⚔️ 자동 전투 v1 — 턴제 자동 진행 + 자동 토글 + 영속화.
- `987715b` ⚔️ 평야 외 EXP 0 처리 + MonsterTag.
- `d1f5612` ⚔️ 평야 4종 EXP 하향 (1~3).
- `4f74441` ⚔️ 광맥 골렘 / 수룡 / 고대 망령 / 타락한 기사 4종 삭제.
- `2797472` ⚔️ 적 카드 세로 레이아웃 + 아바타 96px.
- `ece328e` ⚔️ 적 목록에 이미지.
- `d24693a` ⚔️ 몬스터 처치 시 골드 드롭 제거.

### 마을 / 시설
- `d8bc2aa` / `9d246ae` 🏘️ 훈련장 — 3시간 훈련 → 단련 포인트 → 스탯 분배.
- `9941c1f` 🏘️ 훈련 시간 3 → 4시간.
- `aa411fb` 🏘️ 모험가 길드 진입 카드 + placeholder 서브뷰.
- `e458f2a` 🏘️ 치유소 카드 + 회복 서브뷰.

### NPC / 세계관
- `4525e70` 📦 디올라 마을 추가 + 마을 region에 town 태그.
- `e6693f1` 📦 마을에 적정 레벨 + 시작 마을에 주정뱅이 추가.
- (디올라 NPC v1 코드는 `ece328e` 등에 묶여 푸시됨.)

### 알림 / 로그
- `0f06a49` 🔔 우상단 알림 종 + 토스트 + 캐릭터 탭 '최근 기록' 서브뷰.
- `98be20f` 👤 헤더 우상단에 보유 골드 인라인 표시.

### UI · 디자인
- `5b7798b` 🎨 메인 화면 텍스트 한 단계 키움.
- `e73d8f9` / `01d65e9` / `2353ed1` 🎨 폰트 실험 (Comfortaa + Gowun Dodum).
- `4812305` 🎨 폰트를 Geist + Geist Mono로 복귀.
- `177f48d` / `e56c9d5` / `299858f` 🎨 탭 스타일 다듬기.
- `e8f892c` 🎨 상단 탭 폰트 확대 (text-sm → text-base, font-semibold).
- `4a61a60` 🎨 게임 내 이모지 → Phosphor 아이콘 일괄 교체.
- `b91d41e` 🎨 진입 카드/장비 아이콘에 테마 색상 적용.
- `dc16a19` 🎨 카드 배경 /40 → /90 (배경 이미지 위 가독성).
- `95b8571` 🎨 헤더·탭바도 /90 처리.
- `e867c6c` / `ce44671` 🎨 탭바 풀폭 배경 시도 후 초기 형태로 revert.

### 문서
- `6609f8c` 📝 battle-plan에 자동 반복 토글 / 0.5초 턴 간격 명세 보강.
