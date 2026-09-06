import { afterEach, expect, it, vi } from "vitest";
import { parseAutoActivity, parseMaterials, parseNextActionAt, requestAutoGathering } from "./gatheringClient";

afterEach(() => vi.unstubAllGlobals());

it("preserves gathering material, activity and cooldown parsing", () => {
  expect(parseMaterials({ ore: "3.9", log: -1, bad: "x" })).toEqual({ ore: 3, log: 0, bad: 0 });
  expect(parseMaterials(null)).toEqual({});
  expect(parseAutoActivity("mining")).toBe("mining");
  expect(parseAutoActivity("fishing")).toBeNull();
  expect(parseNextActionAt("123.9")).toBe(123);
  expect(parseNextActionAt(-1)).toBeNull();
});

it.each(["woodcutting", "mining"] as const)("uses the %s verification reader without swallowing challenges", async (activity) => {
  const response = new Response(null, { status: 403 });
  const fetchMock = vi.fn(async () => response);
  vi.stubGlobal("fetch", fetchMock);
  const readJson = vi.fn(async () => { throw new Error("verification required"); });
  await expect(requestAutoGathering(activity, { action: "claim" }, readJson)).rejects.toThrow("verification required");
  expect(fetchMock).toHaveBeenCalledWith(`/api/v2/${activity}/auto`, expect.objectContaining({ method: "POST", body: '{"action":"claim"}' }));
  expect(readJson).toHaveBeenCalledWith(response);
});
