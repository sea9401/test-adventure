import {
  CHAT_ROOM_INVITE_DAYS,
  CHAT_ROOM_JOINED_MAX,
  CHAT_ROOM_MEMBER_MAX,
  CHAT_ROOM_OWNED_MAX,
} from "@/lib/chat-rooms";
import {
  MARKETPLACE_V2_BID_GRACE_MAX_HOURS,
  MARKETPLACE_V2_BID_GRACE_MIN_HOURS,
  MARKETPLACE_V2_BUY_ORDER_LIMIT,
  MARKETPLACE_V2_BUY_ORDER_MAX_DAYS,
  MARKETPLACE_V2_DIRECT_LISTING_HOURS,
  MARKETPLACE_V2_FIXED_LISTING_HOURS,
  MARKETPLACE_V2_MIN_BID_RAISE_RATE,
} from "@/lib/server/marketplaceV2";
import {
  BULLETIN_ACTIVITY_LEVELS,
  BULLETIN_ACTIVITY_TITLE_REWARDS,
  BULLETIN_COMMENT_POINTS,
  BULLETIN_DAILY_COMMENT_CREDIT_LIMIT,
  BULLETIN_DAILY_POST_CREDIT_LIMIT,
  BULLETIN_POST_POINTS,
  BULLETIN_RECEIVED_LIKE_POINTS,
} from "@/lib/bulletinActivity";
import { H2, P, UL, Em, Table, Note, Code } from "./primitives";

const BULLETIN_TITLE_ROWS = BULLETIN_ACTIVITY_TITLE_REWARDS.map((reward) => {
  const level = BULLETIN_ACTIVITY_LEVELS.find((entry) => entry.level === reward.level);
  return [
    "Lv." + reward.level,
    (level?.minPoints.toLocaleString("ko-KR") ?? "-") + "점",
    reward.name,
  ];
});

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
            "다른 모험가가 등록한 장비·씨앗·농축산물·요리 재료·레어맵·완성 음식 등을 사고팝니다.",
          ],
          [
            <Em key="r">랭킹</Em>,
            "성장·전투·생활·도감 완성도와 숙련, 월간 연구 순위를 확인합니다.",
          ],
        ]}
      />

      <H2>게시판</H2>
      <P>
        게시글 본문은 마크다운을 지원합니다. 작성 화면의 <Em>미리보기</Em>에서
        실제 표시 형태를 확인한 뒤 등록할 수 있습니다.
      </P>
      <UL>
        <li>
          <Code>## 소제목</Code>, <Code>**굵게**</Code>, <Code>- 목록</Code>,{" "}
          <Code>&gt; 인용</Code>, 링크·표·코드 문법을 사용할 수 있습니다.
        </li>
        <li>
          기존 일반 텍스트 글의 줄바꿈도 그대로 유지됩니다. 제목과 댓글은 일반
          텍스트로 작성합니다.
        </li>
        <li>
          안전을 위해 HTML 직접 입력과 외부 이미지 삽입은 지원하지 않습니다.
        </li>
      </UL>

      <H2>게시판 활동 레벨</H2>
      <P>
        일반 게시판 활동은 <Em>게시글 {BULLETIN_POST_POINTS}점</Em>,
        <Em>댓글 {BULLETIN_COMMENT_POINTS}점</Em>,
        <Em>받은 좋아요 {BULLETIN_RECEIVED_LIKE_POINTS}점</Em>으로 누적됩니다. 게시글과
        댓글은 KST 하루 기준 각각
        <Em>
          게시글 {BULLETIN_DAILY_POST_CREDIT_LIMIT}개·댓글{" "}
          {BULLETIN_DAILY_COMMENT_CREDIT_LIMIT}개
        </Em>
        까지만 점수를 받습니다. 자신의 좋아요와 공지사항의 좋아요는 활동 점수에
        포함되지 않습니다.
      </P>
      <Table
        head={["활동 레벨", "필요 누적 점수", "영구 칭호"]}
        rows={BULLETIN_TITLE_ROWS}
        caption="활동 레벨은 Lv.20까지 이어집니다. Lv.15에는 광장 원로, Lv.20에는 광장의 전설 칭호를 얻습니다."
      />

      <H2>우편함</H2>
      <P>거래·선물·초대가 우편함으로 도착합니다.</P>
      <UL>
        <li>
          <Em>받은 우편</Em>에는 미확인·미수령·수령 완료 우편이 한 목록에 함께
          남습니다. 우편을 열면 읽음 처리되고, 보상이 있는 우편은 「수령」 또는
          <Em>전체 수령</Em>으로 골드·아이템을 받을 수 있습니다.
        </li>
        <li>
          오른쪽 위 <Em>쪽지 쓰기</Em>로 다른 모험가에게 글을 보냅니다.
        </li>
        <li>
          <Em>길드 초대</Em>는 수락/거절을 선택하고, 수락하면 그 길드에
          합류합니다.
        </li>
      </UL>

      <H2>거래소</H2>
      <P>
        장비·재료·레어맵·꾸미기 아이템·요리 음식·어종 표본을 등록하거나
        구매합니다. 기본 판매 방식은 <Em>즉시구매</Em>이며, 판매가 끝나면 세금을
        제외한 대금을 우편함으로 받습니다.
      </P>
      <UL>
        <li>
          즉시구매 매물은 등록 즉시 살 수 있고 <Em>{MARKETPLACE_V2_DIRECT_LISTING_HOURS}시간</Em>
          동안 노출됩니다. 더 높은 가격을 받아 보고 싶다면 공개 입찰을 선택할 수
          있습니다.
        </li>
        <li>
          재료·음식·스택 소모품은 <Em>개당 가격</Em>으로 등록합니다. 구매 목록에서는
          같은 품목의 매물이 한 줄로 합쳐지며, 원하는 수량을 입력하면 최저가 매물부터
          자동으로 나누어 구매합니다. 장비와 레어맵은 옵션·상태가 달라 개별 매물로
          표시됩니다.
        </li>
        <li>
          <Em>어종 표본</Em>은 수량형 소비품으로 등록·즉시구매·구매 주문할 수
          있습니다. 표본으로 채운 등록 권리도 다시 추출해 판매할 수 있습니다.
        </li>
        <li>
          구매 화면의 <Em>즉시구매·경매</Em> 전환으로 판매 방식을 나누어 보고,
          별표 즐겨찾기와 최근 검색어를 이용해 자주 찾는 품목을 다시 확인할 수
          있습니다.
        </li>
        <li>
          스택 품목의 <Em>시세·주문</Em>에서는 최근 30일 체결가 추이와 현재 판매·구매
          물량을 함께 확인합니다. 원하는 개당 가격과 수량으로 구매 주문을 걸면
          조건에 맞는 최저가 매물부터 자동 체결됩니다.
        </li>
        <li>
          장비도 정확한 이름과 최소 위력·품질, 최대 가격을 정해 구매 주문할 수
          있습니다. 판매 화면의 즉시 판매는 조건에 맞는 최고가 주문을 서버가
          자동으로 선택하며 구매자는 공개되지 않습니다. 장비 주문 가격은 NPC
          매입가보다 낮게 설정할 수 없습니다.
        </li>
        <li>
          장비 판매 가격을 입력하면 비슷한 위력·품질의 최근 시세를 참고할 수
          있습니다. 조건에 맞는 구매 주문이 여러 개 있으면 최대 10개까지 한 번에
          판매할 수 있으며, 확정 전에 예상 수량과 체결가 합계를 다시 보여 줍니다.
        </li>
        <li>
          구매 주문 골드는 등록 시 은행 골드까지 포함해 보관합니다. 체결 물품과
          더 쓰지 않은 잔여금은 우편함으로 도착하며, 미체결 주문은 직접 취소할 수
          있습니다. 한 번에 최대 <Em>{MARKETPLACE_V2_BUY_ORDER_LIMIT}개</Em>, 주문
          기간은 최대 <Em>{MARKETPLACE_V2_BUY_ORDER_MAX_DAYS}일</Em>입니다.
        </li>
        <li>
          가격 알림에 목표 개당 가격을 등록하면 그 이하의 새 매물이 나왔을 때
          우편으로 알려 줍니다. 내가 판매 중인 즉시구매 매물은 취소 후 다시 올리지
          않고도 판매 관리에서 가격을 변경할 수 있습니다.
        </li>
        <li>
          공개 입찰 유예는 <Em>{MARKETPLACE_V2_BID_GRACE_MIN_HOURS}~
          {MARKETPLACE_V2_BID_GRACE_MAX_HOURS}시간</Em> 중에서 정합니다. 이 시간에는
          즉시구매 대신 입찰만 할 수 있습니다.
        </li>
        <li>
          첫 입찰은 1골드부터 가능하고, 다음 입찰은 현재 최고가보다 최소{" "}
          {MARKETPLACE_V2_MIN_BID_RAISE_RATE * 100}% 높아야 합니다. 입찰금은 즉시
          보관되며 더 높은 입찰이 들어오면 밀려난 금액이 우편함으로 반환됩니다.
        </li>
        <li>
          유예 종료 때 최고 입찰이 즉시구매가를 넘었다면 최고 입찰자에게 판매됩니다.
          넘지 않았다면 <Em>{MARKETPLACE_V2_FIXED_LISTING_HOURS}시간</Em> 동안
          즉시구매 매물로 전환된 뒤, 팔리지 않으면 판매자에게 돌아갑니다.
        </li>
        <li>
          입찰이 한 번이라도 시작된 매물은 판매자가 취소할 수 없습니다. 내 입찰과
          환불·구매 물품·판매 대금은 거래소와 우편함에서 확인합니다.
        </li>
      </UL>

      <H2>거래 이용 제한</H2>
      <P>
        운영정책에 따라 거래 이용이 제한된 동안에도 일반 게임과 <Em>거래 정보 조회</Em>는
        이용할 수 있습니다. 다만 <Em>신규 등록·구매·입찰·구매 주문·선물</Em>과 길드
        창고·교역처럼 다른 이용자에게 자산을 옮기는 행위는 제한됩니다.
      </P>
      <P>
        제한 적용 전에 남은 매물과 주문은 안전하게 정리되며, 필요한
        <Em>취소·정산·환불</Em>과 시스템 우편 수령은 계속 처리할 수 있습니다. 제한이
        끝나도 정리된 매물과 주문이 자동으로 다시 등록되지는 않습니다.
      </P>

      <H2>공지·채팅</H2>
      <P>
        모험 탭에는 최근 공지가 표시됩니다. 화면 우하단의 채팅 버튼에서는{" "}
        <Em>전체·길드·사용자 채팅방</Em>과 협동 보스 알림을 확인합니다.
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

      <H2>랭킹</H2>
      <P>
        광장 → 랭킹에서는 레벨·명성·전투 횟수뿐 아니라 생활 숙련과 도감 기록도
        비교할 수 있습니다. <Em>도감 숙련</Em> 랭킹은 기존 수집률인 <Em>완성도</Em>, 누적 점수인
        <Em>종합 숙련</Em>, 장비·어류·생태·미식·현장·직업의 <Em>분야별</Em> 순위로
        나뉩니다.
      </P>
      <UL>
        <li>
          <Em>월간 연구</Em>는 진행 중인 시즌의 점수와 잠정 순위를 보여 줍니다. 종료
          전 순위와 예상 트로피는 확정 결과가 아닙니다.
        </li>
        <li>
          <Em>명예의 전당</Em>에는 결산·트로피 발급·공개까지 마친 종료 시즌의 확정
          순위와 트로피가 보존됩니다.
        </li>
      </UL>

      <Note>
        랭킹의 <Em>명성</Em>은 길드 정보에도 표시되는 누적 지표이고, 전투 횟수
        랭킹은 누가 가장 부지런히 사냥했는지를 보여줍니다.
      </Note>
    </>
  );
}
