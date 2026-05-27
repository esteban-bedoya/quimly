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
};

export type UserCompanyMembership = {
  id: string;
  isActive: boolean;
  company: CompanySummary | null;
};

export type AuthenticatedUserContext = {
  profile: UserProfile;
  memberships: UserCompanyMembership[];
};
