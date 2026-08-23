/**
 * Google Apps Script Web App — Edara Drive Backend
 *
 * Deploy as: Execute as: Me (owner)  |  Who has access: Anyone
 *
 * Endpoints:
 *   GET ?action=ping
 *   GET ?action=list&folderId=...
 *   GET ?action=file&fileId=...
 */

function doGet(e) {
  var action = (e.parameter.action || '').toLowerCase();
  var callback = e.parameter.callback; // JSONP support

  var result;
  try {
    if (action === 'ping') {
      result = handlePing();
    } else if (action === 'list') {
      result = handleList(e.parameter.folderId);
    } else if (action === 'file') {
      result = handleFile(e.parameter.fileId);
    } else {
      result = { success: false, error: 'INVALID_ACTION', message: 'Action not recognised.' };
    }
  } catch (err) {
    result = { success: false, error: 'UNKNOWN_ERROR', message: String(err.message || err) };
  }

  var json = JSON.stringify(result);

  // JSONP wrapper when ?callback= is present (for browser-side testing)
  if (callback) {
    json = callback + '(' + json + ');';
    return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

/* ------------------------------------------------------------------ */
/*  action = ping                                                     */
/* ------------------------------------------------------------------ */

function handlePing() {
  return { success: true, message: 'Edara Drive Apps Script is running.' };
}

/* ------------------------------------------------------------------ */
/*  action = list  –  list files / sub-folders inside a folder        */
/* ------------------------------------------------------------------ */

function handleList(folderId) {
  if (!folderId || typeof folderId !== 'string') {
    return { success: false, error: 'INVALID_FOLDER_ID', message: 'folderId is required.' };
  }

  folderId = folderId.trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(folderId)) {
    return { success: false, error: 'INVALID_FOLDER_ID', message: 'folderId format is invalid.' };
  }

  var folder;
  try {
    folder = DriveApp.getFolderById(folderId);
  } catch (e) {
    return { success: false, error: 'FOLDER_NOT_FOUND', message: 'Folder not found or inaccessible.' };
  }

  // getFiles() only returns files (not sub-folders).  getFolders() for sub-folders.
  var fileIterator = folder.getFiles();
  var files = [];
  while (fileIterator.hasNext()) {
    var file = fileIterator.next();
    files.push({
      id:           file.getId(),
      name:         file.getName(),
      mimeType:     file.getMimeType(),
      size:         file.getSize(),
      createdTime:  file.getDateCreated().toISOString(),
      modifiedTime: file.getLastUpdated().toISOString(),
      webViewLink:  file.getUrl(),
      downloadUrl:  'https://drive.google.com/uc?export=download&id=' + file.getId()
    });
  }

  var folderIterator = folder.getFolders();
  var folders = [];
  while (folderIterator.hasNext()) {
    var sub = folderIterator.next();
    folders.push({
      id:           sub.getId(),
      name:         sub.getName(),
      mimeType:     'application/vnd.google-apps.folder',
      size:         0,
      createdTime:  sub.getDateCreated().toISOString(),
      modifiedTime: sub.getLastUpdated().toISOString(),
      webViewLink:  sub.getUrl(),
      downloadUrl:  undefined
    });
  }

  return {
    success:    true,
    folderId:   folderId,
    folderName: folder.getName(),
    files:      files,
    folders:    folders,
    totalFiles: files.length,
    totalFolders: folders.length
  };
}

/* ------------------------------------------------------------------ */
/*  action = file  –  metadata for a single file                      */
/* ------------------------------------------------------------------ */

function handleFile(fileId) {
  if (!fileId || typeof fileId !== 'string') {
    return { success: false, error: 'INVALID_FILE_ID', message: 'fileId is required.' };
  }

  fileId = fileId.trim();
  if (!/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    return { success: false, error: 'INVALID_FILE_ID', message: 'fileId format is invalid.' };
  }

  try {
    var file = DriveApp.getFileById(fileId);
    return {
      success:      true,
      id:           file.getId(),
      name:         file.getName(),
      mimeType:     file.getMimeType(),
      size:         file.getSize(),
      createdTime:  file.getDateCreated().toISOString(),
      modifiedTime: file.getLastUpdated().toISOString(),
      webViewLink:  file.getUrl(),
      downloadUrl:  'https://drive.google.com/uc?export=download&id=' + file.getId()
    };
  } catch (e) {
    return { success: false, error: 'FILE_NOT_FOUND', message: 'File not found or inaccessible.' };
  }
}
