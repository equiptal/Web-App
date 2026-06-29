"use client";

import { useEffect } from "react";
import { AppShell } from "@/components/AppShell";
import { useSurvey } from "@/components/surveys/SurveyProvider";
import { useT } from "@/lib/i18n";
import { Icon } from "@/components/ui";

/**
 * Surveys page — the discoverable entry for the Outcome Survey. There's no list-all endpoint for
 * renters (the backend serves one pending unit at a time), so this opens the same modal when a survey
 * is due and otherwise shows an empty state. The content reads the gate from INSIDE AppShell (which
 * hosts the SurveyProvider), so it lives in a child component.
 */
export default function SurveysPage() {
  const t = useT();
  return (
    <AppShell title={t.survey.navTitle}>
      <SurveysContent />
    </AppShell>
  );
}

function SurveysContent() {
  const t = useT();
  const { hasPending, openSurvey } = useSurvey();

  useEffect(() => {
    if (hasPending) openSurvey();
  }, [hasPending, openSurvey]);

  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl border border-border bg-surface p-8 text-center">
      <Icon name={hasPending ? "assignment" : "assignment_turned_in"} size={40} className="text-muted" />
      {hasPending ? (
        <button onClick={openSurvey} className="mt-4 rounded-[10px] bg-brand px-5 py-2.5 text-[13.5px] font-bold text-white">
          {t.survey.navTitle}
        </button>
      ) : (
        <>
          <h2 className="mt-3 text-[16px] font-extrabold text-navy">{t.survey.emptyTitle}</h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">{t.survey.emptyBody}</p>
        </>
      )}
    </div>
  );
}
