import { describe, expect, it } from "vitest";
import {
  avatarImageSrc,
  isStoredAvatarId,
  isValidAvatarId,
  normalizeProfileImageObjectKey,
} from "./avatars";

const KEY =
  "profile-images/123e4567-e89b-42d3-a456-426614174000/223e4567-e89b-42d3-b456-426614174000.webp";

describe("커스텀 프로필 이미지 키", () => {
  it("서버가 만든 R2 키만 저장값으로 허용하고 앱 경로로 바꾼다", () => {
    expect(normalizeProfileImageObjectKey(` ${KEY} `)).toBe(KEY);
    expect(isStoredAvatarId(KEY)).toBe(true);
    expect(isValidAvatarId(KEY)).toBe(false);
    expect(avatarImageSrc(KEY)).toBe(
      "/api/profile/image/123e4567-e89b-42d3-a456-426614174000/223e4567-e89b-42d3-b456-426614174000.webp",
    );
  });

  it("외부 URL과 경로 조작 값은 거부한다", () => {
    expect(normalizeProfileImageObjectKey("https://example.com/avatar.png")).toBeNull();
    expect(normalizeProfileImageObjectKey("profile-images/../avatar.webp")).toBeNull();
  });
});
