import { describe, expect, it } from "vitest";
import { isNoticeMessage } from "./chat-config";

describe("isNoticeMessage", () => {
  it("협동/월드 보스 broadcast className 은 모두 알림 탭으로 분리된다", () => {
    // coopRespawn(스폰): isWorldBoss → "월드 보스", 아니면 "협동 보스".
    expect(isNoticeMessage({ className: "월드 보스" })).toBe(true);
    expect(isNoticeMessage({ className: "협동 보스" })).toBe(true);
    // bossState(처치): "협동 토벌".
    expect(isNoticeMessage({ className: "협동 토벌" })).toBe(true);
  });

  it("일반 유저 채팅(직업명 등)은 알림이 아니다", () => {
    expect(isNoticeMessage({ className: "전사" })).toBe(false);
    expect(isNoticeMessage({ className: "" })).toBe(false);
  });
});
