import { describe, expect, it, vi } from "vitest";
import {
  confirmPresetDelete,
  confirmPresetOverwrite,
} from "./presetConfirmation";

describe("프리셋 변경 확인", () => {
  it("덮어쓰기를 취소하면 프리셋을 변경하지 않는다", async () => {
    const confirm = vi.fn(async () => false);
    const onConfirm = vi.fn();

    expect(
      await confirmPresetOverwrite({ name: "보스 사냥", confirm, onConfirm }),
    ).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(confirm).toHaveBeenCalledWith({
      title: "프리셋 덮어쓰기",
      message:
        "'보스 사냥' 프리셋을 현재 세팅으로 덮어쓸까요?\n기존에 저장된 구성은 복구할 수 없습니다.",
      confirmLabel: "덮어쓰기",
      cancelLabel: "취소",
      tone: "warning",
    });
  });

  it("덮어쓰기를 확인하면 변경을 한 번만 실행한다", async () => {
    const onConfirm = vi.fn();

    expect(
      await confirmPresetOverwrite({
        name: "보스 사냥",
        confirm: vi.fn(async () => true),
        onConfirm,
      }),
    ).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("삭제 확인창은 대상 이름과 위험 동작을 알린다", async () => {
    const confirm = vi.fn(async () => true);
    const onConfirm = vi.fn();

    expect(
      await confirmPresetDelete({ name: "생활 세팅", confirm, onConfirm }),
    ).toBe(true);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(confirm).toHaveBeenCalledWith({
      title: "프리셋 삭제",
      message:
        "'생활 세팅' 프리셋을 삭제할까요?\n삭제한 프리셋은 복구할 수 없습니다.",
      confirmLabel: "삭제",
      cancelLabel: "취소",
      tone: "danger",
    });
  });

  it("삭제를 취소하면 프리셋을 유지한다", async () => {
    const onConfirm = vi.fn();

    expect(
      await confirmPresetDelete({
        name: "생활 세팅",
        confirm: vi.fn(async () => false),
        onConfirm,
      }),
    ).toBe(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
