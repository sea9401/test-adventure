import { beforeEach, describe, expect, it, vi } from "vitest";

type QueueRow = {
  id: number;
  kind: string;
  target: string;
  attempts: number;
};

const mocks = vi.hoisted(() => ({
  rows: [] as QueueRow[],
  deleteCount: 0,
  updates: [] as Array<Record<string, unknown>>,
  deleteProfile: vi.fn(async () => 0),
  deleteFeedback: vi.fn(async () => undefined),
  deleteGuild: vi.fn(async () => 0),
}));

vi.mock("@/db", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          orderBy: vi.fn(() => ({
            limit: vi.fn(async () => mocks.rows),
          })),
        })),
      })),
    })),
    delete: vi.fn(() => ({
      where: vi.fn(async () => {
        mocks.deleteCount += 1;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((values: Record<string, unknown>) => {
        mocks.updates.push(values);
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  },
}));
vi.mock("@/lib/server/profileImageStorage", () => ({
  deleteProfileImagesForUser: mocks.deleteProfile,
}));
vi.mock("@/lib/server/feedbackImageStorage", () => ({
  deleteFeedbackImage: mocks.deleteFeedback,
}));
vi.mock("@/lib/server/guildEmblemStorage", () => ({
  deleteGuildEmblemImagesForGuild: mocks.deleteGuild,
}));

import { processStorageDeletionQueue } from "./storageDeletionQueue";

describe("외부 저장소 삭제 재시도 큐", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rows = [];
    mocks.deleteCount = 0;
    mocks.updates = [];
    mocks.deleteProfile.mockResolvedValue(0);
    mocks.deleteFeedback.mockResolvedValue(undefined);
    mocks.deleteGuild.mockResolvedValue(0);
  });

  it("종류별 삭제를 실행하고 성공한 큐 행을 제거한다", async () => {
    mocks.rows = [
      { id: 1, kind: "profile_user", target: "user-id", attempts: 0 },
      { id: 2, kind: "feedback_image", target: "feedback-key", attempts: 0 },
      { id: 3, kind: "guild", target: "7", attempts: 0 },
    ];
    mocks.deleteProfile.mockResolvedValue(2);
    mocks.deleteGuild.mockResolvedValue(3);

    const result = await processStorageDeletionQueue({ ids: [1, 2, 3] });

    expect(result).toEqual({
      attempted: 3,
      completed: 3,
      failed: 0,
      objectsDeleted: 6,
    });
    expect(mocks.deleteProfile).toHaveBeenCalledWith("user-id");
    expect(mocks.deleteFeedback).toHaveBeenCalledWith("feedback-key");
    expect(mocks.deleteGuild).toHaveBeenCalledWith(7);
    expect(mocks.deleteCount).toBe(3);
    expect(mocks.updates).toEqual([]);
  });

  it("실패한 대상은 오류와 다음 재시도 시각을 기록해 큐에 남긴다", async () => {
    mocks.rows = [
      { id: 9, kind: "feedback_image", target: "feedback-key", attempts: 1 },
    ];
    mocks.deleteFeedback.mockRejectedValue(new Error("r2 unavailable"));

    const before = Date.now();
    const result = await processStorageDeletionQueue();

    expect(result).toEqual({
      attempted: 1,
      completed: 0,
      failed: 1,
      objectsDeleted: 0,
    });
    expect(mocks.updates).toHaveLength(1);
    expect(mocks.updates[0]).toMatchObject({
      attempts: 2,
      lastError: "r2 unavailable",
    });
    expect((mocks.updates[0].nextAttemptAt as Date).getTime()).toBeGreaterThan(
      before,
    );
  });
});
