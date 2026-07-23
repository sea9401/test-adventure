import {
  CHAT_ROOM_INVITE_DAYS,
  CHAT_ROOM_JOINED_MAX,
  CHAT_ROOM_MEMBER_MAX,
  CHAT_ROOM_OWNED_MAX,
} from "@/lib/chat-rooms";
import {
  LOTTERY_FEE_PERCENT,
  LOTTERY_MAX_TICKETS_PER_ROUND,
  LOTTERY_MIN_PARTICIPANTS_TO_DRAW,
  LOTTERY_TICKET_PRICE,
} from "@/lib/lottery";
import { H2, P, UL, Em, Table, Note, Code } from "./primitives";

export function PlazaContent() {
  return (
    <>
      <H2>광장</H2>
      <P>
        광장은 다른 모험가와 소식과 물품을 주고받는 공간입니다. 상단바 오른쪽의
        메뉴에서 들어갈 수 있습니다.
      </P>
      <Table
        head={["곳", "역할"]}
        rows={[
          [<Em key="b">게시판</Em>, "모험가들이 글을 올리는 곳(공지 포함)."],
          [
            <Em key="f">전체 소식</Em>,
            "유니크 드랍·고강화 성공·협동 보스 토벌 같은 주요 기록을 확인하는 방송.",
          ],
          [
            <Em key="i">우편함</Em>,
            "쪽지·거래 정산·선물·길드 초대를 확인합니다.",
          ],
          [
            <Em key="m">거래소</Em>,
            "다른 모험가가 등록한 장비·재료·레어맵·요리 음식 등 거래 가능 소모품을 사고팝니다.",
          ],
          [
            <Em key="r">랭킹</Em>,
            "레벨·명성·전투 횟수 등 모험가 순위를 확인합니다.",
          ],
        ]}
      />

      <H2>우편함</H2>
      <P>거래·선물·초대가 우편함으로 도착합니다.</P>
      <UL>
        <li>
          <Em>받은 우편</Em>의 「수령」으로 골드·아이템을 받고, 쪽지는 「확인」으로
          읽습니다. 수령한 우편은 <Em>지난 우편</Em>에 기록으로 남습니다.
        </li>
        <li>
          오른쪽 위 <Em>쪽지 쓰기</Em>로 다른 모험가에게 글을 보냅니다.
        </li>
        <li>
          <Em>길드 초대</Em>는 수락/거절을 선택하고, 수락하면 그 길드에
          합류합니다.
        </li>
      </UL>

      <H2>공지·채팅</H2>
      <P>
        모험 탭에는 최근 공지가 표시됩니다. 상단바의 채팅 버튼에서는{" "}
        <Em>전체·길드·사용자 채팅방·복권방</Em>과 협동 보스 알림을 확인합니다.
        길드 채팅은 길드에 가입한 모험가만 사용할 수 있습니다.
      </P>
      <UL>
        <li>
          사용자 채팅방은 공개 또는 비공개로 만들 수 있습니다. 공개방은 목록에서
          바로 참여하고, 비공개방은 초대를 수락해야 들어갈 수 있습니다.
        </li>
        <li>
          한 이용자는 최대 <Em>{CHAT_ROOM_OWNED_MAX}개</Em>의 방을 만들고, 최대{" "}
          <Em>{CHAT_ROOM_JOINED_MAX}개</Em>의 사용자 채팅방에 참여할 수 있습니다. 방당
          최대 인원은 {CHAT_ROOM_MEMBER_MAX}명입니다.
        </li>
        <li>
          비공개방 초대는 {CHAT_ROOM_INVITE_DAYS}일간 유지됩니다. 방장이 아닌 참여자는
          언제든 방에서 나갈 수 있습니다.
        </li>
        <li>
          전체·길드·사용자 채팅방에서는 욕설과 부적절한 표현을 검사합니다.
          차단된 메시지는 저장·전송되지 않으며, 전송하지 못한 이유가 바로
          표시됩니다.
        </li>
      </UL>
      <P>
        현재 접속자 수와 접속자 명단은 대문이나 채팅창에 표시하지 않으며,
        일반 이용자에게 공개되지 않습니다.
      </P>

      <H2>복권방</H2>
      <P>
        복권방에서 <Code>/복권</Code> 또는 <Code>/복권 1~10</Code>을 입력해
        매시 정각에 추첨하는 복권을 구매합니다.
      </P>
      <UL>
        <li>
          한 장에 <Em>{LOTTERY_TICKET_PRICE.toLocaleString("ko-KR")}골드</Em>이며, 한 회차에
          최대 {LOTTERY_MAX_TICKETS_PER_ROUND}장까지 구매할 수 있습니다.
        </li>
        <li>
          총 구매액에서 수수료 {LOTTERY_FEE_PERCENT}%를 제외한 상금을 1등 70%,
          2등 20%, 3등 10%로 나누어 지급합니다.
        </li>
        <li>
          고유 참여자가 <Em>{LOTTERY_MIN_PARTICIPANTS_TO_DRAW}명 이상</Em>일 때만 추첨합니다.
          참여자가 부족하면 수수료를 제외한 상금 전액을 다음 회차로 이월합니다.
        </li>
        <li>
          서로 다른 티켓 번호를 추첨하므로 여러 장을 산 이용자는 복수 등수에
          당첨될 수 있습니다. 현재 상금·참여 인원·내 티켓과 최근 최대 10회의
          추첨·이월·환불 결과는 복권방에서 확인합니다.
        </li>
        <li>
          각 추첨 결과의 commit과 secret 값을 펼쳐 추첨 검증값도 확인할 수 있습니다.
        </li>
      </UL>

      <Note>
        랭킹의 <Em>명성</Em>은 길드 정보에도 표시되는 누적 지표이고, 전투 횟수
        랭킹은 누가 가장 부지런히 사냥했는지를 보여줍니다.
      </Note>
    </>
  );
}
