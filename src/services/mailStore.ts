import { supabase } from './supabase';
import { getAccount } from './auth';
import type { MailMessage, MailAttachment } from '../types';

// ============================================================================
// Account-Isolated Mail Store (Supabase RLS-enforced, receive-only)
//
// Edara Desktop is strictly RECEIVE-ONLY. There is no Outbox, Sent, Compose,
// Send, Reply, or Forward.
//
// SECURITY: All reads are enforced by Supabase RLS. The SQL policy on
// official_messages is:
//   USING (recipient_account_id = get_my_edara_account_id())
//
// The frontend NEVER sends recipient_account_id or account_id as query
// parameters. RLS enforces isolation regardless of what the client requests.
//
// The Supabase client uses the authenticated user's JWT, which maps to the
// `authenticated` role. The `authenticated` role can only SELECT rows where
// recipient_account_id matches the caller's edara_accounts.id.
// ============================================================================

// Storage bucket name for mail attachments.
// Must match the bucket configured by Edara News in the shared Supabase project.
const MAIL_ATTACHMENT_BUCKET = 'official-mail-attachments';

// Account-scoped localStorage cache key prefix.
const CACHE_PREFIX = 'edara_desktop_mail_inbox_';

// ============================================================================
// Raw Supabase row type (maps to official_messages)
//
// Column names are based on the account-isolation contract agreed with Edara News.
// If the live table uses different names, update these interfaces and the
// mapRow/mmapAttachment functions below.
// ============================================================================

interface RawOfficialMessage {
  id: string;
  sender_account_id: string | null;
  recipient_account_id: string | null;
  sender_organization_type: string | null;
  sender_organization_id: string | null;
  sender_org_name: string | null;
  recipient_organization_type: string | null;
  recipient_organization_id: string | null;
  recipient_org_name: string | null;
  subject: string | null;
  body: string | null;
  status: string | null;
  read_at: string | null;
  created_at: string | null;
  delivered_at: string | null;
  updated_at: string | null;
  attachments: unknown;
  [key: string]: unknown;
}

/**
 * Parse a single object from the official_messages.attachments JSONB array.
 * The JSONB objects have: id, name, path (and possibly other fields).
 * This is different from the old official_message_attachments table schema.
 */
function parseJsonbAttachment(
  raw: Record<string, unknown>,
  recipientAccountId: string,
  messageId: string
): MailAttachment {
  const id = String(raw.id ?? '');
  const name = String(raw.name ?? raw.filename ?? raw.file_name ?? '');
  const path = String(raw.path ?? raw.storage_path ?? '');

  // Resolve storage path: use explicit path, or construct canonical path
  let storedPath = path;
  if (!storedPath && recipientAccountId && messageId && name) {
    storedPath = `accounts/${recipientAccountId}/messages/${messageId}/${name}`;
  }

  // Detect MIME type from name extension
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  const mimeMap: Record<string, string> = {
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    webp: 'image/webp',
    gif: 'image/gif',
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  };
  const mimeType = String(raw.mime_type ?? raw.mimeType ?? raw.type ?? mimeMap[ext] ?? '');

  const result: MailAttachment = {
    id,
    fileName: name,
    fileSize: Number(raw.size ?? 0),
    mimeType,
    storedPath,
    createdAt: '',
  };

  return result;
}

/**
 * Safely parse the attachments JSONB column from official_messages.
 * Handles: null, undefined, [], JSON string, array of objects, malformed values.
 * Returns an array of MailAttachment.
 */
function parseAttachmentsJsonb(
  rawAttachments: unknown,
  recipientAccountId: string,
  messageId: string
): MailAttachment[] {
  if (!rawAttachments) return [];

  let arr: unknown[];
  if (typeof rawAttachments === 'string') {
    try {
      arr = JSON.parse(rawAttachments);
    } catch {
      return [];
    }
  } else if (Array.isArray(rawAttachments)) {
    arr = rawAttachments;
  } else {
    return [];
  }

  return arr
    .filter((item): item is Record<string, unknown> =>
      item !== null && typeof item === 'object' && !Array.isArray(item)
    )
    .map((item) => parseJsonbAttachment(item, recipientAccountId, messageId));
}

// ============================================================================
// Field Mapping
//
// Maps Supabase row → MailMessage. Defensive: falls back to empty strings
// if a field is missing (RLS enforces security regardless).
// ============================================================================

function mapRow(row: RawOfficialMessage): MailMessage {
  // Derive read status from read_at (if set, message is read).
  // The is_read column may not exist in the shared Supabase schema.
  const isRead = row.read_at ? 1 : 0;

  return {
    id: row.id ?? '',
    remoteId: null,
    folder: 'inbox',
    subject: row.subject ?? '',
    body: row.body ?? '',
    senderAccountId: row.sender_account_id ?? '',
    senderOrgType: row.sender_organization_type ?? '',
    senderOrgId: row.sender_organization_id ?? '',
    senderDisplayName: row.sender_org_name ?? '',
    recipientOrgType: row.recipient_organization_type ?? '',
    recipientOrgId: row.recipient_organization_id ?? '',
    recipientDisplayName: row.recipient_org_name ?? '',
    isRead,
    status: row.status ?? null,
    createdAt: row.created_at ?? '',
    updatedAt: row.updated_at ?? '',
    attachments: [],
  };
}

// ============================================================================
// Account-Scoped Cache (localStorage)
//
// Cache key: edara_desktop_mail_inbox_{account_id}
// Each account's cache is independent. When a different account logs in,
// the old cache is never loaded. On logout, clear the active account's cache.
// ============================================================================

function cacheKey(accountId: string): string {
  return `${CACHE_PREFIX}${accountId}`;
}

function getCachedInbox(accountId: string): MailMessage[] | null {
  try {
    const raw = localStorage.getItem(cacheKey(accountId));
    if (!raw) return null;
    return JSON.parse(raw) as MailMessage[];
  } catch {
    return null;
  }
}

function setCachedInbox(accountId: string, messages: MailMessage[]): void {
  try {
    localStorage.setItem(cacheKey(accountId), JSON.stringify(messages));
  } catch {
    // ignore quota errors
  }
}

export function clearMailCache(accountId?: string): void {
  try {
    if (accountId) {
      localStorage.removeItem(cacheKey(accountId));
    } else {
      // Clear all mail caches (all accounts)
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(CACHE_PREFIX)) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    }
  } catch {
    // ignore
  }
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Resolve the current Edara Desktop account ID from the authenticated Supabase
 * session. This is the edara_accounts.id, NOT auth.uid() directly.
 *
 * Returns null if not authenticated or no account exists.
 */
export async function getCurrentAccountId(): Promise<string | null> {
  try {
    const account = await getAccount();
    return account?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Fetch the account's inbox from Supabase (RLS-enforced).
 *
 * SECURITY: The query does NOT filter by recipient_account_id. RLS on the
 * server automatically restricts results to rows where
 * recipient_account_id = get_my_edara_account_id().
 *
 * Returns messages ordered by created_at DESC (newest first).
 * Returns empty list on error (never throws).
 */
export async function fetchInbox(): Promise<MailMessage[]> {
  if (!supabase) return [];

  const accountId = await getCurrentAccountId();
  if (!accountId) return [];

  try {
    // Query official_messages directly. RLS enforces:
    // recipient_account_id = get_my_edara_account_id()
    const { data: rows, error } = await supabase
      .from('official_messages')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[mailStore] fetchInbox error:', error.message);
      return getCachedInbox(accountId) ?? [];
    }

    // Parse messages — attachments come from the JSONB column, NOT a separate table
    const messages: MailMessage[] = (rows ?? []).map((row) => {
      const raw = row as RawOfficialMessage;
      const msg = mapRow(raw);
      msg.attachments = parseAttachmentsJsonb(
        raw.attachments,
        raw.recipient_account_id ?? '',
        raw.id
      );
      return msg;
    });

    // Cache for offline fallback
    setCachedInbox(accountId, messages);

    return messages;
  } catch (e: any) {
    console.error('[mailStore] fetchInbox exception:', e?.message);
    return getCachedInbox(accountId) ?? [];
  }
}

/**
 * Fetch a single message by ID. RLS enforces that only the recipient can read it.
 * Returns null if not found or access denied.
 */
export async function fetchMessage(id: string): Promise<MailMessage | null> {
  if (!supabase || !id) return null;

  try {
    const { data: row, error } = await supabase
      .from('official_messages')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error || !row) return null;

    const raw = row as RawOfficialMessage;
    const msg = mapRow(raw);

    // Parse attachments from JSONB column (NOT a separate table)
    msg.attachments = parseAttachmentsJsonb(
      raw.attachments,
      raw.recipient_account_id ?? '',
      raw.id
    );

    return msg;
  } catch {
    return null;
  }
}

/**
 * Mark a message as read. RLS enforces:
 * message.recipient_account_id = get_my_edara_account_id()
 *
 * A school cannot mark another school's message as read.
 * Returns true on success, false on failure.
 */
export async function markRead(id: string): Promise<boolean> {
  if (!supabase || !id) return false;

  try {
    // Only update read_at. The is_read column may not exist in the shared schema.
    // Read status is derived from read_at being non-null.
    const { error } = await supabase
      .from('official_messages')
      .update({
        read_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      console.error('[mailStore] markRead error:', error.message);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Download an attachment's binary content from Supabase Storage.
 *
 * SECURITY: Uses the authenticated session's JWT to download, which respects
 * Storage bucket RLS policies. The download URL is never exposed to the client
 * as a persistent signed URL.
 *
 * Returns an ArrayBuffer on success, null on failure.
 */
export async function downloadAttachment(
  att: MailAttachment
): Promise<ArrayBuffer | null> {
  if (!supabase || !att.storedPath) return null;

  try {
    const { data, error } = await supabase.storage
      .from(MAIL_ATTACHMENT_BUCKET)
      .download(att.storedPath);

    if (error || !data) return null;

    return await data.arrayBuffer();
  } catch {
    return null;
  }
}

/**
 * Get a short-lived signed URL for previewing an attachment inline (images).
 * The signed URL is scoped to the authenticated session and respects Storage RLS.
 *
 * Returns null on failure.
 */
export async function getAttachmentPreviewUrl(att: MailAttachment): Promise<string | null> {
  if (!supabase || !att.storedPath) return null;

  try {
    const { data, error } = await supabase.storage
      .from(MAIL_ATTACHMENT_BUCKET)
      .createSignedUrl(att.storedPath, 3600);

    if (error || !data?.signedUrl) return null;

    return data.signedUrl;
  } catch {
    return null;
  }
}

/**
 * Clear mail cache for the current account (called on logout).
 */
export async function clearCurrentAccountMailCache(): Promise<void> {
  const accountId = await getCurrentAccountId();
  if (accountId) clearMailCache(accountId);
}
