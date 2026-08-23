import { getPublishedNews, type NewsItem } from './newsService';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface NewsPollState {
  hasNewNews: boolean;
  knownNewsIds: Set<string>;
  lastCheckedAt: number | null;
}

type Listener = (state: NewsPollState) => void;

// ─── Module-level singleton ─────────────────────────────────────────────────
const POLL_INTERVAL_MS = 15_000;
let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _listeners: Set<Listener> = new Set();
let _inflight: Promise<boolean> | null = null;

// Per-account state
let _currentAccountId: string | null = null;
let _knownNewsIds: Set<string> = new Set();
let _baselineEstablished = false;
let _lastCheckedAt: number | null = null;
let _hasNewNews = false;

// ─── State helpers ──────────────────────────────────────────────────────────
function emit() {
  const state: NewsPollState = {
    hasNewNews: _hasNewNews,
    knownNewsIds: _knownNewsIds,
    lastCheckedAt: _lastCheckedAt,
  };
  _listeners.forEach((fn) => fn(state));
}

// ─── Notification helper ────────────────────────────────────────────────────
function showDesktopNotification(title: string, body: string) {
  try {
    const bridge = (window as any).edaraDesktop;
    if (bridge?.showNotification) {
      bridge.showNotification(title, body, null);
    } else if ('Notification' in window && Notification.permission === 'granted') {
      new Notification(title, { body });
    }
  } catch {}
}

// ─── Core poll logic ────────────────────────────────────────────────────────
async function poll(): Promise<boolean> {
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      const items = await getPublishedNews();
      const currentIds = new Set(items.map((n) => n.id));

      if (!_baselineEstablished) {
        // First poll: establish baseline, no notifications
        _knownNewsIds = currentIds;
        _baselineEstablished = true;
        _hasNewNews = false;
        _lastCheckedAt = Date.now();
        emit();
        return true;
      }

      // Detect new news
      const newIds: string[] = [];
      currentIds.forEach((id) => {
        if (!_knownNewsIds.has(id)) {
          newIds.push(id);
        }
      });

      if (newIds.length > 0) {
        _hasNewNews = true;

        // Find the titles of new items
        const newItems = items.filter((n) => newIds.includes(n.id));
        const firstTitle = newItems[0]?.title || 'خبر جديد';

        if (newIds.length === 1) {
          showDesktopNotification('خبر جديد', firstTitle);
        } else {
          showDesktopNotification('أخبار جديدة', `تم نشر ${newIds.length} أخبار جديدة`);
        }
      } else {
        _hasNewNews = false;
      }

      // Update known IDs
      _knownNewsIds = currentIds;
      _lastCheckedAt = Date.now();
      emit();
      return true;
    } catch {
      return false;
    } finally {
      _inflight = null;
    }
  })();

  return _inflight;
}

// ─── Public API ─────────────────────────────────────────────────────────────
export function startNewsPolling(): void {
  if (_running) return;
  _running = true;

  // Run immediately, then every 15s
  poll();
  _timer = setInterval(() => {
    poll();
  }, POLL_INTERVAL_MS);
}

export function stopNewsPolling(): void {
  _running = false;
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
  _inflight = null;
}

export function resetNewsBaseline(accountId: string): void {
  if (_currentAccountId === accountId && _baselineEstablished) return;
  _currentAccountId = accountId;
  _knownNewsIds = new Set();
  _baselineEstablished = false;
  _hasNewNews = false;
  _lastCheckedAt = null;
  emit();
}

export function subscribeNewsPoller(fn: Listener): () => void {
  _listeners.add(fn);
  fn({
    hasNewNews: _hasNewNews,
    knownNewsIds: _knownNewsIds,
    lastCheckedAt: _lastCheckedAt,
  });
  return () => {
    _listeners.delete(fn);
  };
}

export function getNewsPollState(): NewsPollState {
  return {
    hasNewNews: _hasNewNews,
    knownNewsIds: _knownNewsIds,
    lastCheckedAt: _lastCheckedAt,
  };
}
