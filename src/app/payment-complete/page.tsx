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
        background: 'var(--background)',
        color: 'var(--navy)',
        fontFamily: 'system-ui, -apple-system, "Segoe UI", Tahoma, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 440,
          width: '100%',
          textAlign: 'center',
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '32px 24px',
        }}
      >
        <div
          aria-hidden
          style={{
            width: 64,
            height: 64,
            margin: '0 auto 20px',
            borderRadius: 9999,
            background: 'var(--ok-soft)',
            color: 'var(--ok)',
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
          <p style={{ fontSize: 15, margin: '0 0 4px', color: 'var(--muted)' }}>
            شكراً لك. يجري تفعيل اشتراكك.
          </p>
          <p style={{ fontSize: 13, margin: 0, color: 'var(--muted-light)' }}>
            يمكنك إغلاق هذه الصفحة والعودة إلى التطبيق.
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border-hair)', paddingTop: 16 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Payment received</h2>
          <p style={{ fontSize: 14, margin: '0 0 4px', color: 'var(--muted)' }}>
            Thank you. Your subscription is being activated.
          </p>
          <p style={{ fontSize: 12, margin: 0, color: 'var(--muted-light)' }}>
            You can close this page and return to the app.
          </p>
        </div>
      </div>
    </main>
  );
}
