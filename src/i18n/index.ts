import { createInstance, type i18n } from "i18next";
import { initReactI18next } from "react-i18next";
import type { Language } from "@/services/types";
import { resolveLanguage } from "./locale";
import { resources } from "./resources";

interface CreateAppI18nOptions {
  language: Language;
  systemLocales?: readonly string[];
}

let appI18n: i18n | null = null;

export async function createAppI18n(options: CreateAppI18nOptions): Promise<i18n> {
  const instance = createInstance();
  const resolvedLanguage = resolveLanguage(options.language, options.systemLocales ?? []);

  await instance
    .use(initReactI18next)
    .init({
      lng: resolvedLanguage,
      fallbackLng: "en",
      resources,
      interpolation: {
        escapeValue: false,
      },
      react: {
        useSuspense: false,
      },
    });

  return instance;
}

export function getSystemLocales(): string[] {
  if (typeof navigator === "undefined") {
    return [];
  }

  return navigator.languages?.length ? [...navigator.languages] : [navigator.language].filter(Boolean);
}

export async function initAppI18n(options: CreateAppI18nOptions): Promise<i18n> {
  if (!appI18n) {
    appI18n = await createAppI18n(options);
    return appI18n;
  }

  await syncAppLanguage(options.language, options.systemLocales);
  return appI18n;
}

export function getAppI18n(): i18n {
  if (!appI18n) {
    throw new Error("i18n has not been initialized");
  }

  return appI18n;
}

export async function syncAppLanguage(language: Language, systemLocales: readonly string[] = getSystemLocales()): Promise<Exclude<Language, "system">> {
  const resolvedLanguage = resolveLanguage(language, systemLocales);

  if (!appI18n) {
    appI18n = await createAppI18n({ language, systemLocales });
    return resolvedLanguage;
  }

  if (appI18n.language !== resolvedLanguage) {
    await appI18n.changeLanguage(resolvedLanguage);
  }

  return resolvedLanguage;
}

export { resolveLanguage } from "./locale";
