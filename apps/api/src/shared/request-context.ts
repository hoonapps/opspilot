export type RequestContext = {
  actorId?: string;
  email?: string;
  roles: string[];
  teamSlugs: string[];
};

export function parseRequestContext(headers: Record<string, string | string[] | undefined>): RequestContext {
  const read = (key: string) => {
    const value = headers[key] ?? headers[key.toLowerCase()];
    return Array.isArray(value) ? value[0] : value;
  };

  const roles = splitHeader(read("x-user-roles"));
  const teamSlugs = splitHeader(read("x-team-slugs") ?? read("x-team-slug"));

  return {
    actorId: read("x-user-id"),
    email: read("x-user-email"),
    roles,
    teamSlugs
  };
}

function splitHeader(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
