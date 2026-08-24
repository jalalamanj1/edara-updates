// ─── Unified Electron Desktop Notification Service ──────────────────────────
// Used by both drivePoller and newsPoller. Sends notifications via the
// Electron IPC bridge and handles click-to-navigate.

type NotificationType = 'drive' | 'news' | 'mail';

interface NotificationPayload {
  type: NotificationType;
  target?: string; // folderId for drive, newsId for news, messageId for mail
}

const _pendingClick: NotificationPayload | null = null;

// ─── Logging ────────────────────────────────────────────────────────────────
function log(msg: string) {
  console.log(`[EDARA NOTIFICATION] ${msg}`);
}

// ─── Show desktop notification ──────────────────────────────────────────────
export function notifyNewDriveFile(filename: string | null): void {
  const title = 'مستند رسمي جديد';
  const body = filename
    ? `تمت إضافة المستند:\n${filename}`
    : 'تمت إضافة مستند جديد إلى كتب رسمية';

  log(`type=drive title="${title}" body="${body}"`);
  sendElectronNotification(title, body, { type: 'drive' });
}

export function notifyNewDriveFiles(count: number): void {
  const title = 'مستندات رسمية جديدة';
  const body = `تمت إضافة ${count} ملفات جديدة إلى كتب رسمية`;

  log(`type=drive title="${title}" body="${body}"`);
  sendElectronNotification(title, body, { type: 'drive' });
}

export function notifyNewNews(newsTitle: string | null, newsId: string | null): void {
  const title = 'خبر جديد';
  const body = newsTitle || 'تم نشر خبر جديد في إدراة';

  log(`type=news title="${title}" body="${body}"`);
  sendElectronNotification(title, body, { type: 'news', target: newsId || undefined });
}

// ─── Internal: send via Electron IPC ────────────────────────────────────────
function sendElectronNotification(title: string, body: string, payload: NotificationPayload): void {
  try {
    const bridge = (window as any).edaraDesktop;
    // Encode payload as JSON in the messageId so main.cjs can pass it back
    const messageId = JSON.stringify(payload);

    if (bridge?.showNotification) {
      bridge.showNotification(title, body, messageId);
      log('notification sent via Electron IPC');
    } else if ('Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body });
      n.onclick = () => {
        // Handle click in browser context (dev mode)
        handleNotificationClick(payload);
      };
      log('notification sent via browser Notification API');
    } else {
      log('notification BLOCKED — no notification API available');
    }
  } catch (err: any) {
    log('notification FAILED: ' + (err?.message || err));
  }
}

// ─── Click handler (called from App.tsx when notification-click IPC fires) ──
export function handleNotificationPayload(data: { messageId?: string }): void {
  if (!data?.messageId) return;
  try {
    const payload: NotificationPayload = JSON.parse(data.messageId);
    handleNotificationClick(payload);
  } catch {
    // Not a JSON payload — ignore
  }
}

function handleNotificationClick(payload: NotificationPayload): void {
  log(`click received type=${payload.type} target=${payload.target || 'none'}`);

  // Dispatch a custom event that App.tsx listens to
  const event = new CustomEvent('edara-notification-click', { detail: payload });
  window.dispatchEvent(event);
}
