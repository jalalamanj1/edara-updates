import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { execFileSync, execFile } from 'child_process';
// NOTE: `vite` is only used in the dev server branch below. It is imported
// lazily (dynamic import) there so that the production bundle never requires
// `vite` at load time (vite is a devDependency and is pruned from the package).
import initSqlJs, { Database } from 'sql.js';
import multer from 'multer';
import JSZip from 'jszip';
import * as XLSX from 'xlsx';
import { APP_CONFIG, extractFolderId } from './src/config/appConfig';
import { createCloudService } from './cloudBackupService';
import { createClient } from '@supabase/supabase-js';

const PORT = 3000;
const app = express();

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Determine data directory: edara_config.json (cwd) -> env -> default edara_data
function loadDataDir(): string {
  try {
    const cfgPath = path.join(process.cwd(), 'edara_config.json');
    if (fs.existsSync(cfgPath)) {
      const j = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (j && typeof j.dataDir === 'string' && j.dataDir.trim()) {
        return path.resolve(j.dataDir.trim());
      }
    }
  } catch (e) {
    /* ignore */
  }
  if (process.env.EDARA_DATA_DIR) return path.resolve(process.env.EDARA_DATA_DIR);
  return path.join(process.cwd(), 'edara_data');
}

const DATA_DIR = loadDataDir();
const DOCS_DIR = path.join(DATA_DIR, 'documents');
const MINISTRY_DOCS_DIR = path.join(DATA_DIR, 'ministry_documents');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const TEMPLATES_DIR = path.join(DATA_DIR, 'templates');
const OUTGOING_DIR = path.join(DATA_DIR, 'outgoing');
const MAIL_ATTACHMENTS_DIR = path.join(DATA_DIR, 'mail_attachments');
const CORRESPONDENCE_DIR = path.join(DATA_DIR, 'correspondence');
const DB_PATH = path.join(DATA_DIR, 'edara.db');

// Resolve the user's real Desktop (honors OneDrive Known-Folder redirection on Windows)
function getDesktopPath(): string {
  if (process.platform === 'win32') {
    try {
      const out = execFileSync(
        'powershell',
        ['-NoProfile', '-NonInteractive', '-Command', '[Environment]::GetFolderPath("Desktop")'],
        { timeout: 8000 }
      ).toString().trim();
      if (out && fs.existsSync(out)) return out;
    } catch (e) {
      console.warn('[EDARA] Could not resolve Desktop path:', (e as Error).message);
    }
  }
  return path.join(os.homedir(), 'Desktop');
}

// Desktop export folder: every generated document and the outgoing register are stored here
const EXPORT_FOLDER = path.join(getDesktopPath(), 'Edara الصادرات');

// Ensure directories exist
[DATA_DIR, DOCS_DIR, MINISTRY_DOCS_DIR, BACKUPS_DIR, TEMPLATES_DIR, OUTGOING_DIR, MAIL_ATTACHMENTS_DIR, CORRESPONDENCE_DIR, EXPORT_FOLDER].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e) {
      console.warn('[EDARA] Could not create dir:', dir, (e as Error).message);
    }
  }
});

// Migrate any existing export folder from the legacy (non-OneDrive) Desktop location
{
  const legacyFolder = path.join(os.homedir(), 'Desktop', 'Edara الصادرات');
  if (fs.existsSync(legacyFolder) && path.resolve(legacyFolder) !== path.resolve(EXPORT_FOLDER)) {
    try {
      for (const f of fs.readdirSync(legacyFolder)) {
        const src = path.join(legacyFolder, f);
        const dst = path.join(EXPORT_FOLDER, f);
        if (!fs.existsSync(dst)) {
          try {
            fs.renameSync(src, dst);
          } catch (e) {
            fs.copyFileSync(src, dst);
            fs.unlinkSync(src);
          }
        }
      }
      if (fs.readdirSync(legacyFolder).length === 0) fs.rmdirSync(legacyFolder);
      console.log('[EDARA] Migrated export folder to real Desktop:', EXPORT_FOLDER);
    } catch (e) {
      console.warn('[EDARA] Could not migrate legacy export folder:', (e as Error).message);
    }
  }
}

// Configure Multer for file uploads
const docStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const targetDir = req.originalUrl.includes('ministry') ? MINISTRY_DOCS_DIR : DOCS_DIR;
    cb(null, targetDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    const safeName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_');
    cb(null, `${safeName}_${uniqueSuffix}${ext}`);
  },
});
const upload = multer({ storage: docStorage });

const backupStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, BACKUPS_DIR),
  filename: (req, file, cb) => cb(null, `upload_restore_${Date.now()}.zip`),
});
const backupUpload = multer({ storage: backupStorage });

// Global SQLite Database instance
let db: Database;

// Helper: Save DB file to disk
function saveDatabase() {
  if (!db) return;
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(DB_PATH, buffer);
}

// Initialize SQLite Schema
async function initDatabase() {
  const SQL = await initSqlJs();
  if (fs.existsSync(DB_PATH)) {
    const fileBuffer = fs.readFileSync(DB_PATH);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Run Migrations / Table Creations
  db.run(`
    CREATE TABLE IF NOT EXISTS school_profile (
      id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      school_name TEXT NOT NULL,
      email TEXT,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      principal_name TEXT NOT NULL,
      academic_year TEXT NOT NULL,
      registered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      student_code TEXT UNIQUE,
      full_name TEXT NOT NULL,
      gender TEXT NOT NULL,
      dob TEXT NOT NULL,
      grade TEXT NOT NULL,
      phone TEXT NOT NULL,
      parent_name TEXT NOT NULL,
      parent_phone TEXT NOT NULL,
      address TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS staff (
      id TEXT PRIMARY KEY,
      staff_code TEXT UNIQUE,
      full_name TEXT NOT NULL,
      job_title TEXT NOT NULL,
      department TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      address TEXT NOT NULL,
      employment_date TEXT NOT NULL,
      notes TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      doc_type TEXT NOT NULL,
      description TEXT,
      doc_date TEXT NOT NULL,
      file_path TEXT,
      file_name TEXT,
      file_size INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS export_log (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      doc_date TEXT NOT NULL,
      no TEXT,
      to_recipient TEXT,
      file_path TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ministry_documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      ministry_department TEXT NOT NULL,
      doc_number TEXT NOT NULL,
      doc_date TEXT NOT NULL,
      description TEXT,
      file_path TEXT,
      file_name TEXT,
      file_size INTEGER,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_history (
      id TEXT PRIMARY KEY,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS backup_accounts (
      id TEXT PRIMARY KEY,
      provider TEXT NOT NULL UNIQUE,
      account_email TEXT NOT NULL,
      connection_status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS mail_messages (
      id TEXT PRIMARY KEY,
      remote_id INTEGER,
      account_id TEXT,
      folder TEXT NOT NULL DEFAULT 'inbox',
      sender_organization_type TEXT,
      sender_organization_id TEXT,
      sender_org_name TEXT,
      recipient_type TEXT,
      recipient_organization_id TEXT,
      recipient_org_name TEXT,
      subject TEXT,
      body TEXT,
      status TEXT,
      created_at TEXT,
      updated_at TEXT,
      local_read INTEGER NOT NULL DEFAULT 0,
      raw TEXT
    );

    CREATE TABLE IF NOT EXISTS mail_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      filename TEXT,
      size INTEGER,
      mime_type TEXT,
      remote_url TEXT,
      local_file_path TEXT,
      state TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT
    );

    CREATE TABLE IF NOT EXISTS mail_meta (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS correspondence (
      id TEXT PRIMARY KEY,
      message_id TEXT UNIQUE NOT NULL,
      sender_display_name TEXT,
      subject TEXT,
      description TEXT,
      sent_at TEXT,
      attachment_name TEXT,
      local_attachment_path TEXT,
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );
  `);

  // Migration: school profile extra columns (MENTIS parity)
  const profileColumns = db.exec(`PRAGMA table_info(school_profile)`);
  const profileColNames = profileColumns.length > 0 ? profileColumns[0].values.map((v: any) => v[1]) : [];
  if (!profileColNames.includes('city')) db.run(`ALTER TABLE school_profile ADD COLUMN city TEXT`);
  if (!profileColNames.includes('principal_title')) db.run(`ALTER TABLE school_profile ADD COLUMN principal_title TEXT`);
  if (!profileColNames.includes('school_type')) db.run(`ALTER TABLE school_profile ADD COLUMN school_type TEXT`);
  if (!profileColNames.includes('remote_org_id')) db.run(`ALTER TABLE school_profile ADD COLUMN remote_org_id TEXT`);

  // Migration: mail_messages remote id + updated_at
  const msgCols = db.exec(`PRAGMA table_info(mail_messages)`);
  const msgColNames = msgCols.length > 0 ? msgCols[0].values.map((v: any) => v[1]) : [];
  if (msgColNames.length && !msgColNames.includes('remote_id')) {
    db.run(`ALTER TABLE mail_messages ADD COLUMN remote_id INTEGER`);
    db.run(`ALTER TABLE mail_messages ADD COLUMN updated_at TEXT`);
  }
  // Migration: account-scoped inbox — bind every message to the Edara Desktop
  // account (edara_accounts.id) that owns this installation's private inbox.
  if (msgColNames.length && !msgColNames.includes('account_id')) {
    db.run(`ALTER TABLE mail_messages ADD COLUMN account_id TEXT`);
  }

  // Migration: mail_attachments.message_id must be nullable (uploaded before a message exists)
  const attInfo = db.exec(`PRAGMA table_info(mail_attachments)`);
  const attCols = attInfo.length > 0 ? attInfo[0].values : [];
  const attMsgCol = attCols.find((c: any) => c[1] === 'message_id');
  if (attMsgCol && attMsgCol[3] === 1) {
    db.run(`ALTER TABLE mail_attachments RENAME TO mail_attachments_old`);
    db.run(`CREATE TABLE mail_attachments (
      id TEXT PRIMARY KEY,
      message_id TEXT,
      filename TEXT,
      size INTEGER,
      mime_type TEXT,
      remote_url TEXT,
      local_file_path TEXT,
      state TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT
    )`);
    db.run(`INSERT INTO mail_attachments (id, message_id, filename, size, mime_type, remote_url, local_file_path, state, created_at)
            SELECT id, message_id, filename, size, mime_type, remote_url, local_file_path, state, created_at FROM mail_attachments_old`);
    db.run(`DROP TABLE mail_attachments_old`);
  }

  // Migration: student branch (الفرع) for preparatory stage
  const studentCols = db.exec(`PRAGMA table_info(students)`);
  const studentColNames = studentCols.length > 0 ? studentCols[0].values.map((v: any) => v[1]) : [];
  if (!studentColNames.includes('branch')) db.run(`ALTER TABLE students ADD COLUMN branch TEXT`);

  // Migration: cloud backup account tokens
  const accCols = db.exec(`PRAGMA table_info(backup_accounts)`);
  const accColNames = accCols.length > 0 ? accCols[0].values.map((v: any) => v[1]) : [];
  if (!accColNames.includes('access_token')) db.run(`ALTER TABLE backup_accounts ADD COLUMN access_token TEXT`);
  if (!accColNames.includes('refresh_token')) db.run(`ALTER TABLE backup_accounts ADD COLUMN refresh_token TEXT`);
  if (!accColNames.includes('token_expires_at')) db.run(`ALTER TABLE backup_accounts ADD COLUMN token_expires_at TEXT`);

  saveDatabase();
  console.log('[EDARA DB] Database initialized successfully.');
}

// Helper query wrappers
function queryOne<T>(sql: string, params: any[] = []): T | null {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  if (stmt.step()) {
    const row = stmt.getAsObject();
    stmt.free();
    return row as T;
  }
  stmt.free();
  return null;
}

function queryAll<T>(sql: string, params: any[] = []): T[] {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const results: T[] = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject() as T);
  }
  stmt.free();
  return results;
}

function execute(sql: string, params: any[] = []): void {
  db.run(sql, params);
  saveDatabase();
}

function generateUUID(): string {
  return Date.now().toString(36) + Math.random().toString(36).substring(2, 9);
}

// ---------- Update Checking (GitHub: jalalamanj1/edara-updates) ----------
const APP_VERSION = '1.0.5';
const UPDATE_REPO_OWNER = 'jalalamanj1';
const UPDATE_REPO_NAME = 'edara-updates';
const UPDATE_CHECK_INTERVAL_MS = 3 * 60 * 60 * 1000;

interface UpdateStatus {
  checkedAt: string | null;
  currentVersion: string;
  latestVersion: string | null;
  hasUpdate: boolean;
  downloadUrl: string | null;
  releaseNotes: string | null;
  error: string | null;
}

let updateStatus: UpdateStatus = {
  checkedAt: null,
  currentVersion: APP_VERSION,
  latestVersion: null,
  hasUpdate: false,
  downloadUrl: null,
  releaseNotes: null,
  error: null,
};

function parseVersion(v: string): number[] {
  return String(v || '')
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((n) => parseInt(n, 10) || 0);
}

function isNewerVersion(latest: string, current: string): boolean {
  const a = parseVersion(latest);
  const b = parseVersion(current);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

async function checkForUpdates(): Promise<UpdateStatus> {
  updateStatus = { ...updateStatus, checkedAt: new Date().toISOString() };
  const timeoutMs = 10000;
  try {
    // Strategy 1: GitHub Releases (latest release in the updates repo)
    const releaseRes = await fetch(
      `https://api.github.com/repos/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/releases/latest`,
      {
        headers: {
          'User-Agent': 'EDARA-School-Management/1.0.5',
          'Accept': 'application/vnd.github+json',
        },
        signal: AbortSignal.timeout(timeoutMs),
      }
    );

    if (releaseRes.ok) {
      const release: any = await releaseRes.json();
      const latestVersion = String(release.tag_name || '').replace(/^v/i, '');
      const releaseNotes = typeof release.body === 'string' && release.body.trim() ? release.body.trim() : null;
      const asset = Array.isArray(release.assets) && release.assets.length > 0 ? release.assets[0] : null;
      const downloadUrl = (asset && asset.browser_download_url) || release.html_url || null;
      updateStatus = {
        ...updateStatus,
        latestVersion: latestVersion || null,
        hasUpdate: latestVersion ? isNewerVersion(latestVersion, APP_VERSION) : false,
        downloadUrl,
        releaseNotes,
        error: null,
      };
      return updateStatus;
    }

    // Strategy 2: latest.json on the default branch of the updates repo
    const rawRes = await fetch(
      `https://raw.githubusercontent.com/${UPDATE_REPO_OWNER}/${UPDATE_REPO_NAME}/main/latest.json`,
      { signal: AbortSignal.timeout(timeoutMs) }
    );

    if (rawRes.ok) {
      const data: any = await rawRes.json();
      const latestVersion = String(data.version || '').trim();
      const downloadUrl = data.downloadUrl || data.download_url || data.url || null;
      const releaseNotes = data.releaseNotes || data.changelog || data.notes || null;
      updateStatus = {
        ...updateStatus,
        latestVersion: latestVersion || null,
        hasUpdate: latestVersion ? isNewerVersion(latestVersion, APP_VERSION) : false,
        downloadUrl,
        releaseNotes: releaseNotes || null,
        error: null,
      };
      return updateStatus;
    }

    updateStatus.error = 'لا يوجد إصدار جديد متاح بعد.';
  } catch (err: any) {
    updateStatus.error = err?.message || 'تعذر الاتصال بخادم التحديثات.';
  }
  return updateStatus;
}

// Setup API Routes
async function startServer() {
  await initDatabase();

  // Cloud backup service (Google Drive / OneDrive OAuth + upload)
  const cloudService = createCloudService({ queryOne, queryAll, execute, generateUUID });

  // Supabase client (anon key) for governorate drive folder resolution
  const supabaseUrl = process.env.VITE_SUPABASE_URL || '';
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const supabaseClient = supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;
  // Service-role client bypasses RLS for shared config tables (cities, city_drive_folders).
  // Used ONLY for read-only configuration lookups — never exposed to the browser.
  const supabaseAdmin = supabaseUrl && supabaseServiceKey
    ? createClient(supabaseUrl, supabaseServiceKey)
    : null;

  // Health check endpoint for readiness verification
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // 1. App Initialization State
  app.get('/api/init', (req, res) => {
    try {
      const profile = queryOne<any>('SELECT * FROM school_profile LIMIT 1');

      // Single combined query for all counts instead of 3 separate queries
      const countsRow = queryOne<any>(
        `SELECT
          (SELECT COUNT(*) FROM students) as students_count,
          (SELECT COUNT(*) FROM staff) as staff_count,
          (SELECT COUNT(*) FROM export_log) as docs_count`
      );

      const registered = !!profile && !!profile.school_name;

      res.json({
        success: true,
        registered,
        schoolProfile: profile
          ? {
              id: profile.id,
              fullName: profile.full_name,
              schoolName: profile.school_name,
              email: profile.email || '',
              phone: profile.phone,
              address: profile.address,
              principalName: profile.principal_name,
              academicYear: profile.academic_year,
              city: profile.city || '',
              principalTitle: profile.principal_title || '',
              schoolType: profile.school_type || '',
              registeredAt: profile.registered_at,
              updatedAt: profile.updated_at,
            }
          : null,
        stats: {
          studentsCount: countsRow ? Number(countsRow.students_count) : 0,
          staffCount: countsRow ? Number(countsRow.staff_count) : 0,
          documentsCount: countsRow ? Number(countsRow.docs_count) : 0,
        },
      });
    } catch (err: any) {
      console.error('API /api/init error:', err);
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Update Check Status Endpoint
  app.get('/api/updates/status', (req, res) => {
    res.json({ success: true, ...updateStatus });
  });

  app.post('/api/updates/check', async (req, res) => {
    try {
      const status = await checkForUpdates();
      res.json({ success: true, ...status });
    } catch (err: any) {
      res.status(500).json({ success: false, error: err.message, ...updateStatus });
    }
  });


  // 3. Registration Endpoint
  app.post('/api/register', (req, res) => {
    try {
      const { fullName, schoolName, email, phone, address, principalName, academicYear, city, principalTitle, schoolType } = req.body;

      if (!fullName || !fullName.trim()) {
        return res.status(400).json({ success: false, message: 'الاسم الكامل مطلوب.' });
      }
      if (!schoolName || !schoolName.trim()) {
        return res.status(400).json({ success: false, message: 'اسم الشركة / المدرسة مطلوب.' });
      }
      if (!phone || !phone.trim()) {
        return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب.' });
      }
      if (!address || !address.trim()) {
        return res.status(400).json({ success: false, message: 'العنوان مطلوب.' });
      }
      if (!principalName || !principalName.trim()) {
        return res.status(400).json({ success: false, message: 'اسم المدير / المدير العام مطلوب.' });
      }
      if (!academicYear || !academicYear.trim()) {
        return res.status(400).json({ success: false, message: 'السنة الدراسية مطلوبة.' });
      }

      const now = new Date().toISOString();
      const existing = queryOne<any>('SELECT * FROM school_profile LIMIT 1');

      let profId = existing ? existing.id : generateUUID();
      if (existing) {
        execute(
          `UPDATE school_profile SET full_name = ?, school_name = ?, email = ?, phone = ?, address = ?, principal_name = ?, academic_year = ?, city = ?, principal_title = ?, school_type = ?, updated_at = ? WHERE id = ?`,
          [
            fullName.trim(),
            schoolName.trim(),
            (email || '').trim(),
            phone.trim(),
            address.trim(),
            principalName.trim(),
            academicYear.trim(),
            (city || '').trim(),
            (principalTitle || '').trim(),
            (schoolType || '').trim(),
            now,
            profId,
          ]
        );
      } else {
        execute(
          `INSERT INTO school_profile (id, full_name, school_name, email, phone, address, principal_name, academic_year, city, principal_title, school_type, registered_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            profId,
            fullName.trim(),
            schoolName.trim(),
            (email || '').trim(),
            phone.trim(),
            address.trim(),
            principalName.trim(),
            academicYear.trim(),
            (city || '').trim(),
            (principalTitle || '').trim(),
            (schoolType || '').trim(),
            now,
            now,
          ]
        );
      }

      const prof = queryOne<any>('SELECT * FROM school_profile WHERE id = ?', [profId]);
      res.json({
        success: true,
        message: 'تم تسجيل بيانات المؤسسة بنجاح.',
        schoolProfile: {
          id: prof.id,
          fullName: prof.full_name,
          schoolName: prof.school_name,
          email: prof.email || '',
          phone: prof.phone,
          address: prof.address,
          principalName: prof.principal_name,
          academicYear: prof.academic_year,
          city: prof.city || '',
          principalTitle: prof.principal_title || '',
          schoolType: prof.school_type || '',
          registeredAt: prof.registered_at,
          updatedAt: prof.updated_at,
        },
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 4. Students Endpoints
  app.get('/api/students', (req, res) => {
    try {
      const search = (req.query.search as string) || '';
      let sql = 'SELECT * FROM students';
      let params: any[] = [];

      if (search.trim()) {
        sql += ` WHERE full_name LIKE ? OR student_code LIKE ? OR phone LIKE ? OR parent_name LIKE ? OR parent_phone LIKE ?`;
        const pattern = `%${search.trim()}%`;
        params = [pattern, pattern, pattern, pattern, pattern];
      }

      sql += ' ORDER BY created_at DESC';
      const rows = queryAll<any>(sql, params);

      const students = rows.map((r) => ({
        id: r.id,
        studentCode: r.student_code,
        fullName: r.full_name,
        gender: r.gender,
        dob: r.dob,
        grade: r.grade,
        branch: r.branch || '',
        phone: r.phone,
        parentName: r.parent_name,
        parentPhone: r.parent_phone,
        address: r.address,
        notes: r.notes || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      res.json({ success: true, students });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/students', (req, res) => {
    try {
      const { fullName, gender, dob, grade, phone, parentName, parentPhone, address, notes, branch } = req.body;

      if (!fullName || !fullName.trim()) return res.status(400).json({ success: false, message: 'اسم الطالب مطلوب.' });
      if (!gender) return res.status(400).json({ success: false, message: 'الجنس مطلوب.' });
      if (!grade) return res.status(400).json({ success: false, message: 'الصف/المرحلة الدراسية مطلوب.' });
      if (!phone) return res.status(400).json({ success: false, message: 'رقم هاتف الطالب مطلوب.' });
      if (!parentName) return res.status(400).json({ success: false, message: 'اسم ولي الأمر مطلوب.' });
      if (!parentPhone) return res.status(400).json({ success: false, message: 'رقم هاتف ولي الأمر مطلوب.' });

      const id = generateUUID();
      const countRow = queryOne<any>('SELECT COUNT(*) as cnt FROM students');
      const nextNum = (countRow ? Number(countRow.cnt) : 0) + 1001;
      const studentCode = `STD-${nextNum}`;
      const now = new Date().toISOString();

      execute(
        `INSERT INTO students (id, student_code, full_name, gender, dob, grade, branch, phone, parent_name, parent_phone, address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          studentCode,
          fullName.trim(),
          gender,
          dob || '',
          grade.trim(),
          (branch || '').trim(),
          phone.trim(),
          parentName.trim(),
          parentPhone.trim(),
          (address || '').trim(),
          (notes || '').trim(),
          now,
          now,
        ]
      );

      res.json({ success: true, message: 'تم إضافة الطالب بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/api/students/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { fullName, gender, dob, grade, phone, parentName, parentPhone, address, notes, branch } = req.body;

      if (!fullName || !fullName.trim()) return res.status(400).json({ success: false, message: 'اسم الطالب مطلوب.' });

      const now = new Date().toISOString();
      execute(
        `UPDATE students SET full_name = ?, gender = ?, dob = ?, grade = ?, branch = ?, phone = ?, parent_name = ?, parent_phone = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?`,
        [
          fullName.trim(),
          gender,
          dob || '',
          grade.trim(),
          (branch || '').trim(),
          phone.trim(),
          parentName.trim(),
          parentPhone.trim(),
          (address || '').trim(),
          (notes || '').trim(),
          now,
          id,
        ]
      );

      res.json({ success: true, message: 'تم تحديث بيانات الطالب بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Bulk delete students (selection feature)
  app.delete('/api/students/bulk', (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: any) => typeof x === 'string' && x.trim()) : [];
      if (ids.length === 0) {
        return res.status(400).json({ success: false, message: 'لا توجد عناصر محددة للحذف.' });
      }
      for (const id of ids) {
        execute('DELETE FROM students WHERE id = ?', [id]);
      }
      res.json({ success: true, message: `تم حذف ${ids.length} طالب بنجاح.` });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/students/:id', (req, res) => {
    try {
      const { id } = req.params;
      execute('DELETE FROM students WHERE id = ?', [id]);
      res.json({ success: true, message: 'تم حذف الطالب بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/students/import', (req, res) => {
    try {
      const { students } = req.body;
      if (!Array.isArray(students) || students.length === 0) {
        return res.status(400).json({ success: false, message: 'لا توجد بيانات طلاب للاستيراد.' });
      }

      const countRow = queryOne<any>('SELECT COUNT(*) as cnt FROM students');
      let startNum = (countRow ? Number(countRow.cnt) : 0) + 1001;
      const now = new Date().toISOString();
      let importedCount = 0;

      for (const item of students) {
        if (!item.fullName || !item.fullName.trim()) continue;
        const id = generateUUID();
        const code = item.studentCode && item.studentCode.trim() ? item.studentCode.trim() : `STD-${startNum++}`;
        const fullName = item.fullName.trim();
        const gender = item.gender || 'ذكر';
        const dob = item.dob || '';
        const grade = item.grade || 'غير محدد';
        const branch = item.branch || '';
        const phone = item.phone || '';
        const parentName = item.parentName || '';
        const parentPhone = item.parentPhone || '';
        const address = item.address || '';
        const notes = item.notes || '';

        execute(
          `INSERT INTO students (id, student_code, full_name, gender, dob, grade, branch, phone, parent_name, parent_phone, address, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, code, fullName, gender, dob, grade, branch, phone, parentName, parentPhone, address, notes, now, now]
        );
        importedCount++;
      }

      res.json({
        success: true,
        count: importedCount,
        message: `تم استيراد ${importedCount} طالب بنجاح.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 5. Staff Endpoints
  app.get('/api/staff', (req, res) => {
    try {
      const search = (req.query.search as string) || '';
      let sql = 'SELECT * FROM staff';
      let params: any[] = [];

      if (search.trim()) {
        sql += ` WHERE full_name LIKE ? OR staff_code LIKE ? OR job_title LIKE ? OR phone LIKE ? OR department LIKE ?`;
        const pattern = `%${search.trim()}%`;
        params = [pattern, pattern, pattern, pattern, pattern];
      }

      sql += ' ORDER BY created_at DESC';
      const rows = queryAll<any>(sql, params);

      const staff = rows.map((r) => ({
        id: r.id,
        staffCode: r.staff_code,
        fullName: r.full_name,
        jobTitle: r.job_title,
        department: r.department,
        phone: r.phone,
        email: r.email || '',
        address: r.address,
        employmentDate: r.employment_date,
        notes: r.notes || '',
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      res.json({ success: true, staff });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/staff', (req, res) => {
    try {
      const { fullName, jobTitle, department, phone, email, address, employmentDate, notes } = req.body;

      if (!fullName || !fullName.trim()) return res.status(400).json({ success: false, message: 'اسم الموظف مطلوب.' });
      if (!jobTitle || !jobTitle.trim()) return res.status(400).json({ success: false, message: 'المسمى الوظيفي مطلوب.' });
      if (!phone || !phone.trim()) return res.status(400).json({ success: false, message: 'رقم الهاتف مطلوب.' });

      const id = generateUUID();
      const countRow = queryOne<any>('SELECT COUNT(*) as cnt FROM staff');
      const nextNum = (countRow ? Number(countRow.cnt) : 0) + 1001;
      const staffCode = `STF-${nextNum}`;
      const now = new Date().toISOString();

      execute(
        `INSERT INTO staff (id, staff_code, full_name, job_title, department, phone, email, address, employment_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          staffCode,
          fullName.trim(),
          jobTitle.trim(),
          (department || 'عام').trim(),
          phone.trim(),
          (email || '').trim(),
          (address || '').trim(),
          employmentDate || now.substring(0, 10),
          (notes || '').trim(),
          now,
          now,
        ]
      );

      res.json({ success: true, message: 'تم إضافة الموظف بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.put('/api/staff/:id', (req, res) => {
    try {
      const { id } = req.params;
      const { fullName, jobTitle, department, phone, email, address, employmentDate, notes } = req.body;

      if (!fullName || !fullName.trim()) return res.status(400).json({ success: false, message: 'اسم الموظف مطلوب.' });

      const now = new Date().toISOString();
      execute(
        `UPDATE staff SET full_name = ?, job_title = ?, department = ?, phone = ?, email = ?, address = ?, employment_date = ?, notes = ?, updated_at = ? WHERE id = ?`,
        [
          fullName.trim(),
          jobTitle.trim(),
          (department || 'عام').trim(),
          phone.trim(),
          (email || '').trim(),
          (address || '').trim(),
          employmentDate || now.substring(0, 10),
          (notes || '').trim(),
          now,
          id,
        ]
      );

      res.json({ success: true, message: 'تم تحديث بيانات الموظف بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Bulk delete staff (selection feature)
  app.delete('/api/staff/bulk', (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: any) => typeof x === 'string' && x.trim()) : [];
      if (ids.length === 0) {
        return res.status(400).json({ success: false, message: 'لا توجد عناصر محددة للحذف.' });
      }
      for (const id of ids) {
        execute('DELETE FROM staff WHERE id = ?', [id]);
      }
      res.json({ success: true, message: `تم حذف ${ids.length} موظف بنجاح.` });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/staff/:id', (req, res) => {
    try {
      const { id } = req.params;
      execute('DELETE FROM staff WHERE id = ?', [id]);
      res.json({ success: true, message: 'تم حذف الموظف بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/staff/import', (req, res) => {
    try {
      const { staff } = req.body;
      if (!Array.isArray(staff) || staff.length === 0) {
        return res.status(400).json({ success: false, message: 'لا توجد بيانات موظفين للاستيراد.' });
      }

      const countRow = queryOne<any>('SELECT COUNT(*) as cnt FROM staff');
      let startNum = (countRow ? Number(countRow.cnt) : 0) + 1001;
      const now = new Date().toISOString();
      let importedCount = 0;

      for (const item of staff) {
        if (!item.fullName || !item.fullName.trim()) continue;
        const id = generateUUID();
        const code = item.staffCode && item.staffCode.trim() ? item.staffCode.trim() : `STF-${startNum++}`;
        const fullName = item.fullName.trim();
        const jobTitle = item.jobTitle || 'موظف';
        const department = item.department || 'عام';
        const phone = item.phone || '';
        const email = item.email || '';
        const address = item.address || '';
        const employmentDate = item.employmentDate || now.substring(0, 10);
        const notes = item.notes || '';

        execute(
          `INSERT INTO staff (id, staff_code, full_name, job_title, department, phone, email, address, employment_date, notes, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [id, code, fullName, jobTitle, department, phone, email, address, employmentDate, notes, now, now]
        );
        importedCount++;
      }

      res.json({
        success: true,
        count: importedCount,
        message: `تم استيراد ${importedCount} موظف بنجاح.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // 6. Documents Endpoints
  app.get('/api/documents', (req, res) => {
    try {
      const search = (req.query.search as string) || '';
      const docType = (req.query.type as string) || '';

      let sql = 'SELECT * FROM documents';
      let params: any[] = [];
      let conditions: string[] = [];

      if (search.trim()) {
        conditions.push('(title LIKE ? OR description LIKE ? OR file_name LIKE ?)');
        const p = `%${search.trim()}%`;
        params.push(p, p, p);
      }
      if (docType.trim()) {
        conditions.push('doc_type = ?');
        params.push(docType.trim());
      }

      if (conditions.length > 0) {
        sql += ' WHERE ' + conditions.join(' AND ');
      }

      sql += ' ORDER BY created_at DESC';
      const rows = queryAll<any>(sql, params);

      const documents = rows.map((r) => ({
        id: r.id,
        title: r.title,
        docType: r.doc_type,
        description: r.description || '',
        docDate: r.doc_date,
        filePath: r.file_path || '',
        fileName: r.file_name || '',
        fileSize: r.file_size || 0,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));

      res.json({ success: true, documents });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/documents', upload.single('file'), (req, res) => {
    try {
      const { title, docType, description, docDate } = req.body;
      const file = req.file;

      if (!title || !title.trim()) return res.status(400).json({ success: false, message: 'عنوان المستند مطلوب.' });
      if (!docType || !docType.trim()) return res.status(400).json({ success: false, message: 'نوع المستند مطلوب.' });

      const id = generateUUID();
      const now = new Date().toISOString();

      execute(
        `INSERT INTO documents (id, title, doc_type, description, doc_date, file_path, file_name, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title.trim(),
          docType.trim(),
          (description || '').trim(),
          docDate || now.substring(0, 10),
          file ? file.path : '',
          file ? file.originalname : '',
          file ? file.size : 0,
          now,
          now,
        ]
      );

      res.json({ success: true, message: 'تم إضافة المستند بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/documents/download/:id', (req, res) => {
    try {
      const { id } = req.params;
      const doc = queryOne<any>('SELECT * FROM documents WHERE id = ?', [id]);
      if (!doc || !doc.file_path || !fs.existsSync(doc.file_path)) {
        return res.status(404).json({ success: false, message: 'الملف غير موجود.' });
      }
      res.download(doc.file_path, doc.file_name || 'document');
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Open a local document file in the browser (fallback for non-desktop mode).
  // Only files inside the generated documents directory are allowed.
  app.get('/api/documents/open', (req, res) => {
    try {
      const raw = typeof req.query.path === 'string' ? req.query.path : '';
      if (!raw) return res.status(400).json({ success: false, message: 'المسار غير محدد.' });
      const filePath = path.resolve(raw);
      const docsDir = path.resolve(DOCS_DIR) + path.sep;
      if (!filePath.startsWith(docsDir) || !fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'الملف غير موجود.' });
      }
      res.sendFile(filePath);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Bulk delete documents (selection feature)
  app.delete('/api/documents/bulk', (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((x: any) => typeof x === 'string' && x.trim()) : [];
      if (ids.length === 0) {
        return res.status(400).json({ success: false, message: 'لا توجد عناصر محددة للحذف.' });
      }
      for (const id of ids) {
        const doc = queryOne<any>('SELECT * FROM documents WHERE id = ?', [id]);
        if (doc && doc.file_path && fs.existsSync(doc.file_path)) {
          try {
            fs.unlinkSync(doc.file_path);
          } catch (e) {
            console.error('Error removing document file:', e);
          }
        }
        execute('DELETE FROM documents WHERE id = ?', [id]);
      }
      res.json({ success: true, message: `تم حذف ${ids.length} مستند بنجاح.` });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/documents/:id', (req, res) => {
    try {
      const { id } = req.params;
      const doc = queryOne<any>('SELECT * FROM documents WHERE id = ?', [id]);
      if (doc && doc.file_path && fs.existsSync(doc.file_path)) {
        try {
          fs.unlinkSync(doc.file_path);
        } catch (e) {
          console.error('Error removing document file:', e);
        }
      }
      execute('DELETE FROM documents WHERE id = ?', [id]);
      res.json({ success: true, message: 'تم حذف المستند بنجاح.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // ---- Document template helpers (supports MENTIS-style config.json folders + flat .docx) ----

  function escapeRegExp(s: string) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function xmlEscape(s: string) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Concatenated text of all run <w:t> elements inside a <w:p> paragraph element.
  function paragraphText(pXml: string): string {
    const texts: string[] = [];
    const runRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
    let m;
    while ((m = runRe.exec(pXml))) {
      const t = m[0].match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
      if (t) texts.push(t[1]);
    }
    return texts.join('');
  }

  function extractParagraphTokens(pXml: string): string[] {
    const full = paragraphText(pXml);
    const matches = full.match(/\{\{([^}]+)\}\}/g) || [];
    const tokens: string[] = [];
    for (const mm of matches) {
      const clean = mm.replace(/^[\{\s]+|[\}\s]+$/g, '').trim();
      if (clean) tokens.push(clean);
    }
    return tokens;
  }

  function rewriteRunText(raw: string, newText: string): string {
    if (newText === '') return raw.replace(/<w:t\b[^>]*>[^]*?<\/w:t>/, '<w:t/>');
    return raw.replace(/<w:t\b[^>]*>[^]*?<\/w:t>/, `<w:t xml:space="preserve">${xmlEscape(newText)}</w:t>`);
  }

  // Replace {{key}} tokens inside a single paragraph, preserving run positions.
  // Fills known values, then clears any remaining {{...}} tokens so the paragraph
  // structure is never altered (MENTIS FillPlaceholders + Remove(false) parity).
  function replaceInParagraph(pXml: string, values: Record<string, string>): string {
    const runs: { raw: string; text: string }[] = [];
    const runRe = /<w:r\b[^>]*>[\s\S]*?<\/w:r>/g;
    let m;
    while ((m = runRe.exec(pXml))) {
      const raw = m[0];
      const t = raw.match(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/);
      runs.push({ raw, text: t ? t[1] : '' });
    }
    if (runs.length === 0) return pXml;

    let newFull = runs.map((r) => r.text).join('');
    let changed = false;
    for (const k of Object.keys(values)) {
      const esc = escapeRegExp(k);
      const re = new RegExp(`\\{\\{${esc}\\}\\}`, 'g');
      if (re.test(newFull)) {
        newFull = newFull.replace(re, String(values[k] ?? ''));
        changed = true;
      }
    }
    // Clear any remaining unfilled placeholders instead of removing the paragraph.
    const leftover = /\{\{[^}]*\}\}/g;
    if (leftover.test(newFull)) {
      newFull = newFull.replace(leftover, '');
      changed = true;
    }
    if (!changed) return pXml;

    // Redistribute the new text across runs by original run lengths (leftover lands in last run).
    const newTexts: string[] = [];
    let cursor = 0;
    for (const r of runs) {
      const len = r.text.length;
      newTexts.push(newFull.slice(cursor, cursor + len));
      cursor += len;
    }
    if (cursor < newFull.length) newTexts[newTexts.length - 1] += newFull.slice(cursor);

    let result = '';
    let pos = 0;
    for (let i = 0; i < runs.length; i++) {
      const idx = pXml.indexOf(runs[i].raw, pos);
      result += pXml.slice(pos, idx);
      result += newTexts[i] === runs[i].text ? runs[i].raw : rewriteRunText(runs[i].raw, newTexts[i]);
      pos = idx + runs[i].raw.length;
    }
    result += pXml.slice(pos);
    return result;
  }

  // Process a single docx XML part: replace tokens only. Never removes or
  // restructures paragraphs (removing paragraphs breaks docx tables/sections
  // and makes Word report the file as corrupt).
  function processDocxPart(xmlText: string, values: Record<string, string>): string {
    const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
    let out = '';
    let last = 0;
    let m;
    while ((m = pRe.exec(xmlText))) {
      const paraRaw = m[0];
      out += xmlText.slice(last, m.index);
      out += replaceInParagraph(paraRaw, values);
      last = m.index + paraRaw.length;
    }
    out += xmlText.slice(last);
    return out;
  }

  function replacePlaceholdersInDocx(docXml: string, values: Record<string, string>): string {
    return processDocxPart(docXml, values);
  }

  async function replacePlaceholdersInXlsx(zip: any, values: Record<string, string>) {
    const names = Object.keys(zip.files).filter((n: string) => n.toLowerCase().endsWith('.xml'));
    for (const name of names) {
      const file = zip.file(name);
      if (!file) continue;
      const text = await file.async('text');
      let newText = text;
      for (const k of Object.keys(values)) {
        newText = newText.replace(new RegExp(`\\{\\{${escapeRegExp(k)}\\}\\}`, 'g'), String(values[k] ?? ''));
      }
      if (newText !== text) zip.file(name, newText);
    }
  }

  // Extract placeholder keys from a template file (docx paragraph model / xlsx xml entries).
  async function extractTemplatePlaceholders(filePath: string, fileType: string): Promise<string[]> {
    const content = fs.readFileSync(filePath);
    const zip = await JSZip.loadAsync(content);
    const tokens = new Set<string>();
    if (fileType === 'xlsx') {
      for (const name of Object.keys(zip.files)) {
        if (!name.toLowerCase().endsWith('.xml')) continue;
        const file = zip.file(name);
        if (!file) continue;
        const text = await file.async('text');
        for (const mm of text.match(/\{\{([^}]+)\}\}/g) || []) {
          const clean = mm.replace(/^[\{\s]+|[\}\s]+$/g, '').trim();
          if (clean) tokens.add(clean);
        }
      }
    } else {
      const docXml = zip.file('word/document.xml');
      if (docXml) {
        const xmlText = await docXml.async('text');
        const pRe = /<w:p\b[^>]*>[\s\S]*?<\/w:p>/g;
        let m;
        while ((m = pRe.exec(xmlText))) {
          for (const t of extractParagraphTokens(m[0])) tokens.add(t);
        }
      }
    }
    return Array.from(tokens);
  }

  // Choose the template file for a folder following MENTIS Arabic preference order.
  function pickTemplateFile(dir: string): string | null {
    const candidates = ['template_ar.docx', 'template.docx', 'template_en.docx', 'template.xlsx'];
    for (const c of candidates) {
      const p = path.join(dir, c);
      if (fs.existsSync(p)) return p;
    }
    return null;
  }

  // Some MENTIS configs use PascalCase keys (Id, TitleAr, ...) instead of camelCase.
  function normalizeConfig(cfg: any): any {
    const out: any = {};
    for (const [k, v] of Object.entries(cfg || {})) {
      const ck = k.charAt(0).toLowerCase() + k.slice(1);
      if (!(ck in out)) out[ck] = v;
    }
    return out;
  }

  // ---- MENTIS-parity placeholder Arabic titles (mirrors PlaceholderArabicManager + DynamicTemplateForm.GetPlaceholderTitle) ----

  function mentisPlaceholderTitle(ph: string, fieldLabels?: Record<string, string> | null): string {
    if (fieldLabels && fieldLabels[ph]) return String(fieldLabels[ph]);

    const isAcademicYearField = (p: string) =>
      p === 'year_academic' || p === 'academic_year' || /^academic_year\d+$/.test(p);
    if (isAcademicYearField(ph) && ph !== 'academic_year') return 'السنة الدراسية';

    switch (ph) {
      case 'no': return 'العدد';
      case 'no3': return 'عدد الوثيقة';
      case 'city': return 'اسم المحافظة';
      case 'date': case 'date3': return 'التاريخ';
      case 'school_name': case 'name_school': case 'school': return 'اسم المدرسة';
      case 'to': return 'إلى';
      case 'student_name': case 'name_student': return 'اسم الطالب';
      case 'birthdate': return 'تاريخ الولادة الطالب';
      case 'grade': return 'الصف';
      case 'academic_year': return 'السنة الدراسية';
      case 'result': return 'النتيجة';
      case 'round': return 'الدور';
      case 'totalno': return 'المجموع الكلي رقماً';
      case 'totalty': return 'المجموع الكلي كتابة';
      case 'totalnote': return 'ملاحظة على المجموع';
      case 'title': return 'صفة المدير';
      case 'principal_name': return 'اسم مدير المدرسة';
      case 'copyto': return 'نسخة منه إلى';
      case 'gr_no': return 'رقم القيد العام';
      case 'bday': return 'تاريخ الولادة الطالب';
      case 'from': return 'صدرت من';
      case '2no': case 'no2': return 'رقم الوثيقة';
      case '2date': case 'date2': return 'تاريخ الوثيقة';
      case '2to': case 'to2': return 'معنونة إلى';
      case 'docno': return 'رقم وثيقة التخرج أو النقل';
      case 'text': return 'الموضوع';
      case 'date1': return 'التاريخ الأول';
      default: break;
    }

    if (ph.startsWith('reason')) return 'السبب';
    if (ph.startsWith('name') && ph.length > 4 && /[0-9]/.test(ph[4])) return 'الاسم الرباعي للموظف';
    if (ph.startsWith('natio')) return 'القومية';
    if (ph.startsWith('bd')) return 'تاريخ الولادة';
    if (ph.startsWith('status')) return 'الحالة الاجتماعية';
    if (ph.startsWith('degree')) return 'المؤهل العلمي';
    if (ph.startsWith('gdate')) return 'سنة التخرج';
    if (ph.startsWith('spe')) return 'الاختصاص';
    if (ph.startsWith('lastw')) return 'آخر مكان كان يعمل به';
    if (ph.startsWith('firstw')) return 'تاريخ التعيين لأول مرة';
    if (ph.startsWith('start')) return 'تاريخ المباشرة في المدرسة';
    if (ph.startsWith('jobt')) return 'العنوان الوظيفي';
    if (ph.startsWith('studentfullname')) return 'اسم التلميذ الثلاثي';
    if (ph.startsWith('birthplace')) return 'التولد';
    if (ph.startsWith('grade') && ph.length > 5 && /[0-9]/.test(ph[5])) return 'الصف';

    const known: Record<string, string> = {
      no: 'العدد', date: 'التاريخ', to: 'إلى', city: 'المحافظة', province: 'المحافظة',
      school_name: 'اسم المدرسة', name_school: 'اسم المدرسة', school: 'اسم المدرسة',
      student_name: 'اسم الطالب', name_student: 'اسم الطالب', student: 'اسم الطالب',
      birthdate: 'تاريخ الولادة الطالب', bday: 'تاريخ الولادة الطالب', grade: 'الصف',
      year_academic: 'السنة الدراسية', academic_year: 'السنة الدراسية', result: 'النتيجة', round: 'الدور',
      principal: 'اسم مدير المدرسة', principal_name: 'اسم مدير المدرسة', copyto: 'نسخة منه إلى', copy_to: 'نسخة منه إلى',
      '3date': 'تاريخ النسخة', date1: 'التاريخ الأول', date2: 'تاريخ الوثيقة', date3: 'تاريخ النسخة',
      note: 'ملاحظات', text: 'الموضوع', no_gr: 'رقم القيد العام', gr_no: 'رقم القيد العام', from: 'صدرت من',
      '2no': 'رقم الوثيقة', '2date': 'تاريخ الوثيقة', '2to': 'معنونة إلى', no2: 'رقم الوثيقة',
      docno: 'رقم وثيقة التخرج أو النقل', totalno: 'المجموع الكلي رقماً', totalty: 'المجموع الكلي كتابة',
      totalnote: 'ملاحظات المجموع', classes_count: 'عدد الشعب', students_count: 'عدد الطلاب',
      applicationdate: 'تاريخ الطلب', duration: 'المدة', type: 'نوع الاجازة', person_name: 'اسم الشخص',
      jobtitle: 'المسمى الوظيفي', admin_order_no: 'رقم الأمر الإداري', admin_order_date: 'تاريخ الأمر الإداري',
      issued_city: 'المحافظة المصدرة', includes: 'يتضمن', starting_date: 'تاريخ المباشرة',
      birthcity: 'مدينة الولادة', birthplace: 'التولد',
    };
    if (known[ph]) return known[ph];

    const digitRegexes: Array<[RegExp, () => string]> = [
      [/^sub\d+$/, () => 'اسم المادة ' + (ph.match(/\d+/) || [])[0]],
      [/^sub\d+no$/, () => 'درجة المادة ' + (ph.match(/\d+/) || [])[0] + ' رقماً'],
      [/^sub\d+ty$/, () => 'درجة المادة ' + (ph.match(/\d+/) || [])[0] + ' كتابة'],
      [/^sub\d+note$/, () => 'ملاحظة المادة ' + (ph.match(/\d+/) || [])[0]],
      [/^academic_year\d+$/, () => 'السنة الدراسية ' + (ph.match(/\d+/) || [])[0]],
      [/^grade\d+$/, () => 'الصف ' + (ph.match(/\d+/) || [])[0]],
      [/^studentfullname\d+$/, () => 'اسم التلميذ الثلاثي'],
      [/^birthplace\d+$/, () => 'التولد'],
      [/^result\d+$/, () => 'النتيجة ' + (ph.match(/\d+/) || [])[0]],
      [/^round\d+$/, () => 'الدور ' + (ph.match(/\d+/) || [])[0]],
      [/^note\d+$/, () => 'ملاحظة ' + (ph.match(/\d+/) || [])[0]],
      [/^reason\d+$/, () => 'السبب'],
      [/^name\d+$/, () => 'الاسم الرباعي للموظف'],
      [/^fullname\d+$/, () => 'الاسم الرباعي'],
      [/^full_name\d+$/, () => 'الاسم الرباعي'],
      [/^natio\d+$/, () => 'القومية'],
      [/^bd\d+$/, () => 'تاريخ الولادة'],
      [/^status\d+$/, () => 'الحالة الاجتماعية'],
      [/^degree\d+$/, () => 'المؤهل العلمي'],
      [/^gdate\d+$/, () => 'سنة التخرج'],
      [/^spe\d+$/, () => 'الاختصاص'],
      [/^lastw\d+$/, () => 'آخر مكان كان يعمل به'],
      [/^firstw\d+$/, () => 'تاريخ التعيين لأول مرة'],
      [/^start\d+$/, () => 'تاريخ المباشرة في المدرسة'],
      [/^jobt\d+$/, () => 'العنوان الوظيفي'],
      [/^jobtitle\d+$/, () => 'اللقب الوظيفي'],
      [/^job_title\d+$/, () => 'اللقب الوظيفي'],
      [/^place\d+$/, () => 'المكان'],
      [/^efromtime\d+$/, () => 'بداية الدوام المسائي'],
      [/^etotime\d+$/, () => 'نهاية الدوام المسائي'],
      [/^mfromtime\d+$/, () => 'بداية الدوام الصباحي'],
      [/^mtotime\d+$/, () => 'نهاية الدوام الصباحي'],
      [/^monname\d+$/, () => 'اسم الموظف - الإثنين'],
      [/^tuename\d+$/, () => 'اسم الموظف - الثلاثاء'],
      [/^wedname\d+$/, () => 'اسم الموظف - الأربعاء'],
      [/^thuname\d+$/, () => 'اسم الموظف - الخميس'],
      [/^sunname\d+$/, () => 'اسم الموظف - الجمعة'],
    ];
    for (const [re, fn] of digitRegexes) {
      if (re.test(ph)) return fn();
    }

    return ph;
  }

  // Mirrors DynamicTemplateForm.IsGridPlaceholder: skip-prefix followed by digit or _digit
  function isGridPlaceholder(placeholder: string, skipPlaceholders: string[]): boolean {
    if (!Array.isArray(skipPlaceholders)) return false;
    for (const prefix of skipPlaceholders) {
      if (!prefix) continue;
      const idx = placeholder.indexOf(prefix);
      if (idx < 0) continue;
      if (placeholder.length <= idx + prefix.length) continue;
      const c = placeholder[idx + prefix.length];
      if (/[0-9]/.test(c)) return true;
      if (c === '_' && placeholder.length > idx + prefix.length + 1 && /[0-9]/.test(placeholder[idx + prefix.length + 1]))
        return true;
    }
    return false;
  }

  // Arabic number-to-words (port of MENTIS ArabicNumberConverter)
  function arabicNumberToWords(num: number): string {
    const units = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
    const tens = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
    const convertInteger = (n: number): string => {
      if (n === 0) return 'صفر';
      if (n < 20) return units[n];
      if (n < 100) {
        const unit = n % 10;
        const ten = Math.floor(n / 10);
        if (unit === 0) return tens[ten];
        return units[unit] + ' و' + tens[ten];
      }
      if (n < 1000) {
        const hundred = Math.floor(n / 100);
        const remainder = n % 100;
        const hundredText = ['', 'مائة', 'مائتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'][hundred];
        if (remainder === 0) return hundredText;
        return hundredText + ' و' + convertInteger(remainder);
      }
      if (n < 1000000) {
        const thousands = Math.floor(n / 1000);
        const remainder = n % 1000;
        const thousandText = thousands === 1 ? 'ألف' : convertInteger(thousands) + ' ألف';
        if (remainder === 0) return thousandText;
        return thousandText + ' و' + convertInteger(remainder);
      }
      return String(n);
    };

    const wholePart = Math.floor(num);
    let decimalPart = num - wholePart;
    let result = convertInteger(wholePart);
    if (decimalPart > 0) {
      let decimals = '';
      const s = decimalPart.toFixed(2).toString();
      decimals = s.split('.')[1];
      result += ' فاصلة ';
      for (const ch of decimals) {
        if (ch !== '0') result += convertInteger(parseInt(ch, 10)) + ' ';
      }
    }
    return result.trim();
  }

  // Document counter persisted in app_meta (MENTIS NumberManager num.dat equivalent)
  function getLastNumber(): number {
    const row = queryOne<any>(`SELECT value FROM app_meta WHERE key = 'last_document_no'`);
    const n = row ? parseInt(row.value, 10) : 0;
    return isNaN(n) ? 0 : n;
  }
  function saveLastNumber(number: number) {
    execute(
      `INSERT INTO app_meta (key, value) VALUES ('last_document_no', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      [String(number)]
    );
  }
  function getNextNumber(): number {
    return getLastNumber() + 1;
  }

  // MENTIS OutgoingLogManager parity: appends a row to سجل الصادرات.xlsx "الصادر" sheet (inside the Desktop export folder)
  function logOutgoingRegister(number: string, to: string, subject: string, date: string) {
    try {
      if (!fs.existsSync(EXPORT_FOLDER)) {
        fs.mkdirSync(EXPORT_FOLDER, { recursive: true });
      }
      const excelPath = path.join(EXPORT_FOLDER, 'سجل الصادرات.xlsx');
      const oldPath = path.join(OUTGOING_DIR, 'OutgoingRegister.xlsx');

      let wb: XLSX.WorkBook;
      if (fs.existsSync(excelPath)) {
        wb = XLSX.read(fs.readFileSync(excelPath), { type: 'buffer' });
      } else {
        wb = XLSX.utils.book_new();
      }
      let ws = wb.Sheets['الصادر'];
      const header = ['التسلسل', 'إلى', 'الموضوع', 'العدد', 'التاريخ'];
      if (!ws) {
        ws = XLSX.utils.aoa_to_sheet([header]);
        XLSX.utils.book_append_sheet(wb, ws, 'الصادر');
      }

      // Migrate any legacy register (cross-device safe: read + delete, never rename)
      if (fs.existsSync(oldPath)) {
        try {
          const oldWb = XLSX.read(fs.readFileSync(oldPath), { type: 'buffer' });
          const oldWs = oldWb.Sheets['الصادر'];
          if (oldWs) {
            const oldRows: any[][] = XLSX.utils.sheet_to_json(oldWs, { header: 1, defval: '' });
            const hasHeader = oldRows.length > 0 && oldRows[0][0] === 'التسلسل';
            const dataRows = hasHeader ? oldRows.slice(1) : oldRows;
            if (dataRows.length > 0) {
              XLSX.utils.sheet_add_aoa(ws, dataRows, { origin: -1 });
            }
          }
          fs.unlinkSync(oldPath);
        } catch (e) {
          console.warn('[EDARA] Could not migrate OutgoingRegister:', (e as Error).message);
        }
      }

      const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
      const nextRow = rows.length + 1;
      XLSX.utils.sheet_add_aoa(ws, [[nextRow - 1, to, subject, number, date]], { origin: -1 });
      XLSX.writeFile(wb, excelPath);
    } catch (err: any) {
      console.error('[EDARA] OutgoingRegister write failed:', err.message);
    }
  }

  // docx/xlsx -> PDF via MS Word COM (mirrors MENTIS PdfConverter which uses Word.Application)
  function convertDocxToPdf(srcPath: string): Promise<string | null> {
    return new Promise((resolve) => {
      const pdfPath = srcPath.replace(/\.[^.]+$/, '.pdf');
      if (fs.existsSync(pdfPath)) return resolve(pdfPath);
      const script = [
        "$ErrorActionPreference='Stop'",
        "$word = New-Object -ComObject Word.Application",
        "$word.Visible = $false",
        'try {',
        '  $doc = $word.Documents.Open($args[0], $false, $true)',
        '  $doc.SaveAs2($args[1], 17)',
        '  $doc.Close($false)',
        "  Write-Output 'OK'",
        '} finally { $word.Quit() }',
      ].join('; ');
      execFile(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-Command', script, srcPath, pdfPath],
        { timeout: 90000, windowsHide: true, maxBuffer: 1024 * 1024 },
        (err, stdout, stderr) => {
          try {
            if (!err && fs.existsSync(pdfPath)) return resolve(pdfPath);
          } catch (e) {
            // fallthrough
          }
          resolve(null);
        }
      );
    });
  }

  // Helper function to discover document templates (MENTIS config.json folders + flat .docx)
  async function discoverTemplates() {
      const dirs = [TEMPLATES_DIR, process.env.EDARA_TEMPLATES_DIR || path.join(process.cwd(), 'templates')];
    const foundTemplates: any[] = [];
    const seen = new Set<string>();

    const addFlat = async (dir: string) => {
      const files = fs.readdirSync(dir);
      for (const f of files) {
        if (f.endsWith('.docx') && !f.startsWith('~$')) {
          const fullPath = path.join(dir, f);
          try {
            const placeholders = await extractTemplatePlaceholders(fullPath, 'docx');
            const nameWithoutExt = path.basename(f, '.docx').replace(/_/g, ' ');
            const id = 'tpl_' + nameWithoutExt.replace(/[^a-zA-Z0-9\u0600-\u06FF]/g, '_');
            if (seen.has(id)) continue;
            seen.add(id);
            foundTemplates.push({
              id,
              name: nameWithoutExt,
              fileName: f,
              filePath: fullPath,
              fileType: 'docx',
              category: 'نماذج مضافة',
              placeholders,
              allPlaceholders: placeholders,
              fieldLabels: {},
              sortOrder: 0,
              templateType: 'single',
              cleanUnusedPlaceholders: false,
              allowAddRows: false,
              defaultRows: 1,
              employeeMode: false,
              manualEditOption: false,
              calculateTotals: false,
              previewPath: null,
              grids: [],
            });
          } catch (e) {
            console.error('Error parsing docx template:', f, e);
          }
        }
      }
    };

    const addConfigFolder = async (dir: string) => {
      let config: any = {};
      try {
        config = normalizeConfig(JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')));
      } catch (e) {
        return;
      }
      if (config.enabled === false) return;
      const templatePath = pickTemplateFile(dir);
      if (!templatePath) return;

      const fileType = path.extname(templatePath).toLowerCase() === '.xlsx' ? 'xlsx' : 'docx';
      const fileName = path.basename(templatePath);

      const id = String(config.id || path.basename(dir));
      if (seen.has(id)) return;
      seen.add(id);

      let tokens: string[] = [];
      try {
        tokens = await extractTemplatePlaceholders(templatePath, fileType);
      } catch (e) {
        console.error('Skipping unreadable template file:', templatePath, e);
        return;
      }

      const placeholders = [...tokens];
      if (Array.isArray(config.placeholderKeys)) {
        for (const ph of config.placeholderKeys) {
          if (!placeholders.includes(ph)) placeholders.push(ph);
        }
      }

      // MENTIS LoadFields: move birthcity to sit right after copyto if needed
      const birthIdx = placeholders.indexOf('birthcity');
      const copyIdx = placeholders.indexOf('copyto');
      if (birthIdx > copyIdx && copyIdx >= 0 && birthIdx >= 0) {
        placeholders.splice(birthIdx, 1);
        placeholders.splice(copyIdx, 0, 'birthcity');
      }

      const skipAdditional = Array.isArray(config.skipAdditionalPlaceholders) ? config.skipAdditionalPlaceholders : [];
      const formPlaceholders = placeholders.filter((ph) => {
        if (ph === 'totalno' || ph === 'totalty') return false;
        if (ph === 'date3' && placeholders.includes('date')) return false;
        if (isGridPlaceholder(ph, config.skipPlaceholders)) return false;
        if (skipAdditional.includes(ph)) return false;
        return true;
      });

      const fieldLabels: Record<string, string> = {};
      for (const ph of formPlaceholders) {
        fieldLabels[ph] = mentisPlaceholderTitle(ph, config.fieldLabels);
      }

      const grids = Array.isArray(config.grids)
        ? config.grids.map((g: any) => ({
            id: String(g.id || ''),
            title: g.title || '',
            addButtonLabel: g.addButtonLabel || '+ إضافة صف',
            deleteButtonLabel: g.deleteButtonLabel || '- حذف صف',
            height: Number(g.height) || 400,
            defaultRows: Number(g.defaultRows) || 1,
            fillEmpty: !!g.fillEmpty,
            autoCalculateTotal: !!g.autoCalculateTotal,
            totalColumnIndex: typeof g.totalColumnIndex === 'number' ? g.totalColumnIndex : -1,
            rowNumberSeparator: g.rowNumberSeparator || '',
            columns: Array.isArray(g.columns)
              ? g.columns.map((c: any) => ({
                  key: String(c.key || ''),
                  header: c.header || c.key || '',
                  fillWeight: Number(c.fillWeight) || 10,
                  readOnly: !!c.readOnly,
                  hidden: !!c.hidden,
                }))
              : [],
            fixedRows: Array.isArray(g.fixedRows)
              ? g.fixedRows.map((fr: any) => ({
                  label: fr.label || '',
                  placeholders: Array.isArray(fr.placeholders) ? fr.placeholders.map((p: any) => String(p)) : [],
                  hidden: !!fr.hidden,
                }))
              : [],
          }))
        : [];

      const previewPath = fs.existsSync(path.join(dir, 'preview.png')) ? path.join(dir, 'preview.png') : null;

      foundTemplates.push({
        id,
        name: String(config.titleAr || config.titleEn || path.basename(dir)),
        fileName,
        filePath: templatePath,
        fileType,
        category: String(config.category || 'نماذج'),
        placeholders: formPlaceholders,
        allPlaceholders: tokens,
        fieldLabels,
        sortOrder: Number(config.sortOrder) || 0,
        templateType: config.type === 'table' ? 'table' : 'single',
        cleanUnusedPlaceholders: !!config.cleanUnusedPlaceholders,
        allowAddRows: !!config.allowAddRows,
        defaultRows: Number(config.defaultRows) || 1,
        employeeMode: !!config.employeeMode,
        manualEditOption: !!config.manualEditOption,
        calculateTotals: !!config.calculateTotals,
        previewPath,
        grids,
      });
    };

    const collectDirs = (root: string): string[] => {
      const result: string[] = [root];
      let entries: string[] = [];
      try {
        entries = fs.readdirSync(root);
      } catch (e) {
        return result;
      }
      for (const e of entries) {
        const p = path.join(root, e);
        try {
          if (fs.statSync(p).isDirectory()) result.push(...collectDirs(p));
        } catch (e2) {
          // ignore
        }
      }
      return result;
    };

    for (const root of dirs) {
      if (!fs.existsSync(root)) continue;
      for (const dir of collectDirs(root)) {
        const hasConfig = fs.existsSync(path.join(dir, 'config.json'));
        let files: string[] = [];
        try {
          files = fs.readdirSync(dir).filter((f) => (f.endsWith('.docx') || f.endsWith('.xlsx')) && !f.startsWith('~$'));
        } catch (e) {
          continue;
        }
        if (hasConfig && files.length > 0) {
          await addConfigFolder(dir);
        } else if (!hasConfig && files.some((f) => f.endsWith('.docx'))) {
          await addFlat(dir);
        }
      }
    }

    foundTemplates.sort((a, b) => (a.category || '').localeCompare(b.category || '') || a.sortOrder - b.sortOrder || (a.name || '').localeCompare(b.name || ''));
    return foundTemplates;
  }

  // Document Templates Endpoints
  // Normalize Arabic text for search: collapse alef/hamza variants, alef maqsura/ya,
  // waw with hamza, taa marbuta, and strip harakat/tatweel so "ا" matches "أ/آ/إ".
  function normalizeArabic(s: string): string {
    if (!s) return '';
    return s
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/[ىئ]/g, 'ي')
      .replace(/ؤ/g, 'و')
      .replace(/ة/g, 'ه')
      .replace(/[\u0640\u064B-\u0652]/g, '');
  }

  app.get('/api/document-templates', async (req, res) => {
    try {
      const templates = await discoverTemplates();
      const search = (req.query.search as string || '').trim();
      if (search) {
        const q = normalizeArabic(search.toLowerCase());
        const filtered = templates.filter((t: any) =>
          (t.name && normalizeArabic(t.name.toLowerCase()).includes(q)) ||
          (t.category && normalizeArabic(t.category.toLowerCase()).includes(q)) ||
          (t.fileName && normalizeArabic(t.fileName.toLowerCase()).includes(q))
        );
        res.json({ success: true, templates: filtered });
      } else {
        res.json({ success: true, templates });
      }
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/document-templates/:id/preview', async (req, res) => {
    try {
      const templates = await discoverTemplates();
      const tpl = templates.find((t) => t.id === req.params.id);
      if (!tpl || !tpl.previewPath || !fs.existsSync(tpl.previewPath)) {
        return res.status(404).json({ success: false, message: 'لا توجد معاينة لهذا النموذج.' });
      }
      res.sendFile(tpl.previewPath);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/templates/last-number', (req, res) => {
    try {
      const last = getLastNumber();
      res.json({ success: true, last, next: last + 1 });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/templates/last-number', (req, res) => {
    try {
      const num = parseInt(String(req.body?.number), 10);
      if (isNaN(num)) {
        return res.status(400).json({ success: false, message: 'رقم غير صالح.' });
      }
      saveLastNumber(num);
      res.json({ success: true, last: num, next: num + 1 });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Export log (سجل الصادرات) — records of created outgoing documents
  app.get('/api/export-log', (req, res) => {
    try {
      const rows = queryAll<any>(
        `SELECT id, title, doc_date, no, to_recipient, file_path, created_at FROM export_log ORDER BY created_at DESC`
      );
      const logs = rows.map((r) => ({
        id: r.id,
        title: r.title,
        docDate: r.doc_date,
        no: r.no || '',
        to: r.to_recipient || '',
        filePath: r.file_path,
        createdAt: r.created_at,
      }));
      res.json({ success: true, logs });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  function deleteExportLogEntry(id: string): number {
    const row = queryOne<any>('SELECT * FROM export_log WHERE id = ?', [id]);
    if (!row) return 0;
    if (row.file_path && fs.existsSync(row.file_path)) {
      try {
        fs.unlinkSync(row.file_path);
      } catch (e) {
        /* ignore */
      }
    }
    execute('DELETE FROM export_log WHERE id = ?', [id]);
    return 1;
  }

  app.delete('/api/export-log/bulk', (req, res) => {
    try {
      const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
      if (ids.length === 0) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد أي قيود.' });
      }
      let deleted = 0;
      ids.forEach((id: string) => {
        deleted += deleteExportLogEntry(id);
      });
      res.json({ success: true, deleted });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.delete('/api/export-log/:id', (req, res) => {
    try {
      const deleted = deleteExportLogEntry(req.params.id);
      if (deleted === 0) {
        return res.status(404).json({ success: false, message: 'القيد غير موجود.' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Data directory configuration
  app.get('/api/config/data-dir', (req, res) => {
    try {
      res.json({ success: true, dataDir: DATA_DIR });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/config/data-dir', (req, res) => {
    try {
      const newDir = String(req.body?.dataDir || '').trim();
      if (!newDir) {
        return res.status(400).json({ success: false, message: 'مسار المجلد غير صالح.' });
      }
      const resolved = path.resolve(newDir);
      if (!fs.existsSync(resolved)) {
        fs.mkdirSync(resolved, { recursive: true });
      }
      if (!fs.statSync(resolved).isDirectory()) {
        return res.status(400).json({ success: false, message: 'المسار المحدد ليس مجلداً.' });
      }
      // Copy existing data so it remains available after restart
      try {
        fs.cpSync(DATA_DIR, resolved, { recursive: true });
      } catch (e) {
        console.warn('[EDARA] Could not copy existing data to new directory:', e && (e as Error).message);
      }
      const cfgPath = path.join(process.cwd(), 'edara_config.json');
      fs.writeFileSync(cfgPath, JSON.stringify({ dataDir: resolved }, null, 2), 'utf8');
      res.json({ success: true, dataDir: resolved, requiresRestart: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // MENTIS StripPlaceholdersAndCopy parity: copies the template and strips {{...}} tokens from xlsx cells
  app.post('/api/document-templates/:id/manual-copy', async (req, res) => {
    try {
      const templates = await discoverTemplates();
      const tpl = templates.find((t) => t.id === req.params.id);
      if (!tpl || !fs.existsSync(tpl.filePath)) {
        return res.status(404).json({ success: false, message: 'نموذج المستند غير موجود.' });
      }

      const now = new Date().toISOString();
      const stamp = Date.now();
      const baseName = `${(tpl.name || 'نموذج').replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '_')}_يدوي_${stamp}`;
      const outExt = tpl.fileType === 'xlsx' ? '.xlsx' : '.docx';
      const fileName = `${baseName}${outExt}`;
      const genFilePath = path.join(DOCS_DIR, fileName);

      if (tpl.fileType === 'xlsx') {
        const content = fs.readFileSync(tpl.filePath);
        const zip = await JSZip.loadAsync(content);
        for (const name of Object.keys(zip.files)) {
          if (!name.toLowerCase().endsWith('.xml')) continue;
          const file = zip.file(name);
          if (!file) continue;
          const text = await file.async('text');
          if (text.includes('{{')) {
            zip.file(name, text.replace(/\{\{[^}]*\}\}/g, ''));
          }
        }
        const buf = await zip.generateAsync({ type: 'nodebuffer' });
        fs.writeFileSync(genFilePath, buf);
      } else {
        fs.copyFileSync(tpl.filePath, genFilePath);
      }

      const docId = generateUUID();
      execute(
        `INSERT INTO documents (id, title, doc_type, description, doc_date, file_path, file_name, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          docId,
          `${tpl.name} (تعبئة يدوية)`,
          'نموذج للتعبئة اليدوية',
          `نسخة من نموذج: ${tpl.name} بدون بيانات للتعبئة اليدوية`,
          now.substring(0, 10),
          genFilePath,
          fileName,
          fs.statSync(genFilePath).size,
          now,
          now,
        ]
      );

      res.json({
        success: true,
        message: 'تم إنشاء نسخة للتعبئة اليدوية بنجاح.',
        document: {
          id: docId,
          title: `${tpl.name} (تعبئة يدوية)`,
          docType: 'نموذج للتعبئة اليدوية',
          fileName,
          filePath: genFilePath,
          fileSize: fs.statSync(genFilePath).size,
          createdAt: now,
        },
      });
    } catch (err: any) {
      console.error('Error creating manual copy:', err);
      res.status(500).json({ success: false, message: 'فشل إنشاء النسخة اليدوية: ' + err.message });
    }
  });

  app.post('/api/document-templates/:id/generate', async (req, res) => {
    try {
      const { id } = req.params;
      const { documentName, values, format } = req.body;

      const templates = await discoverTemplates();
      const tpl = templates.find((t) => t.id === id || t.name === id);
      if (!tpl || !fs.existsSync(tpl.filePath)) {
        return res.status(404).json({ success: false, message: 'نموذج المستند غير موجود.' });
      }

      const fill: Record<string, string> = {};
      if (values && typeof values === 'object') {
        for (const [k, v] of Object.entries(values)) {
          if (v !== null && v !== undefined) fill[k] = String(v);
        }
      }

      // MENTIS DynamicTemplateForm.CollectAllValues remap: subno1 -> sub1no, subnote1 -> sub1note
      for (const key of Object.keys(fill)) {
        let m = /^subno(\d+)$/.exec(key);
        if (m) fill[`sub${m[1]}no`] = fill[key];
        m = /^subnote(\d+)$/.exec(key);
        if (m) fill[`sub${m[1]}note`] = fill[key];
      }

      const profile = queryOne<any>('SELECT * FROM school_profile LIMIT 1');

      // MENTIS TemplateEngine.CalculateTotals (always runs)
      {
        let total = 0;
        for (let i = 1; i <= 11; i++) {
          const numericKey = `sub${i}no`;
          const textKey = `sub${i}ty`;
          if (fill[numericKey] !== undefined && fill[numericKey] !== null) {
            const mark = parseFloat(String(fill[numericKey]).trim());
            if (!isNaN(mark)) {
              total += mark;
              fill[textKey] = arabicNumberToWords(mark);
            }
          }
        }
        fill['totalno'] = String(total);
        fill['totalty'] = arabicNumberToWords(total);
      }

      // School profile fill (MENTIS parity)
      if (profile) {
        fill['name_school'] = profile.school_name || '';
        fill['school_name'] = profile.school_name || '';
        fill['city'] = profile.city || '';
        fill['province'] = profile.city || '';
      }
      fill['title'] = (profile && profile.principal_title) || 'مدير المدرسة';
      if (!fill['principal_name'] || !fill['principal_name'].trim()) {
        fill['principal_name'] = (profile && profile.principal_name) || '';
      }
      if (fill['date']) fill['date3'] = fill['date'];

      // NOTE: The document number is persisted ONLY after the document and its
      // records are successfully created (see saveLastNumber call below). This
      // prevents a number from being consumed/lost when generation fails.

      // Output filename: student name when present, else Document_timestamp (MENTIS parity)
      const studentName = (fill['name_student'] || fill['student_name'] || '').trim();
      const ts = new Date();
      const tsStr =
        ts.getFullYear() +
        String(ts.getMonth() + 1).padStart(2, '0') +
        String(ts.getDate()).padStart(2, '0') +
        '_' +
        String(ts.getHours()).padStart(2, '0') +
        String(ts.getMinutes()).padStart(2, '0') +
        String(ts.getSeconds()).padStart(2, '0');
      const fileNameBase = studentName || `Document_${tsStr}`;
      const outExt = tpl.fileType === 'xlsx' ? '.xlsx' : '.docx';
      const fileName = `${fileNameBase.replace(/[^a-zA-Z0-9_\-\u0600-\u06FF]/g, '')}${outExt}`;
      const genFilePath = path.join(DOCS_DIR, fileName);

      const content = fs.readFileSync(tpl.filePath);
      const zip = await JSZip.loadAsync(content);

      if (tpl.fileType === 'xlsx') {
        await replacePlaceholdersInXlsx(zip, fill);
      } else {
        for (const name of Object.keys(zip.files)) {
          const lower = name.toLowerCase();
          if (lower === 'word/document.xml' || lower.startsWith('word/header') || lower.startsWith('word/footer')) {
            const file = zip.file(name);
            if (!file) continue;
            const xmlText = await file.async('text');
            zip.file(name, replacePlaceholdersInDocx(xmlText, fill));
          }
        }
      }

      const generatedBuf = await zip.generateAsync({ type: 'nodebuffer' });
      fs.writeFileSync(genFilePath, generatedBuf);

      let finalPath = genFilePath;
      let finalBuf = generatedBuf;
      const wantedFormat = String(format || '').toLowerCase();
      if (wantedFormat === 'pdf') {
        const pdf = await convertDocxToPdf(genFilePath);
        if (pdf && fs.existsSync(pdf)) {
          finalPath = pdf;
          finalBuf = fs.readFileSync(pdf);
        }
      }

      // Copy the generated document to the Desktop "Edara الصادرات" export folder
      let exportPath = '';
      try {
        if (!fs.existsSync(EXPORT_FOLDER)) {
          fs.mkdirSync(EXPORT_FOLDER, { recursive: true });
        }
        exportPath = path.join(EXPORT_FOLDER, path.basename(finalPath));
        fs.writeFileSync(exportPath, finalBuf);
      } catch (e) {
        console.warn('[EDARA] Failed to write export copy to Desktop:', e && (e as Error).message);
        exportPath = finalPath;
      }

      const now = new Date().toISOString();
      const docId = generateUUID();
      const safeTitle = (documentName || tpl.name).trim();
      const descriptionParts: string[] = [];
      if (fill['to']) descriptionParts.push(`إلى: ${fill['to']}`);
      if (fill['no']) descriptionParts.push(`العدد: ${fill['no']}`);
      if (fill['date']) descriptionParts.push(`التاريخ: ${fill['date']}`);
      descriptionParts.push(`النموذج: ${tpl.name}`);

      execute(
        `INSERT INTO documents (id, title, doc_type, description, doc_date, file_path, file_name, file_size, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          docId,
          safeTitle,
          'مستند مُنشّأ من نموذج',
          descriptionParts.join(' — '),
          now.substring(0, 10),
          finalPath,
          path.basename(finalPath),
          finalBuf.length,
          now,
          now,
        ]
      );

      // Export log (سجل الصادرات): keep a record of created docs (title, date, no, to)
      execute(
        `INSERT INTO export_log (id, title, doc_date, no, to_recipient, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          generateUUID(),
          safeTitle,
          now.substring(0, 10),
          fill['no'] || '',
          fill['to'] || '',
          exportPath,
          now,
        ]
      );

      // MENTIS WriteOutgoingLog: skip recordssection templates
      if (tpl.filePath.indexOf('recordssection') < 0) {
        logOutgoingRegister(fill['no'] || '', fill['to'] || '', tpl.name, fill['date'] || '');
      }

      // MENTIS NumberManager.SaveLastNumber — commit the document number only
      // after the document file and all DB records were created successfully.
      if (fill['no'] && /^\d+$/.test(String(fill['no']).trim())) {
        saveLastNumber(parseInt(String(fill['no']).trim(), 10));
      }

      res.json({
        success: true,
        message: 'تم إنشاء المستند بنجاح.',
        exportPath,
        document: {
          id: docId,
          title: safeTitle,
          docType: 'مستند مُنشّأ من نموذج',
          fileName: path.basename(finalPath),
          filePath: finalPath,
          fileSize: finalBuf.length,
          fileType: path.extname(finalPath).replace('.', ''),
          createdAt: now,
        },
      });
    } catch (err: any) {
      console.error('Error generating document:', err);
      res.status(500).json({ success: false, message: 'فشل إنشاء المستند: ' + err.message });
    }
  });

  // Google Apps Script Web App URL (read once at startup)
  const GOOGLE_APPS_SCRIPT_URL = process.env.GOOGLE_APPS_SCRIPT_URL || '';

  // Helper to fetch files from Google Drive via Apps Script Web App
  async function fetchFromAppsScript(targetFolderId: string) {
    if (!GOOGLE_APPS_SCRIPT_URL) {
      throw new Error('GOOGLE_APPS_SCRIPT_URL is not configured.');
    }

    const appsScriptUrl = GOOGLE_APPS_SCRIPT_URL + '?action=list&folderId=' + encodeURIComponent(targetFolderId);

    const res = await fetch(appsScriptUrl);

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.error('[GOV DRIVE] HTTP ' + res.status, body.substring(0, 300));
      throw new Error('Google Apps Script returned HTTP ' + res.status);
    }

    const json: any = await res.json();

    if (!json.success) {
      console.error('[GOV DRIVE] Apps Script error:', json.error, json.message);
      throw new Error(json.message || 'Apps Script returned error: ' + json.error);
    }

    // Merge files + folders into a single items array matching the existing API shape
    const items: any[] = [];

    for (const f of (json.folders || [])) {
      items.push({
        id:           f.id,
        name:         f.name,
        mimeType:     f.mimeType || 'application/vnd.google-apps.folder',
        isFolder:     true,
        parentId:     targetFolderId,
        size:         0,
        createdTime:  f.createdTime,
        modifiedTime: f.modifiedTime,
        downloadUrl:  undefined,
        viewUrl:      f.webViewLink || ('https://drive.google.com/drive/folders/' + f.id),
      });
    }

    for (const f of (json.files || [])) {
      items.push({
        id:           f.id,
        name:         f.name,
        mimeType:     f.mimeType || 'application/octet-stream',
        isFolder:     false,
        parentId:     targetFolderId,
        size:         f.size || 0,
        createdTime:  f.createdTime,
        modifiedTime: f.modifiedTime,
        downloadUrl:  f.downloadUrl || ('https://drive.google.com/uc?export=download&id=' + f.id),
        viewUrl:      f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view'),
      });
    }

    return {
      items,
      folderName: json.folderName || 'المجلد الرئيسي',
    };
  }

  // 7. Governorate Drive Endpoints (Read-Only, Governorate-Scoped)
  //
  // Resolution chain:
  //   edara_accounts.governorate_id → cities.governorate_id → city_drive_folders.city_id → folder_id
  //
  // The server resolves the folder from the authenticated account. The frontend
  // never decides which governorate folder to access.

  app.get('/api/governorate-drive/config', async (req, res) => {
    try {
      if (!supabaseClient) {
        return res.status(503).json({
          success: false,
          message: 'خدمة Supabase غير مهيأة.',
          code: 'not_configured',
        });
      }

      // Verify the caller's Supabase auth token (sent as Authorization header)
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({
          success: false,
          message: 'يرجى تسجيل الدخول أولاً.',
          code: 'auth_error',
        });
      }

      const token = authHeader.replace('Bearer ', '');

      // Validate the JWT and extract the user ID
      const { data: { user }, error: authError } = await supabaseClient.auth.getUser(token);
      if (authError || !user) {
        return res.status(401).json({
          success: false,
          message: 'يرجى تسجيل الدخول مرة أخرى.',
          code: 'auth_error',
        });
      }

      // Create a request-scoped Supabase client with the user's JWT so that
      // RLS policies see auth.uid() = user.id (matching the anon key's JWT context).
      const userClient = createClient(
        supabaseUrl,
        supabaseAnonKey,
        { global: { headers: { Authorization: `Bearer ${token}` } } }
      );

      // --- Step 1: Look up edara_accounts (RLS-protected, needs user JWT) ---
      const { data: account, error: accountError } = await userClient
        .from('edara_accounts')
        .select('governorate_id, governorate')
        .eq('auth_user_id', user.id)
        .maybeSingle();

      if (accountError) {
        console.error('[GOV DRIVE] account lookup error:', accountError.message, accountError.code);
      }

      if (accountError || !account) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم العثور على حسابك في النظام.',
          code: 'no_account',
        });
      }

      if (!account.governorate_id) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم تحديد المحافظة لك. يرجى التواصل مع الإدارة.',
          code: 'no_governorate',
        });
      }

      // --- Step 2: Resolve governorate folder directly from city_drive_folders ---
      // city_drive_folders.governorate_id links directly to the account's governorate.
      // Use userClient (user's JWT) so RLS sees auth.uid() and allows the read.

      const { data: folderConfig, error: folderError } = await userClient
        .from('city_drive_folders')
        .select('id, governorate_id, folder_id, folder_url, is_active')
        .eq('governorate_id', account.governorate_id)
        .eq('is_active', true)
        .maybeSingle();

      if (folderError) {
        console.error('[GOV DRIVE] Supabase error during folder query:', folderError.code, folderError.message);
        return res.status(500).json({
          success: false,
          message: 'حدث خطأ في استعلام قاعدة البيانات.',
          code: 'query_error',
        });
      }

      if (!folderConfig) {
        return res.status(404).json({
          success: false,
          message: 'لم يتم تهيئة مجلد المحافظة بعد. يرجى التواصل مع الإدارة.',
          code: 'no_folder',
        });
      }

      res.json({
        success: true,
        config: {
          governorateName: account.governorate || 'المحافظة',
          folderId: folderConfig.folder_id,
          folderUrl: folderConfig.folder_url,
        },
      });
    } catch (err: any) {
      console.error('[GOV DRIVE] EXCEPTION:', err?.message || err);
      res.status(500).json({
        success: false,
        message: 'حدث خطأ في تحميل إعدادات المحافظة.',
        code: 'server_error',
      });
    }
  });

  // Read-only file listing for the governorate drive folder
  app.get('/api/governorate-drive/files', async (req, res) => {
    try {
      const folderId = ((req.query.folderId as string) || '').trim();
      const search = ((req.query.search as string) || '').trim();

      if (!folderId) {
        return res.status(400).json({
          success: false,
          message: 'معرف المجلد مطلوب.',
        });
      }

      const driveData = await fetchFromAppsScript(folderId);
      let items = driveData.items;

      if (search) {
        items = items.filter((item: any) =>
          item.name.toLowerCase().includes(search.toLowerCase())
        );
      }

      res.json({
        success: true,
        items,
        folderName: driveData.folderName || 'كتب رسمية',
      });
    } catch (err: any) {
      console.error('[GOV DRIVE] files error:', err?.message || err);
      res.status(500).json({
        success: false,
        message: 'تعذر الوصول إلى كتب رسمية حالياً.',
      });
    }
  });

  // 8. Administrative Files Endpoints (Google Drive folder with upload / delete)
  function getSchoolName(): string {
    try {
      const profile = queryOne<any>('SELECT school_name FROM school_profile ORDER BY updated_at DESC LIMIT 1');
      if (profile && profile.school_name && profile.school_name.trim()) return profile.school_name.trim();
    } catch (e) {
      /* ignore */
    }
    return 'المدرسة';
  }

  const adminUpload = multer({ storage: multer.memoryStorage() });

  app.get('/api/admin-files/list', async (req, res) => {
    try {
      const search = ((req.query.search as string) || '').trim();
      const requestedFolderId = ((req.query.folderId as string) || '').trim();
      const defaultFolderId =
        extractFolderId(APP_CONFIG.adminFiles.publicGoogleDriveFolderUrl) || requestedFolderId;
      const targetFolderId = requestedFolderId || defaultFolderId;

      const token = cloudService.getAccessToken('google');
      if (token) {
        try {
          let q = `'${targetFolderId}' in parents and trashed=false`;
          if (search) q += ` and fullText contains '${search.replace(/'/g, "\\'")}'`;
          const fields =
            'files(id,name,mimeType,size,createdTime,modifiedTime,description,appProperties,owners,parents)';
          const driveRes = await fetch(
            `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(q)}&fields=${encodeURIComponent(fields)}&pageSize=1000`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          const driveData: any = await driveRes.json();
          if (!driveRes.ok) {
            throw new Error(driveData.error?.message || 'Drive API error');
          }
          const schoolName = getSchoolName();
          const now = Date.now();
          const items = (driveData.files || []).map((f: any) => {
            const isFolder = f.mimeType === 'application/vnd.google-apps.folder';
            const uploadedBySchool = f.appProperties?.uploadedBySchool || null;
            const created = f.createdTime ? new Date(f.createdTime).getTime() : 0;
            const withinWindow = created ? now - created <= 24 * 60 * 60 * 1000 : false;
            const canDelete = !!uploadedBySchool && uploadedBySchool === schoolName && withinWindow;
            return {
              id: f.id,
              name: f.name,
              mimeType: f.mimeType,
              isFolder,
              size: f.size ? Number(f.size) : undefined,
              createdTime: f.createdTime || undefined,
              modifiedTime: f.modifiedTime || undefined,
              description: f.description || undefined,
              uploader: uploadedBySchool,
              canDelete,
              downloadUrl: isFolder ? undefined : `https://drive.google.com/uc?export=download&id=${f.id}`,
              viewUrl: isFolder
                ? `https://drive.google.com/drive/folders/${f.id}`
                : `https://drive.google.com/file/d/${f.id}/view`,
            };
          });
          const list = search ? items.filter((i: any) => i.name.toLowerCase().includes(search.toLowerCase())) : items;
          res.json({ success: true, items: list, folderName: 'ملفات إدارية', requiresAuth: false });
          return;
        } catch (driveErr: any) {
          console.warn('[Admin Files] Drive API list failed, falling back to public:', driveErr?.message);
        }
      }

      // Fallback: public read-only listing (no upload/delete)
      const driveData = await fetchFromAppsScript(targetFolderId);
      const items = (driveData.items || []).map((i: any) => ({
        ...i,
        createdTime: i.modifiedTime,
        uploader: null,
        canDelete: false,
      }));
      res.json({
        success: true,
        items,
        folderName: driveData.folderName || 'ملفات إدارية',
        requiresAuth: !token,
      });
    } catch (err: any) {
      console.error('[Admin Files Error]:', err?.message || err);
      res.status(500).json({ success: false, message: 'تعذر تحميل ملفات الإدارة حالياً.' });
    }
  });

  app.post('/api/admin-files/upload', adminUpload.single('file'), async (req, res) => {
    try {
      const token = cloudService.getAccessToken('google');
      if (!token) {
        return res.status(401).json({ success: false, message: 'يرجى ربط حساب Google Drive من الإعدادات أولاً.' });
      }
      const title = (req.body.title || '').trim();
      const description = (req.body.description || '').trim();
      const folderId = (req.body.folderId || '').trim() || extractFolderId(APP_CONFIG.adminFiles.publicGoogleDriveFolderUrl);
      if (!title) {
        return res.status(400).json({ success: false, message: 'عنوان الملف مطلوب.' });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'لم يتم تحديد ملف للرفع.' });
      }
      const schoolName = getSchoolName();
      const metadata = JSON.stringify({
        name: title,
        parents: [folderId],
        description: description || undefined,
        appProperties: { uploadedBySchool: schoolName, uploadedAt: new Date().toISOString() },
      });
      const form = new FormData();
      form.append('metadata', new Blob([metadata], { type: 'application/json' }));
      form.append('file', new Blob([req.file.buffer], { type: req.file.mimetype || 'application/octet-stream' }));
      const upRes = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const upData: any = await upRes.json();
      if (!upRes.ok) {
        return res.status(upRes.status).json({ success: false, message: upData.error?.message || 'فشل رفع الملف إلى Google Drive.' });
      }
      res.json({
        success: true,
        message: 'تم رفع الملف بنجاح.',
        item: {
          id: upData.id,
          name: upData.name,
          mimeType: upData.mimeType,
          isFolder: false,
          size: req.file.size,
          createdTime: upData.createdTime,
          uploader: schoolName,
          canDelete: true,
          downloadUrl: `https://drive.google.com/uc?export=download&id=${upData.id}`,
          viewUrl: `https://drive.google.com/file/d/${upData.id}/view`,
        },
      });
    } catch (err: any) {
      console.error('[Admin Files Upload Error]:', err?.message || err);
      res.status(500).json({ success: false, message: err.message || 'حدث خطأ أثناء رفع الملف.' });
    }
  });

  app.delete('/api/admin-files/:id', async (req, res) => {
    try {
      const token = cloudService.getAccessToken('google');
      if (!token) {
        return res.status(401).json({ success: false, message: 'يرجى ربط حساب Google Drive من الإعدادات أولاً.' });
      }
      const fileId = req.params.id;
      const metaRes = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=id,name,createdTime,appProperties`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!metaRes.ok) {
        const e: any = await metaRes.json();
        return res.status(metaRes.status).json({ success: false, message: e.error?.message || 'تعذر العثور على الملف.' });
      }
      const meta: any = await metaRes.json();
      const schoolName = getSchoolName();
      const uploadedBySchool = meta.appProperties?.uploadedBySchool || null;
      const created = meta.createdTime ? new Date(meta.createdTime).getTime() : 0;
      const withinWindow = created ? Date.now() - created <= 24 * 60 * 60 * 1000 : false;
      if (!uploadedBySchool || uploadedBySchool !== schoolName) {
        return res.status(403).json({ success: false, message: 'لا يمكنك حذف ملف لم تقم برفعه عبر التطبيق.' });
      }
      if (!withinWindow) {
        return res.status(403).json({ success: false, message: 'انتهت المهلة المسموحة لحذف هذا الملف (24 ساعة).' });
      }
      const delRes = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!delRes.ok && delRes.status !== 204) {
        const e: any = await delRes.json().catch(() => ({}));
        return res.status(delRes.status).json({ success: false, message: e.error?.message || 'فشل حذف الملف.' });
      }
      res.json({ success: true, message: 'تم حذف الملف بنجاح.' });
    } catch (err: any) {
      console.error('[Admin Files Delete Error]:', err?.message || err);
      res.status(500).json({ success: false, message: err.message || 'حدث خطأ أثناء حذف الملف.' });
    }
  });

  // 8. Backup & Restore Endpoints
  // ---------- Cloud Backup (Google Drive / OneDrive) OAuth + Upload ----------
  app.get('/api/cloud-backup/status', (req, res) => {
    try {
      const provider = (req.query.provider as string) || '';
      if (!['google', 'microsoft'].includes(provider)) {
        return res.status(400).json({ success: false, message: 'مزود الخدمة غير صالح.' });
      }
      const st = cloudService.getStatus(provider as 'google' | 'microsoft');
      res.json({ success: true, connected: st.connected, accountEmail: st.accountEmail, credentialsConfigured: st.credentialsConfigured });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/cloud-backup/connect', async (req, res) => {
    try {
      const { provider } = req.body;
      if (!['google', 'microsoft'].includes(provider)) {
        return res.status(400).json({ success: false, message: 'مزود الخدمة غير صالح.' });
      }
      const info = await cloudService.startConnect(provider as 'google' | 'microsoft');
      if (!info.success) {
        return res.status(400).json(info);
      }
      res.json(info);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/cloud-backup/poll', async (req, res) => {
    try {
      const { provider } = req.body;
      if (!['google', 'microsoft'].includes(provider)) {
        return res.status(400).json({ success: false, message: 'مزود الخدمة غير صالح.' });
      }
      const result = await cloudService.pollConnect(provider as 'google' | 'microsoft');
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/cloud-backup/disconnect', (req, res) => {
    try {
      const { provider } = req.body;
      if (!['google', 'microsoft'].includes(provider)) {
        return res.status(400).json({ success: false, message: 'مزود الخدمة غير صالح.' });
      }
      cloudService.disconnect(provider as 'google' | 'microsoft');
      res.json({ success: true, message: 'تم قطع الاتصال بالحساب.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/backup-accounts', (req, res) => {
    try {
      const rows = queryAll<any>('SELECT * FROM backup_accounts');
      const google = rows.find((r) => r.provider === 'google' && r.connection_status === 'connected') || null;
      const microsoft = rows.find((r) => r.provider === 'microsoft' && r.connection_status === 'connected') || null;

      res.json({
        success: true,
        googleAccount: google ? { email: google.account_email, status: 'connected' } : null,
        microsoftAccount: microsoft ? { email: microsoft.account_email, status: 'connected' } : null,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/backup-accounts/connect', (req, res) => {
    try {
      const { provider, email } = req.body;
      if (!provider || !['google', 'microsoft'].includes(provider)) {
        return res.status(400).json({ success: false, message: 'مزود الخدمة غير صالح.' });
      }
      const accEmail = (email && email.trim()) || (provider === 'google' ? 'user@gmail.com' : 'user@outlook.com');
      const now = new Date().toISOString();

      const existing = queryOne<any>('SELECT * FROM backup_accounts WHERE provider = ?', [provider]);
      if (existing) {
        execute(
          'UPDATE backup_accounts SET account_email = ?, connection_status = ?, updated_at = ? WHERE provider = ?',
          [accEmail, 'connected', now, provider]
        );
      } else {
        const id = generateUUID();
        execute(
          'INSERT INTO backup_accounts (id, provider, account_email, connection_status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
          [id, provider, accEmail, 'connected', now, now]
        );
      }

      res.json({
        success: true,
        message: `تم ربط حساب ${provider === 'google' ? 'Google Drive' : 'Microsoft OneDrive'} بنجاح.`,
      });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/backup-accounts/disconnect', (req, res) => {
    try {
      const { provider } = req.body;
      if (!provider) return res.status(400).json({ success: false, message: 'مزود الخدمة غير صالح.' });

      const now = new Date().toISOString();
      execute(
        'UPDATE backup_accounts SET connection_status = ?, updated_at = ? WHERE provider = ?',
        ['disconnected', now, provider]
      );

      res.json({ success: true, message: 'تم قطع الاتصال بالحساب.' });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.get('/api/backups/history', (req, res) => {
    try {
      const rows = queryAll<any>('SELECT * FROM backup_history ORDER BY created_at DESC');
      const backups = rows.map((r) => ({
        id: r.id,
        fileName: r.file_name,
        filePath: r.file_path,
        fileSize: r.file_size,
        createdAt: r.created_at,
        status: r.status,
      }));
      res.json({ success: true, backups });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/backups/create', async (req, res) => {
    try {
      saveDatabase();
      const zip = new JSZip();

      // Include SQLite Database file
      if (fs.existsSync(DB_PATH)) {
        zip.file('edara.db', fs.readFileSync(DB_PATH));
      }

      // Include manifest
      const profile = queryOne<any>('SELECT * FROM school_profile LIMIT 1');
      const manifest = {
        app: 'EDARA',
        version: '1.0.5',
        createdAt: new Date().toISOString(),
        schoolName: profile ? profile.school_name : 'EDARA School',
      };
      zip.file('manifest.json', JSON.stringify(manifest, null, 2));

      // Include files in documents and ministry_documents
      const docsFolder = zip.folder('documents');
      if (fs.existsSync(DOCS_DIR) && docsFolder) {
        const docFiles = fs.readdirSync(DOCS_DIR);
        for (const fname of docFiles) {
          const fpath = path.join(DOCS_DIR, fname);
          if (fs.statSync(fpath).isFile()) {
            docsFolder.file(fname, fs.readFileSync(fpath));
          }
        }
      }

      const minDocsFolder = zip.folder('ministry_documents');
      if (fs.existsSync(MINISTRY_DOCS_DIR) && minDocsFolder) {
        const minFiles = fs.readdirSync(MINISTRY_DOCS_DIR);
        for (const fname of minFiles) {
          const fpath = path.join(MINISTRY_DOCS_DIR, fname);
          if (fs.statSync(fpath).isFile()) {
            minDocsFolder.file(fname, fs.readFileSync(fpath));
          }
        }
      }

      // Include Mail attachments (local-first permanent store)
      const mailFolder = zip.folder('mail_attachments');
      if (fs.existsSync(MAIL_ATTACHMENTS_DIR) && mailFolder) {
        const mailFiles = fs.readdirSync(MAIL_ATTACHMENTS_DIR);
        for (const fname of mailFiles) {
          const fpath = path.join(MAIL_ATTACHMENTS_DIR, fname);
          if (fs.statSync(fpath).isFile()) {
            mailFolder.file(fname, fs.readFileSync(fpath));
          }
        }
      }

      // Include correspondence attachments
      const corrFolder = zip.folder('correspondence');
      if (fs.existsSync(CORRESPONDENCE_DIR) && corrFolder) {
        const corrFiles = fs.readdirSync(CORRESPONDENCE_DIR);
        for (const fname of corrFiles) {
          const fpath = path.join(CORRESPONDENCE_DIR, fname);
          if (fs.statSync(fpath).isFile()) {
            corrFolder.file(fname, fs.readFileSync(fpath));
          }
        }
      }

      const nowStr = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
      const fileName = `EDARA_Backup_${nowStr}.zip`;
      const backupPath = path.join(BACKUPS_DIR, fileName);

      const content = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      fs.writeFileSync(backupPath, content);

      const id = generateUUID();
      const now = new Date().toISOString();

      // Check cloud connected accounts and actually upload
      const googleAcc = queryOne<any>("SELECT * FROM backup_accounts WHERE provider = 'google' AND connection_status = 'connected'");
      const microsoftAcc = queryOne<any>("SELECT * FROM backup_accounts WHERE provider = 'microsoft' AND connection_status = 'connected'");

      const cloudResults: string[] = [];
      if (googleAcc) {
        const up = await cloudService.uploadBackup('google', backupPath, fileName);
        cloudResults.push(up.success ? up.message : `Google Drive: ${up.message}`);
      }
      if (microsoftAcc) {
        const up = await cloudService.uploadBackup('microsoft', backupPath, fileName);
        cloudResults.push(up.success ? up.message : `Microsoft OneDrive: ${up.message}`);
      }

      let finalMsg = 'تم إنشاء النسخة الاحتياطية المحلية بنجاح.';
      if (cloudResults.length > 0) {
        finalMsg += ' ' + cloudResults.join(' ');
      } else {
        finalMsg += ' لم يتم إنشاء نسخة سحابية لأنه لا يوجد حساب سحابي متصل.';
      }

      execute(
        `INSERT INTO backup_history (id, file_name, file_path, file_size, created_at, status) VALUES (?, ?, ?, ?, ?, ?)`,
        [id, fileName, backupPath, content.length, now, 'success']
      );

      res.json({
        success: true,
        message: finalMsg,
        cloudDetails: {
          googleConnected: !!googleAcc,
          microsoftConnected: !!microsoftAcc,
        },
        backup: {
          id,
          fileName,
          filePath: backupPath,
          fileSize: content.length,
          createdAt: now,
          status: 'success',
        },
      });
    } catch (err: any) {
      console.error('Backup creation error:', err);
      res.status(500).json({ success: false, message: 'فشل إنشاء النسخة الاحتياطية: ' + err.message });
    }
  });

  app.get('/api/backups/download/:id', (req, res) => {
    try {
      const { id } = req.params;
      const backup = queryOne<any>('SELECT * FROM backup_history WHERE id = ?', [id]);
      if (!backup || !fs.existsSync(backup.file_path)) {
        return res.status(404).json({ success: false, message: 'ملف النسخة الاحتياطية غير موجود.' });
      }
      res.download(backup.file_path, backup.file_name);
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  app.post('/api/backups/restore', backupUpload.single('file'), async (req, res) => {
    try {
      const uploadedFile = req.file;
      if (!uploadedFile || !fs.existsSync(uploadedFile.path)) {
        return res.status(400).json({ success: false, message: 'يرجى اختيار ملف نسخة احتياطية صحيح (ZIP).' });
      }

      // Step 1: Create SAFETY BACKUP of current data before overwriting!
      saveDatabase();
      const safetyZip = new JSZip();
      if (fs.existsSync(DB_PATH)) {
        safetyZip.file('edara.db', fs.readFileSync(DB_PATH));
      }
      const safetyName = `EDARA_Safety_Backup_${Date.now()}.zip`;
      const safetyPath = path.join(BACKUPS_DIR, safetyName);
      const safetyBuf = await safetyZip.generateAsync({ type: 'nodebuffer' });
      fs.writeFileSync(safetyPath, safetyBuf);

      // Step 2: Unzip and inspect uploaded backup
      const zipData = fs.readFileSync(uploadedFile.path);
      const zip = await JSZip.loadAsync(zipData);

      const dbEntry = zip.file('edara.db');
      if (!dbEntry) {
        return res.status(400).json({ success: false, message: 'ملف النسخة الاحتياطية غير صالح (لا يحتوي على قاعدة بيانات EDARA).' });
      }

      // Extract new database
      const dbBuf = await dbEntry.async('nodebuffer');
      fs.writeFileSync(DB_PATH, dbBuf);

      // Extract documents
      const docFolderInZip = zip.folder('documents');
      if (docFolderInZip) {
        for (const filename of Object.keys(zip.files)) {
          if (filename.startsWith('documents/') && !zip.files[filename].dir) {
            const fileBuf = await zip.files[filename].async('nodebuffer');
            const targetPath = path.join(DOCS_DIR, path.basename(filename));
            fs.writeFileSync(targetPath, fileBuf);
          }
        }
      }

      // Extract ministry_documents
      const minFolderInZip = zip.folder('ministry_documents');
      if (minFolderInZip) {
        for (const filename of Object.keys(zip.files)) {
          if (filename.startsWith('ministry_documents/') && !zip.files[filename].dir) {
            const fileBuf = await zip.files[filename].async('nodebuffer');
            const targetPath = path.join(MINISTRY_DOCS_DIR, path.basename(filename));
            fs.writeFileSync(targetPath, fileBuf);
          }
        }
      }

      // Extract mail_attachments
      const mailFolderInZip = zip.folder('mail_attachments');
      if (mailFolderInZip) {
        for (const filename of Object.keys(zip.files)) {
          if (filename.startsWith('mail_attachments/') && !zip.files[filename].dir) {
            const fileBuf = await zip.files[filename].async('nodebuffer');
            const targetPath = path.join(MAIL_ATTACHMENTS_DIR, path.basename(filename));
            fs.writeFileSync(targetPath, fileBuf);
          }
        }
      }

      // Extract correspondence attachments
      const corrFolderInZip = zip.folder('correspondence');
      if (corrFolderInZip) {
        for (const filename of Object.keys(zip.files)) {
          if (filename.startsWith('correspondence/') && !zip.files[filename].dir) {
            const fileBuf = await zip.files[filename].async('nodebuffer');
            const targetPath = path.join(CORRESPONDENCE_DIR, path.basename(filename));
            fs.writeFileSync(targetPath, fileBuf);
          }
        }
      }

      // Clean up uploaded temp zip
      try {
        fs.unlinkSync(uploadedFile.path);
      } catch (e) {}

      // Step 3: Re-initialize database connection in-memory
      await initDatabase();

      res.json({
        success: true,
        message: 'تمت استعادة البيانات بنجاح من النسخة الاحتياطية. تم إنشاء نسخة احتياطية آمنة تلقائياً.',
      });
    } catch (err: any) {
      console.error('Restore error:', err);
      res.status(500).json({ success: false, message: 'فشلت عملية الاستعادة: ' + err.message });
    }
  });

  // =========================================================================
  // 8. Correspondence (Official Administrative Mail from Edara News)
  // =========================================================================

  // List all local correspondence (newest first)
  app.get('/api/correspondence', (req, res) => {
    try {
      const rows = queryAll<any>(
        'SELECT * FROM correspondence ORDER BY created_at DESC'
      );
      res.json({ success: true, correspondence: rows });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Get a single correspondence by message_id
  app.get('/api/correspondence/:messageId', (req, res) => {
    try {
      const row = queryOne<any>(
        'SELECT * FROM correspondence WHERE message_id = ?',
        [req.params.messageId]
      );
      if (!row) return res.status(404).json({ success: false, message: 'غير موجود.' });
      res.json({ success: true, correspondence: row });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Save a received correspondence (from Edara Desktop sync)
  app.post('/api/correspondence', (req, res) => {
    try {
      const { message_id, sender_display_name, subject, description, sent_at, attachment_name, local_attachment_path } = req.body;
      if (!message_id) return res.status(400).json({ success: false, message: 'message_id مطلوب.' });

      // Upsert: if message_id already exists, skip (duplicate protection)
      const existing = queryOne<any>('SELECT id FROM correspondence WHERE message_id = ?', [message_id]);
      if (existing) {
        return res.json({ success: true, id: existing.id, duplicate: true });
      }

      const id = generateUUID();
      const created_at = new Date().toISOString();
      execute(
        `INSERT INTO correspondence (id, message_id, sender_display_name, subject, description, sent_at, attachment_name, local_attachment_path, is_read, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`,
        [id, message_id, sender_display_name || '', subject || '', description || '', sent_at || '', attachment_name || '', local_attachment_path || '', created_at]
      );
      res.json({ success: true, id });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Mark correspondence as read (local only)
  app.put('/api/correspondence/:messageId/read', (req, res) => {
    try {
      execute('UPDATE correspondence SET is_read = 1 WHERE message_id = ?', [req.params.messageId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Delete a correspondence
  app.delete('/api/correspondence/:messageId', (req, res) => {
    try {
      const row = queryOne<any>('SELECT local_attachment_path FROM correspondence WHERE message_id = ?', [req.params.messageId]);
      if (row?.local_attachment_path && fs.existsSync(row.local_attachment_path)) {
        fs.unlinkSync(row.local_attachment_path);
      }
      execute('DELETE FROM correspondence WHERE message_id = ?', [req.params.messageId]);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Save a correspondence attachment file
  app.post('/api/correspondence/attachment', (req, res) => {
    try {
      const { message_id, filename, buffer } = req.body;
      if (!message_id || !filename || !buffer) {
        return res.status(400).json({ success: false, message: 'message_id, filename, and buffer required.' });
      }

      const safeName = filename.replace(/[^a-zA-Z0-9_\-\.\u0600-\u06FF]/g, '_');
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
      const ext = path.extname(safeName);
      const baseName = path.basename(safeName, ext);
      const localName = `${baseName}_${uniqueSuffix}${ext}`;
      const localPath = path.join(CORRESPONDENCE_DIR, localName);

      // Decode base64 buffer and write to disk
      const buf = Buffer.from(buffer, 'base64');
      fs.writeFileSync(localPath, buf);

      // Verify file was written
      if (!fs.existsSync(localPath) || fs.statSync(localPath).size !== buf.length) {
        return res.status(500).json({ success: false, message: 'فشل حفظ الملف.' });
      }

      res.json({ success: true, localPath, filename: localName });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // Open a local correspondence attachment
  app.get('/api/correspondence/open/:messageId', async (req, res) => {
    try {
      const row = queryOne<any>('SELECT local_attachment_path FROM correspondence WHERE message_id = ?', [req.params.messageId]);
      if (!row?.local_attachment_path) {
        return res.status(404).json({ success: false, message: 'لا يوجد مرفق.' });
      }
      const filePath = row.local_attachment_path;
      if (!fs.existsSync(filePath)) {
        return res.status(404).json({ success: false, message: 'الملف غير موجود.' });
      }
      const { exec } = await import('child_process');
      const platform = process.platform;
      const cmd = platform === 'win32' ? `start "" "${filePath}"` :
                  platform === 'darwin' ? `open "${filePath}"` :
                  `xdg-open "${filePath}"`;
      exec(cmd);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ success: false, message: err.message });
    }
  });

  // =========================================================================
  // 9. Vite Dev Server / Static Middleware
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = process.env.EDARA_DIST_DIR || path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const server = app.listen(PORT, '127.0.0.1', () => {
    console.log(`[EDARA] Server running at http://localhost:${PORT}`);
  });
  (globalThis as any).__edaraHttpServer = server;

  // Handle server errors (EADDRINUSE, EACCES, etc.)
  server.on('error', (err: any) => {
    console.error(`[EDARA] Server error: ${err.code || err.message}`);
    (globalThis as any).__edaraServerError = err.code || err.message;
  });

  // Expose a clean shutdown function for Electron to call
  (globalThis as any).__edaraShutdownServer = () => new Promise<void>((resolve) => {
    try {
      saveDatabase();
      if (db) {
        try { db.close(); } catch {}
      }
    } catch {}
    server.closeAllConnections ? server.closeAllConnections() : null;
    server.close(() => {
      (globalThis as any).__edaraHttpServer = null;
      resolve();
    });
    // Fallback timeout: if close() hangs, force resolve
    setTimeout(() => {
      (globalThis as any).__edaraHttpServer = null;
      resolve();
    }, 3000);
  });

  // Graceful shutdown on process signals
  const gracefulShutdown = () => {
    console.log('[EDARA] Received shutdown signal, cleaning up...');
    try {
      saveDatabase();
      if (db) {
        try { db.close(); } catch {}
      }
    } catch {}
    server.closeAllConnections ? server.closeAllConnections() : null;
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 3000);
  };
  process.on('SIGINT', gracefulShutdown);
  process.on('SIGTERM', gracefulShutdown);

  // Check for updates on every launch
  checkForUpdates().then((status) => {
    console.log(
      `[EDARA Updates] Checked. Current: v${status.currentVersion}, Latest: ${status.latestVersion ? 'v' + status.latestVersion : 'N/A'}, Has update: ${status.hasUpdate}`
    );
  });

  // Keep checking for updates every 3 hours while the app is running
  const updateInterval = setInterval(() => {
    checkForUpdates().catch((err) => console.warn('[EDARA Updates] Periodic check failed:', err));
  }, UPDATE_CHECK_INTERVAL_MS);
  (globalThis as any).__edaraUpdateInterval = updateInterval;
}

startServer().catch((err) => {
  console.error('[EDARA] Fatal server startup error:', err);
});
