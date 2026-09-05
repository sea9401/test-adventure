import {
  CRIT_OVERFLOW_DMG_CAP,
  CRIT_OVERFLOW_DMG_PER_PCT,
  CRIT_PCT_CAP,
} from "@/adventure/data/stats";
import {
  BLEED_MAX_STACKS,
  COOP_BOSS_MAX_HP_DAMAGE_MULT,
  DEF_REDUCTION_PCT_CAP,
  MAGIC_DEF_MITIGATION_MAX_PCT,
  MAGIC_BARRIER_ABSORB_SCALE,
  MAGIC_BARRIER_BASE_INT,
  MAGIC_BARRIER_DURABILITY_PER_INT,
  MAGIC_BARRIER_EFFICIENCY_SCALE,
  MAGIC_BARRIER_MAX_MP_PCT,
  MAGIC_BARRIER_PVE_MAX_ABSORB_PCT,
  MAGIC_BARRIER_PVE_MAX_EFFICIENCY_PCT,
  MAGIC_BARRIER_PVP_MAX_ABSORB_PCT,
  MAGIC_BARRIER_PVP_MAX_EFFICIENCY_PCT,
  PHYSICAL_DEF_MITIGATION_MAX_PCT,
  PHYSICAL_DEF_MITIGATION_SCALE,
  PLAYER_BLEED_ATK_COEF_PER_STACK,
  POISON_CAP_ATK_COEF,
  POISON_FULL_BUILD_DAMAGE_MULT,
  POISON_MAX_STACKS,
  POISON_PCT_PER_POINT,
  SKILL_CRIT_MULT,
} from "@/adventure/data/v2/v2CombatConstants";
import { V2_DOT_PRESETS } from "@/adventure/data/v2/statusEffects";
import {
  V2_BASE_HP,
  V2_BASE_MP,
  V2_HP_PER_LEVEL,
  V2_MP_PER_LEVEL,
} from "@/adventure/data/v2/v2Stats";
import { BOSS_MAX_HP_DAMAGE_MULT } from "@/adventure/v2/combat/engineState";
import {
  BASE_FREEZE_DELAY_PCT,
  FREEZE_FLAT_DAMAGE,
  FREEZE_INT_COEF,
  FREEZE_MAX_MP_COEF,
  FROST_CHILL_THRESHOLD,
} from "@/adventure/v2/combat/frostChill";
import { PLAYER_ACTION_SPD_CAP } from "@/adventure/v2/combat/combatTimeline";
import {
  ACC_BASE_RATING,
  ACC_PER_INT,
  ACC_PER_SPI,
  ACC_PER_STR,
  ACCURACY_PCT_PER_DEX,
  ATK_PER_STR,
  CRIT_DMG_PER_LUK,
  CRIT_DMG_PER_STR,
  CRIT_MULT_CEIL,
  CRIT_MULT_SCALE,
  CRIT_PER_LUK,
  DEF_PER_VIT,
  EVA_PER_DEX,
  EVA_PER_LUK,
  HEAL_MULT_PER_SPI,
  HEAL_MULT_PER_VIT,
  HP_PER_STR,
  HP_PER_VIT,
  MAGIC_ATK_PER_EXCESS_SPI,
  MAGIC_ATK_PER_INT,
  MAGIC_ATK_PER_SPI,
  MAGIC_DEF_PER_INT,
  MAGIC_DEF_PER_SPI,
  MIN_DMG_PER_INT,
  MIN_DMG_PER_SPI,
  MIN_DMG_PER_STR,
  MIN_DMG_PER_VIT,
  MP_PER_INT,
  SPD_PER_DEX,
  V2_BASE_COMBAT_BONUS,
  VIT_ATK_COEF,
  WEIGHT_SPD_PENALTY,
} from "@/lib/server/v2CombatCoefficients";
import {
  ARENA_DAMAGE_MULTIPLIER,
  ARENA_SUSTAIN_MULTIPLIER,
} from "@/lib/server/arena";
import { Code, Em, H2, H3, Note, P, Table, UL } from "./primitives";

const pct = (value: number) => `${value * 100}%`;

export function CombatFormulasContent() {
  return (
    <>
      <H2>계산식을 읽는 공통 규칙</H2>
      <UL>
        <li>
          이 페이지는 <Em>모든 직업이 공유하는 계산 순서</Em>를 설명합니다. 스킬마다
          다른 위력 계수·고정값·발동 확률은 스킬 상세에 표시된 값을 대입합니다.
        </li>
        <li>
          <Code>내림</Code>은 소수점을 버리고, <Code>반올림</Code>은 가장 가까운
          정수로 만듭니다. 중간 단계에서 정수화하는 효과가 있어 화면의 반올림된 수치만
          다시 계산하면 1 정도 차이가 날 수 있습니다.
        </li>
        <li>
          직업 앵커 보정, 직업 고유 패시브, 장비 옵션, 음식, 전투 중 버프·디버프는
          아래 기본식의 해당 항목에 더하거나 곱합니다. 실제 최종값은 캐릭터 상세에서
          확인할 수 있습니다.
        </li>
      </UL>

      <H2>기본 전투 능력치</H2>
      <P>
        아래는 직업·패시브의 추가 보정이 들어가기 전 기본식입니다. 무기 위력은
        비지팡이면 물리 공격력, 지팡이면 마법 공격력에 들어갑니다.
      </P>
      <Table
        head={["능력치", "기본 계산식"]}
        rows={[
          [
            "물리 공격력",
            <Code key="atk">내림(STR × {ATK_PER_STR} + VIT × {VIT_ATK_COEF} + 직업 전용 DEX·LUK 전환 + 비지팡이 무기 위력) + {V2_BASE_COMBAT_BONUS}</Code>,
          ],
          [
            "마법 공격력",
            <Code key="matk">내림(INT × {MAGIC_ATK_PER_INT} + SPI × {MAGIC_ATK_PER_SPI} + max(0, SPI − INT) × {MAGIC_ATK_PER_EXCESS_SPI}) + 지팡이 위력 + {V2_BASE_COMBAT_BONUS}</Code>,
          ],
          [
            "물리 방어력",
            <Code key="def">내림(VIT × {DEF_PER_VIT} + 방어구 위력) + {V2_BASE_COMBAT_BONUS}</Code>,
          ],
          [
            "마법 방어력",
            <Code key="mdef">내림(SPI × {MAGIC_DEF_PER_SPI} + INT × {MAGIC_DEF_PER_INT} + 장신구 위력) + {V2_BASE_COMBAT_BONUS}</Code>,
          ],
          [
            "물리 스킬 최소 데미지",
            <Code key="pmin">내림(STR × {MIN_DMG_PER_STR} + VIT × {MIN_DMG_PER_VIT})</Code>,
          ],
          [
            "마법 스킬 최소 데미지",
            <Code key="mmin">내림(INT × {MIN_DMG_PER_INT} + SPI × {MIN_DMG_PER_SPI})</Code>,
          ],
        ]}
        caption="장비 고정 HP·MP와 일부 패시브는 정해진 곱연산 뒤에 별도로 더해질 수 있습니다."
      />

      <H3>최대 HP·MP와 회복량</H3>
      <UL>
        <li>
          <Em>최대 HP 계산 순서</Em> — 기초값과 레벨·힘·활력으로{" "}
          <Code>{V2_BASE_HP} + (레벨 − 1) × {V2_HP_PER_LEVEL} + STR × {HP_PER_STR} + VIT × {HP_PER_VIT}</Code>을
          구한 뒤 직업 보정과 최대 HP 증가율을 적용하고, 마지막에 장비의 고정 HP를
          더합니다. 따라서 장비의 고정 HP에는 최대 HP 증가율이 다시 곱해지지 않습니다.
        </li>
        <li>
          <Em>최대 MP 계산 순서</Em> — 기초값과 레벨·지능과 장비 MP를 합친{" "}
          <Code>{V2_BASE_MP} + (레벨 − 1) × {V2_MP_PER_LEVEL} + INT × {MP_PER_INT} + 장비 MP</Code>에
          최대 MP 증가율을 곱합니다. HP와 달리 장비 MP도 최대 MP 증가율의 적용을 받습니다.
        </li>
        <li>
          기본 회복 배율은 <Code>1 + VIT × {HEAL_MULT_PER_VIT} + SPI × {HEAL_MULT_PER_SPI}</Code>입니다.
          회복 강화 옵션은 이 값에 다시 곱해집니다.
        </li>
        <li>
          <Em>정신은 최대 MP를 직접 올리지 않습니다.</Em> 정신은 마법 공격력·마법
          방어력·마법 스킬 최소 데미지와 위의 회복 배율에 반영됩니다. 최대 MP의 기본
          능력치 계수는 지능만 사용합니다.
        </li>
        <li>
          최대 HP 비례 회복 스킬은 보통 <Code>내림((내림(최대 HP × 비율) + 고정 회복량) × 회복 배율)</Code>을
          사용하고, 실제 회복은 최대 HP를 넘지 않습니다.
        </li>
      </UL>
      <H3>생존 능력치 증가율의 점감</H3>
      <UL>
        <li>
          여러 <Em>VIT 증가율</Em>의 합은 처음 40%까지 그대로 적용하고, 초과분은
          40%만 반영하며 최종 60%가 상한입니다.
        </li>
        <li>
          여러 <Em>최대 HP 증가율</Em>의 합은 처음 30%까지 그대로 적용하고,
          초과분은 35%만 반영합니다. 이 점감식에는 별도 하드캡이 없습니다.
        </li>
        <li>
          여러 <Em>방어력 증가율</Em>의 합은 처음 30%까지 그대로 적용하고,
          초과분은 40%만 반영합니다. 장비 고정 방어력까지 합친 기본 방어력에 이
          증가율을 곱합니다.
        </li>
      </UL>

      <H2>직접 피해와 방어</H2>
      <H3>기본 공격</H3>
      <UL>
        <li>
          플레이어가 적에게 주는 기본 공격은 <Code>max(1, 올림(공격력 × 15%), 공격력 − 유효 방어력)</Code>입니다.
        </li>
        <li>
          몬스터의 물리 공격을 받을 때 방어 경감률은 <Code>{PHYSICAL_DEF_MITIGATION_MAX_PCT}% × 방어력 ÷ (방어력 + {PHYSICAL_DEF_MITIGATION_SCALE})</Code>입니다.
          피해는 이 비율만큼 줄이되 공격력의 15%를 방어 단계의 하한으로 둡니다.
        </li>
        <li>
          마법 공격을 받을 때 마방 경감률은 <Code>{MAGIC_DEF_MITIGATION_MAX_PCT}% × 마법 방어력 ÷ (마법 방어력 + 적 마법 관통도)</Code>입니다.
          공격력은 원피해 크기만 정하고 마법 관통도는 마방 효율만 정합니다. 피해에는 마찬가지로 공격력의 15%가 방어 단계 하한입니다.
        </li>
      </UL>

      <H3>직접 피해 스킬</H3>
      <P>
        공통 뼈대는 <Code>내림(사용 공격력 × 속성·버프 배율 × 스킬 계수) + 스킬 고정값 − 유효 방어력</Code>입니다.
        물리 스킬은 물리 공격력·방어력, 마법 스킬은 마법 공격력·마법 방어력을 사용합니다.
        현재 직업명과 무관하게 <Em>스킬 상세에 표시된 물리·마법 계열</Em>이 사용할
        공격력과 방어력을 결정합니다. 결과가 계열별 최소 데미지보다 낮으면 최소
        데미지가 적용됩니다.
      </P>
      <Note>
        캐릭터·몬스터의 불·물·바람 같은 속성 태그에 따른 상성 배율은 현재 없습니다.
        스킬에 적힌 연소·빙결·감전 같은 고유 효과는 별도로 작동합니다.
      </Note>

      <H3>방어 감소와 방어 무시</H3>
      <UL>
        <li>
          여러 방어 감소율은 단순히 더하지 않고 남은 방어력에 차례로 곱합니다.
          예를 들어 20%와 30%는 <Code>1 − 0.8 × 0.7 = 44%</Code> 감소입니다.
        </li>
        <li>
          공통 방어 감소율의 최종 상한은 <Em>{DEF_REDUCTION_PCT_CAP}%</Em>입니다.
          고정 방어 감소와 일부 별도 관통은 적용 단계가 달라 결과가 다를 수 있습니다.
        </li>
        <li>
          ‘방어 무시’로 표시된 암살·약점 계열의 공통 처리는 방어력을 0으로 만드는 것이
          아니라 <Em>30%</Em>만 무시하여 방어력 70%를 남깁니다.
        </li>
      </UL>

      <H2>치명타</H2>
      <UL>
        <li>
          기본 치명타 확률은 <Code>LUK × {CRIT_PER_LUK} + 장비 치명타 + 패시브</Code>입니다.
          일반 상한은 <Em>{CRIT_PCT_CAP}%</Em>이며, PvP에서는 상한을 적용한 뒤 상대의
          치명타 저항을 뺍니다. 확정 치명타 효과는 이 확률 판정을 건너뜁니다.
        </li>
        <li>
          평타 치명타 배율의 가산값 B는 기본적으로 <Code>LUK × {CRIT_DMG_PER_LUK} + STR × {CRIT_DMG_PER_STR} + 장비·패시브 보너스</Code>입니다.
          최종 배율은 <Code>{CRIT_MULT_CEIL} − ({CRIT_MULT_CEIL} − 1.4) × e^(−B ÷ {CRIT_MULT_SCALE})</Code>로,
          {CRIT_MULT_CEIL}배에 가까워지지만 도달하지 않는 점감식입니다.
        </li>
        <li>
          치명타 확률 {CRIT_PCT_CAP}% 초과분은 1%p당 치명타 배율 <Code>+{CRIT_OVERFLOW_DMG_PER_PCT}배</Code>로
          전환되며, 이 전환 보너스는 최대 <Code>+{CRIT_OVERFLOW_DMG_CAP}배</Code>입니다.
          평타에는 기본 적용되고, 액티브 스킬에는 ‘치명 한계 확장’처럼 적용을 명시한 효과가
          있어야 더해집니다.
        </li>
        <li>
          액티브 스킬 치명타의 공통 기본 배율은 <Em>{SKILL_CRIT_MULT}배</Em>입니다.
          스킬 치명타 피해, 강제 치명타 보너스, 마법 치명 전환처럼 명시된 효과만 여기에
          추가됩니다.
        </li>
      </UL>

      <H2>회피도와 적중도</H2>
      <UL>
        <li>
          기본 회피도는 <Code>max(0, DEX − 15) × {EVA_PER_DEX} + max(0, LUK − 15) × {EVA_PER_LUK} + 경갑·장비 회피도</Code>이며,
          회피도 증가 패시브가 전체를 곱해 올립니다.
        </li>
        <li>
          기본 적중도는 <Code>{ACC_BASE_RATING} + DEX × {ACCURACY_PCT_PER_DEX} + STR × {ACC_PER_STR} + INT × {ACC_PER_INT} + SPI × {ACC_PER_SPI} + 장비 적중도</Code>이며,
          적중도 증가 패시브가 전체를 곱해 올립니다.
        </li>
        <li>
          사냥 회피 경감률은 <Code>85% × 회피도 ÷ (회피도 + 적중도 × 2.5)</Code>,
          PvP는 <Code>85% × 회피도 ÷ (회피도 + 적중도 × 3)</Code>입니다.
        </li>
        <li>
          일반 회피도는 공격을 빗나가게 하지 않고 직접 피해만 줄입니다. 지속 피해·반사·상태
          피해에는 적용되지 않으며, ‘완전 회피’라고 적힌 별도 효과만 피해와 부가 효과를 모두
          무효화합니다.
        </li>
      </UL>

      <H2>속도와 행동 순서</H2>
      <UL>
        <li>
          패시브 적용 전 기본 속도는 <Code>max(0, DEX × {SPD_PER_DEX} − 장비 무게 × {WEIGHT_SPD_PENALTY} + 장비 속도)</Code>입니다.
          일부 직업은 LUK 전환이나 속도 증가 패시브를 추가로 적용합니다.
        </li>
        <li>
          속도 <Em>100</Em>은 행동률 100·행동 간격 100틱의 기준입니다. 속도 1,000은
          행동 간격 21틱으로 약 4.8배 자주 행동합니다. 행동 간격은
          <Code>올림(10,000 ÷ 행동률)</Code>이며, 값이 작을수록 더 자주 행동합니다.
        </li>
        <li>
          속도 1,000 이후에도 행동률은 계속 증가하지만 효율은 더 크게 줄어듭니다. 기술적
          안전 한계인 속도 <Em>{PLAYER_ACTION_SPD_CAP.toLocaleString("ko-KR")}</Em>부터는
          행동 간격이 최소 10틱으로 고정됩니다.
        </li>
        <li>
          같은 시각에 행동할 경우 사냥에서는 플레이어가 먼저 행동합니다. 출혈·중독 같은
          지속 피해는 피해를 받은 대상의 실제 행동 시작 시점에 먼저 발생합니다.
        </li>
      </UL>

      <H2>마나 실드와 반사</H2>
      <H3>마나 실드</H3>
      <UL>
        <li>
          유효 INT는 <Code>max(0, INT − {MAGIC_BARRIER_BASE_INT})</Code>입니다.
          유효 INT가 0이거나 최대 MP가 0이면 마나 실드가 전개되지 않습니다.
        </li>
        <li>
          최대 내구도는 <Code>내림(최대 MP × {MAGIC_BARRIER_MAX_MP_PCT}% + 유효 INT × {MAGIC_BARRIER_DURABILITY_PER_INT})</Code>입니다.
          전투 시작 시 이 내구도로 가득 차며 전투 중 다시 계산하거나 회복하지 않습니다.
        </li>
        <li>
          사냥 흡수율은 <Code>{MAGIC_BARRIER_PVE_MAX_ABSORB_PCT}% × 유효 INT ÷ (유효 INT + {MAGIC_BARRIER_ABSORB_SCALE})</Code>,
          PvP 흡수율은 앞의 {MAGIC_BARRIER_PVE_MAX_ABSORB_PCT}% 대신
          {MAGIC_BARRIER_PVP_MAX_ABSORB_PCT}%를 사용합니다.
        </li>
        <li>
          사냥 내구도 소모 경감률은 <Code>{MAGIC_BARRIER_PVE_MAX_EFFICIENCY_PCT}% × 최대 내구도 ÷ (최대 내구도 + {MAGIC_BARRIER_EFFICIENCY_SCALE})</Code>,
          PvP에서는 앞의 {MAGIC_BARRIER_PVE_MAX_EFFICIENCY_PCT}% 대신
          {MAGIC_BARRIER_PVP_MAX_EFFICIENCY_PCT}%를 사용합니다.
        </li>
        <li>
          목표 흡수량은 <Code>내림(방어 전 피해 × 흡수율)</Code>, 필요한 내구도는
          <Code>올림(목표 흡수량 × (1 − 소모 경감률))</Code>입니다. 내구도가 부족하면
          감당하지 못한 피해가 몸통 피해에 합쳐집니다.
        </li>
      </UL>

      <H3>반사</H3>
      <UL>
        <li>
          피해 비례 반사는 <Em>가드·일반 보호막 적용 전 피해</Em>에 반사율을 곱하고,
          방어 비례 반사는 <Em>전투 시작 시 확정된 방어력</Em>에 표시된 비율을 곱해
          반사 원량을 만듭니다.
        </li>
        <li>
          반사 원량에도 공격자의 방어력과 전투별 최종 피해 보정이 적용되며, 그 뒤
          공격자의 마나 실드와 일반 보호막이 처리합니다. PvP에서는 방어 감산과 회피
          경감 중 반사 피해를 더 많이 줄이는 한쪽만 적용하고 둘을 중첩하지 않습니다.
        </li>
        <li>
          일반 보호막이 직접 공격을 전부 흡수하면 피격 반사·반격은 발동하지 않습니다.
          다만 공격이 HP에 닿았다면 가드 때문에 최종 HP 피해가 0이 된 경우에도 이미
          정해진 반사는 발생할 수 있습니다.
        </li>
      </UL>

      <H2>출혈·중독·연소</H2>
      <P>
        세 효과는 모두 대상의 행동 시작마다 1회 피해를 줍니다. 같은 종류를 다시 걸면
        중첩 수를 상한까지 더하고 지속 행동 수와 1중첩당 피해 기준을 가장 최근에 건
        효과로 갱신합니다. 방어력과 일반 회피, 일반 보호막은 무시하지만 상태 피해
        감소와 마나 실드는 적용됩니다. ‘시전 시 공격력’은 효과가 걸릴 때 저장된
        값이며, 일부 LUK 계열 중독 스킬처럼 별도 기준을 쓰는 경우에는 스킬 상세의
        계열을 따릅니다.
      </P>
      <Table
        head={["효과", "1중첩당 1틱 기본 피해", "중첩·지속"]}
        rows={[
          [
            "출혈",
            <Code key="bleed">{V2_DOT_PRESETS.출혈.flatPerStack} + 시전 시 공격력 × {PLAYER_BLEED_ATK_COEF_PER_STACK}</Code>,
            `최대 ${BLEED_MAX_STACKS}중첩 · 기본 ${V2_DOT_PRESETS.출혈.turns}행동`,
          ],
          [
            "중독",
            <Code key="poison">min(대상 최대 HP × 독 비율, 시전 시 공격력 × {POISON_CAP_ATK_COEF})</Code>,
            `최대 ${POISON_MAX_STACKS}중첩 · 기본 ${V2_DOT_PRESETS.중독.turns}행동`,
          ],
          [
            "연소",
            <Code key="burn">{V2_DOT_PRESETS.연소.flatPerStack} + 시전 시 공격력 × {V2_DOT_PRESETS.연소.atkCoefPerStack}</Code>,
            `최대 ${V2_DOT_PRESETS.연소.maxStacks}중첩 · 기본 ${V2_DOT_PRESETS.연소.turns}행동`,
          ],
        ]}
        caption="최종 1틱 피해는 모든 스택의 합을 계산한 뒤 소수점을 내립니다. 효과별 고정값·독 비율이 따로 적혀 있으면 그 값을 사용합니다."
      />

      <H3>출혈 계산</H3>
      <P>
        플레이어 출혈의 공통식은 <Code>내림(중첩 × (효과의 고정값 + 시전 시 공격력 × {PLAYER_BLEED_ATK_COEF_PER_STACK}))</Code>입니다.
        예를 들어 공격력 100, 고정값 10인 출혈 3중첩은
        <Code>내림(3 × (10 + 100 × {PLAYER_BLEED_ATK_COEF_PER_STACK})) = 105</Code> 피해입니다.
        몬스터나 특정 장비가 거는 출혈은 스킬 상세에 별도 계수가 있으면 그 값을 사용합니다.
      </P>

      <H3>중독 계산</H3>
      <UL>
        <li>
          독 강도 1은 대상 최대 HP의 <Em>{pct(POISON_PCT_PER_POINT)}</Em>입니다.
          공통 중독 프리셋의 독 강도 {V2_DOT_PRESETS.중독.pctMaxHpPerStack / POISON_PCT_PER_POINT}은
          1중첩당 최대 HP의 <Em>{pct(V2_DOT_PRESETS.중독.pctMaxHpPerStack)}</Em>를 뜻합니다.
        </li>
        <li>
          최대 HP 비례분은 시전 시 공격력의 <Em>{POISON_CAP_ATK_COEF * 100}%</Em>를 넘지 못합니다.
          일반 보스에서는 이 부분을 {BOSS_MAX_HP_DAMAGE_MULT * 100}%, 협동 보스에서는
          {COOP_BOSS_MAX_HP_DAMAGE_MULT * 100}%로 낮춥니다.
        </li>
        <li>
          맹독 패시브가 적용되는 직업 중독은 과거 완성 세팅을 보존하기 위해
          <Code>C = min(최대 HP × 독 비율 × {POISON_FULL_BUILD_DAMAGE_MULT}, 시전 시 공격력 × {POISON_CAP_ATK_COEF})</Code>를
          먼저 구한 뒤, <Code>C × (1 + 맹독 피해 합계 ÷ 100) ÷ {POISON_FULL_BUILD_DAMAGE_MULT}</Code>를
          1중첩 피해로 사용합니다. 보스 계수는 C에 함께 적용됩니다.
        </li>
        <li>
          여러 중독 중첩의 합, 중독 취약, 상태 피해 감소를 차례로 적용합니다. 각 정수화
          단계에서 소수점을 내립니다. 중독 폭발처럼 중첩을 소비하는 직접 피해는 지속 피해와
          별도이며 스킬 상세의 ‘중첩당 추가 피해’를 사용합니다.
        </li>
      </UL>

      <H3>지속 피해 적용 순서</H3>
      <P>
        <Code>중첩별 원래 피해 합산 → 보스 최대 HP 계수 → 지속 피해 취약 → 마나 실드 분배 → 몸통 피해의 상태 피해 감소·PvP 보정 → HP</Code>
        순서입니다. 마나 실드가 없는 대상은 실드 분배 단계를 건너뜁니다. 여러 지속 피해가
        동시에 발생하면 전체 보정을 한 뒤 원래 피해 비율대로 전투 로그에 다시 나누어
        표시합니다.
      </P>

      <H3>한기와 빙결</H3>
      <UL>
        <li>
          대상에게 한기 {FROST_CHILL_THRESHOLD}중첩이 쌓이면 한기{" "}
          {FROST_CHILL_THRESHOLD}개를 소비하고 빙결이 한 번 발생합니다. 한 번에
          임계치를 넘는 한기를 얻어도 초과분으로 빙결이 연속 발동하지 않습니다.
        </li>
        <li>
          빙결 원래 피해는{" "}
          <Code>
            반올림((INT × {FREEZE_INT_COEF} + 최대 MP × {FREEZE_MAX_MP_COEF} +{" "}
            {FREEZE_FLAT_DAMAGE}) × (1 + 빙결 피해 증가율 ÷ 100))
          </Code>
          입니다. 이후 마법 직접 피해와 같은 방어·회피·마나 실드·보호막·PvP
          보정을 받습니다.
        </li>
        <li>
          빙결은 대상의 예약된 다음 행동을 기본 <Em>{BASE_FREEZE_DELAY_PCT}%</Em>
          늦춥니다. 빙점 지배·영구동토처럼 피해 증가율, 지연율, 발동 뒤 남길 한기가
          따로 적힌 패시브는 그 값을 사용합니다.
        </li>
      </UL>

      <H2>피해 감소·회복·PvP 보정</H2>
      <UL>
        <li>
          상시 받는 피해 감소 패시브 여러 개의 합이 20%를 넘으면 초과분은 40%만 반영하고,
          이 상시 패시브 묶음은 최대 30%입니다. 전투 중 방어 자세·결계·장비 발동 효과는
          각 효과의 적용 단계에 추가됩니다.
        </li>
        <li>
          상태 피해 감소는 출혈·중독·연소 같은 상태 피해에만 적용합니다.
          <Code>내림(상태 피해 × (1 − 감소율 ÷ 100))</Code>이며 최대 100%입니다.
        </li>
        <li>
          흡혈은 해당 공격으로 실제로 가한 피해에 표시된 비율을 곱하고 소수점을 내립니다.
          최대 HP를 넘는 회복은 버려집니다. 자해·HP 비용과 보호막이 흡수한 피해는 일반적인
          ‘실제 가한 피해’에 포함되지 않습니다.
        </li>
        <li>
          투기장·친선 대련·챔피언십은 상대에게 주는 최종 피해를
          <Em>{ARENA_DAMAGE_MULTIPLIER * 100}%</Em>로, 회복량과 새로 생성하는 보호막을
          <Em>{ARENA_SUSTAIN_MULTIPLIER * 100}%</Em>로 조정합니다. HP 비용과 자해는 이 보정을
          받지 않습니다.
        </li>
      </UL>

      <Note>
        스킬 한 개에 직접 피해·지속 피해·중첩 소비·반사·보호막이 함께 있으면 각 부분을
        따로 계산한 뒤 스킬에 정의된 순서대로 처리합니다. 따라서 최종 피해를 확인할 때는
        스킬 상세의 효과 칩과 전투 기록을 함께 보는 것이 가장 정확합니다.
      </Note>
    </>
  );
}
