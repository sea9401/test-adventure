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
  GUILD_EXPLORATION_EXPEDITION_IDS,
  GUILD_EXPLORATION_EXPEDITIONS,
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
import { GUILD_WORKSHOP_MASTER_MARK_DELIVERY_BONUS_PCT } from "@/adventure/data/v2/guildWorkshopDelivery";
import { H2, P, UL, Em, Note, Table } from "./primitives";

export function GuildContent() {
  return (
    <>
      <H2>길드란</H2>
      <P>
        길드는 다른 모험가와 공동 시설과 주간 활동을 운영하는 모임입니다. 길드에
        가입하면 훈련장·탐사 본부·연금 공방·식당·교역소·제작소를 함께 키우고
        이용할 수 있습니다. 창단·가입·운영은 모두 길드 탭에서 진행합니다.
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
        길드 탭은 <Em>길드 정보·길드원·길드 목록·시설</Em>로 나뉩니다. 길드
        정보에서는 소개와 명성, 길드 자금과 활동 내역을 확인합니다. 길드 목록에서는
        가입 후에도 다른 길드의 이름·레벨·인원·명성·길드장과 소개를 검색해서 볼 수
        있습니다. 마스터·관리자에게는 <Em>관리</Em> 탭이 추가되며, 초대·가입
        신청·직책·길드 연구와 설정을 관리할 수 있습니다.
      </P>

      <H2>길드 금고</H2>
      <P>
        길드원은 길드 정보 화면에서 개인 골드를 <Em>길드 금고</Em>에 입금할 수
        있습니다. 주간 탐사와 교역 계약 보상도 길드 자금에 더해집니다. 길드
        금고는 길드 레벨과 시설을 개방하거나 업그레이드할 때 사용합니다.
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
        시설 탭에서 훈련장을 개방하면 매일 직업 숙련도를 보강할 수 있습니다.
        훈련은 현재 직업 기준으로 적용되고, 공용 훈련과 직군별 특화 훈련이
        나뉩니다.
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
        <li>
          훈련장 Lv.{GUILD_TRAINING_DRILLS.tactical_simulation.minBuildingLevel}와
          캐릭터 Lv.{GUILD_TRAINING_DRILLS.tactical_simulation.minCharacterLevel}부터{" "}
          <Em>{GUILD_TRAINING_DRILLS.tactical_simulation.title}</Em>이 열립니다.
          Lv.5의 전직 대비 훈련으로 넘어가기 전 공용 숙련도를 보강하는 단계입니다.
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
        오르면 이용할 수 있는 의뢰 종류가 추가되고 의뢰 진척 보너스가 늘어납니다.
        원정은 시설 Lv.1부터 Lv.5까지 단계마다 한 종류씩, 총{" "}
        <Em>{GUILD_EXPLORATION_EXPEDITION_IDS.length}종</Em>이 열리며 상위 원정일수록
        시간이 오래 걸리는 대신 골드·명성·지도 조각 보상이 커집니다.
        기본 협동보스 목표는 단순 처치가 아니라{" "}
        <Em>
          {GUILD_EXPLORATION_WEEKLY_MISSIONS.weekly_coop_epic_30.title}
        </Em>
        로 계산하고, 이후 사냥·낚시·벌목·농장 수확·고난도 사냥 의뢰가 추가로
        열립니다. 완료 시 길드 금고 골드와 탐사 지도 조각을 보상으로 받습니다.
      </P>
      <Table
        head={["레벨", "단계", "해금 의뢰 종류", "진척 보너스"]}
        rows={[1, 2, 3, 4, 5].map((level) => {
          const upgrade = explorationHqUpgradeForLevel(level);
          return [
            `Lv.${upgrade.level}`,
            <Em key={upgrade.level}>{upgrade.label}</Em>,
            `${upgrade.weeklyMissionCount}종`,
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
      <Table
        head={["원정", "시설", "시간·비용", "귀환 보상"]}
        rows={GUILD_EXPLORATION_EXPEDITION_IDS.map((id) => {
          const expedition = GUILD_EXPLORATION_EXPEDITIONS[id];
          return [
            <Em key={id}>{expedition.name}</Em>,
            `Lv.${expedition.minLevel}`,
            `${expedition.durationMinutes / 60}시간 · ${expedition.costGold.toLocaleString("ko-KR")} G`,
            `길드 금고 ${expedition.rewardGold.toLocaleString("ko-KR")} G · 명성 ${expedition.rewardFame.toLocaleString("ko-KR")} · 지도 조각 +${expedition.mapFragments.toLocaleString("ko-KR")}`,
          ];
        })}
        caption="원정대는 한 번에 하나만 파견할 수 있으며, 마스터 또는 관리자가 길드 금고 골드를 사용해 출발시킵니다. 귀환 시간이 지난 뒤에는 길드원 누구나 보상을 회수할 수 있습니다."
      />

      <H2>연금 공방</H2>
      <P>
        연금 공방은 개인 농장에서 수확한 <Em>허브·은빛잎</Em>을 HP 또는 MP
        충전량, <Em>강화석</Em>, <Em>보스 소환서</Em>로 바꾸는 길드 시설입니다.
        공방 Lv.4부터는 연성력을 집중해 <Em>스태미나 회복약</Em>도 만들 수
        있습니다. 결과는 즉시 개인 보유량에 더해집니다. 연성력은 계정 단위로
        매주 월요일 00:00 KST에 초기화되고, 길드를 옮겨도 같은 주의 사용량은
        유지됩니다.
      </P>
      <Table
        head={["레시피", "시설", "재료", "연성력", "결과"]}
        rows={GUILD_ALCHEMY_RECIPES.map((recipe) => [
          <Em key={recipe.id}>{recipe.name}</Em>,
          `Lv.${recipe.minFacilityLevel}`,
          `허브 ${recipe.ingredients.herb}${recipe.ingredients.silverleaf > 0 ? ` · 은빛잎 ${recipe.ingredients.silverleaf}` : ""}`,
          recipe.energyCost.toLocaleString("ko-KR"),
          recipe.output === "stamina_potion"
            ? `스태미나 회복약 ${recipe.staminaPotionAmount ?? 0}개`
            : recipe.output === "material"
              ? `${recipe.outputMaterialName ?? "연성 재료"} ${recipe.outputMaterialAmount ?? 0}개`
            : `충전 +${recipe.chargeAmount.toLocaleString("ko-KR")}`,
        ])}
        caption="충전액은 조제할 때 HP·MP·반반 충전 중 하나를 선택합니다. 강화 촉매·소환의 잉크·활력 영약은 분배 설정과 무관합니다. HP와 MP 충전량은 각각 최대 10,000,000을 넘을 수 없습니다."
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
          이번 주 참여 대상 길드원은 식재료 기부 여부와 관계없이 기본 식권 1장을
          받습니다. 식재료 <Em>{GUILD_DINING_POINTS_PER_TICKET}점</Em>을 기부할 때마다
          시설 레벨별 한도까지 식권을 추가로 받습니다.
        </li>
        <li>
          관리자는 식재료 기부가 시작되기 전에 이번 주 메뉴를 정합니다. 식당
          레벨이 오를 때마다 동시에 운영할 수 있는 메뉴가 한 종류씩 늘어납니다.
        </li>
        <li>
          식권·기여도·메뉴는 월요일 00:00 KST에 초기화됩니다. 길드를 옮겨도
          같은 주에 이미 사용한 식권과 적용 중인 음식 효과는 유지됩니다.
        </li>
      </UL>
      <Table
        head={["시설 레벨", "기여 식권", "동시 운영 메뉴"]}
        rows={DINING_HALL_UPGRADES.map((upgrade) => [
          `Lv.${upgrade.level}`,
          `최대 ${upgrade.weeklyMealTickets}장`,
          `${upgrade.weeklyMenuSlots}종`,
        ])}
        caption="모든 주간 참여 길드원은 기본 식권 1장을 받습니다. 시설 레벨이 오를 때마다 동시에 운영할 수 있는 메뉴가 한 종류씩 늘어납니다."
      />
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
        caption="지속 효과 메뉴는 식권 1장당 12시간 적용됩니다. 같은 메뉴는 남은 시간에 12시간을 더하고, 다른 효과식은 기존 효과와 남은 시간을 교체합니다. 길드 대연회는 사냥과 생활 경험치에 모두 적용됩니다. 효과식은 한 번에 하나만 적용되며 월요일 00:00 KST에 초기화됩니다."
      />

      <H2>길드 교역소</H2>
      <P>
        길드 교역소는 벌목·채광·농장·낚시에서 모은 생활 재료를 주간 계약에
        함께 납품하는 시설입니다. 누가 납품하든 납품 점수만큼 <Em>길드 공동
        교역 토큰</Em>이 쌓이고, 공동 목표를 채우면 길드 금고 골드와 명성을
        획득합니다.
      </P>
      <UL>
        <li>
          계약 하나의 기본 목표는 <Em>{GUILD_TRADE_BASE_TARGET}점</Em>이며,
          주간 계약 시작 시점의 길드원 1명 초과마다 {GUILD_TRADE_TARGET_PER_EXTRA_MEMBER}점씩
          늘어납니다. 참여 대상도 이 시점에 함께 확정됩니다.
        </li>
        <li>
          시설 레벨이 오를 때마다 납품 토큰 획득량, 개인 납품 한도와 계약 완료
          보상이 증가합니다. 주간 계약 수도 3건에서 5건까지 늘어납니다.
        </li>
        <li>
          계약·개인 납품·길드 전체 구매 횟수는 월요일 00:00 KST에 초기화됩니다.
          공동 교역 토큰은 다음 주에도 유지됩니다.
        </li>
        <li>
          상점 품목은 길드장과 관리자만 선택할 수 있습니다. 선택한 품목은 현재
          길드원 전원에게 같은 수량으로 지급되며, 구매 한도는 길드 전체에
          적용됩니다.
        </li>
        <li>
          선택한 관리자·품목·인원·사용 토큰과 남은 공동 토큰은 길드 활동 내역에
          기록됩니다.
        </li>
      </UL>
      <Table
        head={["레벨", "계약", "개인 납품 한도", "토큰 획득", "완료 보상"]}
        rows={TRADE_POST_UPGRADES.map((upgrade) => [
          `Lv.${upgrade.level}`,
          `${upgrade.weeklyContractCount}건`,
          `${upgrade.personalContributionCap}점`,
          upgrade.tokenYieldBonusPct > 0
            ? `+${upgrade.tokenYieldBonusPct}%`
            : "기본",
          upgrade.completionRewardBonusPct > 0
            ? `+${upgrade.completionRewardBonusPct}%`
            : "기본",
        ])}
        caption="토큰 보너스는 작은 묶음을 여러 번 납품해도 개인의 주간 누적 납품 점수를 기준으로 소수점 손실 없이 계산됩니다."
      />
      <Table
        head={["교환 품목", "필요 시설", "비용", "개인 주간 한도"]}
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
        확률 보너스가 붙습니다. 제작소 레벨의 주간 진척 보너스는 모든 주간 제작
        의뢰에 적용되며, 예를 들어 Lv.5에서는 제작 1회가 1.4회분으로 계산됩니다.
      </P>
      <Table
        head={["제작소", "시설 단계", "품질 확률", "주간 의뢰 진척"]}
        rows={GUILD_SMITHY_UPGRADES.map((upgrade) => [
          `Lv.${upgrade.level}`,
          <Em key={upgrade.level}>{upgrade.label}</Em>,
          `+${upgrade.qualityChanceBonusPct}%p`,
          `+${upgrade.weeklyProgressBonusPct}%`,
        ])}
        caption="주간 진척 보너스는 실제 제작 횟수를 바꾸지 않고 의뢰 완료 판정에만 적용됩니다. 제작소 레벨이 오르면 진행 중인 이번 주 의뢰에도 현재 레벨 보너스가 반영됩니다."
      />
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
        <li>
          일일 제작 납품은 매일 00:00 KST에 초기화됩니다. 대장장이 Lv10
          이상에 만든 명장 제작품은 기존 명장 보너스에 더해{" "}
          <Em>납품 보너스 +{GUILD_WORKSHOP_MASTER_MARK_DELIVERY_BONUS_PCT}%</Em>를
          추가로 받습니다.
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
          {GUILD_LEAVE_COOLDOWN_DAYS}일 동안 다른 길드에 가입할 수 없습니다.
        </li>
        <li>
          <Em>마스터 양도</Em> — 마스터는 바로 탈퇴할 수 없고, 먼저 다른 길드원에게
          마스터를 넘기거나 해산해야 합니다.
        </li>
        <li>
          <Em>해산</Em> — 관리 탭에서 확인하면 길드가 사라집니다. 금고 골드는 모두
          소멸합니다. 해산은 되돌릴 수 없습니다.
        </li>
      </UL>

      <Note>
        길드는 연구와 시설을 함께 운영하는 장기 성장 단위입니다. 시설마다 재료와
        주간 초기화 시점이 다르므로 관리 화면에서 남은 목표를 확인해 주세요.
      </Note>
    </>
  );
}
