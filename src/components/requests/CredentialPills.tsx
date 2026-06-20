import { CERT_LABEL, type CertCode } from "@/lib/contract/bids";

/**
 * Credential pills beside the supplier name (app parity — CredentialPillRow). One pill per cert the
 * RFQ requires: green ✓ when the supplier holds it, red ✗ when not. Certs the RFQ didn't ask for are
 * omitted. Renders nothing when the request required no certs.
 */
export function CredentialPills({ required, held, ar }: { required: CertCode[]; held: CertCode[]; ar: boolean }) {
  if (!required.length) return null;
  const heldSet = new Set(held);
  return (
    <span className="cred-pills">
      {required.map((c) => {
        const ok = heldSet.has(c);
        return (
          <span key={c} className={`cred-pill ${ok ? "ok" : "no"}`} title={ok ? undefined : ar ? "غير متوفّرة" : "not held"}>
            <span className="material-icons-outlined">{ok ? "check" : "close"}</span>
            {ar ? CERT_LABEL[c].ar : CERT_LABEL[c].en}
          </span>
        );
      })}
    </span>
  );
}
