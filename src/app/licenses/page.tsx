import type { Metadata } from "next";
import Link from "next/link";
import { PolicyDocument } from "@/components/PolicyDocument";

const NOTICE_DATE = "2026년 7월 29일";

export const metadata: Metadata = {
  title: "오픈소스 고지 — 무슨무슨게임",
  description: "무슨무슨게임에 사용된 오픈소스 소프트웨어와 글꼴 고지입니다.",
  alternates: { canonical: "/licenses" },
};

export default function LicensesPage() {
  return (
    <PolicyDocument
      title="오픈소스 고지"
      description="무슨무슨게임은 여러 오픈소스 프로젝트를 사용합니다. 각 구성요소의 저작권과 라이선스는 해당 권리자에게 있습니다."
      effectiveDate={NOTICE_DATE}
      dateLabel="고지 기준일"
    >
      <section>
        <h2>제3자 소프트웨어</h2>
        <p>
          현재 잠금 파일을 기준으로 런타임 패키지의 이름, 버전, 라이선스,
          원문 고지를 한 파일에 정리했습니다. 아래 문서는 패키지가 바뀔 때
          자동 검사와 함께 갱신됩니다.
        </p>
        <p className="mt-3">
          <a href="/third-party-notices.txt">제3자 소프트웨어 전체 고지문 보기</a>
        </p>
      </section>

      <section>
        <h2>Geist 글꼴</h2>
        <p>
          서비스의 Geist 및 Geist Mono 글꼴은 The Geist Project Authors가
          SIL Open Font License 1.1로 제공합니다.
        </p>
        <p className="mt-3">
          <a href="/licenses/geist-OFL-1.1.txt">Geist OFL 1.1 원문 보기</a>
          {" · "}
          <a href="https://github.com/vercel/geist-font">공식 소스 저장소</a>
        </p>
      </section>

      <section>
        <h2>서버 이미지 처리 구성요소</h2>
        <p>
          이미지 최적화에는 sharp와 libvips 구성요소가 사용될 수 있습니다.
          libvips 사전 빌드 패키지의 해당 소스와 빌드 정보는
          <a href="https://github.com/lovell/sharp-libvips"> sharp-libvips 공식 저장소</a>에서
          확인할 수 있습니다.
        </p>
      </section>

      <section>
        <h2>서비스 콘텐츠</h2>
        <p>
          이 페이지에 명시된 제3자 구성요소를 제외한 게임 코드, 문구, 이미지와
          서비스 표시는 별도 허락 없이 재사용할 수 있다는 뜻이 아닙니다. 이용자
          콘텐츠에 관한 사항은 <Link href="/terms">이용약관</Link>을 따릅니다.
        </p>
      </section>

      <section>
        <h2>누락 고지 문의</h2>
        <p>
          저작권 또는 라이선스 고지가 누락되었다고 판단되면 구성요소 이름과 근거를
          적어 <a href="mailto:sea9401@gmail.com">sea9401@gmail.com</a>으로 알려 주세요.
        </p>
      </section>
    </PolicyDocument>
  );
}
