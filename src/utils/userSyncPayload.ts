
export function pickUserForWorkspaceSync(user: any, opts?: { includePassword?: boolean }): any {
  if (!opts?.includePassword) {
    const { password, ...rest } = user;
    return rest;
  }
  return user;
}

export function stripUsersPasswords(users: any[]): any[] {
  return users.map(u => {
    const { password, ...rest } = u;
    return rest;
  });
}
