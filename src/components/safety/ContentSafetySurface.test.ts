import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function source(path: string): string {
  return readFileSync(join(ROOT, path), "utf8");
}

describe("콘텐츠 신고 메뉴 노출 범위", () => {
  it("직접 신고할 수 있는 사용자 콘텐츠에만 메뉴를 둔다", () => {
    for (const path of [
      "src/components/chat/MessageList.tsx",
      "src/adventure/bulletin/PostDetailPage.tsx",
      "src/adventure/bulletin/CommentsPanel.tsx",
      "src/adventure/v2/V2InboxView.tsx",
      "src/adventure/v2/V2CharacterScreen.tsx",
    ]) {
      expect(source(path), path).toContain("<ContentSafetyActions");
    }
  });

  it("채팅방과 길드 탐색 화면에는 중복 신고 메뉴를 두지 않는다", () => {
    for (const path of [
      "src/components/ChatPanel.tsx",
      "src/components/chat/ChatRoomManager.tsx",
      "src/adventure/guild/GuildBrowsePanel.tsx",
      "src/adventure/rankings/RankingsView.tsx",
    ]) {
      expect(source(path), path).not.toContain("<ContentSafetyActions");
    }
  });
});
