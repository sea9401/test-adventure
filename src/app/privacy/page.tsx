import type { Metadata } from "next";
import { PolicyDocument } from "@/components/PolicyDocument";

const EFFECTIVE_DATE = "2026년 7월 27일";

export const metadata: Metadata = {
  title: "개인정보처리방침 — 무슨무슨게임",
  description: "무슨무슨게임의 개인정보 수집·이용 및 보호 기준입니다.",
  alternates: { canonical: "/privacy" },
};

export default function PrivacyPage() {
  return (
    <PolicyDocument
      title="개인정보처리방침"
      description="무슨무슨게임 운영자(이하 ‘운영자’)는 서비스 제공에 필요한 범위에서 개인정보를 처리하며, 이용자의 정보를 안전하게 보호하기 위해 노력합니다."
      effectiveDate={EFFECTIVE_DATE}
    >
      <section>
        <h2>1. 처리하는 개인정보와 이용 목적</h2>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>구분</th>
                <th>처리 항목</th>
                <th>이용 목적</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>카카오 로그인</td>
                <td>카카오 회원 식별자, 이메일, 닉네임, 프로필 이미지, OAuth 인증 정보</td>
                <td>회원 식별, 로그인, 계정 복구와 보안</td>
              </tr>
              <tr>
                <td>운영자 발급 계정</td>
                <td>로그인 아이디, 암호화된 비밀번호, 연결된 이메일</td>
                <td>해외 이용자·심사 계정의 로그인 제공</td>
              </tr>
              <tr>
                <td>게임 이용</td>
                <td>게임 닉네임, 캐릭터와 성장 정보, 저장 데이터, 재화·거래·길드·전투·랭킹 기록</td>
                <td>게임 진행 저장, 콘텐츠 제공, 부정 이용 방지, 오류 복구</td>
              </tr>
              <tr>
                <td>커뮤니티와 문의</td>
                <td>채팅, 게시글, 댓글, 신고·건의 내용, 첨부 이미지, 처리 답변</td>
                <td>커뮤니티 제공, 문의 처리, 분쟁과 운영 기록 확인</td>
              </tr>
              <tr>
                <td>자동 생성 정보</td>
                <td>IP 주소, 접속·행동 시각, 세션·기기 식별자, 요청 정보, 쿠키와 로컬 저장소 값</td>
                <td>접속 유지, 기기 세션 관리, 보안, 속도 제한, 장애 분석, 환경설정 저장</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          카카오에서 이메일을 제공하지 않는 경우 계정 연결을 위해 카카오 회원 식별자를 바탕으로 만든 대체 식별용 이메일이 내부에 저장될 수 있습니다.
        </p>
      </section>

      <section>
        <h2>2. 처리와 보유 기간</h2>
        <p>개인정보는 원칙적으로 목적이 달성되거나 회원이 탈퇴하면 지체 없이 파기합니다. 다만 서비스 안전과 기록의 성격에 따라 다음 기간 동안 보관할 수 있습니다.</p>
        <div className="mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>정보</th>
                <th>보유 기간</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>계정, 게임 저장 데이터, 게시글·댓글·문의 등 회원 귀속 정보</td><td>회원 탈퇴 시까지</td></tr>
              <tr><td>채팅 메시지</td><td>작성 후 3일</td></tr>
              <tr><td>전체 소식 기록</td><td>발생 후 3개월</td></tr>
              <tr><td>이상행동·보안 이벤트</td><td>발생 후 90일</td></tr>
              <tr><td>재화 변동·경제 감사 이벤트</td><td>발생 후 180일</td></tr>
              <tr>
                <td>프로필 이미지</td>
                <td>교체·삭제 또는 회원 탈퇴 시까지</td>
              </tr>
              <tr>
                <td>길드 엠블럼 이미지</td>
                <td>교체·삭제 또는 길드 해산 시까지</td>
              </tr>
              <tr>
                <td>문의 첨부 이미지</td>
                <td>문의 기록 삭제 또는 회원 탈퇴 시까지</td>
              </tr>
              <tr><td>데이터베이스 백업</td><td>생성 후 최대 90일</td></tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          관계 법령에서 별도의 보존 의무를 정한 경우에는 해당 기간을 따릅니다. 백업 데이터는 장애 복구 목적으로만 격리 보관하며, 정상 서비스에서 조회하거나 다른 목적으로 이용하지 않습니다.
        </p>
      </section>

      <section>
        <h2>3. 제3자 제공</h2>
        <p>
          운영자는 이용자의 개인정보를 원칙적으로 제3자에게 제공하지 않습니다. 이용자가 미리 동의한 경우 또는 법령에 근거가 있는 경우에만 필요한 범위에서 제공합니다.
        </p>
      </section>

      <section>
        <h2>4. 외부 서비스와 처리 인프라</h2>
        <p>
          서비스 운영을 위해 다음 외부 사업자의 서비스를 이용합니다. 운영자는 업무 수행에 필요한 정보만 처리하고 접근 권한을 제한합니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>외부 사업자</th>
                <th>처리 업무</th>
                <th>주 처리·저장 위치</th>
                <th>보유 기준</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>주식회사 카카오</td>
                <td>소셜 로그인과 회원 인증</td>
                <td>대한민국</td>
                <td>카카오 계정 및 서비스 연결 정책에 따름</td>
              </tr>
              <tr>
                <td>Amazon Web Services</td>
                <td>서버 운영, 데이터베이스와 백업 보관</td>
                <td>대한민국 서울 리전(<code>ap-northeast-2</code>)</td>
                <td>제2조의 항목별 보유 기간에 따름</td>
              </tr>
              <tr>
                <td>Cloudflare, Inc. (R2)</td>
                <td>이용자가 등록한 프로필·길드 엠블럼·문의 첨부 이미지 보관과 전송</td>
                <td>미국 및 아시아·태평양 지역(APAC)</td>
                <td>제2조의 이미지별 보유 기간에 따름</td>
              </tr>
            </tbody>
          </table>
        </div>

        <h3>Cloudflare R2 국외 처리에 관한 안내</h3>
        <p>
          선택형 이미지 기능을 제공하려면 이미지 파일을 Cloudflare R2에 보관해야 합니다. 이는 이용자와의 서비스 이용계약 이행에 필요한 처리위탁·보관으로서, 개인정보 보호법 제28조의8 제1항 제3호에 따라 다음 사항을 공개합니다.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table>
            <tbody>
              <tr>
                <th>이전되는 항목</th>
                <td>
                  이용자가 올린 프로필 이미지, 길드 엠블럼, 문의 첨부 이미지와 이미지에 이용자가 직접 포함한 정보, 프로필 이미지 객체 경로의 사용자 UUID, 길드 엠블럼 객체 경로의 길드 ID
                </td>
              </tr>
              <tr>
                <th>이전 국가</th>
                <td>미국(수탁자 소재·글로벌 운영) 및 아시아·태평양 지역(APAC, 객체 저장 위치)</td>
              </tr>
              <tr>
                <th>이전 시점과 방법</th>
                <td>이용자가 이미지를 등록·조회·삭제할 때 서버가 암호화된 HTTPS API로 전송</td>
              </tr>
              <tr>
                <th>이전받는 자</th>
                <td>
                  Cloudflare, Inc. (101 Townsend St., San Francisco, CA 94107, USA /{" "}
                  <a href="mailto:privacyquestions@cloudflare.com">privacyquestions@cloudflare.com</a>)
                </td>
              </tr>
              <tr>
                <th>이용 목적</th>
                <td>이미지 객체의 저장, 조회, 전송과 삭제</td>
              </tr>
              <tr>
                <th>보유·이용 기간</th>
                <td>프로필 이미지는 교체·삭제 또는 회원 탈퇴 시까지, 길드 엠블럼은 교체·삭제 또는 길드 해산 시까지, 문의 첨부 이미지는 문의 기록 삭제 또는 회원 탈퇴 시까지</td>
              </tr>
              <tr>
                <th>이전을 거부하는 방법과 영향</th>
                <td>
                  이미지 등록을 하지 않거나 이미 등록한 프로필·길드 엠블럼을 삭제해 국외 이전을 거부할 수 있습니다. 이미 제출한 문의 첨부 이미지의 삭제는 제9조의 문의처로 요청할 수 있습니다. 거부하더라도 기본 게임 기능과 텍스트 문의는 이용할 수 있지만, 사용자 등록 프로필·길드 엠블럼·문의 첨부 이미지 기능은 이용할 수 없습니다.
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3">
          현재 R2 버킷에서 확인되는 위치 값은 APAC입니다. Cloudflare가 공개한 설명상 APAC은 특정 국가를 보장하는 관할권이 아니라 최선 노력 방식의 위치 힌트이므로 실제 저장 국가는 지역 안에서 달라질 수 있습니다. 자세한 내용은{" "}
          <a href="https://developers.cloudflare.com/r2/reference/data-location/">
            Cloudflare R2 데이터 위치 안내
          </a>
          에서 확인할 수 있습니다. 운영자는 저장 위치나 사업자 구성이 바뀌면 이 방침을 갱신합니다.
        </p>
      </section>

      <section>
        <h2>5. 파기 절차와 방법</h2>
        <p>
          회원은 게임 메뉴의 ‘회원 탈퇴’에서 탈퇴할 수 있습니다. 탈퇴가 완료되면 운영 데이터베이스의 계정과 연결 정보는 삭제되고, 별도 저장된 첨부 이미지 등은 연결 관계를 확인해 파기합니다. 백업에 남은 정보는 보관 주기가 끝나면 복구하기 어려운 방법으로 삭제됩니다.
        </p>
      </section>

      <section>
        <h2>6. 이용자의 권리와 행사 방법</h2>
        <p>
          이용자는 자신의 정보에 대한 열람, 정정, 삭제, 처리 정지를 요청할 수 있습니다. 게임 내 프로필과 회원 탈퇴 기능을 이용하거나, 아래 개인정보 보호 문의처로 요청할 수 있습니다. 운영자는 본인 확인 후 관계 법령이 정한 범위에서 처리합니다.
        </p>
      </section>

      <section>
        <h2>7. 쿠키와 기기 저장소</h2>
        <p>
          서비스는 로그인 유지, 활성 기기 확인, 홍보 링크 적용을 위해 필수 쿠키를 사용합니다. 테마, 채팅 표시 방식, 알림, 사냥 설정과 같은 이용자 선택은 브라우저의 로컬 저장소에 보관될 수 있습니다. 광고 추적용 쿠키나 제3자 분석 도구는 현재 사용하지 않습니다.
        </p>
        <p className="mt-3">
          이용자는 브라우저 설정에서 쿠키와 사이트 데이터를 삭제할 수 있습니다. 필수 쿠키를 차단하면 로그인이나 일부 기능이 정상적으로 동작하지 않을 수 있습니다.
        </p>
      </section>

      <section>
        <h2>8. 안전성 확보 조치</h2>
        <ul>
          <li>비밀번호 단방향 암호화와 인증 정보 접근 제한</li>
          <li>전송 구간 암호화, 데이터베이스 TLS 연결과 비밀정보 분리 관리</li>
          <li>관리자 권한 제한, 중요 작업 감사 기록과 이상행동 탐지</li>
          <li>백업, 복구 점검과 보관기간이 지난 운영 기록의 정기 정리</li>
        </ul>
      </section>

      <section>
        <h2>9. 개인정보 보호 문의처</h2>
        <p>
          담당: 무슨무슨게임 운영자<br />
          이메일: <a href="mailto:sea9401@gmail.com">sea9401@gmail.com</a>
        </p>
      </section>

      <section>
        <h2>10. 방침의 변경</h2>
        <p>
          이 방침의 내용이 바뀌면 시행 전에 서비스 공지나 이 페이지를 통해 변경 내용과 시행일을 알립니다. 이용자 권리에 중대한 영향을 주는 변경은 충분한 안내 기간을 둡니다.
        </p>
      </section>
    </PolicyDocument>
  );
}
