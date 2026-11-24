# Cài đặt nơi nhận đơn (Google Apps Script)

Script chạy **bằng chính tài khoản Google của Trung** (minhlaductrung@gmail.com). Việc kiểm tra đơn, chống spam và nhắn Telegram do Cloudflare Worker đảm nhiệm. Script này chỉ làm 2 việc: nhận file STL có vé do Worker cấp rồi lưu vào thư mục Drive (và báo lại cho Worker), và gửi Gmail khi Worker yêu cầu bằng phong bì có chữ ký. Làm theo các bước dưới đây **một lần**, mất khoảng 15 phút.

## 1. Tạo dự án Apps Script

1. Đăng nhập Google bằng **minhlaductrung@gmail.com**, rồi vào [script.google.com](https://script.google.com).
2. Chọn **Dự án mới** (New project) và đặt tên, ví dụ `Nhận đơn in 3D`.
3. Xoá hết nội dung mẫu trong `Code.gs`, rồi dán toàn bộ nội dung file [`apps-script/Code.gs`](../apps-script/Code.gs) vào.
4. Bấm **Lưu** (biểu tượng đĩa mềm).

## 2. Đặt Script Properties

Vào **Project Settings** (biểu tượng bánh răng) → **Script properties** → **Add script property**, rồi thêm lần lượt:

| Property | Giá trị |
|---|---|
| `DRIVE_FOLDER_ID` | `1EIxvJZqVhZ8Y8Zp3JmoKgIIpM-Jrokh5` |
| `OWNER_EMAIL` | `minhlaductrung@gmail.com` |
| `SHARED_SECRET` | cùng giá trị với secret `SHARED_SECRET` của Worker |
| `WORKER_URL` | địa chỉ Worker, ví dụ `https://xxx.workers.dev` (không có dấu `/` ở cuối) |

`TELEGRAM_*` và `TURNSTILE_SECRET` không còn dùng ở đây vì đã chuyển sang Worker. Nếu thiếu `SHARED_SECRET`, script từ chối mọi yêu cầu. Các giá trị bí mật chỉ nằm ở đây, **không** nằm trong code website.

## 3. Deploy thành Web app

1. Bấm **Deploy** → **New deployment**.
2. Bấm biểu tượng bánh răng cạnh "Select type", chọn **Web app**.
3. Chọn **Execute as: Me (minhlaductrung@gmail.com)**.
4. Chọn **Who has access: Anyone**.
5. Bấm **Deploy**. Google sẽ hỏi cấp quyền: chọn tài khoản → **Advanced** → **Go to … (unsafe)** → **Allow**. Đây là script của chính bạn nên việc cấp quyền là an toàn.
6. Copy **Web app URL**. URL này có dạng `https://script.google.com/macros/s/…/exec`.

Kiểm tra nhanh: mở URL đó trong trình duyệt, phải thấy `{"ok":true}`.

## 4. Gắn URL vào website

Mở `src/config/contactConfig.ts` và dán URL vào trường:

```ts
appsScriptUrl: 'https://script.google.com/macros/s/…/exec',
```

Sau đó commit và push. Cloudflare Pages sẽ tự deploy lại.

## 5. Đặt thư mục Drive ở chế độ riêng tư

Trên Drive, chuột phải vào thư mục nhận đơn → **Chia sẻ** → **Quyền truy cập chung** → **Bị hạn chế** → **Xong**.

Script vẫn ghi file được vì nó chạy bằng tài khoản của bạn. Người ngoài không xem được file của khách.

## 6. Khi sửa code script

**Sau mỗi lần sửa code phải deploy lại.** Mỗi lần sửa `Code.gs` thì vào **Deploy** → **Manage deployments** → biểu tượng bút chì → **Version: New version** → **Deploy**. URL giữ nguyên. Nếu không tạo version mới thì web vẫn chạy code cũ.

## Thử lại sau khi cài

1. Mở web, thả một file STL nhỏ, chọn PETG rồi gửi đơn với SĐT của bạn.
2. Trên Drive phải xuất hiện thư mục `P3D-…` chứa file `.stl`.
3. Telegram (do Worker gửi) phải nhận được tin báo đơn, và Gmail phải nhận được email báo đơn.
4. Chống spam Turnstile và giới hạn đơn theo SĐT được cấu hình ở Worker, không còn ở script này.

Nếu không có gì xảy ra: trong script.google.com, vào **Executions** (biểu tượng danh sách) để xem lỗi.
