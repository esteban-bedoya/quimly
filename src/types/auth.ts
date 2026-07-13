import type { E164PhoneNumber } from "@/lib/phone";
import type { SiteStatus } from "@/lib/billing";

export type AppRole = "owner" | "super_admin" | "company_admin";

export type UserProfile = {
  userId: string;
  email: string | null;
  phone: E164PhoneNumber;
  phoneVerified: boolean;
  fullName: string | null;
  globalRole: AppRole;
  isActive: boolean;
  defaultCompanyId: string | null;
};

export type UserIdentityType = "phone";

export type ResolvedUserIdentity = {
  type: "phone";
  value: E164PhoneNumber;
  email: string | null;
  phone: E164PhoneNumber;
  phoneVerified: boolean;
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
  isActive: boolean;
  status: SiteStatus;
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

export type BranchSanitaryDocumentKind =
  | "sanitation_plan"
  | "chemical_technical_sheet"
  | "chemical_safety_sheet"
  | "pest_control_certificate"
  | "water_tank_cleaning_certificate"
  | "acu_final_disposal_certificate"
  | "food_handling_course"
  | "medical_fitness_exam";

export type BranchSanitaryDocumentCategory =
  | "sanitation_plan"
  | "chemical_products"
  | "pest_control"
  | "water_tank_cleaning"
  | "acu_final_disposal"
  | "staff_records";

export type BranchSanitaryDocumentStatusColor = "gris" | "rojo" | "amarillo" | "verde";

export type BranchSanitaryDocumentCategoryStatusMap = Record<
  BranchSanitaryDocumentCategory,
  BranchSanitaryDocumentStatusColor
>;

export type BranchSanitaryDocumentFileSummary = {
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
  isActive: boolean;
  uploadedAt: string;
  updatedAt: string;
};

export type BranchChemicalProductSummary = {
  id: string;
  branchId: string;
  companyId: string;
  name: string;
  isActive: boolean;
  updatedAt: string;
};

export type BranchStaffMemberSummary = {
  id: string;
  branchId: string;
  companyId: string;
  fullName: string;
  isActive: boolean;
  updatedAt: string;
};

export type OperationalFormType =
  | "thermal_control"
  | "area_sanitation"
  | "supply_reception"
  | "water_quality";

export type BranchCatalogItemStatus = "active" | "inactive" | "archived";

export type BranchRefrigerationEquipmentType = "refrigerator" | "freezer";

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
  equipmentType?: BranchRefrigerationEquipmentType | null;
  isActive: boolean;
  status: BranchCatalogItemStatus;
};

export type AuthenticatedUserContext = {
  profile: UserProfile;
  identity: ResolvedUserIdentity;
};
