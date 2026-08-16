import { describe, expect, it, vi } from "vitest";
import { confirmCoopBossPublication } from "./V2CoopBossDetailView";

describe("협동 보스 전체 공개 확인", () => {
  it("확인을 취소하면 공개 요청을 보내지 않고 확인창은 한 번만 표시한다", () => {
    const confirm = vi.fn(() => false);
    const onPublish = vi.fn();

    expect(confirmCoopBossPublication({ confirm, onPublish })).toBe(false);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith(
      expect.stringContaining("나만 또는 길드원만으로 되돌릴 수 없습니다"),
    );
    expect(onPublish).not.toHaveBeenCalled();
  });

  it("확인하면 공개 요청을 정확히 한 번 실행한다", () => {
    const confirm = vi.fn(() => true);
    const onPublish = vi.fn();

    expect(confirmCoopBossPublication({ confirm, onPublish })).toBe(true);
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(onPublish).toHaveBeenCalledTimes(1);
  });
});
