import {
  GUILD_CREATE_MIN_LEVEL,
  GUILD_CREATE_GOLD_COST,
  GUILD_LEAVE_COOLDOWN_DAYS,
  GUILD_BASE_MEMBER_CAP,
  GUILD_LEVEL_UPGRADE_COSTS,
  GUILD_MAX_LEVEL,
} from "@/adventure/data/guild";
import {
  GUILD_COMBAT_SUPPLY_DEFS,
  GUILD_COMBAT_SUPPLY_IDS,
  GUILD_COMBAT_SUPPLY_MAX_LEVEL,
  guildCombatSupplyNextCost,
} from "@/adventure/data/v2/guildCombatSupply";
import {
  GUILD_EXPLORATION_WEEKLY_MISSION_IDS,
  GUILD_EXPLORATION_WEEKLY_MISSIONS,
} from "@/adventure/data/v2/guildExploration";
import {
  ALCHEMY_WORKSHOP_UPGRADES,
  DINING_HALL_UPGRADES,
  EXPLORATION_HQ_UPGRADES,
  GUILD_SMITHY_UPGRADES,
  TRADE_POST_UPGRADES,
  TRAINING_GROUND_UPGRADES,
  explorationHqUpgradeForLevel,
  settlementBuildingUpgradeCostText,
} from "@/adventure/data/v2/settlement";
import { GUILD_ALCHEMY_RECIPES } from "@/adventure/data/v2/guildAlchemy";
import {
  GUILD_DINING_INGREDIENTS,
  GUILD_DINING_MENUS,
  GUILD_DINING_POINTS_PER_TICKET,
} from "@/adventure/data/v2/guildDining";
import {
  GUILD_TRADE_BASE_REWARD_FAME,
  GUILD_TRADE_BASE_REWARD_GOLD,
  GUILD_TRADE_BASE_TARGET,
  GUILD_TRADE_SHOP_ITEMS,
  GUILD_TRADE_TARGET_PER_EXTRA_MEMBER,
} from "@/adventure/data/v2/guildTrade";
import {
  FISHING_CATCH_ITEM_CHANCE_PCT,
  FISHING_CATCH_ITEM_DAILY_CAP,
  FISHING_CATCH_ITEM_LIST,
} from "@/adventure/v2/fishingStock";
import {
  GUILD_TRAINING_DRILLS,
  GUILD_TRAINING_DRILL_IDS,
  GUILD_TRAINING_WEEKLY_BONUS_MASTERY,
  GUILD_TRAINING_WEEKLY_BONUS_TARGET,
} from "@/adventure/data/v2/guildTrainingGround";
import {
  GUILD_WORKSHOP_BONUS_TIERS,
  GUILD_WORKSHOP_DISMANTLE_MATERIAL_RECOVERY_PCT,
  GUILD_WORKSHOP_MASTERWORK_MATERIAL_COST_MULT,
  GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT,
  GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT,
  GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT,
  GUILD_WORKSHOP_RESOURCE_TOTAL_BY_TIER,
} from "@/adventure/data/v2/guildWorkshop";
import { H2, P, UL, Em, Note, Table } from "./primitives";

export function GuildContent() {
  return (
    <>
      <H2>길드란</H2>
      <P>
        길드는 거점 점령(영토 PvP)의 단위입니다. 길드에 속하면 길드가 가진 거점의
        세금 수입을 나누고, 거점 다툼(약탈·정복)에 함께합니다. 창단·가입·운영은
        모두 길드 탭에서 합니다.
      </P>

      <H2>창단 · 가입</H2>
      <UL>
        <li>
          창단 조건은{" "}
          <Em>
            레벨 {GUILD_CREATE_MIN_LEVEL} +{" "}
            {GUILD_CREATE_GOLD_COST.toLocaleString()} 골드
          </Em>
          이고, 창단하면 본인이 마스터가 됩니다. Lv.1 정원은{" "}
          <Em>{GUILD_BASE_MEMBER_CAP}명</Em>이며 길드 레벨과 국가 선포로
          늘어납니다.
        </li>
        <li>
          가입은 두 길 — 비소속이면 「둘러보기」에서 마음에 드는 길드에{" "}
          <Em>신청</Em>(마스터가 수락/거절)하거나, 마스터의 <Em>초대</Em>를
          우편함에서 받아 수락합니다.
        </li>
      </UL>

      <H2>길드 레벨</H2>
      <P>
        길드 레벨은 누적 명성에 따라 자동으로 오르지 않습니다. 마스터·관리자가
        길드 관리의 <Em>길드 연구</Em>에서 <Em>사용 가능 명성과 길드 금고 골드</Em>를
        함께 소비해 한 단계씩 올립니다. 누적 명성은 순위와 활동 기록용으로만
        남습니다. 최고 레벨은 <Em>Lv.{GUILD_MAX_LEVEL}</Em>이며, 레벨이 오를
        때마다 길드원 정원이 1명씩 늘어납니다.
      </P>
      <Table
        head={["승급", "사용 가능 명성", "길드 금고 골드"]}
        rows={GUILD_LEVEL_UPGRADE_COSTS.map((cost) => [
          `Lv.${cost.currentLevel} → Lv.${cost.nextLevel}`,
          cost.fame.toLocaleString("ko-KR"),
          `${cost.gold.toLocaleString("ko-KR")} G`,
        ])}
        caption="승급을 확정하면 명성과 골드가 즉시 차감되며, 길드 레벨은 내려가지 않습니다."
      />

      <H2>길드 운영</H2>
      <P>
        길드 탭에서 정보(마스터·인원·명성·소개), 길드원 목록과 조직도(마스터→
        관리자→일반), 보유 거점을 봅니다. 마스터·관리자는 <Em>관리</Em>{" "}
        탭에서 멤버 초대, 가입 신청 처리, 거점 정책·세율, 직책 임명을 다룹니다.
      </P>

      <H2>길드 금고</H2>
      <P>
        길드 금고는 점령 거점에서 모인 <Em>세금 수입</Em>으로 채워집니다. 외부인이
        점령 거점에서 사냥하면 세금이 쌓이고, 길드원이 회수하면 일부는 회수자에게,
        나머지가 금고로 들어갑니다. 자세한 건 <Em>거점과 영토</Em> 페이지를 보세요.
      </P>

      <H2>길드 시설 업그레이드</H2>
      <P>
        개방된 시설이 Lv.5 미만이면 다음 레벨의 재료 기부가 항상 열려 있습니다.
        길드원 누구나 생활에서 얻은 <Em>모든 등급의 원목·광석</Em>을 원하는
        만큼 보탤 수 있으며, 시설 단계가 오를수록 상위 원목과 광석도 함께
        요구합니다.
      </P>
      <Table
        head={["목표 레벨", "공통 생활 재료 요구량"]}
        rows={GUILD_SMITHY_UPGRADES.slice(1).map((upgrade) => [
          `Lv.${upgrade.level}`,
          settlementBuildingUpgradeCostText({
            ...upgrade.cost,
            gold: 0,
            fame: 0,
          }),
        ])}
        caption="제작소·훈련장·탐사 본부·연금 공방·길드 식당·길드 교역소가 같은 단계별 생활 재료 구성을 사용합니다. 요구량을 넘겨 기부할 수 없으며, 기부한 재료는 개인 인벤토리로 되돌릴 수 없습니다."
      />
      <Table
        head={["시설", "Lv2", "Lv3", "Lv4", "Lv5"]}
        rows={[
          ["제작소", GUILD_SMITHY_UPGRADES],
          ["훈련장", TRAINING_GROUND_UPGRADES],
          ["탐사 본부", EXPLORATION_HQ_UPGRADES],
          ["연금 공방", ALCHEMY_WORKSHOP_UPGRADES],
          ["길드 식당", DINING_HALL_UPGRADES],
          ["길드 교역소", TRADE_POST_UPGRADES],
        ].map(([name, upgrades]) => [
          <Em key={String(name)}>{String(name)}</Em>,
          ...(upgrades as typeof GUILD_SMITHY_UPGRADES).slice(1).map(
            (upgrade) =>
              `${(upgrade.cost.gold ?? 0).toLocaleString("ko-KR")}G · 명성 ${(upgrade.cost.fame ?? 0).toLocaleString("ko-KR")}`,
          ),
        ])}
        caption="재료가 모두 모이면 관리자만 업그레이드를 완료할 수 있습니다. 완료할 때 길드 금고 골드와 사용 가능한 길드 명성을 소비하고, 다음 레벨 기부가 자동으로 열립니다. Lv2는 명성을 요구하지 않습니다."
      />

      <H2>전투보급 연구</H2>
      <P>
        길드 명성은 전투보급을 올리는 데 쓸 수 있습니다. 전투보급은 길드 단위
        연구이고, 사냥 보상에 작게 누적되는 장기 보너스입니다.
      </P>
      <Table
        head={["보급", "최대 단계", "효과", "1단계 비용"]}
        rows={GUILD_COMBAT_SUPPLY_IDS.map((id) => {
          const def = GUILD_COMBAT_SUPPLY_DEFS[id];
          return [
            <Em key={id}>{def.name}</Em>,
            `${GUILD_COMBAT_SUPPLY_MAX_LEVEL}단계`,
            def.effectLabel(GUILD_COMBAT_SUPPLY_MAX_LEVEL),
            `${guildCombatSupplyNextCost(0)?.toLocaleString("ko-KR")} 명성`,
          ];
        })}
        caption="단계가 오를수록 다음 연구 비용이 증가합니다. 골드 보급과 EXP 보급은 사냥 보상을 올리고, 숙달 보급은 사냥 승리 시 추가 숙달 포인트를 확률로 줍니다."
      />

      <H2>길드 훈련장</H2>
      <P>
        길드 영지에 훈련장이 있으면 매일 직업 숙련도를 보강할 수 있습니다. 훈련은
        현재 직업 기준으로 적용되고, 공용 훈련과 직군별 특화 훈련이 나뉩니다.
      </P>
      <UL>
        <li>
          건물 레벨과 캐릭터 레벨에 따라 훈련이 잠기거나 열립니다. 완료한 훈련은
          KST 일자 기준으로 다음 날 다시 초기화됩니다.
        </li>
        <li>
          주간 훈련 {GUILD_TRAINING_WEEKLY_BONUS_TARGET}회를 채우면 추가로{" "}
          <Em>숙련도 {GUILD_TRAINING_WEEKLY_BONUS_MASTERY}</Em> 보너스를 받을 수
          있습니다.
        </li>
      </UL>
      <Table
        head={["훈련", "분류", "해금", "기본 숙련도"]}
        rows={GUILD_TRAINING_DRILL_IDS.map((id) => {
          const drill = GUILD_TRAINING_DRILLS[id];
          return [
            <Em key={id}>{drill.title}</Em>,
            drill.focus === "common" ? "공용" : "직군 특화",
            `훈련장 Lv.${drill.minBuildingLevel} / 캐릭터 Lv.${drill.minCharacterLevel}`,
            `+${drill.baseMasteryReward}`,
          ];
        })}
        caption="실제 지급량은 훈련장 업그레이드 보너스가 더해진 뒤 계산됩니다."
      />

      <H2>탐사 본부</H2>
      <P>
        탐사 본부는 길드 단위 주간 탐사 의뢰를 관리하는 시설입니다. 시설 레벨이
        오르면 한 주에 진행할 수 있는 탐사 수와 의뢰 진척 보너스가 늘어납니다.
        기본 협동보스 목표는 단순 처치가 아니라{" "}
        <Em>
          {GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_coop_epic_30.title}
        </Em>
        로 계산하고, 이후 사냥·낚시·벌목·농장 수확·고난도 사냥 의뢰가 추가로
        열립니다. 완료 시 길드 금고 골드와 탐사 지도 조각을 보상으로 받습니다.
      </P>
      <Table
        head={["레벨", "단계", "주간 탐사", "진척 보너스"]}
        rows={[1, 2, 3, 4, 5].map((level) => {
          const upgrade = explorationHqUpgradeForLevel(level);
          return [
            `Lv.${upgrade.level}`,
            <Em key={upgrade.level}>{upgrade.label}</Em>,
            `${upgrade.weeklyMissionCount}건`,
            `+${upgrade.missionProgressBonusPct}%`,
          ];
        })}
        caption={`진척 보너스는 의뢰 진행도에 적용됩니다. 예를 들어 +35%라면 협동보스 EPIC 이상 기여 1회가 1.35회분으로 계산됩니다.`}
      />
      <Table
        head={["주간 의뢰", "목표", "보상"]}
        rows={GUILD_EXPLORATION_WEEKLY_MISSION_IDS.map((id) => {
          const mission = GUILD_EXPLORATION_WEEKLY_MISSIONS[id];
          return [
            <Em key={id}>{mission.title}</Em>,
            `${mission.goal.toLocaleString("ko-KR")}회분`,
            `길드 금고 ${mission.rewardGold.toLocaleString()}G · 지도 조각 +${mission.rewardMapFragments.toLocaleString()}`,
          ];
        })}
        caption="협동보스 의뢰는 보상 수령 시점에 최초 1회만 집계되며, GOLD 이하는 탐사 진척으로 인정하지 않습니다."
      />

      <H2>연금 공방</H2>
      <P>
        연금 공방은 개인 농장에서 수확한 <Em>허브·은빛잎</Em>을 HP 또는 MP
        충전량으로 조제하는 길드 시설입니다. 결과는 즉시 개인 충전약에 더해지며
        거래할 수 없습니다. 연성력은 계정 단위로 매주 월요일 00:00 KST에
        초기화되고, 길드를 옮겨도 같은 주의 사용량은 유지됩니다.
      </P>
      <Table
        head={["레시피", "시설", "재료", "연성력", "충전량"]}
        rows={GUILD_ALCHEMY_RECIPES.map((recipe) => [
          <Em key={recipe.id}>{recipe.name}</Em>,
          `Lv.${recipe.minFacilityLevel}`,
          `허브 ${recipe.ingredients.herb}${recipe.ingredients.silverleaf > 0 ? ` · 은빛잎 ${recipe.ingredients.silverleaf}` : ""}`,
          recipe.energyCost.toLocaleString("ko-KR"),
          `+${recipe.chargeAmount.toLocaleString("ko-KR")}`,
        ])}
        caption="조제할 때 HP·MP·반반 충전 중 하나를 선택합니다. HP와 MP 충전량은 각각 최대 10,000,000을 넘을 수 없습니다."
      />

      <H2>길드 식당</H2>
      <P>
        길드 식당은 농장과 낚시에서 얻은 식재료를 길드원이 함께 준비하고 주간
        식권으로 식사하는 시설입니다. 낚은 어종과 크기는 어보·기록에 남고,
        식재료 보관함에는 물고기 등급에 맞는 어획물 한 종류가 자동으로 쌓입니다.
        성공한 낚시마다 서버에서 <Em>{FISHING_CATCH_ITEM_CHANCE_PCT}%</Em>
        확률을 판정하며, 어획물은 현재 공동 식재료 기부에만 사용합니다.
      </P>
      <UL>
        <li>
          식재료 <Em>{GUILD_DINING_POINTS_PER_TICKET}점</Em>을 기부할 때마다
          식권 1장을 받습니다. 개인 기여와 공동 준비는 시설 레벨별 주간 한도를
          넘길 수 없습니다.
        </li>
        <li>
          관리자는 식재료 기부가 시작되기 전에 이번 주 메뉴를 정합니다. Lv.3부터
          메뉴 두 종류를 함께 운영할 수 있습니다.
        </li>
        <li>
          식권·기여도·메뉴는 월요일 00:00 KST에 초기화됩니다. 길드를 옮겨도
          같은 주에 이미 사용한 식권과 적용 중인 음식 효과는 유지됩니다.
        </li>
      </UL>
      <Table
        head={["낚시 식재료", "기부 단위", "공동 준비", "일일 획득"]}
        rows={FISHING_CATCH_ITEM_LIST.map((item) => {
          const ingredient = GUILD_DINING_INGREDIENTS.find(
            (entry) =>
              entry.source === "fishing_item" && entry.sourceItemId === item.id,
          );
          return [
            <Em key={item.id}>{item.name}</Em>,
            `${ingredient?.batchSize ?? 1}개`,
            `${ingredient?.pointValue ?? 0}점`,
            `${FISHING_CATCH_ITEM_DAILY_CAP[item.id]}개`,
          ];
        })}
        caption="낮은 등급이 획득량을 먼저 채우지 않도록 일일 한도는 등급별로 독립 적용됩니다. 어종별 물고기 아이템이나 개인 요리 재료로는 아직 분리하지 않습니다."
      />
      <Table
        head={["메뉴", "시설", "효과"]}
        rows={GUILD_DINING_MENUS.map((menu) => [
          <Em key={menu.id}>{menu.name}</Em>,
          `Lv.${menu.minFacilityLevel}`,
          menu.description,
        ])}
        caption="모험가 정식과 일꾼 도시락은 식권 1장당 12시간 적용됩니다. 같은 메뉴는 남은 시간에 12시간을 더하고, 다른 효과식은 기존 효과와 남은 시간을 교체합니다. 효과식은 한 번에 하나만 적용되며 월요일 00:00 KST에 초기화됩니다."
      />

      <H2>길드 교역소</H2>
      <P>
        길드 교역소는 벌목·채광·농장·낚시에서 모은 생활 재료를 주간 계약에
        함께 납품하는 시설입니다. 개인은 납품 점수만큼 <Em>교역 토큰</Em>을
        받고, 공동 목표를 채우면 길드 금고 골드와 명성을 획득합니다.
      </P>
      <UL>
        <li>
          계약 하나의 기본 목표는 <Em>{GUILD_TRADE_BASE_TARGET}점</Em>이며,
          주간 계약 시작 시점의 길드원 1명 초과마다 {GUILD_TRADE_TARGET_PER_EXTRA_MEMBER}점씩
          늘어납니다. 참여 대상도 이 시점에 함께 확정됩니다.
        </li>
        <li>
          시설 레벨이 오르면 주간 계약 수가 3건에서 5건으로 늘고, 개인 납품
          한도와 계약 완료 보너스도 증가합니다.
        </li>
        <li>
          계약·개인 납품·상점 구매 횟수는 월요일 00:00 KST에 초기화됩니다.
          남은 교역 토큰은 같은 길드에 있는 동안 다음 주에도 유지됩니다.
        </li>
      </UL>
      <Table
        head={["교환 품목", "필요 시설", "비용", "주간 한도"]}
        rows={GUILD_TRADE_SHOP_ITEMS.map((item) => [
          <Em key={item.id}>{item.name}</Em>,
          `Lv.${item.minFacilityLevel}`,
          `${item.tokenCost} 토큰`,
          `${item.weeklyLimit}회`,
        ])}
        caption={`계약 기본 완료 보상은 길드 금고 ${GUILD_TRADE_BASE_REWARD_GOLD.toLocaleString("ko-KR")}G와 명성 ${GUILD_TRADE_BASE_REWARD_FAME.toLocaleString("ko-KR")}이며, 교역소 레벨 보너스가 적용됩니다.`}
      />

      <H2>길드 제작소</H2>
      <P>
        제작소는 개인이 채집한 원목·광석과 제작 촉매로 장비를 만드는 길드
        시설입니다. 제작은 장인 성장과 연결되고, 누적 제작 기록이 쌓일수록 품질
        확률 보너스가 붙습니다.
      </P>
      <UL>
        <li>
          장비 등급에 맞는 원목과 광석을 함께 사용합니다. 1~5등급은 소나무·철,
          6~7등급은 자작나무·구리, 8~9등급은 버드나무·은, 10등급은
          참나무·금, 11등급은 삼나무·미스릴, 12등급부터는
          편백나무·아다만타이트 재료가 필요합니다.
        </li>
        <li>
          기본 제작 목록은 <Em>수호 · 격노 · 질풍 · 룬 · 연격 · 부식각인</Em>{" "}
          제작 세트 장비를 중심으로 표시됩니다. 드랍 장비와 같은 일반 레시피는
          초반 숙련도 보강용 수련 제작으로 분리됩니다.
        </li>
        <li>
          같은 티어는 부위와 관계없이 원목·광석 총량이 같습니다. 수호는 광석
          60%, 격노는 광석 55%, 질풍은 원목 60%, 룬은 원목 55%, 연격은
          원목 65%, 부식은 원목과 광석을 절반씩 사용합니다.
        </li>
        <li>
          일반 제작의 품질 확률 상한은 <Em>{GUILD_WORKSHOP_NORMAL_QUALITY_CAP_PCT}%</Em>이고,
          명장 제작은 <Em>★ 이상 품질을 확정</Em>합니다.
        </li>
        <li>
          명장 제작은 자원 비용 x{GUILD_WORKSHOP_MASTERWORK_RESOURCE_COST_MULT},
          재료 비용 x{GUILD_WORKSHOP_MASTERWORK_MATERIAL_COST_MULT}를 쓰는 대신
          명장 각인을 남기고, 대장장이 Lv9부터는{" "}
          <Em>★★ 품질 {GUILD_WORKSHOP_MASTERWORK_PLUS2_CHANCE_PCT}%</Em>를 노립니다.
        </li>
        <li>
          분해는 제작 재료 일부를 돌려받는 기능입니다. 회수율은 최대{" "}
          <Em>{GUILD_WORKSHOP_DISMANTLE_MATERIAL_RECOVERY_PCT}%</Em>입니다.
        </li>
      </UL>
      <Table
        head={["장비 티어", "원목·광석", "기본 총량", "촉매 총량"]}
        rows={[
          [4, "소나무·철", "없음"],
          [6, "자작나무·구리", "2개"],
          [8, "버드나무·은", "3개"],
          [10, "참나무·금", "4개"],
          [11, "삼나무·미스릴", "6개"],
          [12, "편백나무·아다만타이트", "8개"],
        ].map(([tier, materials, catalyst]) => [
          `T${tier}`,
          materials,
          `${GUILD_WORKSHOP_RESOURCE_TOTAL_BY_TIER[tier as keyof typeof GUILD_WORKSHOP_RESOURCE_TOTAL_BY_TIER]}개`,
          catalyst,
        ])}
        caption="제작소 Lv4의 T8 특별 제작은 촉매 4개를 사용합니다. 명장 제작은 표의 모든 비용이 2배입니다."
      />
      <Table
        head={["누적 제작", "품질 확률 보너스"]}
        rows={GUILD_WORKSHOP_BONUS_TIERS.filter((tier) => tier.tier > 0).map(
          (tier) => [
            `${tier.totalCrafts.toLocaleString("ko-KR")}회`,
            `+${tier.qualityChanceBonusPct}%`,
          ],
        )}
        caption="제작 기록은 길드 제작소 현황판과 장인 성장 패널에서 확인합니다."
      />

      <H2>탈퇴 · 추방 · 양도 · 해산</H2>
      <UL>
        <li>
          <Em>탈퇴 · 추방</Em> — 길드를 떠나거나(길드원 탭) 내보내면(마스터), 이후{" "}
          {GUILD_LEAVE_COOLDOWN_DAYS} 일 동안 다른 길드에 다시 들어갈 수 없어요.
        </li>
        <li>
          <Em>마스터 양도</Em> — 마스터는 바로 탈퇴할 수 없고, 먼저 다른 길드원에게
          마스터를 넘기거나 해산해야 합니다.
        </li>
        <li>
          <Em>해산</Em> — 관리 탭에서 확인하면 길드가 사라집니다. 금고 골드는 모두
          소멸하고 점령 거점도 전부 풀립니다. 되돌릴 수 없어요.
        </li>
      </UL>

      <Note>
        길드는 거점 점령만이 아니라 전투보급, 훈련장, 제작소까지 함께 키우는
        장기 성장 단위입니다. 명성·영지 자원·세금 회수를 꾸준히 관리할수록 길드
        전체의 효율이 올라갑니다.
      </Note>
    </>
  );
}
