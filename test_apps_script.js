/**
 * Test the Apps Script Web App endpoint directly.
 *
 * Usage:
 *   node test_apps_script.js YOUR_APPS_SCRIPT_URL
 *
 * Example:
 *   node test_apps_script.js https://script.google.com/macros/s/AKfyc.../exec
 */

const url = process.argv[2];
if (!url) {
  console.error('Usage: node test_apps_script.js <APPS_SCRIPT_URL>');
  process.exit(1);
}

const KIRKUK_FOLDER = '1O-xbeSyUUSS9oZwGzTxRcQ35GD7EM3c8';
const MINISTRY_FOLDER = '114dtG2M1l8Ui0yGajwY3FKByzZ4nUjNI';

async function testPing() {
  console.log('\n=== PING ===');
  const res = await fetch(url + '?action=ping');
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  return json.success;
}

async function testList(folderId, label) {
  console.log(`\n=== LIST: ${label} (${folderId}) ===`);
  const res = await fetch(url + '?action=list&folderId=' + folderId);
  const json = await res.json();
  console.log('success:', json.success);
  console.log('folderName:', json.folderName);
  console.log('totalFiles:', json.totalFiles);
  console.log('totalFolders:', json.totalFolders);
  if (json.files && json.files.length > 0) {
    console.log('Files:');
    for (const f of json.files) {
      console.log(`  ${f.name} (${f.mimeType}) id=${f.id} size=${f.size}`);
    }
  }
  if (json.folders && json.folders.length > 0) {
    console.log('Folders:');
    for (const f of json.folders) {
      console.log(`  ${f.name} id=${f.id}`);
    }
  }
  if (json.error) {
    console.log('ERROR:', json.error, json.message);
  }
  return json;
}

async function testFile(fileId) {
  console.log(`\n=== FILE: ${fileId} ===`);
  const res = await fetch(url + '?action=file&fileId=' + fileId);
  const json = await res.json();
  console.log(JSON.stringify(json, null, 2));
  return json;
}

async function main() {
  const pingOk = await testPing();
  if (!pingOk) {
    console.error('\nPing failed. Check your Apps Script URL.');
    process.exit(1);
  }

  const kirkuk = await testList(KIRKUK_FOLDER, 'KIRKUK (empty expected)');
  const ministry = await testList(MINISTRY_FOLDER, 'MINISTRY (should have files)');

  if (ministry.totalFiles > 0) {
    await testFile(ministry.files[0].id);
  }

  console.log('\n=== SUMMARY ===');
  console.log('Kirkuk files:', kirkuk.totalFiles, '(expected: 0)');
  console.log('Ministry files:', ministry.totalFiles, '(expected: 1+)');
  console.log(ministry.totalFiles > 0 ? 'PASS' : 'FAIL');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
