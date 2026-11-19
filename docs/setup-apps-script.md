# Cài đặt nơi nhận đơn (Google Apps Script)

Script chạy **bằng chính tài khoản Google của Trung** (minhlaductrung@gmail.com). Khi có đơn, script làm 3 việc: lưu file vào thư mục Drive, nhắn Telegram, gửi Gmail. Làm theo các bước dưới đây **một lần**, mất khoảng 15 phút.

## 1. Tạo bot Telegram

1. Mở Telegram, tìm **@BotFather** và nhắn `/newbot`.
2. Đặt tên bot, ví dụ `In3D Trung`, và username (phải kết thúc bằng `bot`), ví dụ `in3d_trung_bot`.
3. BotFather sẽ trả về một **token** dạng `123456789:AA...`. Lưu token này lại. **Không gửi token cho ai.**

## 2. Lấy chat id

1. Mở bot vừa tạo và nhắn một tin bất kỳ, ví dụ `hi`.
2. Mở trình duyệt, vào `https://api.telegram.org/bot<TOKEN>/getUpdates` (thay `<TOKEN>` bằng token ở bước 1).
3. Tìm đoạn `"chat":{"id":123456789,...`. Số đó là **chat id**.

## 3. Tạo dự án Apps Script

1. Đăng nhập Google bằng **minhlaductrung@gmail.com**, rồi vào [script.google.com](https://script.google.com).
2. Chọn **Dự án mới** (New project) và đặt tên, ví dụ `Nhận đơn in 3D`.
3. Xoá hết nội dung mẫu trong `Code.gs`, rồi dán toàn bộ nội dung file [`apps-script/Code.gs`](../apps-script/Code.gs) vào.
4. Bấm **Lưu** (biểu tượng đĩa mềm).

## 4. Đặt Script Properties

Vào **Project Settings** (biểu tượng bánh răng) → **Script properties** → **Add script property**, rồi thêm lần lượt:

| Property | Giá trị |
|---|---|
| `TELEGRAM_BOT_TOKEN` | token ở bước 1 |
| `TELEGRAM_CHAT_ID` | chat id ở bước 2 |
| `DRIVE_FOLDER_ID` | `1EIxvJZqVhZ8Y8Zp3JmoKgIIpM-Jrokh5` |
| `OWNER_EMAIL` | `minhlaductrung@gmail.com` |
| `TURNSTILE_SECRET` | *(tuỳ chọn, xem bước 9)* |

Các giá trị bí mật chỉ nằm ở đây, **không** nằm trong code website.

## 5. Deploy thành Web app

1. Bấm **Deploy** → **New deployment**.
2. Bấm biểu tượng bánh răng cạnh "Select type", chọn **Web app**.
3. Chọn **Execute as: Me (minhlaductrung@gmail.com)**.
4. Chọn **Who has access: Anyone**.
5. Bấm **Deploy**. Google sẽ hỏi cấp quyền: chọn tài khoản → **Advanced** → **Go to … (unsafe)** → **Allow**. Đây là script của chính bạn nên việc cấp quyền là an toàn.
6. Copy **Web app URL**. URL này có dạng `https://script.google.com/macros/s/…/exec`.

Kiểm tra nhanh: mở URL đó trong trình duyệt, phải thấy `{"ok":true}`.

## 6. Gắn URL vào website

Mở `src/config/contactConfig.ts` và dán URL vào trường:

```ts
appsScriptUrl: 'https://script.google.com/macros/s/…/exec',
```

Sau đó commit và push. Cloudflare Pages sẽ tự deploy lại.

## 7. Đặt thư mục Drive ở chế độ riêng tư

Trên Drive, chuột phải vào thư mục nhận đơn → **Chia sẻ** → **Quyền truy cập chung** → **Bị hạn chế** → **Xong**.

Script vẫn ghi file được vì nó chạy bằng tài khoản của bạn. Người ngoài không xem được file của khách.

## 8. Khi sửa code script

Mỗi lần sửa `Code.gs` thì vào **Deploy** → **Manage deployments** → biểu tượng bút chì → **Version: New version** → **Deploy**. URL giữ nguyên. Nếu không tạo version mới thì web vẫn chạy code cũ.

## 9. (Tuỳ chọn) Bật chống spam Cloudflare Turnstile

1. Vào [dash.cloudflare.com](https://dash.cloudflare.com) → **Turnstile** → **Add widget**, rồi thêm tên miền `*.pages.dev` của web (và `localhost` nếu muốn thử trên máy).
2. Copy **Site key** vào `contactConfig.turnstileSiteKey`.
3. Copy **Secret key** vào Script Property `TURNSTILE_SECRET`.

Nếu chưa bật Turnstile, web vẫn có lớp chống bot bằng trường ẩn (honeypot) và giới hạn mỗi SĐT tối đa 3 đơn trong 10 phút.

## Thử lại sau khi cài

1. Mở web, thả một file STL nhỏ, chọn PETG rồi gửi đơn với SĐT của bạn.
2. Trên Drive phải xuất hiện thư mục `P3D-…` chứa file `.stl` và `order.json`.
3. Telegram phải nhận được tin bắt đầu bằng 🟢, và Gmail phải nhận được email `[Đơn in 3D] P3D-…`.
4. Gửi thêm một đơn chọn ABS. Telegram phải nhận được tin bắt đầu bằng 🟠 CẦN TƯ VẤN.

Nếu không có gì xảy ra: trong script.google.com, vào **Executions** (biểu tượng danh sách) để xem lỗi.
