export type WorkspaceRole = "Admin" | "Manager" | "User";

export type AdminPermission =
  | "admin.access"
  | "workspace.read"
  | "workspace.write"
  | "users.read"
  | "users.invite"
  | "users.remove"
  | "users.role"
  | "knowledge.read"
  | "knowledge.write"
  | "ai.read"
  | "ai.write"
  | "usage.read"
  | "privacy.read"
  | "privacy.write"
  | "retention.write"
  | "audit.read"
  | "devices.read"
  | "devices.write"
  | "licenses.read"
  | "licenses.write";

const MATRIX: Record<WorkspaceRole, AdminPermission[]> = {
  Admin: [
    "admin.access",
    "workspace.read",
    "workspace.write",
    "users.read",
    "users.invite",
    "users.remove",
    "users.role",
    "knowledge.read",
    "knowledge.write",
    "ai.read",
    "ai.write",
    "usage.read",
    "privacy.read",
    "privacy.write",
    "retention.write",
    "audit.read",
    "devices.read",
    "devices.write",
    "licenses.read",
    "licenses.write",
  ],
  Manager: [
    "admin.access",
    "workspace.read",
    "users.read",
    "knowledge.read",
    "ai.read",
    "usage.read",
    "privacy.read",
    "audit.read",
    "devices.read",
    "licenses.read",
  ],
  User: [],
};

export function normalizeRole(value: unknown): WorkspaceRole {
  if (typeof value !== "string") return "User";
  const compact = value.trim();
  if (compact === "Admin" || compact === "Manager" || compact === "User") return compact;
  const v = compact.toLowerCase();
  if (v === "admin") return "Admin";
  if (v === "manager") return "Manager";
  if (v === "user" || v === "member" || v === "viewer") return "User";
  return "User";
}

export function permissionsFor(role?: string | null): AdminPermission[] {
  return MATRIX[normalizeRole(role)] || [];
}

export function rolePermissionMatrix(): Record<WorkspaceRole, AdminPermission[]> {
  return {
    Admin: [...MATRIX.Admin],
    Manager: [...MATRIX.Manager],
    User: [...MATRIX.User],
  };
}

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  "admin.access",
  "workspace.read",
  "workspace.write",
  "users.read",
  "users.invite",
  "users.remove",
  "users.role",
  "knowledge.read",
  "knowledge.write",
  "ai.read",
  "ai.write",
  "usage.read",
  "privacy.read",
  "privacy.write",
  "retention.write",
  "audit.read",
  "devices.read",
  "devices.write",
  "licenses.read",
  "licenses.write",
];

export function can(role: string | null | undefined, permission: AdminPermission): boolean {
  return permissionsFor(role).includes(permission);
}

export function canAccessAdmin(role?: string | null): boolean {
  return can(role, "admin.access");
}
