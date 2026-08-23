/**
 * CorrespondenceView — Official Administrative Correspondence Inbox
 *
 * Displays correspondence received from Edara News administrators.
 * Each message is permanently stored in local SQLite + local filesystem.
 * Supabase is only used as a temporary delivery queue.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Mail, MailOpen, Paperclip, RefreshCw, Loader2, Inbox } from 'lucide-react';
import { api } from '../services/api';
import { syncCorrespondence } from '../services/correspondence';
import type { Correspondence } from '../types';

const BLUE = '#1f5fa8';
const BORDER = '#e5e7eb';

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

export const CorrespondenceView: React.FC = () => {
  const [items, setItems] = useState<Correspondence[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [selected, setSelected] = useState<Correspondence | null>(null);

  const loadLocal = useCallback(async () => {
    try {
      const res = await api.getCorrespondence();
      if (res.success) setItems(res.correspondence);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  // Load on mount
  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  // Sync from Supabase
  const handleSync = useCallback(async () => {
    setSyncing(true);
    try {
      const result = await syncCorrespondence();
      if (result.received > 0) {
        await loadLocal();
      }
    } catch {
      // ignore
    } finally {
      setSyncing(false);
    }
  }, [loadLocal]);

  // Auto-sync on mount
  useEffect(() => {
    handleSync();
  }, [handleSync]);

  // Open a message (mark as read locally)
  const openMessage = useCallback(async (item: Correspondence) => {
    setSelected(item);
    if (!item.is_read) {
      await api.markCorrespondenceRead(item.message_id);
      setItems((prev) =>
        prev.map((m) =>
          m.message_id === item.message_id ? { ...m, is_read: 1 } : m
        )
      );
      setSelected((prev) => (prev && prev.message_id === item.message_id ? { ...prev, is_read: 1 } : prev));
    }
  }, []);

  // Open attachment
  const openAttachment = useCallback(async (item: Correspondence) => {
    const res = await api.openCorrespondenceAttachment(item.message_id);
    if (!res.success) {
      // Attachment not available locally
    }
  }, []);

  const unreadCount = items.filter((m) => !m.is_read).length;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', direction: 'rtl', background: '#f7f9fc' }}>
      {/* Header */}
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
          <h2 style={{ margin: 0, fontSize: 18, color: '#1f2937' }}>المراسلات الإدارية</h2>
          {unreadCount > 0 && (
            <span
              style={{
                background: '#eaf2fb',
                color: BLUE,
                fontSize: 13,
                fontWeight: 600,
                padding: '3px 10px',
                borderRadius: 999,
              }}
            >
              {unreadCount} جديدة
            </span>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 14px',
            fontSize: 13,
            fontWeight: 600,
            color: BLUE,
            background: '#eaf2fb',
            border: '1px solid #bfdbfe',
            borderRadius: 8,
            cursor: syncing ? 'default' : 'pointer',
            opacity: syncing ? 0.6 : 1,
          }}
        >
          {syncing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          <span>مزامنة</span>
        </button>
      </div>

      {/* Two-panel body */}
      <div style={{ flex: 1, display: 'flex', direction: 'rtl', minHeight: 0 }}>
        {/* Message list */}
        <div
          style={{
            width: '34%',
            minWidth: 280,
            borderLeft: `1px solid ${BORDER}`,
            overflowY: 'auto',
            background: '#fff',
          }}
        >
          {loading ? (
            <div style={{ padding: 20, color: '#94a3b8' }}>جارٍ التحميل…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
              <Inbox size={40} style={{ marginBottom: 12, opacity: 0.4 }} />
              <div style={{ fontSize: 14 }}>لا توجد مراسلات بعد</div>
            </div>
          ) : (
            items.map((item) => {
              const active = selected?.message_id === item.message_id;
              const unread = !item.is_read;
              const hasAtt = !!item.attachment_name;
              return (
                <div
                  key={item.message_id}
                  onClick={() => openMessage(item)}
                  style={{
                    padding: '12px 14px',
                    borderBottom: `1px solid ${BORDER}`,
                    borderRight: active ? `3px solid ${BLUE}` : '3px solid transparent',
                    cursor: 'pointer',
                    background: active ? '#eaf2fb' : unread ? '#fffdf8' : '#fff',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {unread ? (
                      <Mail size={14} style={{ color: '#e67e22', flexShrink: 0 }} />
                    ) : (
                      <MailOpen size={14} style={{ color: '#94a3b8', flexShrink: 0 }} />
                    )}
                    <span
                      style={{
                        fontWeight: unread ? 700 : 500,
                        color: '#1f2937',
                        fontSize: 13,
                        flex: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {item.sender_display_name || 'غير معروف'}
                    </span>
                  </div>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: '#64748b',
                      marginTop: 4,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {item.subject || '(بدون موضوع)'}
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2, display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span>{formatDate(item.sent_at)}</span>
                    {hasAtt && <Paperclip size={11} style={{ color: '#64748b' }} />}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Reader */}
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
            <div style={{ maxWidth: 860, margin: '0 auto' }}>
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
                <Row label="الجهة المرسلة:" value={selected.sender_display_name || '—'} />
                <Row label="التاريخ:" value={formatDate(selected.sent_at)} />
                <Row label="الوقت:" value={formatTime(selected.sent_at)} />
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
                {selected.description || ''}
              </div>

              {selected.attachment_name && (
                <div
                  style={{
                    background: '#fff',
                    border: `1px solid ${BORDER}`,
                    borderRadius: 12,
                    padding: 18,
                  }}
                >
                  <div style={{ fontWeight: 700, color: '#1f2937', marginBottom: 12 }}>المرفق</div>
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
                    <Paperclip size={18} style={{ color: '#64748b' }} />
                    <span style={{ flex: 1, fontWeight: 600, color: '#1f2937', fontSize: 14 }}>
                      {selected.attachment_name}
                    </span>
                    <button
                      onClick={() => openAttachment(selected)}
                      style={{
                        padding: '6px 14px',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#fff',
                        background: BLUE,
                        border: 'none',
                        borderRadius: 8,
                        cursor: 'pointer',
                      }}
                    >
                      فتح
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 8, padding: '3px 0', fontSize: 14 }}>
      <span style={{ color: '#64748b', minWidth: 80 }}>{label}</span>
      <span style={{ color: '#1f2937', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
