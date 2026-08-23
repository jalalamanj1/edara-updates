import { supabase } from './supabase';
import type { Account, AccountType, DeviceStatus } from '../types';

// ----------------------------------------------------------------------------
// Edara account login + server-authoritative device management.
//
// All account/device authority lives in Supabase (Postgres RPCs + RLS). The
// client never decides device limits; register_device() enforces them on the
// server. See supabase/migrations/0001_accounts_devices.sql.
// ----------------------------------------------------------------------------

const DEVICE_ID_KEY = 'edara_device_id';
const APP_VERSION = '1.0.2';

export type { Account, AccountType, DeviceStatus };

export interface AuthResult {
  ok: boolean;
  status?: DeviceStatus;
  account?: Account;
  error?: string; // Arabic, user-facing
  code?: 'no_session' | 'not_configured' | 'no_account';
}

// ---- Stable installation/device identity (generated, not fingerprinted) ----
export function getDeviceId(): string {
  try {
    if (typeof localStorage !== 'undefined') {
      let id = localStorage.getItem(DEVICE_ID_KEY);
      if (!id) {
        id = crypto.randomUUID();
        localStorage.setItem(DEVICE_ID_KEY, id);
      }
      return id;
    }
  } catch {
    /* ignore */
  }
  return crypto.randomUUID();
}

function getPlatformLabel(): string {
  try {
    const p = (navigator.platform || navigator.userAgent || '').toLowerCase();
    if (p.includes('win')) return 'Windows';
    if (p.includes('mac')) return 'macOS';
    if (p.includes('linux')) return 'Linux';
    if (p.includes('android')) return 'Android';
    if (p.includes('iphone') || p.includes('ipad')) return 'iOS';
  } catch {
    /* ignore */
  }
  return 'جهاز';
}

export function getDeviceName(): string {
  const platform = getPlatformLabel();
  const short = getDeviceId().slice(0, 8);
  return `${platform} · ${short}`;
}

// ---- Arabic message constants ----
const MSG_LIMIT =
  'تم الوصول إلى الحد الأقصى للأجهزة المسموح بها لهذا الحساب.';
const MSG_REVOKED = 'تم إلغاء تفعيل هذا الجهاز من قبل الإدارة. يرجى التواصل مع الإدارة للسماح بهذا الجهاز.';
const MSG_DISABLED = 'هذا الحساب غير فعال.';
const MSG_NO_ACCOUNT = 'لا يوجد حساب Edara مرتبط بهذا المستخدم.';
const MSG_NOT_CONFIGURED = 'لم يتم تهيئة نظام الحسابات. تحقق من إعدادات Supabase في التطبيق.';
const MSG_GENERIC = 'تعذر إتمام تسجيل الدخول. يرجى المحاولة مرة أخرى.';

// ---- Supabase auth / session helpers ----
export async function getSession() {
  if (!supabase) return { session: null };
  const { data } = await supabase.auth.getSession();
  return { session: data.session };
}

export function onAuthStateChange(cb: (event: string, session: any) => void) {
  if (!supabase) return () => {};
  const { data } = supabase.auth.onAuthStateChange(cb);
  return () => data.subscription.unsubscribe();
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

// ---- Account + device operations ----
async function ensureAccount(): Promise<Account | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('ensure_account');
  if (error) {
    console.error('[auth] ensure_account failed:', error.message);
    return null;
  }
  return (data as Account) ?? null;
}

async function fetchAccount(): Promise<Account | null> {
  if (!supabase) return null;
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return null;
  const { data, error } = await supabase
    .from('edara_accounts')
    .select('*')
    .eq('auth_user_id', uid)
    .maybeSingle();
  if (error) {
    console.error('[auth] fetch account failed:', error.message);
    return null;
  }
  return (data as Account) ?? null;
}

export async function getAccount(): Promise<Account | null> {
  return fetchAccount();
}

export async function updateAccountCity(city: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: MSG_NOT_CONFIGURED };
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, error: MSG_GENERIC };
  const { error } = await supabase
    .from('edara_accounts')
    .update({ city: city || null, updated_at: new Date().toISOString() })
    .eq('auth_user_id', uid);
  if (error) {
    console.error('[auth] updateAccountCity failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function updateAccountOrganizationName(name: string): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: MSG_NOT_CONFIGURED };
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, error: MSG_GENERIC };
  const { error } = await supabase
    .from('edara_accounts')
    .update({ organization_name: name || null, updated_at: new Date().toISOString() })
    .eq('auth_user_id', uid);
  if (error) {
    console.error('[auth] updateAccountOrganizationName failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/**
 * Update official organization profile fields in Supabase.
 * Only updates the fields passed in `fields`. Protected fields (school_name,
 * governorate, city, account_type, etc.) are never sent.
 */
export async function updateAccountProfile(fields: {
  principal_name?: string;
  phone?: string;
  address?: string;
  job_title?: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!supabase) return { ok: false, error: MSG_NOT_CONFIGURED };
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) return { ok: false, error: MSG_GENERIC };

  // Build update payload — only include defined fields
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (fields.principal_name !== undefined) payload.principal_name = fields.principal_name || null;
  if (fields.phone !== undefined) payload.phone = fields.phone || null;
  if (fields.address !== undefined) payload.address = fields.address || null;
  if (fields.job_title !== undefined) payload.job_title = fields.job_title || null;

  const { error } = await supabase
    .from('edara_accounts')
    .update(payload)
    .eq('auth_user_id', uid);

  if (error) {
    console.error('[auth] updateAccountProfile failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

async function registerDevice(): Promise<{ status: DeviceStatus; account?: Account }> {
  if (!supabase) return { status: 'unauthenticated' };
  const { data, error } = await supabase.rpc('register_device', {
    p_device_id: getDeviceId(),
    p_device_name: getDeviceName(),
    p_platform: getPlatformLabel(),
    p_app_version: APP_VERSION,
  });
  if (error) {
    console.error('[auth] register_device failed:', error.message);
    return { status: 'unauthenticated' };
  }
  const result = data as { status: DeviceStatus; account_type?: AccountType; account_id?: string };
  return { status: result.status };
}

export async function touchDevice(): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc('touch_device', { p_device_id: getDeviceId() });
  if (error) console.warn('[auth] touch_device failed:', error.message);
}

export async function revokeDevice(deviceId: string): Promise<DeviceStatus> {
  if (!supabase) return 'unauthenticated';
  const { data, error } = await supabase.rpc('revoke_device', { p_device_id: deviceId });
  if (error) {
    console.error('[auth] revoke_device failed:', error.message);
    return 'not_found';
  }
  return (data as { status: DeviceStatus }).status;
}

// ---- Map a device-registration result into an AuthResult ----
function finalize(
  account: Account | null,
  status: DeviceStatus
): AuthResult {
  switch (status) {
    case 'ok':
    case 'registered':
      if (!account) return { ok: false, status, error: MSG_GENERIC };
      return { ok: true, status, account };
    case 'limit':
      return { ok: false, status, error: MSG_LIMIT };
    case 'revoked':
      return { ok: false, status, error: MSG_REVOKED };
    case 'disabled':
      return { ok: false, status, error: MSG_DISABLED };
    case 'no_account':
      return { ok: false, status, error: MSG_NO_ACCOUNT, code: 'no_account' };
    case 'unauthenticated':
      return { ok: false, status, error: MSG_GENERIC };
    default:
      return { ok: false, status, error: MSG_GENERIC };
  }
}

// ---- Login (email + password) ----
export async function login(email: string, password: string): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: MSG_NOT_CONFIGURED, code: 'not_configured' };

  const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
  if (signInError) {
    return { ok: false, error: mapAuthError(signInError) };
  }

  // Accounts are provisioned by the administration panel (or the seed SQL),
  // never auto-created by the client. If none exists, surface that state.
  const account = await fetchAccount();
  const { status } = await registerDevice();
  const result = finalize(account, status);

  // If the device is revoked/disabled, the session is useless — sign out.
  if (!result.ok && (status === 'revoked' || status === 'disabled')) {
    await signOut();
  }
  return result;
}

// ---- Bootstrap from an existing (persisted) session on app start ----
export async function bootstrapFromSession(): Promise<AuthResult> {
  if (!supabase) return { ok: false, error: MSG_NOT_CONFIGURED, code: 'not_configured' };

  const { session } = await getSession();
  if (!session) return { ok: false, code: 'no_session' };

  let account = await fetchAccount();
  if (!account) {
    await signOut();
    return { ok: false, status: 'no_account', error: MSG_NO_ACCOUNT, code: 'no_account' };
  }
  if (!account.is_active) {
    await signOut();
    return { ok: false, status: 'disabled', error: MSG_DISABLED };
  }

  const { status } = await registerDevice();
  const result = finalize(account, status);

  if (!result.ok && (status === 'revoked' || status === 'disabled')) {
    await signOut();
  }
  return result;
}

function mapAuthError(error: { message?: string; status?: number }): string {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials') || msg.includes('invalid email or password')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (msg.includes('email not confirmed')) {
    return 'البريد الإلكتروني غير مُفعّل. يرجى تفعيل حسابك أولاً.';
  }
  if (msg.includes('user not found')) {
    return 'لا يوجد حساب مسجّل بهذا البريد الإلكتروني.';
  }
  if (msg.includes('too many requests')) {
    return 'محاولات كثيرة جداً. يرجى المحاولة بعد قليل.';
  }
  if (error?.status === 0 || msg.includes('network') || msg.includes('fetch')) {
    return 'تعذر الاتصال بالخادم. تحقق من اتصال الإنترنت.';
  }
  return 'حدث خطأ أثناء تسجيل الدخول. حاول مرة أخرى.';
}
