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

export type AuthenticatedUserContext = {
  profile: UserProfile;
};
