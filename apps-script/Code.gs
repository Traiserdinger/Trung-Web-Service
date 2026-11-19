/**
 * Nhận đơn in 3D từ website → lưu Google Drive → báo Telegram + Gmail.
 *
 * Deploy: Web app, Execute as "Me", Who has access "Anyone".
 * Script Properties (Project Settings → Script properties):
 *   TELEGRAM_BOT_TOKEN  token bot từ @BotFather
 *   TELEGRAM_CHAT_ID    chat id của Trung
 *   DRIVE_FOLDER_ID     1EIxvJZqVhZ8Y8Zp3JmoKgIIpM-Jrokh5
 *   OWNER_EMAIL         minhlaductrung@gmail.com
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
  var payload;
  try {
    payload = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'Dữ liệu đơn không hợp lệ' });
  }

  // 1. Honeypot: bot điền trường ẩn → trả ok giả, không lưu gì.
  if (payload.honeypot) return json_({ ok: true, orderCode: payload.orderCode });

  var props = PropertiesService.getScriptProperties();

  var invalid = validate_(payload);
  if (invalid) return json_({ ok: false, error: invalid });

  // 2. Gửi lại cùng mã đơn (mạng chập chờn, khách bấm thử lại) → coi như đã nhận, không tạo bản trùng.
  //    Đặt trước Turnstile vì token cũ đã bị dùng ở lần trước.
  var rootId = props.getProperty('DRIVE_FOLDER_ID');
  if (alreadyReceived_(rootId, payload.orderCode)) return json_({ ok: true, orderCode: payload.orderCode });

  // 3. Turnstile (nếu bật).
  var secret = props.getProperty('TURNSTILE_SECRET');
  if (secret && !verifyTurnstile_(secret, payload.turnstileToken)) {
    return json_({ ok: false, error: 'Xác minh chống spam thất bại' });
  }

  // 4. Giới hạn tần suất theo SĐT (chỉ đếm đơn đã lưu thành công).
  if (rateLimited_(payload.customer.phone)) {
    return json_({ ok: false, error: 'Bạn đã gửi quá nhiều đơn, vui lòng thử lại sau 10 phút' });
  }

  // 5. Lưu Drive — bước bắt buộc.
  var folderUrl;
  try {
    folderUrl = saveToDrive_(rootId, payload);
  } catch (err) {
    console.error('Drive error', err);
    return json_({ ok: false, error: 'Không lưu được file, vui lòng gửi qua Zalo kèm mã đơn' });
  }
  markReceived_(payload.orderCode);
  countRate_(payload.customer.phone);

  // 6–7. Thông báo — lỗi ở đây không làm hỏng đơn vì file đã lưu.
  var text = formatMessage_(payload, folderUrl);
  try {
    sendTelegram_(props.getProperty('TELEGRAM_BOT_TOKEN'), props.getProperty('TELEGRAM_CHAT_ID'), text);
  } catch (err) {
    console.error('Telegram error', err);
  }
  try {
    var owner = props.getProperty('OWNER_EMAIL');
    if (owner) MailApp.sendEmail(owner, '[Đơn in 3D] ' + payload.orderCode, text);
  } catch (err) {
    console.error('Mail error', err);
  }

  return json_({ ok: true, orderCode: payload.orderCode });
}

function validate_(p) {
  if (!p || !p.orderCode || !/^P3D-\d{6}-[A-Z2-9]{4}$/.test(p.orderCode)) return 'Mã đơn không hợp lệ';
  if (!p.customer || !p.customer.name || !p.customer.phone) return 'Thiếu tên hoặc SĐT';
  if (!p.fileBase64 || !p.fileName) return 'Thiếu file STL';
  if (p.fileBase64.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 4) return 'File lớn hơn 35MB, vui lòng gửi qua Zalo';
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

function countRate_(phone) {
  var cache = CacheService.getScriptCache();
  var key = rateKey_(phone);
  // Cửa sổ 10 phút tính từ đơn gần nhất — đủ chặn spam, không cần chính xác tuyệt đối.
  cache.put(key, String(Number(cache.get(key) || 0) + 1), RATE_LIMIT_WINDOW_SEC);
}

function alreadyReceived_(rootId, orderCode) {
  if (CacheService.getScriptCache().get('done_' + orderCode)) return true;
  try {
    return DriveApp.getFolderById(rootId).getFoldersByName(orderCode).hasNext();
  } catch (err) {
    return false;
  }
}

function markReceived_(orderCode) {
  CacheService.getScriptCache().put('done_' + orderCode, '1', 21600); // 6 giờ, mức tối đa của CacheService
}

function saveToDrive_(folderId, p) {
  var root = DriveApp.getFolderById(folderId);
  var folder = root.createFolder(p.orderCode);
  var bytes = Utilities.base64Decode(p.fileBase64);
  var safeName = String(p.fileName).replace(/[\\/:*?"<>|]/g, '_');
  folder.createFile(Utilities.newBlob(bytes, 'model/stl', safeName));

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

function formatMessage_(p, folderUrl) {
  var c = p.customer;
  var s = p.settings || {};
  var d = p.dims || {};
  var dims = Math.round(d.length) + ' × ' + Math.round(d.width) + ' × ' + Math.round(d.height) + ' mm';
  var lines = [];

  if (p.orderType === 'consult') {
    lines.push('🟠 CẦN TƯ VẤN ' + p.orderCode);
    lines.push('Lý do: ' + (p.consultReasons || []).join('; '));
  } else {
    lines.push('🟢 ĐƠN IN 3D ' + p.orderCode);
  }

  lines.push('Khách: ' + c.name + ' · ' + c.phone + (c.email ? ' · ' + c.email : ''));
  lines.push(
    'Nhựa ' + s.material + ' · lớp ' + s.layerHeight + ' mm · infill ' + s.infillPercent + '% · ' + s.wallLoops +
      ' tường · support ' + (s.support ? 'có' : 'không') + ' · SL ' + s.quantity,
  );
  lines.push('Kích thước: ' + dims);

  if (p.orderType !== 'consult' && p.estimate) {
    lines.push('~' + p.estimate.grams.toFixed(1) + ' g · ~' + duration_(p.estimate.timeSec));
    lines.push(
      'Tạm tính ' + vnd_(p.estimate.total) + ' (khoảng ' + vnd_(p.estimate.rangeLow) + '–' + vnd_(p.estimate.rangeHigh) + ')',
    );
  }

  if (c.note) lines.push('Ghi chú: ' + c.note);
  lines.push('File: ' + p.fileName + ' (' + (p.fileSize / 1024 / 1024).toFixed(1) + ' MB)');
  lines.push('Drive: ' + folderUrl);
  return lines.join('\n');
}

function vnd_(n) {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') + 'đ';
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
