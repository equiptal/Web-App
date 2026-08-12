import { redirect } from "next/navigation";

/**
 * /compare — retired. The comparison is a tab of the requests workspace now, against one item at a
 * time, instead of a page that had to re-choose location → request → item before it could show
 * anything (docs/requests-workspace-disabled.md).
 *
 * Kept as a redirect rather than deleted: the route is in notification deep links
 * (`contract/notifications.ts`) and in whatever people bookmarked, and a 404 tells them the feature
 * is gone when it has only moved.
 */
export default function ComparePage() {
  redirect("/requests");
}
