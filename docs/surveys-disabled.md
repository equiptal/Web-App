# Outcome Survey — disabled

The renter Outcome Survey (UI, BFF APIs, and its trigger) is switched off. Nothing was deleted —
every original implementation is preserved in-place as comments, so re-enabling is a mechanical revert.

## What was disabled

| # | File | How |
|---|---|---|
| 1 | `src/components/AppShell.tsx` | `SurveyProvider` import + `<SurveyProvider>` wrapper commented out |
| 2 | `src/components/surveys/SurveyProvider.tsx` | whole file line-commented |
| 3 | `src/components/surveys/SurveyModal.tsx` | whole file line-commented |
| 4 | `src/lib/api/client.ts` | `fetchPendingSurvey` / `respondSurvey` + their type import commented out |
| 5 | `src/app/api/me/surveys/pending/route.ts` | `GET` now returns 404; original proxy in a trailing comment block |
| 6 | `src/app/api/me/surveys/[id]/respond/route.ts` | `POST` now returns 404; original proxy in a trailing comment block |
| 7 | `tests/unit/survey-routes.test.ts` | two proxy suites → `describe.skip`; new active suite pins the 404 contract |

### The trigger

There was exactly one. `<SurveyProvider>` in `AppShell` polled `/api/me/surveys/pending` on
`status === "authed"` and auto-opened the modal once per browser session (guarded by the
`survey-autoshown` sessionStorage flag). Removing the wrapper removes the poll and the auto-open.

`useSurvey()` was exported for "the sidebar item / topbar icon" mentioned in its docstring, but had
**no consumers** — there is no second entry point to disable.

## Deliberately left alone

**`wonViaSurvey`** — `src/lib/contract/bids.ts:125`, `src/components/requests/GroupBids.tsx:819`,
`src/components/compare/BidComparisonWorkspace.tsx:482`.

This is not survey UI, an API, or a trigger. It is a **bid field the backend sends**, marking a bid
whose win was reported through a survey (possibly from the mobile app, which still runs the feature).
The web only reads it to render "Awarded" and to block awarding a second supplier when one already
won (`BidComparisonWorkspace.tsx:1767`). Commenting it out would make already-awarded bids look
undecided and re-open the double-award path — a real regression unrelated to switching the survey off.

Also untouched, all inert: `src/lib/contract/survey.ts` (pure types/helpers, still covered by
`tests/unit/survey.test.ts`), and the `survey.*` i18n strings in `src/lib/i18n/{en,ar}.ts`.

## Re-enabling

1. Uncomment the import and wrapper in `AppShell.tsx`.
2. Strip the leading `// ` from `SurveyProvider.tsx` and `SurveyModal.tsx`.
3. Uncomment the two functions and the type import in `client.ts`.
4. In both `route.ts` files: delete the 404 stub and un-comment the original block
   (restore `*\/` → `*/` in the nested docstrings).
5. Remove `.skip` from the two suites in `survey-routes.test.ts` and drop the disabled-contract suite.
6. `npm run typecheck && npm test`.
