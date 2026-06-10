"use client";

import { useRfq } from "@/lib/store/rfq-store";
import { useSession } from "@/lib/session";
import { GuestBlock } from "@/components/screens/GuestBlock";
import { Intake } from "@/components/screens/Intake";
import { Processing } from "@/components/screens/Processing";
import { Confirmation } from "@/components/screens/Confirmation";
import { Wizard } from "@/components/wizard/Wizard";

export function CreateSurface() {
  const { state } = useRfq();
  const { canCreate } = useSession();

  // Flow 4 (AC-02/03): guest tier is blocked at entry, before reaching the RFQ intake.
  if (!canCreate) return <GuestBlock />;

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
