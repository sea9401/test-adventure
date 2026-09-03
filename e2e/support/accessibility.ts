import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";
import type { Result } from "axe-core";

export const WCAG_AA_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

export function violationSummary(violations: Result[]) {
  return violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    help: violation.help,
    nodes: violation.nodes.map((node) => ({
      target: node.target,
      html: node.html,
      failureSummary: node.failureSummary,
    })),
  }));
}

export async function a11yViolationSummary(page: Page) {
  const result = await new AxeBuilder({ page })
    .withTags([...WCAG_AA_TAGS])
    .analyze();
  return violationSummary(result.violations);
}

export async function expectNoA11yViolations(page: Page) {
  expect(await a11yViolationSummary(page)).toEqual([]);
}

export async function documentViewportDimensions(page: Page) {
  return page.evaluate(() => ({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  }));
}

export async function expectNoDocumentOverflow(page: Page) {
  const dimensions = await documentViewportDimensions(page);
  expect(dimensions.content).toBeLessThanOrEqual(dimensions.viewport);
}
