import { H2, P, UL, Em, Table, Note } from "./primitives";
import {
  TILE_TIER_LABEL,
  TILE_FOUND_COST,
  TILE_PROMOTE_COST,
} from "@/adventure/data/v2/tileConfig";
import { OUTPOST_MOVE_GOLD_COST } from "@/adventure/data/v2/coreLoopConfig";

export function OutpostContent() {
  return (
    <>
      <H2>지도와 이동</H2>
      <P>
        세계는 <Em>타일 지도</Em>입니다. 지도에서 칸을 눌러 <Em>어디로든 바로</Em>{" "}
        이동합니다 — 인접 여부와 상관없습니다.
      </P>
      <UL>
        <li>
          다른 칸으로 이동할 때마다 <Em>{OUTPOST_MOVE_GOLD_COST} 골드</Em>가
          듭니다. 지금 있는 칸에 머무르거나 다시 누르는 건 무료입니다.
        </li>
        <li>
          일부 칸에는 <Em>거점</Em>이 놓여 있습니다(점령·세금의 무대). 나머지는 빈
          땅이라 직접 정착할 수 있습니다.
        </li>
        <li>마을 탭 또는 모험 탭에서 지도를 엽니다.</li>
      </UL>

      <H2>개척 정착지</H2>
      <P>
        거점 말고도, <Em>빈 땅 아무 칸</Em>에나 <Em>{TILE_TIER_LABEL.frontier}</Em>
        을 세워 나만의 정착지를 시작합니다(<Em>개인 소유</Em>). 골드를 들여 한
        단계씩 키웁니다.
      </P>
      <Table
        head={["단계", "내용", "비용"]}
        rows={[
          [
            <Em key="f">{TILE_TIER_LABEL.frontier}</Em>,
            "빈 칸에 건설 — 아직 영지는 없습니다.",
            `${TILE_FOUND_COST} 골드`,
          ],
          [
            <Em key="v">{TILE_TIER_LABEL.village}</Em>,
            "마을로 승격 — 3×3 영지를 얻습니다.",
            `${TILE_PROMOTE_COST.frontier} 골드`,
          ],
          [
            <Em key="c">{TILE_TIER_LABEL.city}</Em>,
            "도시로 승격.",
            `${TILE_PROMOTE_COST.village} 골드`,
          ],
          [
            <Em key="m">{TILE_TIER_LABEL.metropolis}</Em>,
            "대도시로 승격 — 최고 단계.",
            `${TILE_PROMOTE_COST.city} 골드`,
          ],
        ]}
        caption="비용은 지갑·은행 골드에서 빠집니다. 정착지 칸을 눌러 건설·승격·철거합니다."
      />

      <H2>거점 점령</H2>
      <UL>
        <li>
          지도의 <Em>거점</Em>은 <Em>1대1 일기토</Em>로 점령합니다. 빈 거점이면 NPC
          챔피언과, 이미 점령된 거점이면 점령자의 챔피언과 겨뤄 이기면 거점이
          넘어옵니다.
        </li>
        <li>중립 거점은 점령할 수 없습니다.</li>
        <li>
          점령·공성에는 <Em>길드 보유 골드</Em>가 듭니다(규모가 클수록 더 많이).
          길드 골드는 거점 금고 회수와 <Em>길드원의 입금</Em>(거점 화면의 「길드
          금고 입금」)으로 모으며, 모자라면 점령할 수 없습니다 — 거점은 길드
          자산이라 전쟁 비용도 길드가 함께 부담합니다.
        </li>
      </UL>

      <H2>약탈과 정복 — 위치와 인접</H2>
      <UL>
        <li>
          <Em>약탈</Em>은 그 정착지 <Em>칸에 직접 가 있어야</Em> 합니다 — 지도에서
          대상 칸으로 이동한 뒤 시도하세요. 수비대 1번과 겨뤄 이기면 거점 금고의
          50%를 빼앗습니다(점령은 안 함).
        </li>
        <li>
          <Em>정복</Em>은 <Em>내 길드 영지에 인접한(상하좌우) 칸</Em>만 칠 수
          있습니다 — 영토는 맞붙은 곳으로만 넓혀집니다.
        </li>
        <li>
          아직 <Em>땅이 없는 길드</Em>는 <Em>중립 거점(리베라) 옆 칸</Em>부터
          시작할 수 있습니다(첫 발판).
        </li>
      </UL>

      <H2>점령 보상 = 수입 + 통제</H2>
      <Table
        head={["축", "내용"]}
        rows={[
          [
            <Em key="i">수입</Em>,
            "외부인이 그 거점에서 사냥하면 골드 세금이 금고에 쌓입니다. 길드원이 회수하면 회수자 10% + 나머지는 길드 금고.",
          ],
          [
            <Em key="c">통제</Em>,
            "정책을 「개방」(외부 과세) 또는 「길드 전용」(다른 길드 사냥 차단)으로 설정.",
          ],
        ]}
        caption="세율은 점령자가 직접 정합니다(최소 10% · 최대 50%). NPC 운영 거점의 기본 세율은 15%."
      />
      <Note>
        보상이 <Em>전투력이 아니라 수입·통제</Em>인 게 핵심입니다 — 점령으로 더
        강해지는 게 아니라 길목을 쥐는 것이라, 강자 독식의 눈덩이를 피하도록
        설계되어 있습니다.
      </Note>

      <H2>침입자 토벌</H2>
      <UL>
        <li>
          다른 길드 모험가가 우리 거점에서 사냥하면 <Em>10 분간 추적</Em>됩니다.
        </li>
        <li>
          점령 길드원은 전투 탭의 <Em>토벌</Em>에서 1대1로 토벌해 쫓아낼 수
          있습니다.
        </li>
      </UL>

      <H2>NPC 공격</H2>
      <P>
        점령한 거점은 주기적으로 NPC 의 공격을 받습니다. 현 거점 카드에 「다음
        공격」 타이머가 표시되며, 이 타이머가 점령의 회전을 조절하는 장치이기도
        합니다.
      </P>
    </>
  );
}
