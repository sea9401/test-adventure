import type { Metadata } from "next";
import Link from "next/link";
import { PolicyDocument } from "@/components/PolicyDocument";

export const metadata: Metadata = {
  title: "서비스 이용 연령 기준 변경 안내 — 무슨무슨게임",
  description:
    "2026년 10월 4일부터 적용되는 무슨무슨게임의 만 14세 이상 서비스 이용 기준을 안내합니다.",
  alternates: { canonical: "/notices/minimum-age-policy" },
};

export default function MinimumAgePolicyNoticePage() {
  return (
    <PolicyDocument
      title="서비스 이용 연령 기준 변경 안내"
      description="만 14세 미만 아동의 개인정보를 별도 법정대리인 동의 절차 없이 처리하지 않도록 서비스 이용 연령 기준을 변경합니다."
      effectiveDate="2026년 10월 4일 00:00 (대한민국 표준시)"
    >
      <section>
        <p className="font-semibold">공지일: 2026년 9월 4일</p>
        <p className="mt-3">
          2026년 10월 4일 00:00부터 무슨무슨게임은 만 14세 이상인
          이용자에게만 로그인과 게임 이용을 제공합니다.
        </p>
      </section>

      <section>
        <h2>변경되는 내용</h2>
        <ul>
          <li>로그인 전에 본인이 만 14세 이상임을 확인해야 합니다.</li>
          <li>기존 이용자도 시행일 이후 처음 접속할 때 같은 확인을 거칩니다.</li>
          <li>만 14세 미만인 이용자는 시행일부터 로그인하거나 게임을 이용할 수 없습니다.</li>
          <li>확인하지 않으면 카카오 로그인과 운영자 발급 계정 로그인을 진행할 수 없습니다.</li>
        </ul>
      </section>

      <section>
        <h2>게임 등급과 서비스 기준</h2>
        <p>
          게임콘텐츠등급분류위원회가 결정한 게임 등급은 계속 12세이용가입니다.
          만 14세 이상 기준은 게임 내용 등급을 바꾸는 것이 아니라, 개인정보 처리와
          계정 운영을 위해 별도로 적용하는 서비스 이용 조건입니다.
        </p>
      </section>

      <section>
        <h2>연령 확인 정보</h2>
        <p>
          연령 확인 과정에서 생년월일은 수집하지 않습니다. 브라우저에는 만 14세 이상
          확인 여부와 확인 시각을 위조 방지 서명과 함께 최대 1년 동안 저장합니다.
          브라우저의 쿠키를 삭제하면 다시 확인해야 합니다.
        </p>
      </section>

      <section>
        <h2>약관과 계정 선택</h2>
        <p>
          변경된 내용은 <Link href="/terms">이용약관</Link>과{" "}
          <Link href="/privacy">개인정보처리방침</Link>에서 확인할 수 있습니다.
          변경에 동의하지 않거나 연령 기준을 충족하지 않는 경우 시행일 전에 게임
          메뉴에서 탈퇴하거나 <Link href="/account-deletion">계정 및 데이터 삭제 안내</Link>에
          따라 삭제를 요청할 수 있습니다.
        </p>
        <p className="mt-3">
          문의: <a href="mailto:sea9401@gmail.com">sea9401@gmail.com</a>
        </p>
      </section>
    </PolicyDocument>
  );
}
