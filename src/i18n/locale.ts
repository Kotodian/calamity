import type { Language } from "@/services/types";

export function resolveLanguage(language: Language, locales: readonly string[]): Exclude<Language, "system"> {
  if (language !== "system") {
    return language;
  }

  return locales.some((locale) => locale.toLowerCase().startsWith("zh")) ? "zh-CN" : "en";
}
