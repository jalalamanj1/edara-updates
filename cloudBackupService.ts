import fs from 'fs';
import path from 'path';
import http from 'http';
import crypto from 'crypto';
import { URL } from 'url';

// Fixed loopback redirect URI for the Google OAuth callback. The callback listener
// (see startGoogleConnect) binds to this exact port, so Google's redirect is handled
// locally by Edara instead of hitting an unowned port (which previously caused
// ERR_CONNECTION_REFUSED on http://localhost/). Register this exact URI as an
// Authorized redirect URI in the Google Cloud Console OAuth client. It works in both
// `npm run electron:dev` and the packaged app.
const GOOGLE_OAUTH_REDIRECT_PORT = 18821;
const GOOGLE_OAUTH_REDIRECT_URI = `http://127.0.0.1:${GOOGLE_OAUTH_REDIRECT_PORT}`;

export type CloudProvider = 'google' | 'microsoft';

export interface CloudServiceDeps {
  queryOne<T>(sql: string, params?: any[]): T | null;
  queryAll<T>(sql: string, params?: any[]): T[];
  execute(sql: string, params?: any[]): void;
  generateUUID(): string;
}

interface StoredAccount {
  id: string;
  provider: string;
  account_email: string;
  connection_status: string;
  access_token: string | null;
  refresh_token: string | null;
  token_expires_at: string | null;
}

export interface DeviceCodeInfo {
  success: boolean;
  message: string;
  userCode?: string;
  verificationUrl?: string;
  verificationUrlComplete?: string;
  authUrl?: string;
  expiresIn?: number;
  interval?: number;
}

export interface PollResult {
  status: 'pending' | 'done' | 'error';
  accountEmail?: string;
  message?: string;
}

interface DeviceState {
  provider: CloudProvider;
  deviceCode: string;
  expiresAt: number;
  interval: number;
}

interface GoogleAuthSession {
  state: string;
  verifier: string;
  port: number;
  server: http.Server;
  result?: PollResult;
  expiresAt: number;
}

interface CloudCredentials {
  google: { clientId: string; clientSecret: string };
  microsoft: { clientId: string; clientSecret: string };
}

export function createCloudService(deps: CloudServiceDeps) {
  const { queryOne, queryAll, execute, generateUUID } = deps;

  const deviceStates = new Map<CloudProvider, DeviceState>();
  const googleSessions = new Map<string, GoogleAuthSession>();

  function loadCredentials(): CloudCredentials {
    const env = process.env;
    const creds: CloudCredentials = {
      google: { clientId: env.GOOGLE_CLIENT_ID || '', clientSecret: env.GOOGLE_CLIENT_SECRET || '' },
      microsoft: { clientId: env.MICROSOFT_CLIENT_ID || '', clientSecret: env.MICROSOFT_CLIENT_SECRET || '' },
    };
    try {
      const p = path.join(process.cwd(), 'cloud_credentials.json');
      if (fs.existsSync(p)) {
        const j = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (j.google && typeof j.google === 'object') {
          creds.google = { ...creds.google, ...j.google };
        }
        if (j.microsoft && typeof j.microsoft === 'object') {
          creds.microsoft = { ...creds.microsoft, ...j.microsoft };
        }
      }
    } catch (e) {
      console.warn('[EDARA Cloud] Failed to read cloud_credentials.json:', e);
    }
    return creds;
  }

  const creds = loadCredentials();

  function isConfigured(provider: CloudProvider): boolean {
    return !!(creds[provider] && creds[provider].clientId);
  }

  function getStoredAccount(provider: CloudProvider): StoredAccount | null {
    return queryOne<StoredAccount>('SELECT * FROM backup_accounts WHERE provider = ?', [provider]);
  }

  function updateTokens(provider: CloudProvider, accessToken: string, refreshToken: string, expiresIn: number) {
    const expiresAt = String(Date.now() + (Number(expiresIn) || 3600) * 1000);
    const now = new Date().toISOString();
    execute(
      'UPDATE backup_accounts SET access_token = ?, refresh_token = ?, token_expires_at = ?, connection_status = ?, updated_at = ? WHERE provider = ?',
      [accessToken, refreshToken, expiresAt, 'connected', now, provider]
    );
  }

  function storeConnectedAccount(provider: CloudProvider, accessToken: string, refreshToken: string, expiresIn: number, email: string | null) {
    const now = new Date().toISOString();
    const fallbackEmail = provider === 'google' ? 'user@gmail.com' : 'user@outlook.com';
    const existing = queryOne<any>('SELECT * FROM backup_accounts WHERE provider = ?', [provider]);
    if (existing) {
      execute(
        'UPDATE backup_accounts SET account_email = ?, connection_status = ?, access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = ? WHERE provider = ?',
        [
          email || fallbackEmail,
          'connected',
          accessToken,
          refreshToken || existing.refresh_token || '',
          String(Date.now() + (Number(expiresIn) || 3600) * 1000),
          now,
          provider,
        ]
      );
    } else {
      execute(
        'INSERT INTO backup_accounts (id, provider, account_email, connection_status, access_token, refresh_token, token_expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          generateUUID(),
          provider,
          email || fallbackEmail,
          'connected',
          accessToken,
          refreshToken || '',
          String(Date.now() + (Number(expiresIn) || 3600) * 1000),
          now,
          now,
        ]
      );
    }
  }

  async function getAccessToken(provider: CloudProvider): Promise<string | null> {
    const acc = getStoredAccount(provider);
    if (!acc || !acc.access_token || acc.connection_status !== 'connected') return null;
    if (acc.token_expires_at && Date.now() < Number(acc.token_expires_at) - 60000) {
      return acc.access_token;
    }
    if (!acc.refresh_token) return null;
    const cfg = creds[provider];
    if (!cfg || !cfg.clientId) return null;

    try {
      if (provider === 'google') {
        const res = await fetch('https://oauth2.googleapis.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: cfg.clientId,
            client_secret: cfg.clientSecret || '',
            refresh_token: acc.refresh_token,
            grant_type: 'refresh_token',
          }),
        });
        const data: any = await res.json();
        if (data.access_token) {
          updateTokens(provider, data.access_token, data.refresh_token || acc.refresh_token, data.expires_in);
          return data.access_token;
        }
        console.warn('[EDARA Cloud] Google token refresh failed:', data.error_description || data.error);
        return null;
      } else {
        const body: Record<string, string> = {
          client_id: cfg.clientId,
          refresh_token: acc.refresh_token,
          grant_type: 'refresh_token',
        };
        if (cfg.clientSecret) body.client_secret = cfg.clientSecret;
        const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams(body),
        });
        const data: any = await res.json();
        if (data.access_token) {
          updateTokens(provider, data.access_token, data.refresh_token || acc.refresh_token, data.expires_in);
          return data.access_token;
        }
        console.warn('[EDARA Cloud] Microsoft token refresh failed:', data.error_description || data.error);
        return null;
      }
    } catch (e: any) {
      console.warn('[EDARA Cloud] Token refresh error:', e.message);
      return null;
    }
  }

  function getStatus(provider: CloudProvider): { connected: boolean; accountEmail: string | null; credentialsConfigured: boolean } {
    const acc = getStoredAccount(provider);
    const configured = isConfigured(provider);
    if (!acc || acc.connection_status !== 'connected') {
      return { connected: false, accountEmail: null, credentialsConfigured: configured };
    }
    return { connected: true, accountEmail: acc.account_email, credentialsConfigured: configured };
  }

  async function startConnect(provider: CloudProvider): Promise<DeviceCodeInfo> {
    const cfg = creds[provider];
    if (!cfg || !cfg.clientId) {
      return {
        success: false,
        message: `لم يتم إعداد بيانات OAuth لحساب ${provider === 'google' ? 'Google' : 'Microsoft'} في ملف cloud_credentials.json.`,
      };
    }

    try {
      if (provider === 'google') {
        return startGoogleConnect(cfg);
      } else {
        const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/devicecode', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: cfg.clientId,
            scope: 'Files.ReadWrite offline_access User.Read',
          }),
        });
        const data: any = await res.json();
        if (!data.device_code) {
          return { success: false, message: data.error_description || data.error || 'فشل بدء تسجيل الدخول إلى Microsoft.' };
        }
        deviceStates.set('microsoft', {
          provider: 'microsoft',
          deviceCode: data.device_code,
          expiresAt: Date.now() + Number(data.expires_in) * 1000,
          interval: Math.max(Number(data.interval) || 5, 3),
        });
        return {
          success: true,
          message: '',
          userCode: data.user_code,
          verificationUrl: data.verification_uri || 'https://microsoft.com/devicelogin',
          verificationUrlComplete: data.verification_uri_complete || undefined,
          expiresIn: Number(data.expires_in),
          interval: Math.max(Number(data.interval) || 5, 3),
        };
      }
    } catch (e: any) {
      return { success: false, message: e.message || 'تعذر الاتصال بخدمة تسجيل الدخول.' };
    }
  }

  function cleanupSession(state: string) {
    const sess = googleSessions.get(state);
    if (sess) {
      try { sess.server.close(); } catch { /* ignore */ }
      googleSessions.delete(state);
    }
  }

  async function startGoogleConnect(cfg: { clientId: string; clientSecret: string }): Promise<DeviceCodeInfo> {
    const state = crypto.randomBytes(16).toString('hex');
    const verifier = crypto.randomBytes(32).toString('base64url');
    const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
    // Fixed loopback redirect URI. The callback listener below binds to the exact same
    // port, so Google's redirect lands on our local server instead of an unowned port.
    const redirectUri = GOOGLE_OAUTH_REDIRECT_URI;

    const server = http.createServer(async (req, res) => {
      const sess = googleSessions.get(state);
      if (!sess) {
        res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('unknown session');
        return;
      }
      try {
        const u = new URL(req.url || '/', redirectUri);
        const err = u.searchParams.get('error');
        const code = u.searchParams.get('code');
        const retState = u.searchParams.get('state');
        if (retState !== state) {
          sess.result = { status: 'error', message: 'state mismatch' };
          res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('state mismatch');
          cleanupSession(state);
          return;
        }
        if (!code && !err) {
          res.writeHead(200);
          res.end();
          return;
        }
        if (err) {
          sess.result = { status: 'error', message: 'تم رفض تسجيل الدخول إلى Google.' };
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end('<html dir="rtl"><body style="font-family:Tahoma"><h2>تم إلغاء تسجيل الدخول</h2><p>يمكنك إغلاق هذه النافذة.</p></body></html>');
          cleanupSession(state);
          return;
        }
        try {
          const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: cfg.clientId,
              client_secret: cfg.clientSecret || '',
              code: code as string,
              code_verifier: verifier,
              redirect_uri: redirectUri,
              grant_type: 'authorization_code',
            }),
          });
          const tdata: any = await tokenRes.json();
          if (!tdata.access_token) {
            sess.result = { status: 'error', message: tdata.error_description || tdata.error || 'فشل الحصول على رمز الوصول.' };
          } else {
            const accountEmail = await fetchAccountEmail('google', tdata.access_token);
            storeConnectedAccount('google', tdata.access_token, tdata.refresh_token || '', Number(tdata.expires_in) || 3600, accountEmail);
            sess.result = { status: 'done', accountEmail };
          }
        } catch (e: any) {
          sess.result = { status: 'error', message: e.message || 'فشل تبادل رمز الدخول.' };
        }
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html dir="rtl"><body style="font-family:Tahoma"><h2>تم تسجيل الدخول بنجاح</h2><p>تم ربط حساب Google Drive. يمكنك إغلاق هذه النافذة والعودة للبرنامج.</p></body></html>');
        cleanupSession(state);
      } catch (e: any) {
        sess.result = { status: 'error', message: e.message || 'خطأ في معالجة الاستجابة.' };
        res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('error');
        cleanupSession(state);
      }
    });

    // Start the loopback callback listener and wait until it is actually bound
    // before handing the auth URL to the UI, so the redirect port always matches.
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(GOOGLE_OAUTH_REDIRECT_PORT, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve();
        });
      });
    } catch (err: any) {
      console.warn('[EDARA Cloud] Google OAuth callback listener failed:', err && err.message);
      return {
        success: false,
        message: `تعذر بدء خادم استقبال تسجيل الدخول إلى Google على المنفذ ${GOOGLE_OAUTH_REDIRECT_PORT}. تأكد من أنه غير مستخدم من تطبيق آخر.`,
      };
    }

    googleSessions.set(state, {
      state,
      verifier,
      port: GOOGLE_OAUTH_REDIRECT_PORT,
      server,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    setTimeout(() => cleanupSession(state), 10 * 60 * 1000);

    const authUrl = 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({
      client_id: cfg.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/drive.file',
      state,
      code_challenge: challenge,
      code_challenge_method: 'S256',
      access_type: 'offline',
    }).toString();

    return { success: true, message: '', authUrl };
  }

  function pollGoogleConnect(): PollResult {
    const sess = Array.from(googleSessions.values())[0];
    if (!sess) {
      return { status: 'error', message: 'لا توجد جلسة تسجيل دخول نشطة لـ Google. أعد المحاولة.' };
    }
    if (Date.now() > sess.expiresAt) {
      cleanupSession(sess.state);
      return { status: 'error', message: 'انتهت صلاحية رمز تسجيل الدخول. أعد المحاولة.' };
    }
    if (sess.result) {
      const r = sess.result;
      cleanupSession(sess.state);
      return r;
    }
    return { status: 'pending' };
  }

  async function pollConnect(provider: CloudProvider): Promise<PollResult> {
    if (provider === 'google') {
      return pollGoogleConnect();
    }
    const state = deviceStates.get(provider);
    if (!state) {
      return { status: 'error', message: 'لا توجد جلسة تسجيل دخول نشطة. أعد المحاولة.' };
    }
    if (Date.now() > state.expiresAt) {
      deviceStates.delete(provider);
      return { status: 'error', message: 'انتهت صلاحية رمز تسجيل الدخول. أعد المحاولة.' };
    }
    const cfg = creds[provider];
    if (!cfg || !cfg.clientId) {
      return { status: 'error', message: 'لم يتم إعداد بيانات OAuth.' };
    }

    try {
      let data: any;
      const body: Record<string, string> = {
        client_id: cfg.clientId,
        device_code: state.deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      };
      if (cfg.clientSecret) body.client_secret = cfg.clientSecret;
      const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(body),
      });
      data = await res.json();

      if (!data.access_token) {
        if (data.error === 'authorization_pending') return { status: 'pending' };
        if (data.error === 'slow_down') {
          deviceStates.set(provider, { ...state, interval: state.interval + 5 });
          return { status: 'pending' };
        }
        if (data.error === 'expired_token') {
          deviceStates.delete(provider);
          return { status: 'error', message: 'انتهت صلاحية رمز تسجيل الدخول. أعد المحاولة.' };
        }
        if (data.error === 'access_denied' || data.error === 'authorization_declined') {
          deviceStates.delete(provider);
          return { status: 'error', message: 'تم رفض تسجيل الدخول.' };
        }
        deviceStates.delete(provider);
        return { status: 'error', message: data.error_description || data.error || 'فشل تسجيل الدخول.' };
      }

      deviceStates.delete(provider);
      const accountEmail = await fetchAccountEmail(provider, data.access_token);
      storeConnectedAccount(provider, data.access_token, data.refresh_token || '', Number(data.expires_in) || 3600, accountEmail);
      return { status: 'done', accountEmail };
    } catch (e: any) {
      return { status: 'error', message: e.message || 'حدث خطأ أثناء التحقق من تسجيل الدخول.' };
    }
  }

  async function fetchAccountEmail(provider: CloudProvider, accessToken: string): Promise<string | null> {
    try {
      if (provider === 'google') {
        const res = await fetch('https://www.googleapis.com/drive/v3/about?fields=user', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data: any = await res.json();
        return data.user && data.user.emailAddress ? data.user.emailAddress : null;
      } else {
        const res = await fetch('https://graph.microsoft.com/v1.0/me', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data: any = await res.json();
        return data.mail || data.userPrincipalName || null;
      }
    } catch (e) {
      return null;
    }
  }

  function disconnect(provider: CloudProvider): void {
    deviceStates.delete(provider);
    const now = new Date().toISOString();
    execute(
      'UPDATE backup_accounts SET connection_status = ?, access_token = ?, refresh_token = ?, token_expires_at = ?, updated_at = ? WHERE provider = ?',
      ['disconnected', '', '', '', now, provider]
    );
  }

  async function ensureGoogleFolder(token: string): Promise<string> {
    const q = encodeURIComponent(
      `name='EDARA Backups' and mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false`
    );
    const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data: any = await res.json();
    if (data.files && data.files.length > 0) return data.files[0].id;
    const create = await fetch('https://www.googleapis.com/drive/v3/files', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'EDARA Backups',
        mimeType: 'application/vnd.google-apps.folder',
      }),
    });
    const cdata: any = await create.json();
    return cdata.id;
  }

  async function ensureOneDriveFolder(token: string): Promise<void> {
    const res = await fetch('https://graph.microsoft.com/v1.0/me/drive/root:/EDARA%20Backups', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.status === 404) {
      await fetch('https://graph.microsoft.com/v1.0/me/drive/root/children', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: 'EDARA Backups', folder: {} }),
      });
    }
  }

  async function uploadBackup(provider: CloudProvider, filePath: string, fileName: string): Promise<{ success: boolean; message: string }> {
    const token = await getAccessToken(provider);
    if (!token) {
      return { success: false, message: 'الحساب غير متصل أو انتهت صلاحية الجلسة.' };
    }
    const fileBuf = fs.readFileSync(filePath);
    try {
      if (provider === 'google') {
        const folderId = await ensureGoogleFolder(token);
        const metadata = JSON.stringify({ name: fileName, parents: [folderId] });
        const form = new FormData();
        form.append('metadata', new Blob([metadata], { type: 'application/json' }));
        form.append('file', new Blob([fileBuf], { type: 'application/zip' }));
        const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: form,
        });
        const data: any = await res.json();
        if (!res.ok) {
          return { success: false, message: data.error?.message || `فشل الرفع إلى Google Drive (${res.status}).` };
        }
        return { success: true, message: `تم رفع النسخة السحابية إلى Google Drive في مجلد "EDARA Backups".` };
      } else {
        await ensureOneDriveFolder(token);
        const encodedName = encodeURIComponent(fileName).replace(/%2F/g, '_');
        const res = await fetch(`https://graph.microsoft.com/v1.0/me/drive/root:/EDARA%20Backups/${encodedName}:/content`, {
          method: 'PUT',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/zip',
          },
          body: fileBuf,
        });
        if (!res.ok) {
          const data: any = await res.json();
          return { success: false, message: data.error?.message || `فشل الرفع إلى OneDrive (${res.status}).` };
        }
        return { success: true, message: `تم رفع النسخة السحابية إلى Microsoft OneDrive في مجلد "EDARA Backups".` };
      }
    } catch (e: any) {
      return { success: false, message: e.message || 'حدث خطأ أثناء الرفع السحابي.' };
    }
  }

  function getConnectedProviders(): Array<{ provider: CloudProvider; accountEmail: string }> {
    const rows = queryAll<any>("SELECT provider, account_email FROM backup_accounts WHERE connection_status = 'connected' AND provider IN ('google', 'microsoft')");
    return rows.map((r) => ({ provider: r.provider as CloudProvider, accountEmail: r.account_email }));
  }

  return {
    getStatus,
    startConnect,
    pollConnect,
    disconnect,
    uploadBackup,
    getConnectedProviders,
    getAccessToken,
  };
}
