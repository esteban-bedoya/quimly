import type {
  BranchSanitaryDocumentKind,
  CompanySummary,
  OperationalFormType,
} from "@/types/auth";
import type { CurrentDocumentCategoryId, HistoryDocumentCategoryId } from "@/lib/branch-reports/config";

export type BranchReportPanelData = {
  documentCategories: Array<{
    id: CurrentDocumentCategoryId;
    title: string;
    countLabel: string;
    availableFileCount: number;
  }>;
  historyCategories: Array<{
    id: HistoryDocumentCategoryId;
    title: string;
    countLabel: string;
    availableFileCount: number;
  }>;
};

export type BranchReportBranch = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
};

export type BranchReportContext = {
  company: CompanySummary;
  branch: BranchReportBranch;
};

export type BranchReportDocumentFile = {
  id: string;
  branchId: string;
  companyId: string;
  documentKind: BranchSanitaryDocumentKind;
  chemicalProductId: string | null;
  staffMemberId: string | null;
  fileUrl: string;
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  metadata: Record<string, unknown>;
  expiresAt: string | null;
  uploadedAt: string;
  updatedAt: string;
};

export type BranchReportNamedEntity = {
  id: string;
  name: string;
};

export type BranchReportDocumentSource = {
  files: BranchReportDocumentFile[];
  chemicalProducts: BranchReportNamedEntity[];
  staffMembers: BranchReportNamedEntity[];
};

export type BranchReportDocumentEntry = {
  file: BranchReportDocumentFile;
  label: string;
  date: string;
};

export type BranchReportDocumentGroup = {
  title: string;
  entries: BranchReportDocumentEntry[];
};

export type BranchReportDocumentBundle = {
  id: CurrentDocumentCategoryId | HistoryDocumentCategoryId;
  title: string;
  entries: BranchReportDocumentEntry[];
  groups?: BranchReportDocumentGroup[];
};

export type OperationalReportField = {
  label: string;
  value: string;
};

export type OperationalReportRecord = {
  id: string;
  recordedAt: string;
  createdAt: string;
  reportedBy: string;
  fields: OperationalReportField[];
};

export type OperationalReportSection = {
  formType: OperationalFormType;
  title: string;
  records: OperationalReportRecord[];
};
