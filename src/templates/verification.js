function getVerificationEmailTemplate(verificationLink) {
  return `
<!doctype html>
<html lang="vi">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Xác thực email — OptiLens Shop</title>
    <style>
      /* === Reset === */
      *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

      body {
        background: #f0f4f8;
        font-family: Arial, Helvetica, sans-serif;
        color: #1f2937;
        -webkit-font-smoothing: antialiased;
      }

      /* === Layout === */
      .email-wrap {
        max-width: 580px;
        margin: 32px auto;
        background: #ffffff;
        border-radius: 16px;
        overflow: hidden;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        border: 1px solid #e5e7eb;
      }

      /* === Header === */
      .email-header {
        background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%);
        padding: 28px 32px 24px;
        text-align: center;
      }
      .brand {
        font-size: 22px;
        font-weight: 800;
        color: #ffffff;
        letter-spacing: -0.5px;
        text-decoration: none;
      }
      .brand span { color: #fbbf24; }
      .header-tagline {
        font-size: 12px;
        color: rgba(255,255,255,0.75);
        margin-top: 4px;
        letter-spacing: 0.5px;
        text-transform: uppercase;
      }

      /* === Body === */
      .email-body {
        padding: 32px 32px 28px;
      }

      /* Avatar icon */
      .icon-wrap {
        width: 56px;
        height: 56px;
        background: #eff6ff;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        margin: 0 auto 20px;
      }
      .icon-wrap svg {
        width: 28px;
        height: 28px;
        color: #2563eb;
      }

      .heading {
        font-size: 20px;
        font-weight: 700;
        color: #111827;
        text-align: center;
        margin-bottom: 12px;
      }
      .subtext {
        font-size: 14px;
        line-height: 1.75;
        color: #4b5563;
        text-align: center;
        margin-bottom: 28px;
      }
      .subtext strong { color: #1f2937; }

      /* === CTA Button === */
      .cta-wrap {
        text-align: center;
        margin-bottom: 20px;
      }
      .cta-btn {
        display: inline-block;
        background: #1d4ed8;
        color: #ffffff !important;
        text-decoration: none;
        padding: 13px 32px;
        border-radius: 10px;
        font-weight: 700;
        font-size: 15px;
        letter-spacing: 0.2px;
        box-shadow: 0 4px 12px rgba(37, 99, 235, 0.35);
        transition: background 0.2s, box-shadow 0.2s;
      }
      .cta-btn:hover {
        background: #1e40af;
        box-shadow: 0 6px 16px rgba(37, 99, 235, 0.45);
      }

      /* === Expiry notice === */
      .expiry {
        background: #fffbeb;
        border: 1px solid #fde68a;
        border-radius: 8px;
        padding: 10px 16px;
        margin-bottom: 20px;
        font-size: 13px;
        color: #92400e;
        line-height: 1.5;
        display: flex;
        align-items: flex-start;
        gap: 8px;
      }
      .expiry svg {
        flex-shrink: 0;
        margin-top: 1px;
        color: #f59e0b;
      }

      /* === Fallback link === */
      .fallback {
        background: #f9fafb;
        border: 1px solid #e5e7eb;
        border-radius: 8px;
        padding: 12px 14px;
        font-size: 12px;
        color: #6b7280;
        word-break: break-all;
        line-height: 1.6;
      }
      .fallback a {
        color: #2563eb;
        text-decoration: underline;
        word-break: break-all;
      }

      /* === Footer === */
      .email-footer {
        background: #f9fafb;
        border-top: 1px solid #f3f4f6;
        padding: 20px 32px;
        text-align: center;
      }
      .footer-divider {
        width: 40px;
        height: 3px;
        background: #e5e7eb;
        border-radius: 2px;
        margin: 0 auto 16px;
      }
      .footer-brand {
        font-size: 14px;
        font-weight: 700;
        color: #1d4ed8;
        margin-bottom: 4px;
      }
      .footer-brand span { color: #f59e0b; }
      .footer-text {
        font-size: 12px;
        color: #9ca3af;
        line-height: 1.6;
        margin-bottom: 6px;
      }
      .footer-text a {
        color: #6b7280;
        text-decoration: none;
      }

      /* === Responsive === */
      @media (max-width: 480px) {
        .email-wrap { margin: 0; border-radius: 0; }
        .email-body, .email-header, .email-footer { padding-left: 20px; padding-right: 20px; }
      }
    </style>
  </head>
  <body>
    <div class="email-wrap">

      <!-- Header -->
      <div class="email-header">
        <div class="brand">Opti<span>Lens</span> Shop</div>
        <div class="header-tagline">Hệ thống bán kính mắt trực tuyến</div>
      </div>

      <!-- Body -->
      <div class="email-body">

        <!-- Icon -->
        <div class="icon-wrap">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
          </svg>
        </div>

        <h2 class="heading">Xác thực địa chỉ email</h2>
        <p class="subtext">
          Chào bạn,<br />
          Cảm ơn bạn đã đăng ký tài khoản tại
          <strong>OptiLens Shop</strong>.<br />
          Nhấn nút bên dưới để xác thực email và kích hoạt tài khoản.
        </p>

        <!-- CTA -->
        <div class="cta-wrap">
          <a
            class="cta-btn"
            href="${verificationLink}"
            target="_blank"
            rel="noopener noreferrer"
          >
            Xác thực email ngay
          </a>
        </div>

        <!-- Expiry -->
        <div class="expiry">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round"
              d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          Liên kết có hiệu lực trong <strong>30 phút</strong>. Nếu hết hạn, hãy yêu cầu gửi lại email xác thực.
        </div>

        <!-- Fallback -->
        <div class="fallback">
          Không nhấn được nút? Dán liên kết sau vào trình duyệt:<br />
          <a href="${verificationLink}">${verificationLink}</a>
        </div>

      </div>

      <!-- Footer -->
      <div class="email-footer">
        <div class="footer-divider"></div>
        <div class="footer-brand">Opti<span>Lens</span> Shop</div>
        <div class="footer-text">
          Email này được gửi tự động, vui lòng không trả lời trực tiếp.<br />
          <a href="#">Chính sách bảo mật</a> &nbsp;·&nbsp; <a href="#">Điều khoản sử dụng</a>
        </div>
      </div>

    </div>
  </body>
</html>
  `.trim();
}

module.exports = { getVerificationEmailTemplate };
