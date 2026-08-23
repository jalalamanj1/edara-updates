import React, { useState, useEffect, useCallback, useRef } from 'react';
import { SchoolProfile, MailMessage, MailAttachment } from '../types';
import {
  downloadAttachment,
  getAttachmentPreviewUrl,
} from '../services/mailStore';
import { mailSync, type MailSyncState } from '../services/mailSync';

const BLUE = '#1f5fa8';
const BLUE_SOFT = '#eaf2fb';
const BORDER = '#e5e7eb';
const UNREAD_DOT = '#e67e22';

const AR_DATE: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'long', year: 'numeric' };
const AR_TIME: Intl.DateTimeFormatOptions = { hour: 'numeric', minute: '2-digit' };

function formatDate(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('ar-EG', AR_DATE);
}
function formatTime(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('ar-EG', AR_TIME);
}
function formatSize(s: number | string | undefined): string {
  if (typeof s === 'string') return s;
  if (!s || s <= 0) return '';
  if (s >= 1024 * 1024) return `${(s / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${(s / 1024).toFixed(1)} ك.ب`;
}
function typeLabel(mime?: string): string {
  if (!mime) return 'ملف';
  if (mime.startsWith('image/')) return 'صورة';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.includes('word') || mime.includes('document')) return 'مستند Word';
  if (mime.includes('excel') || mime.includes('sheet')) return 'مستند Excel';
  return mime.split('/').pop()?.toUpperCase() || 'ملف';
}

function extFromMime(mime?: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'image/bmp': 'bmp',
    'application/pdf': 'pdf',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'text/plain': 'txt',
    'application/zip': 'zip',
  };
  return (mime && map[mime]) || 'bin';
}

function formatArrivalStamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
}

function buildDownloadName(createdAt: string, mime: string, used: Set<string>): string {
  const base = formatArrivalStamp(createdAt) || 'attachment';
  const ext = extFromMime(mime);
  let name = `${base}.${ext}`;
  let n = 1;
  while (used.has(name)) {
    name = `${base}-${n}.${ext}`;
    n++;
  }
  used.add(name);
  return name;
}

export const MailView: React.FC<{
  schoolProfile: SchoolProfile;
  mailParams?: Record<string, string> | null;
  onMailParamsConsumed?: () => void;
}> = ({ mailParams, onMailParamsConsumed }) => {
  const [messages, setMessages] = useState<MailMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<MailMessage | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [filterContactId, setFilterContactId] = useState<string | null>(null);
  const mailParamsConsumedRef = useRef(false);

  // Subscribe to mailSync for real-time updates
  const [syncState, setSyncState] = useState<MailSyncState>({
    messages: [],
    contacts: [],
    totalUnread: 0,
    loading: false,
    lastSyncAt: null,
  });

  useEffect(() => {
    const unsub = mailSync.subscribe(setSyncState);
    return unsub;
  }, []);

  // Use messages from mailSync (already synced, no need for separate fetchInbox)
  useEffect(() => {
    if (filterContactId) {
      setMessages(syncState.messages.filter((m) => m.senderAccountId === filterContactId));
    } else {
      setMessages(syncState.messages);
    }
  }, [syncState.messages, filterContactId]);

  useEffect(() => {
    setLoading(syncState.loading);
  }, [syncState.loading]);

  // Handle mailParams: contactId or messageId
  useEffect(() => {
    if (!mailParams || mailParamsConsumedRef.current) return;
    mailParamsConsumedRef.current = true;

    if (mailParams.contactId) {
      setFilterContactId(mailParams.contactId);
    }
    if (mailParams.messageId) {
      const msg = syncState.messages.find((m) => m.id === mailParams.messageId);
      if (msg) {
        openMessage(msg);
      } else {
        // Message not yet loaded — try fetching it directly
        (async () => {
          const { fetchMessage } = await import('../services/mailStore');
          const fetched = await fetchMessage(mailParams.messageId!);
          if (fetched) openMessage(fetched);
        })();
      }
    }

    onMailParamsConsumed?.();
  }, [mailParams]);

  // MailSync provides real-time messages — no manual fetch needed.
  // The initial sync happens when mailSync.start() is called in App.tsx.

  // Keep `selected` in sync with the latest messages from mailSync.
  useEffect(() => {
    if (!selected) return;
    const fresh = syncState.messages.find((m) => m.id === selected.id);
    if (fresh && fresh !== selected) {
      setSelected(fresh);
    }
  }, [syncState.messages, selected]);

  const openMessage = async (m: MailMessage) => {
    setSelected(m);
    if (!m.isRead) {
      await mailSync.optimisticMarkRead(m.id);
    }
  };

  // Download attachment via Supabase Storage (RLS-enforced) → save locally.
  const handleDownload = useCallback(
    async (a: MailAttachment, downloadName: string) => {
      const bytes = await downloadAttachment(a);
      if (!bytes) return;

      const bridge = (window as any).edaraDesktop;
      if (bridge && typeof bridge.saveAttachmentBuffer === 'function') {
        // Electron: pass ArrayBuffer to native Save As dialog
        const array = Array.from(new Uint8Array(bytes));
        await bridge.saveAttachmentBuffer(array, downloadName);
      } else {
        // Browser fallback: trigger download via blob URL
        const blob = new Blob([bytes]);
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = downloadName;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
      }
    },
    []
  );

  const unreadCount = syncState.totalUnread;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', direction: 'rtl', background: '#f7f9fc' }}>
      <style>{`
        @keyframes mailSlideIn {
          from { opacity: 0; transform: translateX(16px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        .mail-reader-anim { animation: mailSlideIn 220ms ease-out; }
        @media (prefers-reduced-motion: reduce) {
          .mail-reader-anim { animation: none; }
        }
      `}</style>

      {/* Header — title + filter indicator */}
      <div
        style={{
          padding: '14px 20px',
          borderBottom: `1px solid ${BORDER}`,
          background: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h2 style={{ margin: 0, fontSize: 18, color: '#1f2937' }}>
            {filterContactId
              ? `رسائل ${messages[0]?.senderDisplayName || 'مرسل'}`
              : 'البريد الإداري'}
          </h2>
          {filterContactId && (
            <button
              onClick={() => {
                setFilterContactId(null);
                setSelected(null);
              }}
              style={{
                padding: '3px 10px',
                fontSize: 12,
                fontWeight: 600,
                color: '#64748b',
                background: '#f1f5f9',
                border: '1px solid #e2e8f0',
                borderRadius: 6,
                cursor: 'pointer',
              }}
            >
              عرض الكل
            </button>
          )}
        </div>
        {unreadCount > 0 && (
          <span
            style={{
              background: BLUE_SOFT,
              color: BLUE,
              fontSize: 13,
              fontWeight: 600,
              padding: '3px 10px',
              borderRadius: 999,
            }}
          >
            {unreadCount} غير مقروء
          </span>
        )}
      </div>

      {/* Two-panel body: RIGHT = list, LEFT = reader (RTL) */}
      <div style={{ flex: 1, display: 'flex', direction: 'rtl', minHeight: 0 }}>
        {/* Message list (right side, narrower) */}
        <div
          style={{
            width: '34%',
            minWidth: 280,
            borderLeft: `1px solid ${BORDER}`,
            overflowY: 'auto',
            background: '#fff',
          }}
        >
          {loading && messages.length === 0 ? (
            <div style={{ padding: 20, color: '#94a3b8' }}>جارٍ التحميل…</div>
          ) : messages.length === 0 ? (
            <div style={{ padding: 20, color: '#94a3b8' }}>لا توجد رسائل.</div>
          ) : (
            messages.map((m) => {
              const active = selected?.id === m.id;
              const unread = !m.isRead;
              const hasAtt = Array.isArray(m.attachments) && m.attachments.length > 0;
              return (
                <div
                  key={m.id}
                  onClick={() => openMessage(m)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: `1px solid ${BORDER}`,
                    borderRight: active ? `3px solid ${BLUE}` : '3px solid transparent',
                    cursor: 'pointer',
                    background: active ? BLUE_SOFT : unread ? '#fffdf8' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {unread && (
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: UNREAD_DOT, flexShrink: 0 }} />
                    )}
                    <span
                      style={{
                        fontWeight: unread ? 700 : 500,
                        color: '#1f2937',
                        fontSize: 14,
                        flex: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {m.subject || '(بدون موضوع)'}
                    </span>
                  </div>
                  <div style={{ fontSize: 12.5, color: '#64748b', marginTop: 4, display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {m.senderDisplayName || m.senderOrgId || ''}
                    </span>
                    <span style={{ flexShrink: 0, color: '#94a3b8' }}>{formatDate(m.createdAt)}</span>
                  </div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span>{formatTime(m.createdAt)}</span>
                    {hasAtt && (
                      <span title="يحتوي على مرفق" style={{ color: '#64748b' }}>
                        📎
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Reader (left side, wider) */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, minWidth: 0 }}>
          {!selected ? (
            <div
              style={{
                height: '100%',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#94a3b8',
                fontSize: 16,
                textAlign: 'center',
              }}
            >
              اختر رسالة لعرض محتواها
            </div>
          ) : (
            <div key={selected.id} className="mail-reader-anim" style={{ maxWidth: 860, margin: '0 auto' }}>
              <h1 style={{ margin: '0 0 6px', fontSize: 22, color: '#111827' }}>{selected.subject || '(بدون موضوع)'}</h1>

              <div
                style={{
                  background: '#fff',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: '14px 16px',
                  marginBottom: 18,
                }}
              >
                <Row label="من:" value={selected.senderDisplayName || selected.senderOrgId || '—'} />
                <Row label="التاريخ:" value={formatDate(selected.createdAt)} />
                <Row label="الوقت:" value={formatTime(selected.createdAt)} />
              </div>

              <div
                style={{
                  background: '#fff',
                  border: `1px solid ${BORDER}`,
                  borderRadius: 12,
                  padding: 18,
                  lineHeight: 1.85,
                  fontSize: 15,
                  color: '#1f2937',
                  whiteSpace: 'pre-wrap',
                  marginBottom: 18,
                }}
              >
                {selected.body || ''}
              </div>

              {selected.attachments && selected.attachments.length > 0 && (
                <div
                  style={{
                    background: '#fff',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                    padding: 18,
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>المرفقات</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {(() => {
                      const used = new Set<string>();
                      const nameByAtt = new Map<string, string>();
                      for (const a of selected.attachments) {
                        nameByAtt.set(a.id, buildDownloadName(selected.createdAt, a.mimeType || '', used));
                      }
                      return selected.attachments.map((a) => (
                        <AttachmentView
                          key={a.id}
                          a={a}
                          downloadName={nameByAtt.get(a.id) || ''}
                          onEnlarge={async () => {
                            const url = await getAttachmentPreviewUrl(a);
                            if (url) setLightboxUrl(url);
                          }}
                          onDownload={() => handleDownload(a, nameByAtt.get(a.id) || '')}
                        />
                      ));
                    })()}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {lightboxUrl && (
        <div
          onClick={() => setLightboxUrl(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,23,42,0.82)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 200,
            padding: 24,
          }}
        >
          <img
            src={lightboxUrl}
            alt=""
            style={{ maxWidth: '92%', maxHeight: '92%', objectFit: 'contain', borderRadius: 8, boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}
          />
        </div>
      )}
    </div>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 14 }}>
      <span style={{ color: '#64748b', minWidth: 64 }}>{label}</span>
      <span style={{ color: '#1f2937', fontWeight: 500 }}>{value}</span>
    </div>
  );
}

const AttachmentView: React.FC<{
  a: MailAttachment;
  downloadName: string;
  onEnlarge: () => void;
  onDownload: () => void;
}> = ({ a, downloadName, onEnlarge, onDownload }) => {
  const mime = a.mimeType || '';
  const isImage = mime.startsWith('image/');
  const hasContent = !!a.storedPath;

  if (isImage && hasContent) {
    return (
      <div>
        <AttachmentPreviewImage att={a} onClick={onEnlarge} />
        <DownloadButton onClick={onDownload} />
      </div>
    );
  }

  if (hasContent) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 14px',
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          background: '#f8fbff',
        }}
      >
        <span style={{ fontSize: 20 }}>📄</span>
        <span style={{ flex: 1 }}>
          <div style={{ fontWeight: 600, color: '#1f2937' }}>{typeLabel(mime)}</div>
          <div style={{ fontSize: 12, color: '#64748b' }}>
            {formatSize(a.fileSize) && `• ${formatSize(a.fileSize)}`}
          </div>
        </span>
        <DownloadButton onClick={onDownload} />
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 12px',
        border: `1px solid ${BORDER}`,
        borderRadius: 10,
        background: '#f8fafc',
      }}
    >
      <span style={{ fontSize: 18 }}>📎</span>
      <span style={{ flex: 1 }}>
        <div style={{ fontWeight: 600, color: '#334155' }}>{typeLabel(mime)}</div>
        <div style={{ fontSize: 12, color: '#64748b' }}>
          {formatSize(a.fileSize) && `• ${formatSize(a.fileSize)}`}
        </div>
      </span>
    </div>
  );
};

const AttachmentPreviewImage: React.FC<{
  att: MailAttachment;
  onClick: () => void;
}> = ({ att, onClick }) => {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await getAttachmentPreviewUrl(att);
      if (!cancelled && url) setSrc(url);
    })();
    return () => {
      cancelled = true;
    };
  }, [att]);

  if (!src) {
    return (
      <div
        style={{
          padding: '10px 12px',
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          background: '#f8fafc',
          color: '#94a3b8',
          fontSize: 13,
        }}
      >
        جارٍ تحميل المعاينة…
      </div>
    );
  }

  return (
    <img
      src={src}
      alt=""
      onClick={onClick}
      style={{
        maxWidth: '100%',
        maxHeight: 420,
        objectFit: 'contain',
        borderRadius: 8,
        border: `1px solid ${BORDER}`,
        cursor: 'pointer',
        display: 'block',
      }}
    />
  );
};

function DownloadButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        marginTop: 10,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        border: 'none',
        borderRadius: 10,
        background: BLUE,
        color: '#fff',
        fontSize: 14,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      <span>⬇</span>
      <span>تنزيل</span>
    </button>
  );
}
