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

// ─── State helpers ──────────────────────────────────────────────────────────
function getState(): DrivePollState {
  return {
    fileCount: _knownFileIds.size,
    hasNewFiles: false, // updated externally by the polling logic
    knownFileIds: _knownFileIds,
    lastCheckedAt: _lastCheckedAt,
  };
}

let _hasNewFiles = false;

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
async function poll(): Promise<boolean> {
  if (_inflight) return _inflight;

  _inflight = (async () => {
    try {
      // Ensure we have a config
      if (!_config) {
        const configResult = await api.getGovernorateDriveConfig();
        if (!configResult.success || !configResult.config) return false;
        _config = configResult.config;
      }

      if (!_config?.folderId) return false;

      // Fetch files from the Drive folder
      const result = await api.getGovernorateDriveFiles(_config.folderId);
      if (!result.success) return false;

      const items = result.items || [];
      const currentIds = new Set(items.map((f: any) => f.id));

      if (!_baselineEstablished) {
        // First poll: establish baseline, no notifications
        _knownFileIds = currentIds;
        _baselineEstablished = true;
        _hasNewFiles = false;
        _lastCheckedAt = Date.now();
        emit();
        return true;
      }

      // Detect new files
      const newIds: string[] = [];
      currentIds.forEach((id) => {
        if (!_knownFileIds.has(id)) {
          newIds.push(id);
        }
      });

      if (newIds.length > 0) {
        // Find the names of new files
        const newFiles = items.filter((f: any) => newIds.includes(f.id));
        const firstName = newFiles[0]?.name || 'ملف جديد';

        _hasNewFiles = true;

        // Notify for each new file (or batch)
        if (newIds.length === 1) {
          showDesktopNotification(
            'مستند رسمي جديد',
            `تمت إضافة: ${firstName}`
          );
        } else {
          showDesktopNotification(
            'مستندات رسمية جديدة',
            `تمت إضافة ${newIds.length} ملفات جديدة`
          );
        }
      } else {
        _hasNewFiles = false;
      }

      // Update known IDs to include all current files
      _knownFileIds = currentIds;
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
export function startDrivePolling(): void {
  if (_running) return;
  _running = true;

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
}

export function resetDriveBaseline(accountId: string): void {
  // Only reset if the account actually changed
  if (_currentAccountId === accountId && _baselineEstablished) return;
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
  emit();
}

export function subscribeDrivePoller(fn: Listener): () => void {
  _listeners.add(fn);
  // Emit current state immediately
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

/** Force an immediate poll (used when folder page opens). */
export function forceDrivePoll(): Promise<boolean> {
  return poll();
}
