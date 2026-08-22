// 요리 개편 후 작물 떨이 교환은 조건 납품으로 대체되었다.
// 구 클라이언트가 v2 요리 상태를 레거시 모양으로 덮어쓰지 못하도록 명시적으로 종료한다.
export async function POST() {
  return Response.json(
    { ok: false, error: "cooking_surplus_retired" },
    { status: 410 },
  );
}
