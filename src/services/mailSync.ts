import { fetchInbox } from './mailStore';
import type { MailMessage, MailContact } from '../types';

// ============================================================================
// Mail Sync Service
//
// Manages a 5-second polling loop that:
//   1. Fetches the inbox from Supabase (RLS-enforced)
//   2. Detects new messages since the last poll
//   3. Groups messages by senderAccountId for the Dashboard card
//   4. Triggers local desktop notifications for new messages
//   5. Deduplicates notifications per account per message
//
// Lifecycle:
//   - start(accountId) → begins polling
//   - stop() → stops polling
//   - focusSync() → immediate sync (called on window focus)
//   - subscribe(callback) → listen for state changes
// ============================================================================

const POLL_INTERVAL_MS = 5000;
const NOTIFIED_CACHE_PREFIX = 'edara_desktop_mail_notified_';

// ============================================================================
// Contact Grouping
// ============================================================================

export function groupContacts(messages: MailContact[]): MailContact[] {
  return messages;
}

/**
 * Group inbox messages by senderAccountId.
 * Returns contacts sorted by latest message time (newest first).
 */
export function groupBySender(messages: MailMessage[]): MailContact[] {
  const map = new Map<string, MailContact>();

  for (const msg of messages) {
    const key = msg.senderAccountId || msg.senderOrgId || msg.senderDisplayName || 'unknown';
    let contact = map.get(key);
    if (!contact) {
      contact = {
        senderAccountId: key,
        senderDisplayName: msg.senderDisplayName || msg.senderOrgId || 'غير معروف',
        unreadCount: 0,
        totalCount: 0,
        latestMessageAt: msg.createdAt,
        latestSubject: msg.subject,
        messages: [],
      };
      map.set(key, contact);
    }
    contact.messages.push(msg);
    contact.totalCount++;
    if (!msg.isRead) contact.unreadCount++;
    if (msg.createdAt > contact.latestMessageAt) {
      contact.latestMessageAt = msg.createdAt;
      contact.latestSubject = msg.subject;
    }
  }

  return Array.from(map.values()).sort(
    (a, b) => (b.latestMessageAt || '').localeCompare(a.latestMessageAt || '')
  );
}

// ============================================================================
// Notification Dedup (account-scoped)
// ============================================================================

function getNotifiedIds(accountId: string): Set<string> {
  try {
    const raw = localStorage.getItem(NOTIFIED_CACHE_PREFIX + accountId);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw));
  } catch {
    return new Set();
  }
}

function saveNotifiedIds(accountId: string, ids: Set<string>): void {
  try {
    // Keep only the last 500 IDs to avoid unbounded growth
    const arr = Array.from(ids);
    const trimmed = arr.slice(Math.max(0, arr.length - 500));
    localStorage.setItem(NOTIFIED_CACHE_PREFIX + accountId, JSON.stringify(trimmed));
  } catch {
    // ignore
  }
}

function markNotified(accountId: string, messageId: string): void {
  const ids = getNotifiedIds(accountId);
  ids.add(messageId);
  saveNotifiedIds(accountId, ids);
}

function isAlreadyNotified(accountId: string, messageId: string): boolean {
  return getNotifiedIds(accountId).has(messageId);
}

// ============================================================================
// Desktop Notification (Electron bridge)
// ============================================================================

interface DesktopNotification {
  title: string;
  body: string;
  messageId?: string;
}

function showDesktopNotification(n: DesktopNotification): void {
  const bridge = (window as any).edaraDesktop;
  if (bridge && typeof bridge.showNotification === 'function') {
    bridge.showNotification(n.title, n.body, n.messageId);
    return;
  }
  // Browser fallback: use Notification API
  if ('Notification' in window && Notification.permission === 'granted') {
    const notif = new Notification(n.title, { body: n.body });
    if (n.messageId) {
      notif.onclick = () => {
        window.dispatchEvent(
          new CustomEvent('edara-mail-notification-click', { detail: { messageId: n.messageId } })
        );
      };
    }
  }
}

// ============================================================================
// Sync State
// ============================================================================

export interface MailSyncState {
  messages: MailMessage[];
  contacts: MailContact[];
  totalUnread: number;
  loading: boolean;
  lastSyncAt: string | null;
}

type Listener = (state: MailSyncState) => void;

// ============================================================================
// MailSync singleton
// ============================================================================

class MailSync {
  private accountId: string | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private listeners: Set<Listener> = new Set();
  private state: MailSyncState = {
    messages: [],
    contacts: [],
    totalUnread: 0,
    loading: false,
    lastSyncAt: null,
  };
  private lastKnownIds: Set<string> = new Set();

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    // Emit current state immediately
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  getState(): MailSyncState {
    return this.state;
  }

  private emit(): void {
    for (const listener of this.listeners) {
      try {
        listener(this.state);
      } catch {
        // listener error — skip
      }
    }
  }

  async start(accountId: string): Promise<void> {
    this.stop();
    this.accountId = accountId;
    this.lastKnownIds = new Set(getNotifiedIds(accountId));

    // Initial sync
    await this.sync();

    // Start polling
    this.timer = setInterval(() => this.sync(), POLL_INTERVAL_MS);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.accountId = null;
    this.lastKnownIds = new Set();
  }

  async focusSync(): Promise<void> {
    if (!this.accountId) return;
    await this.sync();
  }

  /**
   * Optimistically mark a message as read in local state and persist to Supabase.
   * Updates all subscribers immediately so the sidebar/Dashboard reflects the
   * new read state without waiting for the next sync cycle.
   */
  async optimisticMarkRead(messageId: string): Promise<boolean> {
    // Update local state immediately
    const messages = this.state.messages.map((m) =>
      m.id === messageId ? { ...m, isRead: 1 } : m
    );
    const contacts = groupBySender(messages);
    const totalUnread = messages.filter((m) => !m.isRead).length;
    this.state = { ...this.state, messages, contacts, totalUnread };
    this.emit();

    // Persist to Supabase (RLS-enforced)
    const { markRead } = await import('./mailStore');
    return markRead(messageId);
  }

  private async sync(): Promise<void> {
    if (!this.accountId) return;

    this.state = { ...this.state, loading: true };
    this.emit();

    try {
      const messages = await fetchInbox();
      const contacts = groupBySender(messages);
      const totalUnread = messages.filter((m) => !m.isRead).length;

      // Detect new messages (not in lastKnownIds)
      const currentIds = new Set(messages.map((m) => m.id));
      const newMessages = messages.filter(
        (m) => !this.lastKnownIds.has(m.id) && !m.isRead
      );

      // Notify for new messages
      for (const msg of newMessages) {
        if (!isAlreadyNotified(this.accountId!, msg.id)) {
          markNotified(this.accountId!, msg.id);
          const sender = msg.senderDisplayName || msg.senderOrgId || 'مجهول';
          const subjectLine = msg.subject ? `\nبخصوص: ${msg.subject}` : '';
          showDesktopNotification({
            title: 'رسالة جديدة',
            body: `رسالة جديدة من ${sender}${subjectLine}`,
            messageId: msg.id,
          });
        }
      }

      this.lastKnownIds = currentIds;

      this.state = {
        messages,
        contacts,
        totalUnread,
        loading: false,
        lastSyncAt: new Date().toISOString(),
      };
      this.emit();
    } catch {
      // On error, keep existing state, just turn off loading
      this.state = { ...this.state, loading: false };
      this.emit();
    }
  }
}

export const mailSync = new MailSync();
