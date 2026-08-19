// One-off maintenance script: clears the local `school_profile` row from
// edara.db (resets the local institution setup). The old local `activation`
// table was removed when Edara moved to Supabase account login, so account/
// device state now lives in Supabase, not this file. Other tables
// (students, staff, documents, etc.) are left untouched.
//
// Run from project root:  node scripts/clear-activation-profile.mjs
// Make sure Edara (the server process) is NOT running when you run this,
// otherwise the in-memory DB will overwrite the cleared file.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import initSqlJs from 'sql.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function resolveDataDir() {
  try {
    const cfgPath = path.join(process.cwd(), 'edara_config.json');
    if (fs.existsSync(cfgPath)) {
      const j = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
      if (j && typeof j.dataDir === 'string' && j.dataDir.trim()) {
        return path.resolve(j.dataDir.trim());
      }
    }
  } catch { /* ignore */ }
  if (process.env.EDARA_DATA_DIR) return path.resolve(process.env.EDARA_DATA_DIR);
  return path.join(process.cwd(), 'edara_data');
}

async function main() {
  const DATA_DIR = resolveDataDir();
  const DB_PATH = path.join(DATA_DIR, 'edara.db');
  const SQL = await initSqlJs();

  if (!fs.existsSync(DB_PATH)) {
    console.error(`[clear] No DB found at ${DB_PATH} — nothing to clear.`);
    process.exit(0);
  }

  // Safety backup
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const BAK = `${DB_PATH}.bak-${stamp}`;
  fs.copyFileSync(DB_PATH, BAK);
  console.log(`[clear] Backup created: ${BAK}`);

  const fileBuffer = fs.readFileSync(DB_PATH);
  const db = new SQL.Database(fileBuffer);

  const count = (t) => {
    const r = db.exec(`SELECT COUNT(*) FROM ${t}`);
    return r.length ? Number(r[0].values[0][0]) : 0;
  };

  // The local `activation` table was removed when Edara moved to Supabase
  // account login. Only `school_profile` (local institution setup) remains.
  const beforeProf = count('school_profile');
  db.run('DELETE FROM school_profile;');
  const afterProf = count('school_profile');

  const data = db.export();
  fs.writeFileSync(DB_PATH, Buffer.from(data));
  db.close();

  console.log(`[clear] school_profile:  ${beforeProf} -> ${afterProf}`);
  console.log(`[clear] Done. Other tables untouched. Restart Edara to re-register.`);
}

main().catch((e) => {
  console.error('[clear] Failed:', e);
  process.exit(1);
});
