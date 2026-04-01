export interface RuleSetEntry {
  name: string;
  url: string;
}

export interface RuleSetMarketService {
  getList(): Promise<RuleSetEntry[]>;
}

const mockEntries: RuleSetEntry[] = [
  { name: "Google", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Google/Google.srs" },
  { name: "YouTube", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/YouTube/YouTube.srs" },
  { name: "Netflix", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Netflix/Netflix.srs" },
  { name: "Telegram", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Telegram/Telegram.srs" },
  { name: "Advertising", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/Advertising/Advertising.srs" },
  { name: "China", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/China/China.srs" },
  { name: "ChinaMax", url: "https://raw.githubusercontent.com/Kotodian/singbox_ruleset/main/rule/ChinaMax/ChinaMax.srs" },
];

const mockService: RuleSetMarketService = {
  async getList() {
    return mockEntries;
  },
};

function createTauriService(): RuleSetMarketService {
  return {
    async getList() {
      const { invoke } = await import("@tauri-apps/api/core");
      return invoke<RuleSetEntry[]>("get_ruleset_list");
    },
  };
}

const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
export const ruleSetMarketService: RuleSetMarketService = isTauri
  ? createTauriService()
  : mockService;
