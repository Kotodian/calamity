import { describe, expect, it } from "vitest";
import { resolveLanguage } from "../locale";

describe("resolveLanguage", () => {
  it("returns explicit language selection without system detection", () => {
    expect(resolveLanguage("en", ["zh-CN"])).toBe("en");
    expect(resolveLanguage("zh-CN", ["en-US"])).toBe("zh-CN");
  });

  it("maps Chinese system locales to zh-CN", () => {
    expect(resolveLanguage("system", ["zh-CN"])).toBe("zh-CN");
    expect(resolveLanguage("system", ["zh-Hans-CN"])).toBe("zh-CN");
    expect(resolveLanguage("system", ["zh-TW", "en-US"])).toBe("zh-CN");
  });

  it("falls back to English for non-Chinese system locales", () => {
    expect(resolveLanguage("system", ["en-US"])).toBe("en");
    expect(resolveLanguage("system", ["ja-JP", "fr-FR"])).toBe("en");
    expect(resolveLanguage("system", [])).toBe("en");
  });
});
