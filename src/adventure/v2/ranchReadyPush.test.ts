import { describe, expect, it } from "vitest";
import { emptyFarmState } from "./farm";
import {
  addRanchFeed,
  emptyRanchState,
  settleRanch,
  unlockRanchSlot,
  type RanchState,
} from "./ranch";
import {
  pendingRanchReadyPush,
  ranchReadyPushCandidates,
} from "./ranchReadyPush";

const HOUR = 60 * 60 * 1_000;
const START = 1_000;

function farmWithRanch(ranch: RanchState) {
  return { ...emptyFarmState(START), ranch };
}

describe("ranch ready push", () => {
  it("생산 완료 경계에서 후보를 만들고 새 생산 전까지 같은 키를 유지한다", () => {
    const ranch = addRanchFeed(
      emptyRanchState(START),
      "slot-1",
      2,
      START,
    );
    const firstReadyAt = START + 2 * HOUR;

    expect(
      ranchReadyPushCandidates(
        "user-1",
        farmWithRanch(ranch),
        firstReadyAt - 1,
      ),
    ).toEqual([]);
    expect(
      ranchReadyPushCandidates(
        "user-1",
        farmWithRanch(ranch),
        firstReadyAt,
      ),
    ).toEqual([
      {
        animalId: "chicken",
        outputName: "달걀",
        eventKey: "ranch:user-1:chicken:1:1",
      },
    ]);

    const persisted = settleRanch(ranch, firstReadyAt + HOUR);
    expect(
      ranchReadyPushCandidates(
        "user-1",
        farmWithRanch(persisted),
        firstReadyAt + HOUR,
      ),
    ).toEqual([
      {
        animalId: "chicken",
        outputName: "달걀",
        eventKey: "ranch:user-1:chicken:1:1",
      },
    ]);
    expect(
      ranchReadyPushCandidates(
        "user-1",
        farmWithRanch(persisted),
        START + 4 * HOUR,
      ),
    ).toEqual([
      {
        animalId: "chicken",
        outputName: "달걀",
        eventKey: "ranch:user-1:chicken:2:2",
      },
    ]);
  });

  it("서로 다른 시각에 끝난 돼지 두 마리를 안정된 완료 상태로 구분한다", () => {
    let ranch = unlockRanchSlot(
      emptyRanchState(START),
      "slot-2",
      "pig",
      100,
      START,
    ).ranch;
    ranch = addRanchFeed(ranch, "slot-2", 2, START + 6 * HOUR);

    expect(
      ranchReadyPushCandidates(
        "user-1",
        farmWithRanch(ranch),
        START + 12 * HOUR,
      ),
    ).toEqual([
      {
        animalId: "pig",
        outputName: "돼지고기",
        eventKey: "ranch:user-1:pig:1:1",
      },
    ]);
    expect(
      ranchReadyPushCandidates(
        "user-1",
        farmWithRanch(ranch),
        START + 18 * HOUR,
      ),
    ).toEqual([
      {
        animalId: "pig",
        outputName: "돼지고기",
        eventKey: "ranch:user-1:pig:2:2",
      },
    ]);
  });

  it("이미 전송한 동물을 빼고 새 생산물만 한 알림으로 묶는다", () => {
    let ranch = addRanchFeed(
      emptyRanchState(START),
      "slot-1",
      1,
      START,
    );
    ranch = unlockRanchSlot(ranch, "slot-2", "cow", 100, START).ranch;
    ranch = addRanchFeed(ranch, "slot-2", 1, START);
    ranch = unlockRanchSlot(ranch, "slot-3", "pig", 100, START).ranch;
    const candidates = ranchReadyPushCandidates(
      "user-1",
      farmWithRanch(ranch),
      START + 12 * HOUR,
    );

    expect(
      pendingRanchReadyPush(
        candidates,
        new Set(["ranch:user-1:cow:1:1"]),
      ),
    ).toEqual({
      eventKeys: [
        "ranch:user-1:chicken:1:1",
        "ranch:user-1:pig:1:1",
      ],
      body: "달걀, 돼지고기를 수확할 수 있습니다.",
    });
    expect(
      pendingRanchReadyPush(
        candidates,
        new Set(candidates.map((candidate) => candidate.eventKey)),
      ),
    ).toBeNull();
  });
});
