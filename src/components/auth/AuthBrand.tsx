"use client";

import { Icon } from "@/components/ui";
import { useT } from "@/lib/i18n";

/**
 * Brand panel for the sign-in screens (web-app/001), matching the prototype's left hero. Uses the
 * official Moedatech brand mark in place of the prototype's placeholder. Hidden on small screens.
 */
export function AuthBrand() {
  const t = useT();
  return (
    <div className="hidden flex-col justify-between bg-navy p-7 text-white md:flex">
      <div className="flex items-center gap-2 text-[17px] font-extrabold tracking-tight">
        <span className="grid h-[34px] w-[34px] place-items-center rounded-[9px] bg-white/10">
          <Icon name="precision_manufacturing" className="text-white" size={19} />
        </span>
        <span>
          MOEDA<span className="text-brand">TECH</span>
        </span>
      </div>

      <div className="space-y-4 py-8">
        <p className="text-xl font-extrabold leading-snug">{t.auth.brandTagline}</p>
        <ul className="space-y-3 text-sm text-white/80">
          <li className="flex items-center gap-2">
            <Icon name="edit_note" size={18} className="text-brand" /> {t.auth.brandPoint1}
          </li>
          <li className="flex items-center gap-2">
            <Icon name="auto_awesome" size={18} className="text-brand" /> {t.auth.brandPoint2}
          </li>
        </ul>
      </div>

      <p className="text-xs font-semibold uppercase tracking-wide text-white/50">{t.auth.brandFoot}</p>
    </div>
  );
}
