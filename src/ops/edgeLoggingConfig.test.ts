import { describe, expect, it } from "vitest";
import {
  SAFE_CLOUDFRONT_FIELDS,
  buildResourceNames,
  buildWafLoggingConfiguration,
  cloudFrontFieldsArePrivate,
  wafRedactionsArePrivate,
} from "../../infra/cloudfront-waf/configure-logging.mjs";

describe("edge logging configuration", () => {
  it("uses the deployed resource names", () => {
    expect(buildResourceNames("E2NWRUQ46FYRC")).toEqual({
      cloudFrontLogGroup: "msmsge-production-cloudfront-access",
      wafLogGroup: "aws-waf-logs-msmsge-production-cloudfront",
      deliverySource: "msmsge-E2NWRUQ46FYRC-access",
      deliveryDestination: "msmsge-E2NWRUQ46FYRC-cwl",
    });
  });

  it("excludes request query, cookies, referer, and forwarded IP chains", () => {
    expect(cloudFrontFieldsArePrivate(SAFE_CLOUDFRONT_FIELDS)).toBe(true);
    for (const sensitive of ["cs-uri-query", "cs(Cookie)", "cs(Referer)", "x-forwarded-for"]) {
      expect(cloudFrontFieldsArePrivate([...SAFE_CLOUDFRONT_FIELDS, sensitive])).toBe(false);
    }
  });

  it("redacts WAF credentials, cookies, and the complete query string", () => {
    const config = buildWafLoggingConfiguration(
      "arn:aws:wafv2:us-east-1:983903215138:global/webacl/example/id",
      "arn:aws:logs:us-east-1:983903215138:log-group:aws-waf-logs-example",
    );
    expect(wafRedactionsArePrivate(config.RedactedFields)).toBe(true);
    expect(wafRedactionsArePrivate(config.RedactedFields.slice(0, 2))).toBe(false);
  });
});
