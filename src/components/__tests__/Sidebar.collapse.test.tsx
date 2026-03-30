import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { I18nextProvider } from "react-i18next";
import { Sidebar } from "../Sidebar";
import { createAppI18n } from "@/i18n";

describe("Sidebar collapse", () => {
  it("hides navigation labels when collapsed", async () => {
    const onToggle = vi.fn();
    const i18n = await createAppI18n({
      language: "en",
      systemLocales: ["en-US"],
    });

    const { rerender } = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Sidebar collapsed={false} onToggle={onToggle} />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(screen.getByText("Dashboard")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse sidebar" }));
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter>
          <Sidebar collapsed onToggle={onToggle} />
        </MemoryRouter>
      </I18nextProvider>
    );

    expect(screen.queryByText("Dashboard")).toBeNull();
    expect(screen.getByRole("button", { name: "Expand sidebar" })).toBeTruthy();
    expect(screen.getByTestId("sidebar-header").className).toContain("flex-col");
  });
});
