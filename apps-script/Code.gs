/**
 * Nhận đơn in 3D từ website → lưu Google Drive → báo qua Gmail (và Telegram nếu có cấu hình).
 *
 * Deploy: Web app, Execute as "Me", Who has access "Anyone".
 * Script Properties (Project Settings → Script properties):
 *   DRIVE_FOLDER_ID     1EIxvJZqVhZ8Y8Zp3JmoKgIIpM-Jrokh5
 *   OWNER_EMAIL         minhlaductrung@gmail.com  (nhận email báo đơn)
 *   TELEGRAM_BOT_TOKEN  (tuỳ chọn) bỏ trống = không gửi Telegram
 *   TELEGRAM_CHAT_ID    (tuỳ chọn)
 *   TURNSTILE_SECRET    (tuỳ chọn) secret key Cloudflare Turnstile
 *
 * Hướng dẫn chi tiết: docs/setup-apps-script.md
 */

var MAX_FILE_BYTES = 35 * 1024 * 1024;
var RATE_LIMIT_COUNT = 3;
var RATE_LIMIT_WINDOW_SEC = 600;

function doGet() {
  return json_({ ok: true });
}

function doPost(e) {
  // Mọi lỗi không lường trước vẫn phải trả JSON đúng hợp đồng, không để Google trả trang HTML.
  try {
    return json_(handleOrder_(e));
  } catch (err) {
    console.error('Unhandled', err);
    return json_({ ok: false, error: 'Máy chủ gặp lỗi, vui lòng gửi qua Zalo kèm mã đơn' });
  }
}

function handleOrder_(e) {
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return { ok: false, error: 'Dữ liệu đơn không hợp lệ' };
  }
  if (!payload || typeof payload !== 'object') return { ok: false, error: 'Dữ liệu đơn không hợp lệ' };

  // 1. Honeypot: bot điền trường ẩn → trả ok giả, không lưu gì.
  if (payload.honeypot) return { ok: true, orderCode: payload.orderCode };

  var props = PropertiesService.getScriptProperties();
  var invalid = validate_(payload);
  if (invalid) return { ok: false, error: invalid };
  clampFields_(payload);

  var code = payload.orderCode;
  var phone = payload.customer.phone;
  var fp = fingerprint_(payload);
  var cache = CacheService.getScriptCache();
  var lock = acquireLock_();
  var claimed = false;
  var reserved = false;
  var folderUrl;
  try {
    // 2. Gửi lại cùng mã đơn: nội dung giống hệt → đã nhận; nội dung khác → báo rõ, không nuốt mất phần sửa.
    var done = cache.get('done_' + code);
    if (done) {
      if (done === fp) return { ok: true, orderCode: code };
      return {
        ok: false,
        error:
          'Mã đơn ' + code + ' đã được gửi với nội dung khác. Tải lại trang để tạo đơn mới, hoặc nhắn Zalo để sửa đơn.',
      };
    }
    // Một lần gửi khác của cùng mã đang được xử lý (bấm hai lần, mạng gửi lặp)
    if (cache.get('busy_' + code) === '1') return { ok: false, error: 'Đơn đang được xử lý, vui lòng đợi vài giây rồi thử lại' };
    cache.put('busy_' + code, '1', 120);
    claimed = true;

    // 3. Turnstile (nếu bật). Đặt sau dedupe vì token cũ đã bị dùng ở lần trước.
    var secret = props.getProperty('TURNSTILE_SECRET');
    if (secret && !verifyTurnstile_(secret, payload.turnstileToken)) {
      return { ok: false, error: 'Xác minh chống spam thất bại' };
    }

    // 4. Giới hạn tần suất theo SĐT: giữ chỗ trước khi lưu, trả lại nếu lưu thất bại.
    if (rateLimited_(phone)) return { ok: false, error: 'Bạn đã gửi quá nhiều đơn, vui lòng thử lại sau 10 phút' };
    countRate_(phone, 1);
    reserved = true;

    // 5. Lưu Drive — bước bắt buộc.
    try {
      folderUrl = saveToDrive_(props.getProperty('DRIVE_FOLDER_ID'), payload);
    } catch (err) {
      console.error('Drive error', err);
      return { ok: false, error: 'Không lưu được file, vui lòng gửi qua Zalo kèm mã đơn' };
    }
    reserved = false; // suất đã dùng thật
    safely_('markReceived', function () {
      cache.put('done_' + code, fp, 21600); // 6 giờ, mức tối đa của CacheService
    });
  } finally {
    if (reserved) safely_('rateRollback', function () { countRate_(phone, -1); });
    if (claimed) safely_('release', function () { cache.put('busy_' + code, '0', 1); });
    if (lock) lock.releaseLock();
  }

  // 6–7. Thông báo — lỗi ở đây không làm hỏng đơn vì file đã lưu.
  var text = '';
  safely_('format', function () { text = formatMessage_(payload, folderUrl); });
  if (!text) text = 'ĐƠN ' + code + '\nDrive: ' + folderUrl;
  safely_('telegram', function () {
    sendTelegram_(props.getProperty('TELEGRAM_BOT_TOKEN'), props.getProperty('TELEGRAM_CHAT_ID'), text);
  });
  safely_('mail', function () {
    var owner = props.getProperty('OWNER_EMAIL');
    if (owner) MailApp.sendEmail(owner, '[Đơn in 3D] ' + code, text);
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

/** Nội dung quyết định của đơn — để phân biệt gửi lại y hệt với gửi lại đã sửa. */
function fingerprint_(p) {
  return JSON.stringify([p.settings, p.customer, p.fileName, p.fileSize, p.scale || 1, p.fileDelivery || 'upload']);
}

var FIELD_LIMITS = { name: 120, phone: 40, email: 160, note: 1500 };

/** Giới hạn độ dài phía server (POST trực tiếp có thể bỏ qua giới hạn của web). */
function clampFields_(p) {
  for (var k in FIELD_LIMITS) {
    if (p.customer[k] != null) p.customer[k] = String(p.customer[k]).slice(0, FIELD_LIMITS[k]);
  }
  p.fileName = String(p.fileName || 'model.stl').slice(0, 160);
}

function validate_(p) {
  if (!p || !p.orderCode || !/^P3D-\d{6}-[A-Z2-9]{4}$/.test(p.orderCode)) return 'Mã đơn không hợp lệ';
  if (!p.customer || !p.customer.name || !p.customer.phone) return 'Thiếu tên hoặc SĐT';
  if (p.fileDelivery !== 'zalo' && (typeof p.fileBase64 !== 'string' || !p.fileBase64 || !p.fileName)) return 'Thiếu file STL';
  if (p.fileBase64 && p.fileBase64.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4) return 'File lớn hơn 35MB, vui lòng gửi qua Zalo';
  return null;
}

function verifyTurnstile_(secret, token) {
  if (!token) return false;
  var res = UrlFetchApp.fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'post',
    payload: { secret: secret, response: token },
    muteHttpExceptions: true,
  });
  try {
    return JSON.parse(res.getContentText()).success === true;
  } catch (err) {
    return false;
  }
}

function rateKey_(phone) {
  return 'rl_' + String(phone).replace(/[^\d+]/g, '').replace(/^\+84/, '0');
}

function rateLimited_(phone) {
  return Number(CacheService.getScriptCache().get(rateKey_(phone)) || 0) >= RATE_LIMIT_COUNT;
}

function countRate_(phone, delta) {
  var cache = CacheService.getScriptCache();
  var key = rateKey_(phone);
  var next = Math.max(0, Number(cache.get(key) || 0) + delta);
  // Cửa sổ 10 phút tính từ đơn gần nhất — đủ chặn spam, không cần chính xác tuyệt đối.
  cache.put(key, String(next), RATE_LIMIT_WINDOW_SEC);
}

function saveToDrive_(folderId, p) {
  var root = DriveApp.getFolderById(folderId);
  var folder = root.createFolder(p.orderCode);
  if (p.fileDelivery !== 'zalo') {
    var bytes = Utilities.base64Decode(p.fileBase64);
    var safeName = String(p.fileName).replace(/[\\/:*?"<>|\r\n]/g, '_');
    folder.createFile(Utilities.newBlob(bytes, 'model/stl', safeName));
  }

  var record = {};
  for (var k in p) if (k !== 'fileBase64' && k !== 'turnstileToken' && k !== 'honeypot') record[k] = p[k];
  folder.createFile('order.json', JSON.stringify(record, null, 2), 'application/json');
  return folder.getUrl();
}

function sendTelegram_(token, chatId, text) {
  if (!token || !chatId) return;
  UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ chat_id: chatId, text: text, disable_web_page_preview: true }),
  });
}

var TELEGRAM_MAX = 4000;

/** Một dòng: bỏ xuống dòng để chữ của khách không giả được các dòng hệ thống. */
function oneLine_(v) {
  return String(v == null ? '' : v).replace(/[\r\n]+/g, ' ').trim();
}

function num_(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = Number(v);
  return isFinite(n) ? n : null;
}

function formatMessage_(p, folderUrl) {
  var c = p.customer || {};
  var s = p.settings || {};
  var d = p.dims || {};
  var r = function (v) {
    var n = num_(v);
    return n === null ? '?' : String(Math.round(n));
  };
  var lines = [];

  lines.push((p.orderType === 'consult' ? '🟠 CẦN TƯ VẤN ' : '🟢 ĐƠN IN 3D ') + p.orderCode);
  // Link Drive thật đặt ngay đầu, trước mọi chữ do khách nhập
  lines.push('Drive: ' + folderUrl);
  if (p.orderType === 'consult') {
    var reasons = Array.isArray(p.consultReasons) ? p.consultReasons : [p.consultReasons];
    lines.push('Lý do: ' + oneLine_(reasons.join('; ')));
  }
  lines.push('Khách: ' + oneLine_(c.name) + ', ' + oneLine_(c.phone) + (c.email ? ', ' + oneLine_(c.email) : ''));
  lines.push(
    'Nhựa ' + oneLine_(s.material) + ', lớp ' + s.layerHeight + ' mm, infill ' + s.infillPercent + '%, ' +
      s.wallLoops + ' tường, support ' + (s.support ? 'có' : 'không') + ', SL ' + s.quantity,
  );
  lines.push('Kích thước: ' + r(d.length) + ' × ' + r(d.width) + ' × ' + r(d.height) + ' mm');
  var scale = num_(p.scale);
  if (scale !== null && scale !== 1) {
    lines.push('⚠ File gốc tính bằng inch: khách đã nhân ×' + String(scale).replace('.', ',') + ' khi báo giá');
  }

  var est = p.estimate;
  if (p.orderType !== 'consult' && est) {
    var g = num_(est.grams);
    var t = num_(est.timeSec);
    lines.push((g === null ? '? g' : '~' + g.toFixed(1) + ' g') + ', ' + (t === null ? '?' : '~' + duration_(t)));
    if (num_(est.total) !== null) {
      lines.push('Tạm tính ' + vnd_(est.total) + ' (khoảng ' + vnd_(est.rangeLow) + '–' + vnd_(est.rangeHigh) + ')');
    }
  }

  if (p.fileDelivery === 'zalo') {
    lines.push('📎 File lớn, khách sẽ gửi qua Zalo: ' + oneLine_(p.fileName));
  } else {
    var size = num_(p.fileSize);
    lines.push('File: ' + oneLine_(p.fileName) + (size === null ? '' : ' (' + (size / 1024 / 1024).toFixed(1) + ' MB)'));
  }
  if (c.note) {
    // Ghi chú nhiều dòng: thụt lề để không dòng nào giả được "Drive:" hay các dòng hệ thống
    lines.push('Ghi chú:\n  ' + String(c.note).replace(/\r?\n/g, '\n  '));
  }
  var text = lines.join('\n');
  return text.length > TELEGRAM_MAX ? text.slice(0, TELEGRAM_MAX - 1) + '…' : text;
}

function vnd_(n) {
  var v = num_(n);
  if (v === null) return '?';
  return String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
}

function duration_(sec) {
  var total = Math.max(1, Math.ceil(sec / 60));
  var h = Math.floor(total / 60);
  var m = total % 60;
  return h === 0 ? m + ' phút' : h + ' giờ ' + (m < 10 ? '0' : '') + m + ' phút';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
