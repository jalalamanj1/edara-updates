# Edara — Legal Information Audit Report

> Factual, code-based audit of the Edara school-management application.
> Prepared as raw material for future Privacy Policy, Terms of Service, and EULA documents.
> **Do NOT expose secrets/keys/tokens** — they are noted by location only.

---

## A. Edara Identity

| Item | Finding | Status |
|---|---|---|
| Official application name | **Edara** (productName in `package.json`; Arabic school-management app "نظام إدارة المدارس") | Confirmed (code) |
| Developer / company / owner | **Jalal Amanj** (`author` in `package.json`). GitHub owner `jalalamanj1`. | Confirmed (code) |
| Website / domain | **https://jalalamanj.online** (hard-coded in `api.ts` and linked in `SettingsView.tsx` "About") | Confirmed (code) |
| Support email | **None found** anywhere in the codebase. | Not found (code) |
| Contact information | Only the website link; no email/phone/address for support. | Not found (code) |
| Application version | **1.0.0** (`package.json`), also hard-coded as User-Agent in update check. | Confirmed (code) |
| Platforms | **Desktop** (Electron + React 19 + Vite). Build config targets **Windows only** (NSIS installer). Cross-platform technically possible but not configured. | Confirmed (code) |
| Distribution method | `electron-builder` → Windows NSIS installer in `release/`. No app store / Microsoft Store. | Confirmed (code) |
| Free / paid / subscription | App is **license-key gated** (activation required). License types in UI: Monthly, Six Months, Twelve Months, Trial (7 days), and Lifetime. **No in-app payment processing.** Actual pricing/commercial model is not in the code. | Partial: gating confirmed; pricing requires owner confirmation |
| Purchases / payments / licenses | License-key activation only; **no payment/checkout code**. | Confirmed (code) |
| Intended audience | Schools / educational institutions (Arabic UI; manages students, staff, documents). Likely Iraq (Arabic, phone format `07XXXXXXXX`, "الوزارة" ministry docs). | Apparent from content; jurisdiction not coded |
| Geographic availability | Not restricted in code; Arabic RTL. | Unclear (owner confirmation) |

## B. Exact Functionality (Modules)

All modules are local (run against the bundled Express server on `localhost:3000`); no Edara-owned remote server.

1. **Dashboard** (`DashboardView`) — statistics overview. Local read.
2. **Students** (`StudentsView`) — CRUD for student records (name, gender, DOB, grade, phone, parent name/phone, address, notes). Local DB.
3. **Staff** (`StaffView`) — CRUD for staff records (name, job title, dept, phone, email, address, employment date, notes). Local DB.
4. **Documents** (`DocumentsView`) — create documents from Word/Excel templates; generate docx/xlsx/pdf; print; manual copy. Local.
5. **Archive** (`ArchiveView`) — read-only log ("سجل الصادرات") of generated outgoing documents (title, date, number, recipient, file path). Local.
6. **Ministry Documents** (`MinistryDocsView`) — browse/download a **public** Google Drive folder (read-only, no auth). Caches locally.
7. **Administrative Files** (`AdminFilesView`) — upload/delete files to the **user's own authenticated Google Drive** folder; cached locally.
8. **Backup / Restore** (`BackupRestoreView`) — local ZIP backup of app data; optional upload to user's Google Drive / OneDrive; restore from local or cloud.
9. **Settings** (`SettingsView`) — school profile, backup accounts (connect Google/Microsoft), about/updates, developer website link.
10. **Document template system** — templates discovered from `templates/` directory; placeholders filled and doc generated via `JSZip` (docx/xlsx) and optional Word→PDF via PowerShell COM (Windows).

Internet required? **No** for core use (students/staff/documents/archive). **Yes** only for: Ministry docs (public Drive), cloud backup (Google/Microsoft), update checks (GitHub), and share deep-links.

## C. User / Account Information

- **No user accounts with passwords.** There is no login system, no username/password, no third-party identity login for app access.
- **Two gating steps before use:**
  1. **Activation** — a **license key** bound to the device HWID (local verification, no remote server). `ActivationWindow.tsx`.
  2. **Registration** — a one-time **school/institution profile** (`RegistrationWindow.tsx`) stored locally in `school_profile` table.
- **Registration required fields:** full name of registrant, school/company name, school type, phone, full address, principal name, academic year. **Email is optional.** No password.
- Stored locally in SQLite (`school_profile`). No remote copy.
- **Logout:** not applicable (no session). Activation/registration persist locally.

## D. Personal Data Collected (by the app)

Confirmed categories stored in the local DB / files:
- Registrant full name, school name, phone, address, principal name, academic year, city, principal title, school type; email (optional).
- **Students:** student code, full name, gender, date of birth, grade, phone, parent name, parent phone, address, notes.
- **Staff:** staff code, full name, job title, department, phone, email (optional), address, employment date, notes.
- **Documents:** titles, recipient ("إلى"), document number, date, descriptions; the generated Office files themselves (which may embed student/staff names, grades, etc.).
- **Uploaded files** (admin files, ministry docs, document attachments) — arbitrary user files.
- **Connected cloud account email** (Google/Microsoft) when user connects backup.
- **Device HWID** (derived from CPU/board/disk via SHA-256) — used for license binding; stored implicitly via activation record.

**Not found:** IP address collection, analytics identifiers, advertising IDs, biometrics, precise geolocation, contacts, messages, audio, video, images (no camera/mic capture), cookies (none — local desktop app), fingerprinting.

## E. User-Generated Content

- Student/staff records, school profile, documents (docx/xlsx/pdf), templates, admin files, backups (ZIP).
- **Storage:** local disk (`edara_data/` working dir: `documents/`, `ministry_documents/`, `backups/`, `templates/`, plus `Desktop/Edara الصادرات` export folder). Optionally mirrored to user's own Google Drive / OneDrive.
- **Encrypted?** No (plain files; no SQLCipher; no file encryption found).
- **Local or cloud:** primarily local; cloud optional (user's own accounts).
- **Who can access:** the local user / anyone with filesystem access to the machine.
- **Delete:** yes — delete endpoints exist for students, staff, documents, export-log, admin files, ministry docs (downloads only), backup accounts.
- **Admin access:** the local user is the admin (single-tenant local app). No separate admin role.
- **Auto backup:** not automatic (manual backup; no scheduled backup found). Cloud sync only when user connects and uploads.
- **Cross-device sync:** only if user manually uploads/ downloads via their own Google Drive / OneDrive.

## F. Local Storage

- **SQLite database file** `edara.db` (via `sql.js` WASM, exported to disk) at `edara_data/edara.db`.
- Working data directory `edara_data/` (or `EDARA_DATA_DIR` env): `documents/`, `ministry_documents/`, `backups/`, `templates/`, `outgoing/`.
- Desktop export folder: `Desktop/Edara الصادرات`.
- Activated license & school profile in the SQLite DB.
- OAuth tokens (Google/Microsoft) in `backup_accounts` table (plaintext).
- Fonts bundled in `public/fonts/` (offline).

## G. Remote Storage

- **No Edara-owned remote storage.** The only remote storage is the **user's own** cloud accounts, connected optionally:
  - **Google Drive** (user-authenticated) — admin files & backups.
  - **Microsoft OneDrive** (user-authenticated, Graph API) — backups.
- Ministry docs use a **public, shared** Google Drive folder (read-only, no auth) — this is developer/publisher content, not user storage.

## H. Databases

- **Technology:** SQLite (in-browser WASM `sql.js`), persisted as a single file `edara.db` on local disk. Local only.
- **Tables:** `activation`, `school_profile`, `settings`, `students`, `staff`, `documents`, `export_log`, `ministry_documents`, `backup_history`, `backup_accounts`, `app_meta` (incl. `last_document_no` counter).
- **User data stored:** all personal data listed in §D.
- **App data:** document counter, settings, activation, backup history.
- **Backups:** yes (ZIP to `backups/`).
- **Encrypted:** **No** (plain SQLite file; no encryption at rest found).
- **Synchronized:** only via optional user cloud upload.

## I. Authentication

- **No password-based authentication.** App access controlled by (1) local license-key activation and (2) local school-profile registration.
- **External auth (optional, user-initiated):** Google (Drive) and Microsoft (OneDrive) OAuth — used **only** for cloud backup / admin files. Device-code (Microsoft) and Authorization-Code+PKCE (Google) flows. Tokens stored locally (plaintext).
- Passwords: **not stored or used anywhere** (no bcrypt/argon2/hashing of credentials found; only SHA-256 for HWID/license/PKCE).

## J. Third-Party Services

| Service | Purpose | Data shared | Necessary? | Optional? |
|---|---|---|---|---|
| Google Drive API (`googleapis.com/drive/v3`) | (a) public ministry docs (read-only, no auth); (b) user backup/admin files (authenticated) | (a) none; (b) user's files + tokens | (a) for ministry docs; (b) for cloud backup | (a) yes; (b) optional |
| Google OAuth (`accounts.google.com`, `oauth2.googleapis.com`) | Authenticate user's Google Drive for backup/admin files | OAuth tokens, account email, Drive files | No | Optional |
| Microsoft Graph (`graph.microsoft.com`) + Microsoft identity (`login.microsoftonline.com`) | OneDrive backup (authenticated) | OAuth tokens, account email, files | No | Optional |
| GitHub (`api.github.com`, `raw.githubusercontent.com`) | Update availability check | **None** (anonymous GET of public release metadata; only a User-Agent header) | For update notifications | Yes (non-blocking) |
| jalalamanj.online | Developer website (opened via in-app link) | None (user navigates in browser) | No | Yes |
| t.me / wa.me | Document share deep-links (user-initiated) | Document name only (in share text) | No | Yes |
| `@google/genai` (Gemini SDK) | **Present in `package.json` dependencies but NOT used anywhere in application code** | None | No | N/A |

No Firebase, Supabase, Auth0, or other auth/backend providers.

## K. Analytics / Tracking

- **None found.** No Google Analytics, Firebase Analytics, Sentry, PostHog, Mixpanel, Amplitude, telemetry, crash reporting, advertising SDKs, cookies, or fingerprinting. The only network calls to the developer's infrastructure are the anonymous GitHub update checks.

## L. Advertising

- **None.** No ad SDKs, no targeted/behavioral advertising, no ad tracking.

## M. Permissions (Electron desktop, Windows)

Electron apps run with the user's privileges (no mobile-style permission prompts). Capabilities used:
- **Filesystem** — read/write app data, documents, templates, Desktop export folder, backups. Required (core function).
- **Network** — localhost server + external HTTPS APIs (Drive, Graph, GitHub). Required for those features.
- **Shell / external open** (`shell.openExternal`) — opens browser for website/share links; opens files/printers. Optional/required per action.
- **Native dialog** — folder picker (`selectDirectory`). Optional.
- **Clipboard** — `navigator.clipboard` (copy HWID, copy file path). No OS prompt.
- **Printing** — `shell.openPath` / PowerShell `-Verb Print`. Optional.
- **Not requested / not used:** camera, microphone, location/GPS, contacts, Bluetooth, USB, screen capture, notifications, biometric.

## N. Security

| Control | Status |
|---|---|
| Encryption at rest | **Not found** — SQLite DB and all files are unencrypted on disk; backup ZIPs unencrypted. |
| Encryption in transit | **Implemented** for external calls (HTTPS to Google/Microsoft/GitHub). Local server is HTTP on localhost only. |
| HTTPS | Implemented for all third-party external calls. |
| Password hashing | Not applicable (no passwords). |
| Authentication | License-key (HWID-bound, local) + local registration. No remote auth for app use. |
| Authorization / access control | Single local user; no multi-user RBAC. |
| Electron security | **Implemented:** `contextIsolation: true`, `nodeIntegration: false`, preload exposes a limited `edaraDesktop` API (openFile, printFile, openExternalUrl, openExternalWebsite, openMailTo, showItemInFolder, selectDirectory, isDesktop). No `remote` module. |
| IPC security | **Implemented:** external-URL handler allows only `https://` (and the developer domain for website); `mailto:` and `showItemInFolder` validated/guarded. |
| Token storage | **Implemented but weak:** OAuth access/refresh tokens stored in plaintext in `backup_accounts`. |
| Secret management | Google OAuth client secret in `cloud_credentials.json`; a license `PANDARA_SECRET` in `server.ts`. Stored in plaintext config (not env-injected at runtime). |
| Database security | Local file; no encryption; protected only by OS filesystem permissions. |

## O. Data Retention & Deletion

- **Retention:** indefinite — data persists in the local DB/files until deleted or the app/data dir is removed.
- **User can delete data:** yes — per-record delete for students, staff, documents, export-log, admin files; full backup/restore reset available.
- **Delete account:** no account system; "deletion" = clearing local data / uninstalling. No in-app "delete my account" flow.
- **Backups after deletion:** deleting a record does not auto-delete its copies in cloud/backups.
- **Logs:** application logs are `console.*` only (no persistent log files found). No persistent personal-data logs.
- **Third-party retention:** if user connected Google/Microsoft, those providers retain tokens/files per their policies; disconnecting revokes locally (token deletion in DB) but does not call a remote revoke endpoint (not found).

## P. Data Sharing

- **Edara does not transmit user data to the developer or any Edara server.** External flows:
  - User's files → user's own Google Drive / OneDrive (only when user connects & uploads).
  - Share deep-links (t.me / wa.me / mailto) → only document name, user-initiated.
  - Public ministry docs fetched from a shared Drive folder (publisher content).
  - Anonymous GitHub update metadata (no user data).
- No sharing with advertisers, analytics, or other third parties. No administrator access (single local user).

## Q. Children / Age Restrictions

- The **Students** module stores data that typically belongs to **minors** (date of birth, name, parent/guardian info, address). So the app processes children's personal data by design.
- **No minimum-age gate, no age verification, no COPPA/GDPR-K specific handling found in code.** (Relevant for the owner's compliance obligations.)

## R. Intellectual Property

- **Edara-owned:** the application name "Edara", logo (`EdaraLogo.tsx`), UI, codebase (copyright not explicitly stated in a LICENSE file). Author: Jalal Amanj.
- **Third-party / open-source components (from `package.json`):** React, React-DOM, Express, `sql.js` (SQLite WASM, public domain), `JSZip` (MIT), `multer` (MIT), `xlsx` (SheetJS), `lucide-react` (ISC), `motion` (MIT), `clsx`/`tailwind-merge` (MIT), Tailwind CSS, Vite, `electron`/`electron-builder` (MIT), `@google/genai` (unused), `dotenv`. **No bundled EULA/license text in the repo.** Full third-party license texts are not reproduced here (standard OSS obligations apply: attribution/notice retention).
- **Proprietary assets:** bundled font files (`public/fonts/cairo/*.woff2`, Cairo — SIL Open Font License), logo images (`logo.png`, `icon.png`, `assets/icon.ico`).
- No explicit copyright notice file, trademark registration, or attribution file found in-repo.

## S. Licensing / Activation

- **License-key activation** implemented locally:
  - HWID computed from device hardware (SHA-256 of CPU/board/disk), formatted `HWID-XXXXXX`.
  - Key verified against a license algorithm (`PANDARA_SECRET`) bound to the device HWID; types: Lifetime (8-digit), dated single-use (10-digit = 6 HWID digits + MMDD), Trial (hours/minutes/days). Expiry stored (`expires_at`).
  - Stored in `activation` table; re-validated on launch (gating).
- **No remote activation/license server** — verification is fully offline.
- **DRM/anti-piracy:** license binding to HWID is the only mechanism; no obfuscation/phone-home found.
- Trial period: 7-day trial option exists in UI.

## T. Payments

- **None.** No Stripe, PayPal, Apple/Google payments, billing APIs, or checkout code. Monetization (if any) is out-of-band (license keys issued externally).

## U. Updates

- **Mechanism:** on launch + every 3 hours, the app GETs public release info from **GitHub** (`jalalamanj1/edara-updates` repo: `releases/latest` and `latest.json`).
- **No auto-updater / `electron-builder` publish configured** — updates are **manual**: the app shows a toast with the new version and the user downloads from the link in Settings.
- **Data transmitted in update check:** **none** identifiable — only a `User-Agent: EDARA-School-Management/1.0.0` header and the public GET request. No HWID/email/device info sent.

## V. Logging / Error Reporting

- **Local only:** `console.log/warn/error` throughout server and `console.error` in frontend. No persistent log files, no remote telemetry, no crash reporting service.
- Logs may include technical error messages (e.g., file paths, exception text) but **no deliberate collection of personal data** into logs. The export/print operations log file paths (which may contain document names/paths).
- No remote telemetry.

## W. Complete Data Flow

```
User
 ├─> Local UI (React/Electron)
 │    ├─> Local Express server (localhost:3000)
 │    │    ├─> Local SQLite DB (edara.db)        [all app + personal data]
 │    │    ├─> Local files: documents/, templates/, backups/, Desktop export folder
 │    │    └─> Local OAuth tokens (backup_accounts)  [Google/Microsoft]
 │    ├─> Google Drive API  ──(HTTPS)──> User's own Google Drive   [only if user connects/uploads]
 │    ├─> Microsoft Graph  ──(HTTPS)──> User's own OneDrive        [only if user connects/uploads]
 │    ├─> Google Drive (public folder) ──(HTTPS)──> Ministry docs  [read-only, publisher content]
 │    ├─> t.me / wa.me / mailto ──> OS default apps               [share, user-initiated, name only]
 │    └─> jalalamanj.online ──> default browser                    [developer website link]
 └─> GitHub (api.github.com / raw.githubusercontent.com) ──(HTTPS, anonymous)──> update check
```
No data flows to any Edara-owned server.

## X. User Controls (actual)

- View/edit/delete: students, staff, documents, export-log, admin files, school profile. ✔
- Export: documents can be generated/printed/opened; backups can be created (ZIP). ✔
- Backup / restore: local ZIP + optional cloud upload/download. ✔
- Delete account: not applicable (no account); local data removable by user.
- Revoke/disconnect external accounts: "disconnect" exists for Google/Microsoft (clears local tokens). ✔ (remote token revocation endpoint not found)
- Permission revocation: N/A (no OS permissions requested).

## Y. Existing Legal / Business Information

- **Company/developer name:** Jalal Amanj (code only; no legal entity name).
- **Website:** jalalamanj.online (code).
- **Support email / legal email / postal address / jurisdiction / governing law:** **Not found** in code or repo.
- **Copyright notice:** not present as a file/string (owner should add).
- **Existing Terms / Privacy Policy / EULA:** **None found** in the repository.
- `README.md` is generic AI Studio boilerplate (mentions a Gemini key) and is **not** Edara's documentation.

## Z. Secrets (do not expose)

Present but **values withheld**:
- Google OAuth **client secret** in `cloud_credentials.json` (and a now-unused `client_secret_*.json` file).
- License **`PANDARA_SECRET`** in `server.ts` (used for offline key verification).
- No DB credentials (SQLite, no server auth). No hardcoded API keys beyond the above.

---

## INFORMATION I STILL NEED FROM THE OWNER

1. **Legal entity / business name, postal address, support email, legal email** — for Privacy Policy/Terms/EULA identity & contact blocks (not in code).
2. **Governing law / jurisdiction** (e.g., Iraq? another?) — for Terms/EULA.
3. **Commercial/pricing model** — is Edara sold (one-time, subscription)? How are license keys issued/distributed? (Code shows gating + types but no money flow.)
4. **Confirm the GitHub `jalalamanj1/edara-updates` repo and `jalalamanj.online` are the official update/website channels** (used in code).
5. **Data-processing role for student/minor data** — do you act as the school's processor, or controller? (Affects GDPR/COPPA phrasing; app processes children's data.)
6. **Whether cloud backups should be described as using the user's own Google/Microsoft accounts** (confirmed in code) or an Edara-managed cloud — confirm owner intent for the Policy.
7. **Any retention period you want to commit to** (code keeps data indefinitely until deleted).

(Everything else above is directly confirmed from the codebase.)
