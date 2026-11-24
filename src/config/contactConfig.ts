// Thông tin liên hệ và nơi nhận đơn. Trung tự sửa file này.

export const contactConfig = {
  name: 'Nguyễn Đức Trung',
  phone: '0913014605',
  zaloUrl: 'https://zalo.me/0913014605',
  email: 'minhlaductrung@gmail.com',
  githubUrl: 'https://github.com/Traiserdinger',
  /** URL Web app (.../exec) của Google Apps Script. Giờ chỉ là nơi trình duyệt tải file STL lên (cần vé do Worker cấp); đơn hàng gửi cho Worker và lưu trong D1. Dán vào sau khi deploy (docs/setup-apps-script.md) */
  appsScriptUrl:
    'https://script.google.com/macros/s/AKfycbyvHRfr8muFpvZDPBpha7SIMfya90zrxprtobUleQaB8JPxewNo9rzOpszdGGFpO0lw2Q/exec',
  /** Cloudflare Turnstile site key (tuỳ chọn). Để trống = tắt Turnstile */
  turnstileSiteKey: '',
}
