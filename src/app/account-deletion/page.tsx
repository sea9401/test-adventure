import type { Metadata } from "next";
import Link from "next/link";
import { PolicyDocument } from "@/components/PolicyDocument";

const UPDATED_DATE = "2026년 8월 8일";

export const metadata: Metadata = {
  title: "계정 및 데이터 삭제 — 무슨무슨게임",
  description: "무슨무슨게임 계정과 연결된 데이터의 삭제를 요청하는 방법입니다.",
  alternates: { canonical: "/account-deletion" },
};

export default function AccountDeletionPage() {
  return (
    <PolicyDocument
      title="계정 및 데이터 삭제"
      description="무슨무슨게임 계정과 연결된 데이터를 앱 안에서 직접 삭제하거나 웹에서 삭제를 요청하는 방법을 안내합니다."
      effectiveDate={UPDATED_DATE}
      dateLabel="최종 업데이트"
    >
      <section>
        <h2>앱에서 바로 삭제하기</h2>
        <ol>
          <li>무슨무슨게임에 로그인합니다.</li>
          <li>메뉴에서 ‘환경 설정’을 엽니다.</li>
          <li>‘계정 및 안내 → 회원 탈퇴 진행’을 선택합니다.</li>
          <li>화면에 안내된 확인 문구를 입력하고 삭제를 확정합니다.</li>
        </ol>
        <p className="mt-3">
          앱에서 완료한 탈퇴는 즉시 계정 로그인을 해제하고 운영 데이터베이스의 계정과 게임 데이터를 삭제합니다.
        </p>
      </section>

      <section>
        <h2>웹에서 삭제 요청하기</h2>
        <p>
          앱에 로그인할 수 없다면 아래 이메일로 삭제를 요청할 수 있습니다. 제목에 ‘무슨무슨게임 계정 삭제 요청’을 적고, 계정 확인을 위해 로그인에 사용한 이메일 주소와 게임 닉네임을 함께 보내주세요.
        </p>
        <p className="mt-3">
          <a href="mailto:sea9401@gmail.com?subject=%EB%AC%B4%EC%8A%A8%EB%AC%B4%EC%8A%A8%EA%B2%8C%EC%9E%84%20%EA%B3%84%EC%A0%95%20%EC%82%AD%EC%A0%9C%20%EC%9A%94%EC%B2%AD">
            sea9401@gmail.com으로 계정 삭제 요청 보내기
          </a>
        </p>
        <p className="mt-3">
          본인 확인을 마친 요청은 보통 7일 이내, 늦어도 30일 이내 처리합니다. 비밀번호나 OAuth 인증 토큰은 절대 요청하지 않습니다.
        </p>
      </section>

      <section>
        <h2>삭제되는 데이터</h2>
        <ul>
          <li>로그인 계정과 연결된 OAuth·세션 정보</li>
          <li>캐릭터, 성장, 재화, 아이템, 전투·거래·길드 등 게임 저장 데이터</li>
          <li>게시글, 댓글과 계정에 귀속된 커뮤니티 콘텐츠</li>
          <li>프로필 이미지, 문의 첨부 이미지와 계정 소유 길드의 엠블럼</li>
          <li>푸시 알림 구독 정보</li>
        </ul>
      </section>

      <section>
        <h2>일정 기간 남을 수 있는 데이터</h2>
        <ul>
          <li>완료된 콘텐츠 신고 기록은 분쟁 대응과 서비스 안전을 위해 계정 식별값과 이름을 익명화한 뒤 최대 180일 보관할 수 있습니다.</li>
          <li>보안·이상행동·접속 기록과 관리자 감사 기록은 개인정보처리방침에 정한 기간 동안 제한적으로 보관할 수 있습니다.</li>
          <li>장애 복구용 백업은 정상 서비스에서 분리되며 생성 후 최대 90일 안에 순환 삭제됩니다.</li>
          <li>관계 법령이 별도 보존을 요구하는 정보는 해당 법정 기간 동안만 보관합니다.</li>
        </ul>
        <p className="mt-3">
          자세한 항목과 보유 기간은 <Link href="/privacy">개인정보처리방침</Link>에서 확인할 수 있습니다.
        </p>
      </section>
    </PolicyDocument>
  );
}
