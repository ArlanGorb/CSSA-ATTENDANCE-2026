const DEFAULT_ADMIN_PASSWORD = '8182838485';

export function verifyAdminToken(request: Request): boolean {
  const adminToken = request.headers.get('x-admin-token');

  // Keep backward compatibility with both env names used in this project.
  const validPasswords = [
    process.env.ADMIN_PASSWORD,
    process.env.NEXT_PUBLIC_ADMIN_PASSWORD,
    DEFAULT_ADMIN_PASSWORD
  ].filter((value): value is string => Boolean(value && value.trim()));

  return adminToken !== null && validPasswords.includes(adminToken);
}
