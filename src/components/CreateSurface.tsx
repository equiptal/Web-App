"use client";

import { useRfq } from "@/lib/store/rfq-store";
import { Intake } from "@/components/screens/Intake";
import { Processing } from "@/components/screens/Processing";
import { Confirmation } from "@/components/screens/Confirmation";
import { Wizard } from "@/components/wizard/Wizard";

/**
 * The RFQ create surface. Guests can now run the WHOLE flow — the account gate moved to Submit
 * (Step 4): a guest who posts is shown the account-creation modal, then the request auto-submits.
 */
export function CreateSurface() {
  const { state } = useRfq();

  switch (state.phase) {
    case "intake":
      return <Intake />;
    case "processing":
      return <Processing />;
    case "wizard":
      return <Wizard />;
    case "confirmation":
      return <Confirmation />;
  }
}
