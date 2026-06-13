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
    <div className="flex items-center gap-[14px]">
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-[10px] border border-white/15 bg-white/[0.07] text-[#FCD9A0]">
        <Icon name={icon} size={20} />
      </span>
      <span>
        <b className="block text-[14.5px] font-bold">{title}</b>
        <span className="text-[12.5px] text-white/60">{sub}</span>
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
      style={{ background: "linear-gradient(165deg,var(--navy),#12263A)" }}
    >
      <div className="pointer-events-none absolute inset-0" style={GRID_STYLE} />
      <span className="pointer-events-none absolute -top-[60px] end-[-40px] h-[260px] w-[260px] rounded-full bg-brand opacity-[0.22] blur-[80px]" />
      <span
        className="pointer-events-none absolute -bottom-[80px] start-[-60px] h-[300px] w-[300px] rounded-full opacity-25 blur-[80px]"
        style={{ background: "#2563EB" }}
      />

      {/* brand mark */}
      <div className="relative z-[2] flex items-center gap-[11px] text-[18px] font-extrabold tracking-[-.2px]">
        <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[9px] border border-white/[0.18] bg-white/10">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/moedatech-logomark.svg" alt="Moedatech" className="h-6 w-6 object-contain" />
        </span>
        MOEDA<i className="not-italic text-brand">TECH</i>
      </div>

      {/* hero */}
      <div className="relative z-[2] mt-auto">
        <div className="mb-[22px] inline-flex items-center gap-[7px] rounded-full border border-[rgba(247,144,9,.4)] bg-[rgba(247,144,9,.16)] px-[13px] py-[6px] text-[11.5px] font-extrabold uppercase tracking-[0.04em] text-[#FCD9A0]">
          <Icon name="bolt" size={15} />
          {a.brandPill}
        </div>
        <h1 className="mb-[14px] max-w-[17ch] text-[36px] font-extrabold leading-[1.16] tracking-[-.6px]">{a.brandHeadline}</h1>
        <p className="mb-[32px] max-w-[44ch] text-[15.5px] leading-[1.6] text-white/[0.72]">{a.brandSubtitle}</p>

        <div className="flex flex-col gap-[14px]">
          <Feat icon="edit_note" title={a.feat1Title} sub={a.feat1Sub} />
          <Feat icon="auto_awesome" title={a.feat2Title} sub={a.feat2Sub} />
          <Feat icon="gavel" title={a.feat3Title} sub={a.feat3Sub} />
        </div>
      </div>

      <div className="relative z-[2] mt-[42px] text-[12px] text-white/40">© 2026 Moedatech · {a.brandFoot}</div>
    </div>
  );
}
