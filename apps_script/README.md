# Edara Drive Apps Script — Deployment

## Deploy

1. Open https://script.google.com
2. New project → name it "Edara Drive Backend"
3. Paste `Code.gs` content
4. Paste `appsscript.json` as manifest (Project Settings → Show "appsscript.json" manifest file)
5. Deploy → New deployment → Web app
   - Execute as: **Me (your Google account)**
   - Who has access: **Anyone**
6. Copy the deployment URL (ends with `/exec`)
7. Add to `.env`:
   ```
   GOOGLE_APPS_SCRIPT_URL=https://script.google.com/macros/s/YOUR_DEPLOYMENT_ID/exec
   ```
8. In Supabase, put the same URL in `city_drive_folders` or keep it in `.env` only.

## Test

```
curl "YOUR_URL?action=ping"
curl "YOUR_URL?action=list&folderId=114dtG2M1l8Ui0yGajwY3FKByzZ4nUjNI"
curl "YOUR_URL?action=list&folderId=1O-xbeSyUUSS9oZwGzTxRcQ35GD7EM3c8"
```

## Required

The Google account that deploys the script must have access to the Drive folders.

For "Anyone with the link" folders: add the deploying Google account as a viewer/editor.

## How it works

- `doGet` receives requests, dispatches to `handleList` / `handleFile` / `handlePing`
- Executes as the deployer → DriveApp uses the deployer's Drive access
- Returns JSON with CORS support
