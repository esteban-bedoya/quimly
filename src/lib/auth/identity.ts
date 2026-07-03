import "server-only";

import type { ResolvedUserIdentity, UserProfile } from "@/types/auth";

type IdentitySource = Pick<UserProfile, "email" | "phone" | "phoneVerified">;

export function resolveUserIdentity(user: IdentitySource): ResolvedUserIdentity {
  const phone = user.phone.trim();

  if (!phone) {
    throw new Error("Phone-first auth requires a phone identity.");
  }

  return {
    type: "phone",
    value: phone,
    email: user.email,
    phone,
    phoneVerified: user.phoneVerified,
  };
}
