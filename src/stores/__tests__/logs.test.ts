import { describe, it, expect, beforeEach, vi } from "vitest";
import { useLogsStore } from "../logs";

describe("useLogsStore", () => {
  beforeEach(() => {
    useLogsStore.setState({ logs: [], filter: null, search: "", autoScroll: true });
  });

  it("fetchLogs loads logs from service", async () => {
    await useLogsStore.getState().fetchLogs();
    expect(useLogsStore.getState().logs.length).toBeGreaterThan(0);
  });

  it("clearLogs empties the store", async () => {
    await useLogsStore.getState().fetchLogs();
    expect(useLogsStore.getState().logs.length).toBeGreaterThan(0);
    await useLogsStore.getState().clearLogs();
    expect(useLogsStore.getState().logs.length).toBe(0);
  });

  it("setFilter updates filter state", () => {
    useLogsStore.getState().setFilter("error");
    expect(useLogsStore.getState().filter).toBe("error");
  });

  it("setSearch updates search state", () => {
    useLogsStore.getState().setSearch("github");
    expect(useLogsStore.getState().search).toBe("github");
  });

  it("filteredLogs filters by level", async () => {
    // Populate with known entries
    useLogsStore.setState({
      logs: [
        { id: "1", timestamp: new Date().toISOString(), level: "info", source: "test", message: "info msg" },
        { id: "2", timestamp: new Date().toISOString(), level: "error", source: "test", message: "error msg" },
        { id: "3", timestamp: new Date().toISOString(), level: "info", source: "test", message: "another info" },
      ],
    });

    useLogsStore.getState().setFilter("error");
    const filtered = useLogsStore.getState().filteredLogs();
    expect(filtered.length).toBe(1);
    expect(filtered[0].level).toBe("error");
  });

  it("filteredLogs filters by search term", () => {
    useLogsStore.setState({
      logs: [
        { id: "1", timestamp: new Date().toISOString(), level: "info", source: "test", message: "github request" },
        { id: "2", timestamp: new Date().toISOString(), level: "info", source: "test", message: "google request" },
      ],
    });

    useLogsStore.getState().setSearch("github");
    const filtered = useLogsStore.getState().filteredLogs();
    expect(filtered.length).toBe(1);
    expect(filtered[0].message).toContain("github");
  });

  it("filteredLogs combines level and search filters", () => {
    useLogsStore.setState({
      logs: [
        { id: "1", timestamp: new Date().toISOString(), level: "info", source: "test", message: "github info" },
        { id: "2", timestamp: new Date().toISOString(), level: "error", source: "test", message: "github error" },
        { id: "3", timestamp: new Date().toISOString(), level: "error", source: "test", message: "google error" },
      ],
    });

    useLogsStore.getState().setFilter("error");
    useLogsStore.getState().setSearch("github");
    const filtered = useLogsStore.getState().filteredLogs();
    expect(filtered.length).toBe(1);
    expect(filtered[0].id).toBe("2");
  });

  it("subscribe adds entries to store", async () => {
    vi.useFakeTimers();
    const unsub = useLogsStore.getState().subscribe();
    await vi.advanceTimersByTimeAsync(4100);
    unsub();
    vi.useRealTimers();

    expect(useLogsStore.getState().logs.length).toBe(2);
  });
});
