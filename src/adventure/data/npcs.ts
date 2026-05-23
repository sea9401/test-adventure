import type { RegionId } from "./world";

export type NpcId =
  | "village_trainer_smith"
  | "village_blacksmith_bold"
  | "village_suzy"
  | "village_woodcutter_jimmy"
  // 5막 「빈 옥좌의 시대」, 별바다 노수호자 유성이 시작 마을로 직접 걸어왔다 (Ch 26 ~).
  | "village_pilgrim_meteor"
  | "diola_elder"
  | "diola_fisher"
  | "diola_innkeeper"
  | "diola_merchant"
  | "diola_kid"
  | "diola_stranger"
  | "unhyang_elder"
  | "unhyang_smith"
  | "unhyang_guide"
  | "unhyang_herbalist"
  | "unhyang_pilgrim"
  | "windvale_keeper"
  | "windvale_merchant"
  | "windvale_pathfinder"
  | "windvale_bard"
  | "skyreach_elder"
  | "skyreach_guide"
  | "skyreach_alchemist"
  | "skyreach_acolyte"
  | "skyreach_gatekeeper"
  // 별바다, 천공 라인 endgame 정거장.
  | "star_haven_elder"
  // 소만, 해안 지선의 작은 포구.
  | "saltmarsh_elder"
  | "saltmarsh_ferryman"
  | "saltmarsh_salter"
  | "saltmarsh_innkeeper"
  | "saltmarsh_kid"
  // 마른나루, 서편 옛길의 작은 역참 마을.
  | "dustford_keeper"
  | "dustford_scavenger"
  | "dustford_innkeeper"
  | "dustford_hunter"
  | "dustford_kid";

export type NpcRole =
  | "elder"
  | "vendor"
  | "innkeeper"
  | "quest"
  | "lore"
  | "stranger"
  | "trainer";

export type Npc = {
  id: NpcId;
  region: RegionId;
  name: string;
  role: NpcRole;
  description: string;
  greeting: string;
  portrait?: string;
};

export const NPCS: Npc[] = [
  {
    id: "village_trainer_smith",
    region: "village",
    name: "훈련 교관 스미스",
    role: "trainer",
    description:
      "마을 한구석 훈련장을 지키는 전직 모험가. 어깨가 두툼하고 손마디가 굵다.",
    greeting:
      "왔구나, 새내기.\n자세부터 잡아주마. 모험은 한 번 휘두르는 검보다, 백 번 흘리는 땀이다.",
    portrait: "/images/npc/smith.webp",
  },
  {
    id: "village_blacksmith_bold",
    region: "village",
    name: "대장장이 볼드",
    role: "vendor",
    description:
      "반들반들한 대머리에 가죽 앞치마를 두른 사내. 망치질 한 번에 모루가 통째로 운다.",
    greeting:
      "어, 왔나.\n무기든 갑옷이든 가져와 봐. 쓸 만한 거면 손봐주고, 못 쓸 거면 그 자리에서 녹여주지.",
    portrait: "/images/npc/bold.webp",
  },
  {
    id: "village_suzy",
    region: "village",
    name: "수지",
    role: "lore",
    description:
      "마을 어귀에서 자주 서성이는 젊은 아낙. 손에는 늘 뜨다 만 뜨개질감이 들려 있다.",
    greeting:
      "아, 모험가 분이세요?\n혹시 디올라 쪽에서 오시는 길은 아니죠? …우리 그이가 거기 호숫가에서 일한다고 갔는데, 벌써 한 달째 편지 한 통이 없네요.",
    portrait: "/images/npc/suzy.webp",
  },
  {
    id: "village_woodcutter_jimmy",
    region: "village",
    name: "나무꾼 지미",
    role: "lore",
    description:
      "마을 뒤편 숲을 오가며 장작을 패는 사내. 어깨에는 늘 도끼가 걸려 있고, 옷자락에 톱밥이 묻어 있다.",
    greeting:
      "어이, 모험가 양반.\n오늘도 숲에서 나무 좀 패다 왔지. 별일 없는 게 제일이야, 안 그래?",
    portrait: "/images/npc/jimmy.webp",
  },
  // 5막, 별바다에서 시작 마을까지 직접 걸어온 노수호자. star_haven_elder 와 동일 인물,
  // 다른 인스턴스(NPC 시스템에 flag-gated 등장이 없어 dialogue 가 endgame_apex_defeated
  // 미보유 시 짧은 인사로 가드). portrait 공유.
  {
    id: "village_pilgrim_meteor",
    region: "village",
    name: "노수호자 유성",
    role: "quest",
    description:
      "별바다에서 여기까지 걸어 내려온 노인. 가슴팍에 별빛 한 점을 작은 그릇에 담아 두었다. 우물가에 앉아 자네를 기다린다.",
    greeting:
      "…먼 길이었지. 별바다에서 시작 마을까지. 자네를 만나기 위해 천천히 걸어왔네.",
    portrait: "/images/npc/yousung.webp",
  },
  {
    id: "diola_elder",
    region: "diola",
    name: "촌장 마린",
    role: "elder",
    description: "바닷바람에 그을린 노인. 호수가 달라지는 낌새를 누구보다 빨리 알아챈다.",
    greeting:
      "…어서 와요, 모험가.\n안개가 짙은 날엔 길을 잘 살펴야 해. 이 호수도 늘 같은 자리에 있는 건 아니거든.",
    portrait: "/images/npc/marin.webp",
  },
  {
    id: "diola_fisher",
    region: "diola",
    name: "어부 카이",
    role: "lore",
    description: "매일 새벽 호수에 나가는 청년. 말수가 적다.",
    greeting:
      "…뭐.\n물고기가 줄었어. 그것뿐이야. 호수에 뭔가 있어.",
    portrait: "/images/npc/kai.webp",
  },
  {
    id: "diola_innkeeper",
    region: "diola",
    name: "여관 주인 노라",
    role: "innkeeper",
    description: "안개 여관의 주인. 따뜻한 미소가 인상적.",
    greeting:
      "피곤해 보이네요. 들어와요.\n방은 비어 있어요. 침대 시트는 갓 갈아둔 거랍니다.",
    portrait: "/images/npc/nora.webp",
  },
  {
    id: "diola_merchant",
    region: "diola",
    name: "잡화상 보로",
    role: "vendor",
    description: "어딘지 음흉한 미소의 잡화상.",
    greeting:
      "어이~ 좋은 거 들여놨는데, 한번 봐요.\n호수에서만 잡히는 미끼도 있다구요?",
    portrait: "/images/npc/boro.webp",
  },
  {
    id: "diola_kid",
    region: "diola",
    name: "꼬마 리오",
    role: "lore",
    description: "또래 친구가 없는지, 모험가에게 들러붙는다.",
    greeting:
      "아저씨! 아니, 누나? 어쨌든!\n어젯밤에 호수에서 등불이 떠다니는 걸 봤어요. 진짜로!",
    portrait: "/images/npc/rio.webp",
  },
  {
    id: "diola_stranger",
    region: "diola",
    name: "후드를 쓴 손님",
    role: "stranger",
    description: "여관 구석 자리에 앉아 있는 정체 모를 사람.",
    greeting:
      "…아직 너에게 들려줄 이야기는 없어.\n호수 너머를 봤을 때, 다시 와.",
    portrait: "/images/npc/hoodguy.webp",
  },
  // ── 운향 ────────────────────────────────────────────────────────────────
  {
    id: "unhyang_elder",
    region: "unhyang",
    name: "노촌장 백운",
    role: "elder",
    description:
      "구름 위 도시를 지켜온 노인. 거인의 위협을 가장 먼저 감지했다.",
    greeting:
      "…먼 길을 올라왔구먼.\n이 산정에는 옛부터 잠들지 않는 것이 살고 있다네. 그 이야기는 차차 들려주지.",
    portrait: "/images/npc/bakwoon.webp",
  },
  {
    id: "unhyang_smith",
    region: "unhyang",
    name: "대장장이 만월",
    role: "vendor",
    description:
      "운봉석을 다루는 솜씨가 일품인 늙은 장인. 운봉 무기 제작 안내.",
    greeting:
      "어이, 모험가.\n운봉석은 제대로 다룰 줄 아는 손이 드물어. 거인의 뼛조각을 가져오면 무엇이든 만들어 주지. 아직은 좀 더 두고 봐야겠지만.",
    portrait: "/images/npc/manwar.webp",
  },
  {
    id: "unhyang_guide",
    region: "unhyang",
    name: "산악 가이드 도연",
    role: "quest",
    description:
      "협곡과 그 너머를 누벼본 젊은 안내인. 무리장 사냥 의뢰.",
    greeting:
      "산을 잘 안다니까 자주 묻는데, 협곡은 아직도 위험해.\n특히 무리장 늑대들. 떼를 이끌고 다니지. 솜씨가 있다면 도와줄 일이 있어.",
    portrait: "/images/npc/doyeon.webp",
  },
  {
    id: "unhyang_herbalist",
    region: "unhyang",
    name: "약초꾼 산하",
    role: "lore",
    description:
      "산에서만 나는 약초를 찾아다닌다. 회복약·재료 거래.",
    greeting:
      "오, 새 얼굴이네요.\n산기슭 산초꽃이나 거인 비늘 같은 거, 모아오시면 제가 잘 써먹을 수 있어요.",
    portrait: "/images/npc/sanha.webp",
  },
  {
    id: "unhyang_pilgrim",
    region: "unhyang",
    name: "순례자 미상",
    role: "stranger",
    description:
      "북쪽 더 깊은 곳에서 왔다고 한다. 말을 아낀다.",
    greeting:
      "…북쪽에서 왔다.\n그 너머는 아직 네가 알 시간이 아니야.",
    portrait: "/images/npc/pilgrim.webp",
  },
  // ── 바람골 역참 ──────────────────────────────────────────────────────────
  {
    id: "windvale_keeper",
    region: "windvale",
    name: "역참지기 마로",
    role: "elder",
    description:
      "바람골 역참을 도맡아 꾸리는 노인. 오가는 대상들의 사정을 훤히 꿴다.",
    greeting:
      "어서 오시오, 모험가.\n역참 울타리를 들이받는 들소 떼만 아니면 여긴 조용한 곳이오. …그 들소가 문제지만.",
    portrait: "/images/npc/maro.webp",
  },
  {
    id: "windvale_merchant",
    region: "windvale",
    name: "대상 상인 노을",
    role: "vendor",
    description:
      "산정과 화염 능선을 오가며 장사하는 대상의 우두머리. 길 위 소문이라면 모르는 게 없다.",
    greeting:
      "오, 마침 사람 손이 필요했는데.\n초원 매가 짐을 자꾸 노려서 깃털이 모이질 않아. 도와주면 길에서 주운 좋은 걸 나눠 드리지.",
    portrait: "/images/npc/noeul.webp",
  },
  {
    id: "windvale_pathfinder",
    region: "windvale",
    name: "길잡이 한솔",
    role: "quest",
    description:
      "잿빛 협로 너머 봉황령까지 길을 내본 안내인. 늘 잿가루가 묻은 외투를 걸친다.",
    greeting:
      "봉황령으로 가려고? 길은 잿빛 협로를 지나야 해.\n근데 재먼지 골렘이 길목을 막고 있어서… 그것부터 좀 치워 줘야 길을 알려줄 수 있겠는데.",
  },
  {
    id: "windvale_bard",
    region: "windvale",
    name: "떠돌이 음유시인",
    role: "lore",
    description:
      "대상 일행 사이를 떠도는 가수. 산정·화염 능선·천공 성지의 소문을 노래로 흘린다.",
    greeting:
      "여어, 길손.\n산정엔 잠들지 않는 거인이, 화염 능선엔 깃을 떨구는 새가, 구름 위엔 봉인이 셋이라네. 다 노래로 들었지. 노래는 늘 진실보다 한 발 앞서가거든.\n…유실품을 모으는 자의 옛 노래도 있어. 두 점을 모은 자에게 행운이 따라붙는다는. 자네, 그런 거 가진 거 없나?",
    portrait: "/images/npc/windavalebard.webp",
  },
  // ── 천공 성지 ────────────────────────────────────────────────────────────
  {
    id: "skyreach_elder",
    region: "skyreach",
    name: "원로 해무",
    role: "elder",
    description:
      "천공 성지를 수백 년 지켜온 노인. 화산의 위협을 누구보다 잘 알았다.",
    greeting:
      "…드디어 왔구려. 화산의 심장이 잠든 걸 느꼈소.\n그놈이 깨어 있는 동안엔 이 성지도 닫혀 있었지. 잘 와줬소.",
    portrait: "/images/npc/haemoo.webp",
  },
  {
    id: "skyreach_guide",
    region: "skyreach",
    name: "정찰대원 검",
    role: "quest",
    description:
      "화산 지대를 정기적으로 순찰하는 성지의 정찰대원. 대담하고 말이 빠르다.",
    greeting:
      "왔구나! 봉황령 쪽은 어떻던가?\n산악 기사들이 지난주보다 더 늘었어. 솜씨가 있다면 도움을 청할 수 있겠는데.",
    portrait: "/images/npc/gum.webp",
  },
  {
    id: "skyreach_alchemist",
    region: "skyreach",
    name: "연금술사 시온",
    role: "quest",
    description:
      "화산 지대의 재료를 연구하는 성지 연금술사. 실험 가운이 그을려 있다.",
    greeting:
      "오, 마침 잘 왔어.\n용암 핵이 필요한데, 화산 두꺼비나 불꽃 골렘을 잡으면 가끔 나오거든. 여분이 있으면 거래할 수 있어.",
    portrait: "/images/npc/sion.webp",
  },
  {
    id: "skyreach_acolyte",
    region: "skyreach",
    name: "사미승 운하",
    role: "lore",
    description:
      "성지 첨탑을 오르내리며 종을 치는 어린 수행자. 구름층 위를 자주 올려다본다.",
    greeting:
      "…쉿. 종소리 끝나기 전엔 말하면 안 돼요.\n…됐다. 저기 첨탑 너머, 구름이 한 겹 더 있는 거 보여요? 해무 어른은 거기 얘기를 안 해요. 북쪽에서 온 순례자도요. 다들 뭔가 알면서 숨기는 것 같아요. …모험가님은 알게 될 것 같아요. 왠지.",
    portrait: "/images/npc/unha.webp",
  },
  {
    id: "skyreach_gatekeeper",
    region: "skyreach",
    name: "문지기 청람",
    role: "quest",
    description:
      "화염 능선에서 성지로 드는 마지막 문을 지키는 정찰대원. 말수가 적다.",
    greeting:
      "…통과.\n화산 지대 쪽은 아직 시끄러워. 두꺼비도, 슬라임도. 검이 순찰 의뢰를 게시판에 걸어 뒀으니, 손 빌릴 생각 있으면 거기 봐.\n…그리고 한밤중 첨탑엔 올라가지 마. 종 치는 애가 무서워하니까.",
    portrait: "/images/npc/chungram.webp",
  },
  // ── 별바다 (천공 라인 endgame 정거장) ─────────────────────────────────────
  {
    id: "star_haven_elder",
    region: "star_haven",
    name: "노수호자 유성",
    role: "quest",
    description:
      "별바다에 마지막으로 남은 옛 천공인의 후예. 회랑부터 옥좌의 길까지 오래된 길을 외우고, 첨탑 위 별빛을 매일 지킨다.",
    greeting:
      "…별바다에 사람의 발소리가 닿은 게 얼마만인지.\n자네를 보니 별의 첨탑은 지났고, 폐도의 문 앞까지도 닿았겠지. 그렇다면 회랑에 흩어진 별빛부터 거두어 주게. 옛 회랑과 옥좌의 길을 다시 잇는 데 마지막 손길이 필요하네.",
    portrait: "/images/npc/yousung.webp",
  },
  // ── 소만 (해안 지선) ─────────────────────────────────────────────────────
  {
    id: "saltmarsh_elder",
    region: "saltmarsh",
    name: "원로 여울",
    role: "elder",
    portrait: "/images/npc/yeowool.webp",
    description:
      "소만 포구를 가장 오래 지켜본 노인. 갯바람에 그을린 얼굴로 늘 난바다 쪽을 본다.",
    greeting:
      "낯선 발소리군. 디올라 쪽에서 갯벌을 건너왔나.\n…요즘 우리 포구가 영 시원찮네. 그물이 비어 오고, 한낮에도 물이 차. 노인들은 암초 너머 안개 밑에 잠든 게 다시 뒤척인다고들 해.\n소만이 자네를 알게 되거든, 그때 이야기를 더 하지. 우선 갈매와 보말부터 도와주게.",
  },
  {
    id: "saltmarsh_ferryman",
    region: "saltmarsh",
    name: "뱃사공 해랑",
    role: "quest",
    portrait: "/images/npc/haerang.webp",
    description:
      "소만에서 난바다로 나가는 단 한 척의 배를 부리는 사공. 손마디가 노에 닳아 굵다.",
    greeting:
      "난바다로? …아무나 못 데려가. 암초가 배 밑을 갉아. 잘못 들어가면 둘 다 산호밥이야.\n원로 여울이 자네를 보증하면 그땐 생각해 보지. 먼저 그쪽에 가 봐.",
  },
  {
    id: "saltmarsh_salter",
    region: "saltmarsh",
    name: "소금장수 갈매",
    role: "vendor",
    portrait: "/images/npc/galmae.webp",
    description:
      "소만 소금밭과 젓갈 창고를 도맡은 장수. 손에 늘 굵은소금이 묻어 있다.",
    greeting:
      "어, 손님인가. 아니, 일손인가? 마침 잘 왔어.\n갯벌에 집게발 게가 너무 불었어. 등딱지가 좋아서 통발이며 방패며 두루 쓰는데, 게들이 통발째 끌고 가 버려서 원. 좀 솎아 주면 사례하지. 게딱지 다루는 법도 알려줄게.",
  },
  {
    id: "saltmarsh_innkeeper",
    region: "saltmarsh",
    name: "여각 주인 보말",
    role: "innkeeper",
    portrait: "/images/npc/bomal.webp",
    description:
      "소만 여각을 꾸리는 주인. 게장과 미역국으로 대상 길손들 배를 채운다.",
    greeting:
      "어서 와요, 길손. 갯벌 건너오느라 발이 무거웠겠네.\n…요즘 손님상에 올릴 게 마땅찮아서요. 게딱지라도 좀 들여와 주면 게장이라도 담그지. 사례는 섭섭잖게 할게요.",
  },
  {
    id: "saltmarsh_kid",
    region: "saltmarsh",
    name: "갯마을 아이 미르",
    role: "lore",
    portrait: "/images/npc/mirr.webp",
    description:
      "썰물 때마다 갯벌에서 노는 소만 아이. 늘 조개껍데기를 한 줌씩 들고 다닌다.",
    greeting:
      "쉿. …지금은 물이 안 출렁여요. 가끔 한낮에도 갯벌이 출렁출렁해요. 바다 밑에 엄청 큰 게 숨 쉬는 것처럼.\n해랑 아저씨는 거짓말 말랬는데, 진짜예요. 어른들도 다 알면서 말 안 하는 거예요.",
  },
  // ── 마른나루 (서편 옛길) ─────────────────────────────────────────────────
  {
    id: "dustford_keeper",
    region: "dustford",
    name: "옛 수비대장 무진",
    role: "elder",
    portrait: "/images/npc/mujin.webp",
    description:
      "한 세대 전 옛 변경 성채를 지키던 수비대의 마지막 대장. 다리를 절지만 등은 여전히 꼿꼿하다.",
    greeting:
      "낯선 발소리군. 시작 마을 서문 쪽에서 옛길을 따라 왔나.\n…이 마른나루는 거의 비었어. 교역로가 비껴간 뒤로. 그래도 우물과 밭을 붙들고 사는 집들이 있지. 우린 떠나지 않아.\n마른나루가 자네를 받아들이거든, 그땐 옛 성채 이야기를 하지. 우선 두루와 나래부터 도와주게.",
  },
  {
    id: "dustford_scavenger",
    region: "dustford",
    name: "고물장수 두루",
    role: "vendor",
    portrait: "/images/npc/duru.webp",
    description:
      "옛길과 성채에서 거둔 고물을 손질해 파는 장수. 손에 늘 녹가루와 깃털이 묻어 있다.",
    greeting:
      "어, 손님인가. 아니, 일손인가? 마침 잘 왔어.\n옛길에 들고양이가 너무 불었어. 가죽이며 송곳니가 쓸 만한데, 그놈들이 통발을 죄다 헤집어 놔서 원. 좀 솎아 주면 사례하지. 노상강도 단검 손질하는 법도 알려줄게.",
  },
  {
    id: "dustford_innkeeper",
    region: "dustford",
    name: "역참 주인 나래",
    role: "innkeeper",
    portrait: "/images/npc/narae.webp",
    description:
      "마른나루 옛 역참을 지키는 주인. 마른 억새와 들밀로 끓인 죽으로 드문 길손들 배를 채운다.",
    greeting:
      "어서 와요, 길손. 옛길 걸어오느라 발이 무거웠겠네.\n…요즘 손님 베개 속 채울 깃이 영 모자라서요. 까마귀 깃이라도 좀 들여와 주면 잠자리가 한결 나을 텐데. 사례는 섭섭잖게 할게요.",
  },
  {
    id: "dustford_hunter",
    region: "dustford",
    name: "들사냥꾼 솔개",
    role: "quest",
    portrait: "/images/npc/solgae.webp",
    description:
      "옛길의 들짐승을 쫓아 사는 사냥꾼. 어깨에 늘 들매를 한 마리 앉히고 다닌다.",
    greeting:
      "왔구먼. 옛길에서 왔나.\n갈대 살쾡이가 요즘 떼를 키워. 둥지를 헤집고 다녀서 밭 가는 사람들이 못 살아. 좀 정리해 주면 사례하지. 까마귀깃 두건 짓는 법도 알려줄게.",
  },
  {
    id: "dustford_kid",
    region: "dustford",
    name: "역참 아이 보리",
    role: "lore",
    portrait: "/images/npc/vory.webp",
    description:
      "마른 억새밭에서 노는 마른나루 아이. 늘 까마귀 깃을 한 줌씩 모아 다닌다.",
    greeting:
      "쉿. …지금은 조용해요. 밤마다 옛길 끝에서 쿵, 쿵 소리가 나요. 성문이 혼자 닫혔다 열렸다 하는 것처럼.\n무진 할아버지는 무서운 거 아니랬는데, 진짜 무서워요. 어른들도 다 알면서 안 가는 거예요.",
  },
];

export function getNpcsByRegion(regionId: RegionId): Npc[] {
  return NPCS.filter((n) => n.region === regionId);
}
