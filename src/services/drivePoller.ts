import { api } from './api';
import { getAccount } from './auth';
import type { GovernorateDriveConfig } from '../types';

// ─── Types ──────────────────────────────────────────────────────────────────
export interface DrivePollState {
  fileCount: number;
  hasNewFiles: boolean;
  knownFileIds: Set<string>;
  lastCheckedAt: number | null;
}

type Listener = (state: DrivePollState) => void;

// ─── Module-level singleton ─────────────────────────────────────────────────
const POLL_INTERVAL_MS = 15_000;
let _timer: ReturnType<typeof setInterval> | null = null;
let _running = false;
let _listeners: Set<Listener> = new Set();
let _inflight: Promise<boolean> | null = null;

// Per-account state
let _currentAccountId: string | null = null;
let _knownFileIds: Set<string> = new Set();
let _baselineEstablished = false;
let _lastCheckedAt: number | null = null;
let _config: GovernorateDriveConfig | null = null;
let _hasNewFiles = false;

// ─── Logging ────────────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[GOV DRIVE POLL] ${msg}`);
}

// ─── State helpers ──────────────────────────────────────────────────────────
function emit() {
  const state: DrivePollState = {
    fileCount: _knownFileIds.size,
    hasNewFiles: _hasNewFiles,
    knownFileIds: _knownFileIds,
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
let _pollGeneration = 0;

async function poll(force = false): Promise<boolean> {
  // Skip if a request is already running (unless forced)
  if (_inflight && !force) {
    log('tick skipped — inflight request');
    return _inflight;
  }

  const gen = ++_pollGeneration;

  _inflight = (async () => {
    const t0 = Date.now();
    try {
      log('tick' + (force ? ' (forced)' : ''));

      // Ensure we have a config
      if (!_config) {
        log('fetching config...');
        const configResult = await api.getGovernorateDriveConfig();
        if (!configResult.success || !configResult.config) {
          log('config FAILED: ' + (configResult.message || 'unknown'));
          return false;
        }
        _config = configResult.config;
        log('config OK: folderId=' + _config.folderId);
      }

      if (!_config?.folderId) {
        log('no folderId — skip');
        return false;
      }

      // Fetch files from the Drive folder
      log('request started folderId=' + _config.folderId);
      const result = await api.getGovernorateDriveFiles(_config.folderId);
      const elapsed = Date.now() - t0;

      // Check if a newer poll superseded this one
      if (gen !== _pollGeneration) {
        log('stale response discarded (gen=' + gen + ' current=' + _pollGeneration + ')');
        return false;
      }

      if (!result.success) {
        log('request FAILED (' + elapsed + 'ms): ' + (result.message || 'unknown'));
        return false;
      }

      const items = result.items || [];
      const currentIds = new Set(items.map((f: any) => f.id));
      log('request completed (' + elapsed + 'ms) files=' + items.length + ' ids=' + [...currentIds].join(','));

      if (!_baselineEstablished) {
        // First poll: establish baseline, no notifications
        _knownFileIds = currentIds;
        _baselineEstablished = true;
        _hasNewFiles = false;
        _lastCheckedAt = Date.now();
        log('baseline established: ' + items.length + ' files');
        emit();
        return true;
      }

      // Detect new files by comparing IDs
      const newIds: string[] = [];
      currentIds.forEach((id) => {
        if (!_knownFileIds.has(id)) {
          newIds.push(id);
        }
      });

      if (newIds.length > 0) {
        const newFiles = items.filter((f: any) => newIds.includes(f.id));
        const firstName = newFiles[0]?.name || 'ملف جديد';
        _hasNewFiles = true;
        log('NEW FILES DETECTED: ' + newIds.join(', '));

        // Desktop notification
        if (newIds.length === 1) {
          showDesktopNotification('مستند رسمي جديد', 'تمت إضافة: ' + firstName);
        } else {
          showDesktopNotification('مستندات رسمية جديدة', 'تمت إضافة ' + newIds.length + ' ملفات جديدة');
        }
        log('notification shown');
      } else {
        _hasNewFiles = false;
      }

      // Update known IDs
      _knownFileIds = currentIds;
      _lastCheckedAt = Date.now();
      log('known files updated: ' + _knownFileIds.size);
      emit();
      return true;
    } catch (err: any) {
      log('ERROR: ' + (err?.message || err));
      return false;
    } finally {
      // Only clear inflight if this is still the current generation
      if (gen === _pollGeneration) {
        _inflight = null;
      }
    }
  })();

  return _inflight;
}

// ─── Public API ─────────────────────────────────────────────────────────────
export function startDrivePolling(): void {
  if (_running) return;
  _running = true;
  log('polling STARTED');

  // Run immediately, then every 15s
  poll();
  _timer = setInterval(() => {
    poll();
  }, POLL_INTERVAL_MS);
}

export function stopDrivePolling(): void {
  _running = false;
  if (_timer !== null) {
    clearInterval(_timer);
    _timer = null;
  }
  _inflight = null;
  log('polling STOPPED');
}

export function resetDriveBaseline(accountId: string): void {
  if (_currentAccountId === accountId && _baselineEstablished) return;
  log('baseline RESET for account=' + accountId);
  _currentAccountId = accountId;
  _knownFileIds = new Set();
  _baselineEstablished = false;
  _hasNewFiles = false;
  _lastCheckedAt = null;
  _config = null;
  emit();
}

export function acknowledgeNewFiles(): void {
  _hasNewFiles = false;
  log('new files ACKNOWLEDGED');
  emit();
}

export function subscribeDrivePoller(fn: Listener): () => void {
  _listeners.add(fn);
  fn({
    fileCount: _knownFileIds.size,
    hasNewFiles: _hasNewFiles,
    knownFileIds: _knownFileIds,
    lastCheckedAt: _lastCheckedAt,
  });
  return () => {
    _listeners.delete(fn);
  };
}

export function getDrivePollState(): DrivePollState {
  return {
    fileCount: _knownFileIds.size,
    hasNewFiles: _hasNewFiles,
    knownFileIds: _knownFileIds,
    lastCheckedAt: _lastCheckedAt,
  };
}

/** Force an immediate poll — bypasses inflight dedup. */
export function forceDrivePoll(): Promise<boolean> {
  log('force poll requested');
  return poll(true);
}
