import { useCallback } from "react";
import type { User } from "../types/app-types.js";

type OrganizationRole = "owner" | "admin" | "member";
type UiPermission =
  | "admin:access"
  | "billing:plus"
  | "organization:manage"
  | "organization:assignRole"
  | "organization:removeMember";
type Subject = Partial<Pick<User, "isAdmin" | "plan">> & {
  organizationRole?: OrganizationRole;
};

export function usePermission(user: Subject | null | undefined) {
  const isAdmin = user?.isAdmin === true;
  const plan = user?.plan;
  const role = user?.organizationRole;
  // The UI controls visibility. Relay independently authorizes requests.
  const can = useCallback(
    (permission: UiPermission, target?: { role: OrganizationRole; self: boolean }) => {
      switch (permission) {
        case "admin:access":
          return isAdmin;
        case "billing:plus":
          return isAdmin || plan === "plus";
        case "organization:manage":
          return role === "owner" || role === "admin";
        case "organization:assignRole":
          return role === "owner" && target?.role !== "owner";
        case "organization:removeMember":
          return Boolean(
            target &&
            target.role !== "owner" &&
            (target.self || role === "owner" || (role === "admin" && target.role === "member")),
          );
      }
    },
    [isAdmin, plan, role],
  );
  return { can };
}
