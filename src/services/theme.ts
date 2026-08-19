export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'edara_theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

function getMedia(): MediaQueryList | null {
  if (typeof window === 'undefined' || !window.matchMedia) return null;
  return window.matchMedia(DARK_QUERY);
}

function getStored(): ThemeMode {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    /* ignore storage errors */
  }
  return 'system';
}

function resolve(mode: ThemeMode): 'light' | 'dark' {
  if (mode === 'dark') return 'dark';
  if (mode === 'light') return 'light';
  const mql = getMedia();
  return mql && mql.matches ? 'dark' : 'light';
}

function applyThemeValue(value: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', value);
}

let systemListener: ((e: MediaQueryListEvent) => void) | null = null;

/** Apply the stored theme immediately. Call this once before first render. */
export function initTheme(): void {
  const mode = getStored();
  applyThemeValue(resolve(mode));

  if (mode === 'system') {
    const mql = getMedia();
    if (mql && !systemListener) {
      systemListener = (e) => {
        if (getStored() === 'system') applyThemeValue(e.matches ? 'dark' : 'light');
      };
      mql.addEventListener('change', systemListener);
    }
  }
}

/** Persist and apply a new theme choice. */
export function setTheme(mode: ThemeMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode);
  } catch {
    /* ignore storage errors */
  }

  const root = document.documentElement;
  root.classList.add('theme-transition');
  window.setTimeout(() => root.classList.remove('theme-transition'), 260);

  applyThemeValue(resolve(mode));

  const mql = getMedia();
  if (mode === 'system') {
    if (mql && !systemListener) {
      systemListener = (e) => {
        if (getStored() === 'system') applyThemeValue(e.matches ? 'dark' : 'light');
      };
      mql.addEventListener('change', systemListener);
    }
  } else if (systemListener && mql) {
    mql.removeEventListener('change', systemListener);
    systemListener = null;
  }
}

export function getTheme(): ThemeMode {
  return getStored();
}
