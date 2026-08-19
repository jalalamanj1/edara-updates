// Real-time notification service for new files in the Ministry of Education
// Google Drive folder (the "مستجدات الوزارة" Dashboard card).
//
// Design notes:
// - Singleton: a single polling timer is shared across all subscribers.
// - Detection is fileId-based (driven by the server /count + /seen endpoints).
// - "Seen" state is owned by the server (app_meta.seen_ministry_docs) so it
//   survives restarts. This service is the live, in-memory mirror of that state.
// - Polling pauses when the browser is offline and resumes on reconnect.

import React from 'react';
import { api } from './api';

const POLL_INTERVAL_MS = 10_000;
const MAX_BADGE = 99;

export interface MinistryNotificationState {
  /** Number of new (unseen) files currently in the Drive folder. */
  unreadCount: number;
  /** Live total number of files currently in the Drive folder. */
  totalCount: number;
}

type Listener = (state: MinistryNotificationState) => void;

class MinistryNotificationsService {
  private seenIds = new Set<string>();
  private currentFileIds = new Set<string>();
  private unread = 0;
  private total = 0;
  private listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private onlineHandler: (() => void) | null = null;

  private emit(): void {
    const snapshot: MinistryNotificationState = {
      unreadCount: this.unread,
      totalCount: this.total,
    };
    this.listeners.forEach((l) => l(snapshot));
  }

  getSnapshot(): MinistryNotificationState {
    return { unreadCount: this.unread, totalCount: this.total };
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    this.ensureRunning();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private ensureRunning(): void {
    if (this.timer) return;
    this.onlineHandler = () => {
      if (navigator.onLine) this.poll();
    };
    window.addEventListener('online', this.onlineHandler);
    // Immediate first check, then on an interval.
    this.poll();
    this.timer = setInterval(() => this.poll(), POLL_INTERVAL_MS);
  }

  private stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.onlineHandler) {
      window.removeEventListener('online', this.onlineHandler);
      this.onlineHandler = null;
    }
  }

  private async poll(): Promise<void> {
    if (this.inFlight) return;
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;

    this.inFlight = true;
    try {
      const [countRes, seenRes] = await Promise.all([
        api.getMinistryDriveCount(),
        api.getMinistryDriveSeen(),
      ]);
      if (!countRes.success) return;

      const fileIds = (countRes.items || [])
        .filter((i: { id: string; isFolder: boolean }) => !i.isFolder)
        .map((i: { id: string }) => i.id);

      this.seenIds = new Set<string>(seenRes.seen || []);
      this.currentFileIds = new Set<string>(fileIds);
      this.total = fileIds.length;
      this.recompute();
    } catch {
      // Network/Drive error: keep previous state, try again next cycle.
    } finally {
      this.inFlight = false;
    }
  }

  private recompute(): void {
    let n = 0;
    this.currentFileIds.forEach((id) => {
      if (!this.seenIds.has(id)) n += 1;
    });
    this.unread = n;
    this.emit();
  }

  /** Mark the given file ids as seen (server + local) and clear the badge. */
  async markSeenWith(ids: string[]): Promise<void> {
    ids.forEach((id) => this.seenIds.add(id));
    this.recompute();
    try {
      await api.markMinistryDriveSeen(ids);
    } catch {
      // Will self-correct on the next poll.
    }
  }

  /** Mark every file currently known to the service as seen. */
  async markSeen(): Promise<void> {
    await this.markSeenWith(Array.from(this.currentFileIds));
  }
}

export const ministryNotifications = new MinistryNotificationsService();

/** React hook that subscribes a component to live ministry notification state. */
export function useMinistryNotifications(): MinistryNotificationState & {
  markSeen: () => void;
} {
  const [state, setState] = React.useState<MinistryNotificationState>(
    ministryNotifications.getSnapshot()
  );

  React.useEffect(() => ministryNotifications.subscribe(setState), []);

  return {
    ...state,
    markSeen: () => {
      void ministryNotifications.markSeen();
    },
  };
}
