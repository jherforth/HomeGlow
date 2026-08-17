// i18next setup for HomeGlow (issue #137).
//
// Language is a per-device preference, matching how theme, screensaver, and
// vacation settings work: the detector caches to localStorage under
// `language`. A household-wide default can be seeded from the server, but a
// device that has chosen explicitly always keeps its own choice — a kitchen
// display and a phone can run different languages.
//
// English is bundled eagerly because it is the fallback and must always be
// available; every other language is fetched on demand, so a household running
// English pays nothing for the rest.
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { setDateLocale } from '../utils/dateUtils.js';

export const LANGUAGE_STORAGE_KEY = 'language';
export const FALLBACK_LANGUAGE = 'en';

// Namespaces are per-surface so a widget only pulls the strings it renders,
// and so plugins can later register their own without colliding. Widgets are
// migrated one at a time; a namespace is added here once its locale files
// exist, so the completeness check never chases a file that isn't written yet.
export const NAMESPACES = ['common', 'chores', 'admin', 'weather', 'photos', 'calendar'];

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', endonym: 'English' },
  { code: 'es', label: 'Spanish', endonym: 'Español' },
];

// Vite resolves these at build time: `en` inlined, the rest split into chunks
// that are only fetched when that language is selected.
const englishResources = import.meta.glob('./locales/en/*.json', { eager: true });
const lazyResources = import.meta.glob('./locales/*/*.json');

const namespaceFromPath = (path) => path.split('/').pop().replace('.json', '');

const buildEnglish = () => {
  const bundle = {};
  for (const [path, mod] of Object.entries(englishResources)) {
    bundle[namespaceFromPath(path)] = mod.default ?? mod;
  }
  return bundle;
};

// Pulls every namespace for a language and registers it with i18next.
async function loadLanguageResources(language) {
  if (language === FALLBACK_LANGUAGE) return;
  const wanted = Object.entries(lazyResources).filter(([path]) => path.includes(`/locales/${language}/`));
  await Promise.all(wanted.map(async ([path, load]) => {
    try {
      const mod = await load();
      i18n.addResourceBundle(language, namespaceFromPath(path), mod.default ?? mod, true, true);
    } catch (error) {
      // A missing namespace file degrades to English rather than blanking the UI.
      console.warn(`Missing translations for ${language}/${namespaceFromPath(path)}:`, error);
    }
  }));
}

// Dev-only: surfaces strings that were never extracted. Rendering the key
// itself is louder than silently showing English, which is the whole point.
const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;

export async function initI18n({ initialLanguage } = {}) {
  await i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
      resources: { [FALLBACK_LANGUAGE]: buildEnglish() },
      lng: initialLanguage,
      fallbackLng: FALLBACK_LANGUAGE,
      ns: NAMESPACES,
      defaultNS: 'common',
      supportedLngs: SUPPORTED_LANGUAGES.map((l) => l.code),
      nonExplicitSupportedLngs: true, // treat es-MX as es
      interpolation: { escapeValue: false }, // React already escapes
      detection: {
        order: ['localStorage', 'navigator'],
        lookupLocalStorage: LANGUAGE_STORAGE_KEY,
        caches: ['localStorage'],
      },
      saveMissing: false,
      missingKeyHandler: isDev
        ? (lngs, ns, key) => console.warn(`[i18n] missing key: ${ns}:${key} (${lngs.join(',')})`)
        : undefined,
      react: { useSuspense: false },
    });

  await changeLanguage(i18n.language || FALLBACK_LANGUAGE);
  return i18n;
}

// The one entry point for switching language: loads the strings, loads the
// matching date locale, then flips i18next so the UI re-renders once with
// everything in place.
export async function changeLanguage(language) {
  const code = SUPPORTED_LANGUAGES.some((l) => l.code === language) ? language : FALLBACK_LANGUAGE;
  await loadLanguageResources(code);
  // Synchronous: date display uses Intl, so there is no locale bundle to fetch.
  setDateLocale(code);
  await i18n.changeLanguage(code);
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
  }
  return code;
}

/** The device's stored choice, or null if it has never chosen. */
export const getStoredLanguage = () => {
  try {
    return localStorage.getItem(LANGUAGE_STORAGE_KEY);
  } catch {
    return null;
  }
};

export default i18n;
