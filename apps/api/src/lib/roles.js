export const DEFAULT_ROLE_NAME = 'buyer';

export function normalizeRoleName(value) {
  return String(value || DEFAULT_ROLE_NAME)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

export function publicUserFromRecord(user) {
  return {
    id: user.id,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role?.name || DEFAULT_ROLE_NAME,
    roleId: user.roleId,
  };
}
