import { describe, expect, it } from "vitest";

import { GhCliClient } from "./github";

describe("GhCliClient", () => {
  it("validates typed PR JSON at the gh boundary", async () => {
    const client = new GhCliClient({
      exec: async () => ({
        exitCode: 0,
        stdout: JSON.stringify([
          {
            number: 2501,
            state: "OPEN",
            baseRefName: "staging",
            headRefName: "feat/echo-warden",
            url: "https://github.com/sea9401/test-adventure/pull/2501",
          },
        ]),
        stderr: "",
      }),
    });

    await expect(
      client.findPullRequest("feat/echo-warden"),
    ).resolves.toMatchObject({ number: 2501, baseRefName: "staging" });
  });

  it("rejects malformed JSON and non-GitHub URLs", async () => {
    const malformed = new GhCliClient({
      exec: async () => ({ exitCode: 0, stdout: "not-json", stderr: "" }),
    });
    await expect(malformed.findPullRequest("feat/x")).rejects.toThrow(
      "gh returned invalid JSON",
    );
    const wrongUrl = new GhCliClient({
      exec: async () => ({
        exitCode: 0,
        stdout: JSON.stringify([
          {
            number: 1,
            state: "OPEN",
            baseRefName: "staging",
            headRefName: "feat/x",
            url: "https://example.com/pull/1",
          },
        ]),
        stderr: "",
      }),
    });
    await expect(wrongUrl.findPullRequest("feat/x")).rejects.toThrow(
      "invalid GitHub pull request",
    );
  });
});
