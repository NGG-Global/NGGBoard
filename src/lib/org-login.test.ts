import { describe, expect, it } from "vitest";
import { AttemptLimiter, isOrgEmail, safeEqual } from "./org-login";

describe("isOrgEmail", () => {
  it("accepts addresses on the org domain, case-insensitively", () => {
    expect(isOrgEmail("dana@nggconsult.com")).toBe(true);
    expect(isOrgEmail("  Dana.Levi@NGGConsult.COM ")).toBe(true);
  });

  it("rejects other domains, subdomains and look-alikes", () => {
    expect(isOrgEmail("dana@gmail.com")).toBe(false);
    expect(isOrgEmail("dana@mail.nggconsult.com")).toBe(false);
    expect(isOrgEmail("dana@evil-nggconsult.com")).toBe(false);
    expect(isOrgEmail("dana@nggconsult.com.evil.io")).toBe(false);
  });

  it("rejects malformed input", () => {
    expect(isOrgEmail("")).toBe(false);
    expect(isOrgEmail("@nggconsult.com")).toBe(false);
    expect(isOrgEmail("a@b@nggconsult.com")).toBe(false);
    expect(isOrgEmail("da na@nggconsult.com")).toBe(false);
  });

  it("honours a custom domain", () => {
    expect(isOrgEmail("x@example.org", "example.org")).toBe(true);
    expect(isOrgEmail("x@nggconsult.com", "example.org")).toBe(false);
  });
});

describe("safeEqual", () => {
  it("compares exactly", () => {
    expect(safeEqual("s3cret!", "s3cret!")).toBe(true);
    expect(safeEqual("s3cret!", "s3cret")).toBe(false);
    expect(safeEqual("s3cret!", "S3cret!")).toBe(false);
    expect(safeEqual("", "x")).toBe(false);
  });
});

describe("AttemptLimiter", () => {
  it("blocks after the limit and resets after the window", () => {
    const limiter = new AttemptLimiter(2, 1000);
    expect(limiter.allow("ip", 0)).toBe(true);
    expect(limiter.allow("ip", 10)).toBe(true);
    expect(limiter.allow("ip", 20)).toBe(false);
    expect(limiter.allow("other", 20)).toBe(true);
    expect(limiter.allow("ip", 1001)).toBe(true);
  });
});
