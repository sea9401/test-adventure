import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/server/ensureUser", () => ({
  ensureUser: vi.fn(async () => "u-association"),
}));
vi.mock("@/lib/server/adventurerAssociation", () => ({
  canUseAdventurerAssociation: vi.fn(async () => true),
  readAssociationFacilities: vi.fn(async () => []),
}));

import { ensureUser } from "@/lib/server/ensureUser";
import {
  canUseAdventurerAssociation,
  readAssociationFacilities,
} from "@/lib/server/adventurerAssociation";
import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(ensureUser).mockResolvedValue("u-association");
  vi.mocked(canUseAdventurerAssociation).mockResolvedValue(true);
  vi.mocked(readAssociationFacilities).mockResolvedValue([]);
});

describe("모험가 협회 시설 현황", () => {
  it("길드 가입자는 협회 API를 직접 호출해도 거부한다", async () => {
    vi.mocked(canUseAdventurerAssociation).mockResolvedValue(false);

    const response = await GET();

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({
      ok: false,
      error: "association_for_solo_only",
    });
    expect(readAssociationFacilities).not.toHaveBeenCalled();
  });

  it("무소속 모험가는 협회 시설 현황을 조회할 수 있다", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, facilities: [] });
    expect(readAssociationFacilities).toHaveBeenCalledOnce();
  });
});
