import { getPublishedNews, type NewsItem } from './newsService';
import { notifyNewNews } from './notificationService';

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

// ─── Logging ────────────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[EDARA NEWS POLL] ${msg}`);
}

// ─── State helpers ──────────────────────────────────────────────────────────
function emit() {
  const state: NewsPollState = {
    hasNewNews: _hasNewNews,
    knownNewsIds: _knownNewsIds,
    lastCheckedAt: _lastCheckedAt,
  };
  _listeners.forEach((fn) => fn(state));
}

// ─── Core poll logic ────────────────────────────────────────────────────────
async function poll(): Promise<boolean> {
  if (_inflight) {
    log('tick skipped — inflight request');
    return _inflight;
  }

  _inflight = (async () => {
    const t0 = Date.now();
    try {
      log('tick');
      const items = await getPublishedNews();
      const elapsed = Date.now() - t0;
      const currentIds = new Set(items.map((n) => n.id));
      log('request completed (' + elapsed + 'ms) news=' + items.length);

      if (!_baselineEstablished) {
        // First poll: establish baseline, no notifications
        _knownNewsIds = currentIds;
        _baselineEstablished = true;
        _hasNewNews = false;
        _lastCheckedAt = Date.now();
        log('baseline established: ' + items.length + ' items');
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

        // Find the titles of new items — notify for each new one
        const newItems = items.filter((n) => newIds.includes(n.id));
        for (const item of newItems) {
          notifyNewNews(item.title || null, item.id || null);
        }
        log('NEW NEWS DETECTED: ' + newIds.join(', '));
      } else {
        _hasNewNews = false;
      }

      // Update known IDs
      _knownNewsIds = currentIds;
      _lastCheckedAt = Date.now();
      log('known news updated: ' + _knownNewsIds.size);
      emit();
      return true;
    } catch (err: any) {
      log('ERROR: ' + (err?.message || err));
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
  log('polling STARTED');

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
  log('polling STOPPED');
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
