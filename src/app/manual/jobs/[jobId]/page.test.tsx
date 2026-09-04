import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { jobManualStaticParams } from "../../jobManualModel";

const navigationMocks = vi.hoisted(() => ({
  push: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("TEST_NOT_FOUND");
  }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: navigationMocks.push }),
  notFound: navigationMocks.notFound,
}));

import Page, {
  dynamicParams,
  generateMetadata,
  generateStaticParams,
} from "./page";

afterEach(() => vi.clearAllMocks());

describe("job manual route", () => {
  it("prebuilds every catalog job and rejects dynamic ids", () => {
    expect(generateStaticParams()).toEqual(jobManualStaticParams());
    expect(dynamicParams).toBe(false);
  });

  it("generates canonical public metadata from the catalog", async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ jobId: "primordialmage" }),
    });

    expect(metadata.title).toContain("태초술사");
    expect(metadata.description).toContain("6차 전투 직업");
    expect(metadata.alternates?.canonical).toBe(
      "/manual/jobs/primordialmage",
    );
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });

  it("renders the manual shell and full job detail", async () => {
    const element = await Page({
      params: Promise.resolve({ jobId: "primordialmage" }),
    });
    const html = renderToStaticMarkup(element);

    expect(html).toContain("게임 안내서");
    expect(html).toContain("태초술사");
    expect(html).toContain("태초회귀");
    expect(html).toContain("전체 직업 도감");
  });

  it("uses the not-found path for an unknown job", async () => {
    await expect(
      Page({ params: Promise.resolve({ jobId: "missing-job" }) }),
    ).rejects.toThrow("TEST_NOT_FOUND");
    expect(navigationMocks.notFound).toHaveBeenCalledOnce();
  });
});
