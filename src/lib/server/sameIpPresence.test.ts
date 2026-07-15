import { beforeEach, describe, expect, it } from "vitest";
import {
  SAME_IP_PRESENCE_CONTINUOUS_MS,
  observeSameIpPresence,
  resetSameIpPresenceForTests,
} from "./sameIpPresence";

describe("sameIpPresence", () => {
  beforeEach(() => resetSameIpPresenceForTests());

  it("동일 IP의 두 계정이 30분 연속 하트비트를 보내면 계정 목록을 알린다", () => {
    let detected = null;
    for (let elapsed = 0; elapsed <= SAME_IP_PRESENCE_CONTINUOUS_MS; elapsed += 60_000) {
      detected ??= observeSameIpPresence({
        ip: "203.0.113.30",
        userId: "u1",
        name: "연이",
        now: elapsed,
      });
      detected ??= observeSameIpPresence({
        ip: "203.0.113.30",
        userId: "u2",
        name: "테스터",
        now: elapsed,
      });
    }
    expect(detected).toMatchObject({
      ip: "203.0.113.30",
      continuousMs: SAME_IP_PRESENCE_CONTINUOUS_MS,
      users: [
        { userId: "u1", name: "연이" },
        { userId: "u2", name: "테스터" },
      ],
    });
  });

  it("90초 넘게 하트비트가 끊기면 지속 시간을 다시 계산한다", () => {
    observeSameIpPresence({ ip: "203.0.113.31", userId: "u1", name: "A", now: 0 });
    observeSameIpPresence({ ip: "203.0.113.31", userId: "u2", name: "B", now: 0 });
    expect(
      observeSameIpPresence({
        ip: "203.0.113.31",
        userId: "u1",
        name: "A",
        now: SAME_IP_PRESENCE_CONTINUOUS_MS,
      }),
    ).toBeNull();
  });
});
