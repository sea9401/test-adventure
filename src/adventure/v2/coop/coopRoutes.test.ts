import { describe, expect, it } from "vitest";
import { coopBossSessionHref } from "./coopRoutes";

describe("coopBossSessionHref", () => {
  it("보스 처치 알림을 해당 세션의 보상 수령 화면으로 연결한다", () => {
    expect(coopBossSessionHref("session/37")).toBe(
      "/battle/coop/session%2F37",
    );
  });

  it("과거 알림에 세션 식별자가 없으면 협동 보스 목록으로 안전하게 이동한다", () => {
    expect(coopBossSessionHref(" ")).toBe("/battle/coop");
  });
});
