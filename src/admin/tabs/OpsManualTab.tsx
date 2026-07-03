"use client";

const SECTIONS = [
  {
    title: "보상 문의 확인",
    steps: [
      "유저 탭에서 대상 유저를 선택하고 운영 요약을 확인합니다.",
      "최근 보상 수령, reward.failure.*, 숙련/증서 이벤트를 순서대로 봅니다.",
      "오늘 낚시 코인 획득량이 상한에 도달했는지 먼저 확인합니다.",
      "운영 현황의 보상 실패 보정 후보에서 원본 event id를 확인합니다.",
      "여러 실패 건은 운영 현황에서 검토 완료, 보정 완료, 제외 상태로 묶어 저장합니다.",
      "자주 쓰는 보상은 프리셋을 먼저 적용한 뒤 수량과 event id만 조정합니다.",
      "프리셋이 맞지 않으면 운영 현황의 보상 보정 프리셋 관리에서 수정합니다.",
      "실제 미지급이면 보상 보정 지급을 사용하고 사유와 원본 event id를 남깁니다.",
      "대량 지급 확인창이 뜨면 수량과 최근 보정 내역을 다시 확인합니다.",
    ],
  },
  {
    title: "매크로 의심 확인",
    steps: [
      "운영 현황의 매크로 의심 점수와 요청 제한 알림을 봅니다.",
      "의심 점수의 userId/IP 링크로 이상 행동 로그를 바로 필터링합니다.",
      "이상 행동 탭에서 userId, IP, action, reason으로 필터링합니다.",
      "통합 검색에서 userId/IP/event id를 입력해 경제 로그와 감사 로그까지 함께 봅니다.",
      "동일 IP 다계정이면 IP 공유 패턴을 확인하고, 단일 유저 반복이면 제재 후보로 봅니다.",
      "제재는 유저 노출 사유와 관리자 메모를 구분해서 남깁니다.",
      "차단 중인 유저는 제재 패널에서 1일/3일 연장 또는 해제를 처리합니다.",
      "정상 플레이도 제한에 걸리면 해당 API limit/window를 조정합니다.",
    ],
  },
  {
    title: "배포 후 점검",
    steps: [
      "GitHub Actions의 CI와 Deploy to EC2 성공을 확인합니다.",
      "/api/health의 ok/db ok, /api/version의 buildId를 확인합니다.",
      "운영 현황에서 webhook 설정, 알림 카드, 경제 이벤트 급증 여부를 확인합니다.",
      "운영 알림 이력에서 웹훅 전송 성공, 실패, 미설정 스킵 여부를 확인합니다.",
      "배포 로그에서 deploy-smoke 200과 주요 API 모듈 로드 여부를 확인합니다.",
      "새 마이그레이션이 있으면 관리자 화면에서 관련 API가 정상 조회되는지 봅니다.",
    ],
  },
  {
    title: "핫타임 운영",
    steps: [
      "운영 현황에서 제목, 기간, 골드/경험치/숙련/낚시 코인 배율을 입력합니다.",
      "활성화 상태와 시작/종료 시각이 맞을 때만 보너스가 적용됩니다.",
      "반복 예약은 요일과 KST 시각을 지정하고, 단발 핫타임이 없을 때 적용됩니다.",
      "겹치는 예약이나 단발 핫타임 충돌 경고가 나오면 시간대를 조정한 뒤 저장합니다.",
      "모험 첫 화면의 핫타임 배너에서 유저 노출 문구와 남은 시간을 확인합니다.",
      "사냥 결과와 낚시 결과에서 핫타임 보너스 표시를 확인합니다.",
      "설정 변경은 감사 로그에 남습니다.",
    ],
  },
  {
    title: "권한 점검",
    steps: [
      "상단 배지에서 현재 운영자 역할을 확인합니다.",
      "보상 지급은 reward 또는 super, 제재는 sanction 또는 super 권한이 필요합니다.",
      "권한 설정 인원수가 0이면 환경 변수 ADMIN_EMAILS 또는 OPS_*_EMAILS를 확인합니다.",
      "권한 변경은 EC2 .env.production.local 수정 후 서비스 재시작으로 반영합니다.",
      "변경 후 /admin 상단 권한 설정 인원수와 현재 계정 역할을 다시 확인합니다.",
      "읽기 전용 토글이 켜져 있으면 권한이 있어도 변경 버튼은 동작하지 않습니다.",
    ],
  },
];

export function OpsManualTab() {
  return (
    <section className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold">운영 매뉴얼</h3>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          반복 문의와 운영 점검을 처리할 때 보는 짧은 절차입니다.
        </p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        {SECTIONS.map((section) => (
          <section
            key={section.title}
            className="rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900"
          >
            <h4 className="text-xs font-semibold">{section.title}</h4>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-zinc-600 dark:text-zinc-300">
              {section.steps.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </section>
  );
}
