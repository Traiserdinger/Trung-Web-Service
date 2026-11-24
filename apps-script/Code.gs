/**
 * Nhận file STL đã được Cloudflare Worker cấp vé → lưu Google Drive → báo lại cho Worker.
 * Gửi Gmail khi Worker gửi phong bì có chữ ký. Việc kiểm tra đơn, chống spam, Telegram nằm ở Worker.
 *
 * Deploy: Web app, Execute as "Me", Who has access "Anyone".
 * Script Properties (Project Settings → Script properties):
 *   DRIVE_FOLDER_ID  1EIxvJZqVhZ8Y8Zp3JmoKgIIpM-Jrokh5
 *   OWNER_EMAIL      minhlaductrung@gmail.com  (nhận email báo đơn)
 *   SHARED_SECRET    cùng giá trị với secret SHARED_SECRET của Worker
 *   WORKER_URL       địa chỉ Worker, ví dụ https://xxx.workers.dev (không có dấu / ở cuối)
 *
 * Hướng dẫn chi tiết: docs/setup-apps-script.md
 */

var MAX_FILE_BYTES = 35 * 1024 * 1024;
var ENVELOPE_WINDOW_SEC = 300;

function doGet() {
  return json_({ ok: true });
}

function doPost(e) {
  // Mọi lỗi không lường trước vẫn phải trả JSON đúng hợp đồng, không để Google trả trang HTML.
  try {
    return json_(handle_(e));
  } catch (err) {
    console.error('Unhandled', err);
    return json_({ ok: false, error: 'Máy chủ gặp lỗi, vui lòng gửi qua Zalo kèm mã đơn' });
  }
}

function handle_(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return { ok: false, error: 'Dữ liệu không hợp lệ' };
  }
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Dữ liệu không hợp lệ' };
  var props = PropertiesService.getScriptProperties();
  if (payload.action !== undefined) return handleEnvelope_(props, payload);
  return handleUpload_(props, payload);
}

// ---------- HMAC (khớp byte-for-byte với worker/shared/hmac.ts) ----------

/** HMAC-SHA256 dạng hex chữ thường. Apps Script trả byte có dấu nên phải cộng 256. */
function hmacHex_(secret, msg) {
  var bytes = Utilities.computeHmacSha256Signature(msg, secret);
  var out = '';
  for (var i = 0; i < bytes.length; i++) {
    var b = bytes[i] < 0 ? bytes[i] + 256 : bytes[i];
    out += (b < 16 ? '0' : '') + b.toString(16);
  }
  return out;
}

function safeEqual_(a, b) {
  if (a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function nowSec_() {
  return Math.floor(Date.now() / 1000);
}

/** sig = hmac(secret, action|ts|JSON(data)); từ chối nếu |now − ts| > 300 giây. */
function verifyEnvelope_(secret, env) {
  if (!secret) return false;
  if (typeof env.action !== 'string' || typeof env.ts !== 'number' || typeof env.sig !== 'string') return false;
  if (Math.abs(nowSec_() - env.ts) > ENVELOPE_WINDOW_SEC) return false;
  var expected = hmacHex_(secret, env.action + '|' + env.ts + '|' + JSON.stringify(env.data));
  return safeEqual_(expected, env.sig);
}

function signEnvelope_(secret, action, data) {
  var ts = nowSec_();
  return { action: action, ts: ts, data: data, sig: hmacHex_(secret, action + '|' + ts + '|' + JSON.stringify(data)) };
}

/** Vé = exp.hmac(secret, code|fileSize|exp); còn hạn khi now <= exp (giây). */
function verifyTicket_(secret, ticket, code, fileSize) {
  if (!secret || typeof ticket !== 'string') return false;
  var dot = ticket.indexOf('.');
  if (dot < 1) return false;
  var expStr = ticket.slice(0, dot);
  var exp = Number(expStr);
  if (!isFinite(exp) || Math.floor(exp) !== exp || String(exp) !== expStr) return false;
  if (nowSec_() > exp) return false;
  return safeEqual_(hmacHex_(secret, code + '|' + fileSize + '|' + exp), ticket.slice(dot + 1));
}

// ---------- Phong bì từ Worker: gửi mail ----------

function handleEnvelope_(props, env) {
  if (!verifyEnvelope_(props.getProperty('SHARED_SECRET'), env)) return { ok: false, error: 'unauthorized' };
  var data = env.data || {};
  if (env.action === 'notifyOwner') {
    var owner = props.getProperty('OWNER_EMAIL');
    if (!owner) return { ok: false, error: 'Thiếu OWNER_EMAIL' };
    MailApp.sendEmail(owner, String(data.subject), String(data.text));
    return { ok: true };
  }
  if (env.action === 'notifyStatus') {
    if (!data.to) return { ok: false, error: 'Thiếu người nhận' };
    MailApp.sendEmail(String(data.to), String(data.subject), String(data.text));
    return { ok: true };
  }
  return { ok: false, error: 'Hành động không hợp lệ' };
}

// ---------- Upload có vé ----------

function handleUpload_(props, p) {
  var code = p.orderCode;
  var secret = props.getProperty('SHARED_SECRET');
  if (typeof code !== 'string' || !/^P3D-\d{6}-[A-Z2-9]{4}$/.test(code) || !verifyTicket_(secret, p.uploadTicket, code, p.fileSize)) {
    return { ok: false, error: 'Phiên gửi file đã hết hạn, vui lòng gửi lại đơn' };
  }
  if (typeof p.fileBase64 !== 'string' || !p.fileBase64) return { ok: false, error: 'Thiếu file STL' };
  if (p.fileBase64.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4) return { ok: false, error: 'File lớn hơn 35MB, vui lòng gửi qua Zalo' };
  var fileName = String(p.fileName || 'model.stl').slice(0, 160).replace(/[\\/:*?"<>|\r\n]/g, '_');

  var folderUrl;
  var lock = acquireLock_();
  try {
    folderUrl = saveToDrive_(props.getProperty('DRIVE_FOLDER_ID'), code, fileName, p.fileBase64);
  } catch (err) {
    console.error('Drive error', err);
    return { ok: false, error: 'Không lưu được file, vui lòng gửi qua Zalo kèm mã đơn' };
  } finally {
    if (lock) lock.releaseLock();
  }

  // Báo lại Worker — lỗi ở đây không làm hỏng upload vì file đã lưu.
  safely_('fileSaved', function () {
    var res = UrlFetchApp.fetch(String(props.getProperty('WORKER_URL')) + '/api/internal/file', {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(signEnvelope_(secret, 'fileSaved', { orderCode: code, driveUrl: folderUrl })),
      muteHttpExceptions: true,
    });
    if (res && res.getResponseCode && res.getResponseCode() >= 300) console.error('fileSaved HTTP ' + res.getResponseCode());
  });
  return { ok: true, orderCode: code };
}

function safely_(label, fn) {
  try {
    fn();
  } catch (err) {
    console.error(label + ' error', err);
  }
}

/** Khoá toàn script khi chạy thật trên Apps Script (không có trong môi trường test). */
function acquireLock_() {
  if (typeof LockService === 'undefined') return null;
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  return lock;
}

/** Lấy hoặc tạo thư mục theo mã đơn; gửi lại cùng file thì không tạo thêm. Gọi trong khoá. */
function saveToDrive_(folderId, code, safeName, base64) {
  var root = DriveApp.getFolderById(folderId);
  var existing = root.getFoldersByName(code);
  var folder = existing.hasNext() ? existing.next() : root.createFolder(code);
  if (!folder.getFilesByName(safeName).hasNext()) {
    folder.createFile(Utilities.newBlob(Utilities.base64Decode(base64), 'model/stl', safeName));
  }
  return folder.getUrl();
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
