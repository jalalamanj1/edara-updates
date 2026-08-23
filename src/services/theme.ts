export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'edara_theme';

/**
 * Resolve theme based on current local time:
 *   06:00–17:59 → light
 *   18:00–05:59 → dark
 */
function getTimeBasedTheme(): 'light' | 'dark' {
  const hour = new Date().getHours();
  return hour >= 6 && hour < 18 ? 'light' : 'dark';
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
  return getTimeBasedTheme();
}

function applyThemeValue(value: 'light' | 'dark'): void {
  document.documentElement.setAttribute('data-theme', value);
}

// ─── Auto-schedule timer ─────────────────────────────────────────────────────
// Calculates ms until the next 06:00 / 18:00 boundary, then switches theme.
let scheduleTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleNextSwitch(): void {
  if (scheduleTimer !== null) {
    clearTimeout(scheduleTimer);
    scheduleTimer = null;
  }

  const now = new Date();
  const hour = now.getHours();
  const minute = now.getMinutes();
  const second = now.getSeconds();
  const msNow = (hour * 3600 + minute * 60 + second) * 1000;

  // Next boundary: 06:00 (21600000 ms) or 18:00 (64800000 ms)
  const lightStart = 6 * 3600 * 1000;   // 06:00
  const darkStart = 18 * 3600 * 1000;   // 18:00

  let msUntilNext: number;
  if (msNow < lightStart) {
    // before 06:00 → next boundary is 06:00
    msUntilNext = lightStart - msNow + 1000; // +1s to land on the new minute
  } else if (msNow < darkStart) {
    // between 06:00 and 18:00 → next boundary is 18:00
    msUntilNext = darkStart - msNow + 1000;
  } else {
    // after 18:00 → next boundary is tomorrow 06:00
    msUntilNext = 24 * 3600 * 1000 - msNow + lightStart + 1000;
  }

  scheduleTimer = setTimeout(() => {
    scheduleTimer = null;
    const mode = getStored();
    if (mode === 'system') {
      applyThemeValue(getTimeBasedTheme());
    }
    scheduleNextSwitch();
  }, msUntilNext);
}

/** Apply the stored theme immediately. Call this once before first render. */
export function initTheme(): void {
  const mode = getStored();
  applyThemeValue(resolve(mode));
  scheduleNextSwitch();
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
  scheduleNextSwitch();
}

export function getTheme(): ThemeMode {
  return getStored();
}
