/**
 * Correspondence Sync Service
 *
 * Downloads official administrative correspondence from Supabase
 * (temporary delivery queue) and persists it permanently to local
 * SQLite + local filesystem. Supabase is ONLY a delivery server.
 *
 * Flow:
 *   1. Fetch pending messages from Supabase
 *   2. Download attachment (if present)
 *   3. Save attachment to local filesystem
 *   4. Save message to local SQLite
 *   5. Send delivery acknowledgement → server deletes temporary copy
 *
 * SECURITY: Uses the authenticated user's JWT (RLS-enforced).
 * Only the recipient school can access its own messages.
 */
import { supabase } from './supabase';
import { api } from './api';

// Raw Supabase row from official_correspondence (or equivalent table)
interface RawCorrespondence {
  id: string;
  sender_display_name: string | null;
  subject: string | null;
  description: string | null;
  sent_at: string | null;
  attachment_name: string | null;
  attachment_path: string | null;
  attachment_size: number | null;
  recipient_account_id: string | null;
  is_delivered: boolean | null;
  created_at: string | null;
  [key: string]: unknown;
}

/**
 * Fetch pending correspondence from Supabase for the authenticated account.
 * Returns messages where is_delivered = false (not yet acknowledged).
 */
async function fetchPendingCorrespondence(): Promise<RawCorrespondence[]> {
  if (!supabase) return [];

  try {
    const { data: rows, error } = await supabase
      .from('official_correspondence')
      .select('*')
      .eq('is_delivered', false)
      .order('sent_at', { ascending: true });

    if (error) {
      console.error('[Correspondence] fetch error:', error.message);
      return [];
    }

    return (rows ?? []) as RawCorrespondence[];
  } catch (e: any) {
    console.error('[Correspondence] fetch exception:', e?.message);
    return [];
  }
}

/**
 * Download attachment from Supabase Storage.
 * Uses the authenticated session's JWT (RLS-enforced).
 */
async function downloadAttachment(attachmentPath: string): Promise<ArrayBuffer | null> {
  if (!supabase || !attachmentPath) return null;

  try {
    const { data, error } = await supabase.storage
      .from('official-mail-attachments')
      .download(attachmentPath);

    if (error || !data) {
      console.error('[Correspondence] attachment download error:', error?.message);
      return null;
    }

    return await data.arrayBuffer();
  } catch (e: any) {
    console.error('[Correspondence] attachment download exception:', e?.message);
    return null;
  }
}

/**
 * Send delivery acknowledgement to Supabase.
 * This tells the server the message has been saved locally.
 * The server should then delete its temporary copy.
 */
async function acknowledgeDelivery(messageId: string): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from('official_correspondence')
      .update({ is_delivered: true, delivered_at: new Date().toISOString() })
      .eq('id', messageId);

    if (error) {
      console.error('[Correspondence] acknowledge error:', error.message);
      return false;
    }
    return true;
  } catch (e: any) {
    console.error('[Correspondence] acknowledge exception:', e?.message);
    return false;
  }
}

/**
 * Process a single correspondence message:
 * 1. Download attachment (if present)
 * 2. Save attachment to local filesystem
 * 3. Save message to local SQLite
 * 4. Acknowledge delivery
 */
async function processMessage(msg: RawCorrespondence): Promise<boolean> {
  const messageId = msg.id;
  let localAttachmentPath = '';
  let attachmentName = msg.attachment_name || '';

  // Step 1-2: Download and save attachment if present
  if (msg.attachment_path && msg.attachment_name) {
    const buffer = await downloadAttachment(msg.attachment_path);
    if (!buffer) {
      console.error(`[Correspondence] failed to download attachment for ${messageId}`);
      return false;
    }

    const saveResult = await api.saveCorrespondenceAttachment(messageId, msg.attachment_name, buffer);
    if (!saveResult.success || !saveResult.localPath) {
      console.error(`[Correspondence] failed to save attachment for ${messageId}`);
      return false;
    }

    localAttachmentPath = saveResult.localPath;
  }

  // Step 3: Save message to local SQLite
  const saveResult = await api.saveCorrespondence({
    message_id: messageId,
    sender_display_name: msg.sender_display_name || '',
    subject: msg.subject || '',
    description: msg.description || '',
    sent_at: msg.sent_at || msg.created_at || new Date().toISOString(),
    attachment_name: attachmentName,
    local_attachment_path: localAttachmentPath,
  });

  if (!saveResult.success) {
    console.error(`[Correspondence] failed to save message ${messageId}: ${saveResult.message}`);
    return false;
  }

  // Step 4: Acknowledge delivery to Supabase
  const ackResult = await acknowledgeDelivery(messageId);
  if (!ackResult) {
    console.error(`[Correspondence] failed to acknowledge ${messageId}`);
    // Message is saved locally but not acknowledged — will be retried
    // This is acceptable: the message is permanently stored locally
  }

  return true;
}

/**
 * Main sync function. Fetches pending correspondence from Supabase
 * and processes each one locally. Called on app startup, login, and
 * periodic sync.
 */
export async function syncCorrespondence(): Promise<{ received: number; errors: number }> {
  const pending = await fetchPendingCorrespondence();
  if (pending.length === 0) return { received: 0, errors: 0 };

  let received = 0;
  let errors = 0;

  for (const msg of pending) {
    const success = await processMessage(msg);
    if (success) {
      received++;
    } else {
      errors++;
    }
  }

  return { received, errors };
}

/**
 * Check if there are any pending (undelivered) correspondence messages.
 * Useful for showing a sync indicator.
 */
export async function hasPendingCorrespondence(): Promise<boolean> {
  if (!supabase) return false;

  try {
    const { count, error } = await supabase
      .from('official_correspondence')
      .select('id', { count: 'exact', head: true })
      .eq('is_delivered', false);

    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}
