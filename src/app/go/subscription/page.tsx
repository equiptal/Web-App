import type { Metadata } from 'next';

/**
 * "Open the subscription page in the app" landing (2026-10-15).
 *
 * Meta (WhatsApp templates, ads) refuses link shorteners, and `moedatech.chottu.link` counts as
 * one, so Meta gets this own-domain URL and the person taps through to the ChottuLink link.
 *
 * ⚠️ **A button, NOT a redirect.** This was a 307 to the ChottuLink link first, and it opened the
 * app on nothing: a server redirect is not a user tap, so iOS and Android do not hand the
 * ChottuLink URL to the app, ChottuLink shows its own "Open" page, and that button launches the app
 * WITHOUT the link. A real tap on a `moedatech.chottu.link` anchor is what opens the app WITH it.
 * Do not "improve" this into an auto-redirect or a script `location` change: same failure.
 *
 * The lasting fix is the app claiming this domain itself (a store release), after which this page
 * is not needed. No auth, no data. Bilingual, like `/payment-complete`.
 */

const APP_LINK = 'https://moedatech.chottu.link/subscription';

export const metadata: Metadata = {
  title: 'Open in the app',
  robots: { index: false, follow: false },
};

export default function GoSubscriptionPage() {
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
        <div dir="rtl" style={{ marginBottom: 18 }}>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 8px' }}>اشتراكك في معدّاتك</h1>
          <p style={{ fontSize: 15, margin: 0, color: 'var(--muted)' }}>
            اضغط الزر لفتح صفحة الاشتراك في التطبيق
          </p>
        </div>

        <div style={{ borderTop: '1px solid var(--border-hair)', paddingTop: 16, marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 8px' }}>Your Moedatech subscription</h2>
          <p style={{ fontSize: 14, margin: 0, color: 'var(--muted)' }}>
            Tap the button to open the subscription page in the app
          </p>
        </div>

        <a
          href={APP_LINK}
          style={{
            display: 'block',
            padding: '14px 20px',
            borderRadius: 12,
            background: 'var(--brand)',
            color: '#fff',
            fontSize: 16,
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          <span dir="rtl">افتح في التطبيق</span>
          <span aria-hidden style={{ opacity: 0.7, margin: '0 8px' }}>·</span>
          <span>Open in the app</span>
        </a>

        <p style={{ fontSize: 12, margin: '14px 0 0', color: 'var(--muted-light)' }}>
          <span dir="rtl">ما عندك التطبيق؟ الزر ينقلك للمتجر</span>
          <br />
          No app yet? The button takes you to the store
        </p>
      </div>
    </main>
  );
}
