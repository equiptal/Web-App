"use client";

import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";

/**
 * Brand panel for the sign-in screens (web-app/001), reproducing the prototype's left hero
 * (`.auth-brand`): navy gradient + glow + grid, AI pill, headline, subtitle, three features, footer.
 * Hidden below 1024px. Uses the official Moedatech mark in place of the placeholder.
 */
const GRID_STYLE: React.CSSProperties = {
  backgroundImage:
    "linear-gradient(rgba(255,255,255,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.04) 1px,transparent 1px)",
  backgroundSize: "46px 46px",
  maskImage: "radial-gradient(circle at 38% 36%,#000 38%,transparent 86%)",
  WebkitMaskImage: "radial-gradient(circle at 38% 36%,#000 38%,transparent 86%)",
};

function Feat({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <div className="flex items-center gap-4">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-sm border border-white/15 bg-white/[0.07] text-brand-pale">
        <Icon name={icon} size={20} />
      </span>
      <span>
        <b className="block text-subhead font-extrabold">{title}</b>
        <span className="text-meta text-white/60">{sub}</span>
      </span>
    </div>
  );
}

export function AuthBrand() {
  const t = useT();
  const a = t.auth;
  return (
    <div
      className="relative hidden flex-col overflow-hidden p-[48px_56px] text-white lg:flex"
      style={{ background: "linear-gradient(165deg,var(--navy),var(--navy-deep))" }}
    >
      <div className="pointer-events-none absolute inset-0" style={GRID_STYLE} />
      <span className="pointer-events-none absolute -top-[60px] end-[-40px] h-[260px] w-[260px] rounded-full bg-brand opacity-[0.22] blur-[80px]" />
      <span
        className="pointer-events-none absolute -bottom-[80px] start-[-60px] h-[300px] w-[300px] rounded-full opacity-25 blur-[80px]"
        style={{ background: "var(--info)" }}
      />

      {/* brand mark */}
      <div className="relative z-[2] flex items-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/moedatech-logo.png" alt="Moedatech" className="h-9 w-auto [filter:brightness(0)_invert(1)]" />
      </div>

      {/* hero */}
      <div className="relative z-[2] mt-auto">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-[color-mix(in srgb, var(--brand) 40%, transparent)] bg-[color-mix(in srgb, var(--brand) 16%, transparent)] px-3 py-2 text-label font-extrabold uppercase tracking-[0.04em] text-brand-pale">
          <Icon name="bolt" size={15} />
          {a.brandPill}
        </div>
        <h1 className="mb-4 max-w-[17ch] text-[36px] font-extrabold leading-[1.16] tracking-[-.6px]">{a.brandHeadline}</h1>
        <p className="mb-8 max-w-[44ch] text-subhead leading-[1.6] text-white/[0.72]">{a.brandSubtitle}</p>

        <div className="flex flex-col gap-4">
          <Feat icon="edit_note" title={a.feat1Title} sub={a.feat1Sub} />
          <Feat icon="auto_awesome" title={a.feat2Title} sub={a.feat2Sub} />
          <Feat icon="gavel" title={a.feat3Title} sub={a.feat3Sub} />
        </div>
      </div>

      <div className="relative z-[2] mt-11 text-meta text-white/40">© 2026 Moedatech · {a.brandFoot}</div>
    </div>
  );
}
