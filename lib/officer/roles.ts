export const officerRoles = {
  officer: "officer",
  analyst: "analyst",
  admin: "admin",
  dataSync: "data-sync",
} as const;

export type OfficerRole = typeof officerRoles[keyof typeof officerRoles];

const canonicalRoleMap: Record<string, OfficerRole> = {
  officer: officerRoles.officer,
  analyst: officerRoles.analyst,
  admin: officerRoles.admin,
  "data-sync": officerRoles.dataSync,
  data_sync: officerRoles.dataSync,
  datasync: officerRoles.dataSync,
};

export function normalizeOfficerRole(value: string | undefined): OfficerRole | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return undefined;
  return canonicalRoleMap[trimmed];
}

export function hasOfficerRole(value: string | undefined, allowedRoles: readonly OfficerRole[]) {
  const normalized = normalizeOfficerRole(value);
  return Boolean(normalized && allowedRoles.includes(normalized));
}
