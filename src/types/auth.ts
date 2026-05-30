export type AppRole = "owner" | "super_admin" | "company_admin";

export type UserProfile = {
  userId: string;
  email: string;
  fullName: string | null;
  globalRole: AppRole;
  isActive: boolean;
  canAccessAllCompanies: boolean;
  defaultCompanyId: string | null;
};

export type CompanySummary = {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  companyAdminUserId: string | null;
};

export type CompanyBranchSummary = {
  id: string;
  companyId: string;
  name: string;
  slug: string;
  isMain: boolean;
  isActive: boolean;
};

export type AccessibleBranchSummary = CompanyBranchSummary & {
  companyName: string;
  companySlug: string;
};

export type BranchDocumentSectionKey =
  | "manuals_protocols"
  | "plant_certifications"
  | "traceability_supplies"
  | "staff_records";

export type BranchDocumentSummary = {
  id: string;
  branchId: string;
  sectionKey: BranchDocumentSectionKey;
  title: string;
  description: string | null;
  fileUrl: string | null;
  expiresAt: string | null;
  isActive: boolean;
  sortOrder: number;
};

export type OperationalFormType =
  | "thermal_control"
  | "area_sanitation"
  | "supply_reception"
  | "water_quality";

export type BranchCatalogItemStatus = "active" | "inactive" | "archived";

export type BranchFormQrSummary = {
  id: string;
  branchId: string;
  companyId: string;
  formType: OperationalFormType;
  token: string;
  isActive: boolean;
};

export type BranchCatalogItemSummary = {
  id: string;
  branchId: string;
  companyId: string;
  name: string;
  isActive: boolean;
  status: BranchCatalogItemStatus;
};

export type AuthenticatedUserContext = {
  profile: UserProfile;
};
