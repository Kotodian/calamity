import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { I18nextProvider } from "react-i18next";
import { Sidebar } from "../Sidebar";
import { createAppI18n } from "@/i18n";

describe("Sidebar", () => {
  it("renders translated navigation labels", async () => {
    const i18n = await createAppI18n({
      language: "zh-CN",
      systemLocales: ["en-US"],
    });

    render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Sidebar collapsed={false} onToggle={() => {}} />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(screen.getByText("仪表盘")).toBeTruthy();
    expect(screen.getByText("节点")).toBeTruthy();
    expect(screen.getByText("设置")).toBeTruthy();
  });
});
