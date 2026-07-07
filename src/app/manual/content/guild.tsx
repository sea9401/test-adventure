import {
  GUILD_CREATE_MIN_LEVEL,
  GUILD_CREATE_GOLD_COST,
  GUILD_LEAVE_COOLDOWN_DAYS,
  GUILD_MAX_MEMBERS,
} from "@/adventure/data/guild";
import {
  GUILD_COMBAT_SUPPLY_DEFS,
  GUILD_COMBAT_SUPPLY_IDS,
  GUILD_COMBAT_SUPPLY_MAX_LEVEL,
  guildCombatSupplyNextCost,
} from "@/adventure/data/v2/guildCombatSupply";
import { explorationHqUpgradeForLevel } from "@/adventure/data/v2/settlement";
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
          이고, 창단하면 본인이 마스터가 됩니다. 정원은{" "}
          <Em>{GUILD_MAX_MEMBERS} 명</Em>(국가 선포 시 증가).
        </li>
        <li>
          가입은 두 길 — 비소속이면 「둘러보기」에서 마음에 드는 길드에{" "}
          <Em>신청</Em>(마스터가 수락/거절)하거나, 마스터의 <Em>초대</Em>를
          우편함에서 받아 수락합니다.
        </li>
      </UL>

      <H2>길드 운영</H2>
      <P>
        길드 탭에서 정보(마스터·인원·명성·소개), 길드원 목록과 조직도(마스터→
        부마스터→관리자→일반), 보유 거점을 봅니다. 마스터·관리자는 <Em>관리</Em>{" "}
        탭에서 멤버 초대, 가입 신청 처리, 거점 정책·세율, 직책 임명을 다룹니다.
      </P>

      <H2>길드 금고</H2>
      <P>
        길드 금고는 점령 거점에서 모인 <Em>세금 수입</Em>으로 채워집니다. 외부인이
        점령 거점에서 사냥하면 세금이 쌓이고, 길드원이 회수하면 일부는 회수자에게,
        나머지가 금고로 들어갑니다. 자세한 건 <Em>거점과 영토</Em> 페이지를 보세요.
      </P>

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
        caption="탐사 의뢰는 길드원이 사냥·발굴·보스 처치 같은 활동으로 함께 채우는 주간 목표로 확장됩니다."
      />

      <H2>길드 제작소</H2>
      <P>
        제작소는 영지 자원과 제작 재료를 써 장비를 만드는 길드 시설입니다. 제작은
        장인 성장과 연결되고, 누적 제작 기록이 쌓일수록 품질 확률 보너스가 붙습니다.
      </P>
      <UL>
        <li>
          기본 제작 목록은 <Em>수호각인 · 질풍각인 · 룬각인</Em> 제작 세트
          장비를 중심으로 표시됩니다. 드랍 장비와 같은 일반 레시피는 초반
          숙련도 보강용 수련 제작으로 분리됩니다.
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
