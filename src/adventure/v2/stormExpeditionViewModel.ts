export function stormExpeditionEntryActions(attemptsLeft: number) {
  const canEnterNormal = attemptsLeft > 0;
  return {
    normal: {
      enabled: canEnterNormal,
      label: canEnterNormal ? "실전 출발" : "오늘 입장 완료",
    },
    practice: {
      enabled: true,
      label: "연습 시작",
      description: "입장 횟수 소모 없음 · 보상 없음",
    },
  } as const;
}
