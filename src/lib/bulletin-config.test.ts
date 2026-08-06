import { describe, expect, it } from "vitest";
import {
  BULLETIN_MAX_LENGTH,
  BULLETIN_NOTICE_MAX_LENGTH,
  bulletinMaxLength,
} from "./bulletin-config";

describe("게시판 본문 길이 제한", () => {
  it("공지는 20000자까지 허용한다", () => {
    expect(BULLETIN_NOTICE_MAX_LENGTH).toBe(20_000);
    expect(bulletinMaxLength("notice")).toBe(20_000);
  });

  it("일반 게시글은 기존 4000자 제한을 유지한다", () => {
    expect(BULLETIN_MAX_LENGTH).toBe(4_000);
    expect(bulletinMaxLength("free")).toBe(4_000);
    expect(bulletinMaxLength("guide")).toBe(4_000);
  });
});
