import { redirect } from "next/navigation";

/**
 * /requests/[id] — retired. A request's detail is the workspace's drawer now, opened from the strip
 * without leaving the bids behind (docs/requests-workspace-disabled.md).
 *
 * The id is dropped rather than carried: the workspace resolves its own selection from the rail, and
 * a stale or foreign id would land the renter on a request that is not theirs to see. They arrive at
 * their newest request, which is where the page starts anyway.
 */
export default function RequestDetailPage() {
  redirect("/requests");
}
