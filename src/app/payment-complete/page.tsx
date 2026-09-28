import type { Metadata } from 'next';

/**
 * Public "payment received" landing (2026-09-28, docs/plans/payment-gateway-tap).
 *
 * Where Tap redirects a RENTEE's browser after subscription checkout — the
 * backend routes a rentee-audience charge's `redirect.url` to
 * `<webAppUrl>/payment-complete` (a supplier goes to the OS instead). Cosmetic
 * only: the subscription is activated server-side by the Tap webhook, not here.
 * No auth, no data — the buyer may be in an in-app browser or a new tab; they
 * read it and return to the app. Bilingual so it reads for AR and EN renters.
 */

export const metadata: Metadata = {
  title: 'Payment received',
  robots: { index: false, follow: false },
};

export default function PaymentCompletePage() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: '#f6f7f9',
        color: '#1f2937',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          background: '#ffffff',
          border: '1px solid #e5e7eb',
          borderRadius: 16,
          padding: '32px 24px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 20px',
            borderRadius: 9999,
            background: 'rgba(34,197,94,0.12)',
            color: '#16a34a',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 34,
            lineHeight: 1,
          }}
        >
          ✓
        </div>

        <div dir="rtl" style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>تم استلام الدفع</h1>
          <p style={{ fontSize: 15, margin: '0 0 4px', color: '#4b5563' }}>
            شكراً لك. يجري تفعيل اشتراكك.
          </p>
          <p style={{ fontSize: 13, margin: 0, color: '#9ca3af' }}>
            يمكنك إغلاق هذه الصفحة والعودة إلى التطبيق.
          </p>
        </div>

        <div style={{ borderTop: '1px solid #f0f1f3', paddingTop: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Payment received</h2>
          <p style={{ fontSize: 14, margin: '0 0 4px', color: '#4b5563' }}>
            Thank you. Your subscription is being activated.
          </p>
          <p style={{ fontSize: 12, margin: 0, color: '#9ca3af' }}>
            You can close this page and return to the app.
          </p>
        </div>
      </div>
    </main>
  );
}
