import { describe, expect, it } from "vitest";
import { createAppI18n } from "../index";

describe("createAppI18n", () => {
  it("uses explicit zh-CN resources", async () => {
    const i18n = await createAppI18n({
      language: "zh-CN",
      systemLocales: ["en-US"],
    });

    expect(i18n.language).toBe("zh-CN");
    expect(i18n.t("settings.title")).toBe("设置");
    expect(i18n.t("sidebar.dashboard")).toBe("仪表盘");
  });

  it("resolves system locale before initializing resources", async () => {
    const i18n = await createAppI18n({
      language: "system",
      systemLocales: ["zh-Hans-CN"],
    });

    expect(i18n.language).toBe("zh-CN");
    expect(i18n.t("settings.title")).toBe("设置");
  });
});
