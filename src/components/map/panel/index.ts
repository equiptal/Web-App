/**
 * Deal-room equipment verification (spec 004 v3) — **V7 / V8 / V9** public surface.
 *
 * The three components are standalone and mount nothing: the panel shell that hosts them is another
 * ticket's, and it imports from here so it never has to know how this directory is laid out.
 */

export { EquipmentDetail, type EquipmentDetailProps } from "./EquipmentDetail";
export { EquipmentDocuments, type EquipmentDocumentsProps } from "./EquipmentDocuments";
export { CompanyPanel, type CompanyPanelProps } from "./CompanyPanel";
export { DocRowList, type DocRowView, type DotState } from "./DocRowList";
export {
  arDigits,
  attentionCount,
  batchDocumentRequest,
  certificateChips,
  companyDocRows,
  COMPANY_DOC_KEYS,
  docRowActions,
  equipmentDocGroups,
  heroPhotoUrl,
  matchGrid,
  photoSlotOf,
  presentPhotoSlots,
  PHOTO_SLOTS,
  type Bilingual,
  type CompanyDocInput,
  type CompanyDocKey,
  type CompanyDocRow,
  type CompanyDocsSource,
  type CompanyDocStatus,
  type DocAction,
  type DocActionKind,
  type DocGroup,
  type DocGroupKey,
  type DocRow,
  type MatchCell,
  type MatchCellKey,
  type MatchCellState,
  type MatchRequest,
  type PanelRequestDraft,
  type PhotoSlot,
  type PresenceStatus,
} from "./machine-panel-model";
