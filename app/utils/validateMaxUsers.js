/**
 * Validates maxUsers for experiment create/update when not using account default.
 * @param {boolean} useAccountDefault - When true, skips validation (uses account default).
 * @param {string} maxUsersStr - Raw form value for maxUsers.
 * @returns {string|null} Error message or null if valid.
 */
export function validateMaxUsers(useAccountDefault, maxUsersStr) {
  if (useAccountDefault) return null;
  if (!maxUsersStr) {
    return "Max users is required when not using account default";
  }
  const parsed = Number(maxUsersStr);
  if (!Number.isInteger(parsed)) {
    return "Max users must be a whole number";
  }
  if (parsed < 1) {
    return "Max users must be at least 1";
  }
  if (parsed > 1_000_000) {
    return "Max users must be at most 1,000,000";
  }
  return null;
}
