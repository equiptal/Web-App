import { redirect } from "next/navigation";

/**
 * /requests/group/[groupId] — retired. A multi-item RFQ is one tile in the workspace rail, with its
 * items as chips in the dark strip, so there is no separate page for the group any more
 * (docs/requests-workspace-disabled.md).
 */
export default function RequestGroupPage() {
  redirect("/requests");
}
