export const dynamic = "force-static";

export const metadata = {
  title: "테스트 서버 운영중이지 않습니다",
  robots: { index: false, follow: false },
};

export default function StagingClosedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="max-w-md text-center space-y-4">
        <h1 className="text-2xl font-bold">테스트 서버 운영중이지 않습니다</h1>
        <p className="text-sm text-neutral-500 leading-relaxed">
          현재 점검 또는 작업 중이라 잠시 접근을 막아두었어요.
          <br />
          다음 테스트가 열리면 다시 방문해 주세요.
        </p>
      </div>
    </main>
  );
}
