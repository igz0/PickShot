import {
  type Locale,
  type TranslationKey,
  type TranslationValues,
  defaultLocale,
  formatPhotoCount,
  getAvailableLocales,
  getIntlLocale,
  getLocaleLabel,
  isLocale,
  resolveLocale,
  translate,
} from "@shared/i18n";
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

interface I18nContextValue {
  locale: Locale;
  availableLocales: Locale[];
  localeLabels: Record<Locale, string>;
  t: (key: TranslationKey, values?: TranslationValues) => string;
  setLocale: (nextLocale: Locale) => Promise<void>;
  formatDate: (timestamp: number) => string;
  formatNumber: (value: number) => string;
  formatPhotoCount: (count: number) => string;
  isReady: boolean;
}

const I18nContext = createContext<I18nContextValue | null>(null);

const STORAGE_KEY = "pickshot.locale";
const STORAGE_SOURCE_KEY = `${STORAGE_KEY}:source`;

type PreferenceSource = "system" | "user";

interface StoredLocalePreference {
  locale: Locale;
  source: PreferenceSource;
}

function getStoredPreference(): StoredLocalePreference | null {
  try {
    const storedValue = window.localStorage.getItem(STORAGE_KEY);
    if (!storedValue || !isLocale(storedValue)) {
      return null;
    }

    const storedSource = window.localStorage.getItem(STORAGE_SOURCE_KEY);
    if (storedSource === "user") {
      return { locale: storedValue, source: "user" };
    }

    // Treat legacy entries without an explicit source as system-derived defaults.
    return { locale: storedValue, source: "system" };
  } catch (error) {
    console.warn("Failed to read locale from storage", error);
  }
  return null;
}

function storeLocale(value: Locale, source: PreferenceSource) {
  try {
    window.localStorage.setItem(STORAGE_KEY, value);
    window.localStorage.setItem(STORAGE_SOURCE_KEY, source);
  } catch (error) {
    console.warn("Failed to persist locale", error);
  }
}

function clearStoredLocale() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    window.localStorage.removeItem(STORAGE_SOURCE_KEY);
  } catch (error) {
    console.warn("Failed to clear stored locale", error);
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof window !== "undefined") {
      const stored = getStoredPreference();
      if (stored && stored.source === "user") {
        return stored.locale;
      }
      if (typeof navigator !== "undefined" && navigator.language) {
        return resolveLocale(navigator.language);
      }
    }
    return defaultLocale;
  });
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    let canceled = false;
    const initialize = async () => {
      const storedPreference = getStoredPreference();
      const hasUserPreference = storedPreference?.source === "user";
      let nextLocale: Locale | null = hasUserPreference
        ? (storedPreference?.locale ?? null)
        : null;
      const source: PreferenceSource = hasUserPreference ? "user" : "system";

      if (!hasUserPreference && storedPreference) {
        clearStoredLocale();
      }

      let initial: Locale | null = null;
      try {
        const result = await window.api.getLocale();
        if (result && isLocale(result.locale)) {
          initial = result.locale;
        }
      } catch (error) {
        console.warn("Failed to obtain locale from main process", error);
      }

      if (!initial && typeof navigator !== "undefined" && navigator.language) {
        initial = resolveLocale(navigator.language);
      }

      if (!nextLocale) {
        nextLocale = initial ?? defaultLocale;
      }

      if (canceled) {
        return;
      }

      setLocaleState(nextLocale);
      if (source === "user") {
        storeLocale(nextLocale, "user");
      } else {
        clearStoredLocale();
      }

      try {
        await window.api.setLocale(nextLocale);
      } catch (error) {
        console.warn(
          "Failed to notify main process of locale selection",
          error,
        );
      }

      if (!canceled) {
        setIsReady(true);
      }
    };

    void initialize();

    return () => {
      canceled = true;
    };
  }, []);

  const availableLocales = useMemo(() => getAvailableLocales(), []);

  const localeLabels = useMemo(() => {
    return availableLocales.reduce<Record<Locale, string>>(
      (acc, entry) => {
        acc[entry] = getLocaleLabel(entry);
        return acc;
      },
      {} as Record<Locale, string>,
    );
  }, [availableLocales]);

  const numberFormatter = useMemo(
    () => new Intl.NumberFormat(getIntlLocale(locale)),
    [locale],
  );

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(getIntlLocale(locale), {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
    [locale],
  );

  const t = useCallback(
    (key: TranslationKey, values?: TranslationValues) =>
      translate(locale, key, values),
    [locale],
  );

  const handleSetLocale = useCallback(
    async (nextLocale: Locale) => {
      if (nextLocale === locale) {
        return;
      }
      setLocaleState(nextLocale);
      storeLocale(nextLocale, "user");
      try {
        await window.api.setLocale(nextLocale);
      } catch (error) {
        console.warn("Failed to notify main process of locale change", error);
      }
    },
    [locale],
  );

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      availableLocales,
      localeLabels,
      t,
      setLocale: handleSetLocale,
      formatDate: (timestamp: number) =>
        dateFormatter.format(new Date(timestamp)),
      formatNumber: (value: number) => numberFormatter.format(value),
      formatPhotoCount: (count: number) => formatPhotoCount(locale, count),
      isReady,
    }),
    [
      availableLocales,
      dateFormatter,
      handleSetLocale,
      isReady,
      locale,
      localeLabels,
      numberFormatter,
      t,
    ],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}
