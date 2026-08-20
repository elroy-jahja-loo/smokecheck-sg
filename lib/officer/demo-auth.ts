import { createHash, randomBytes } from "node:crypto";

import { getPostgisPool, hasPostgisConfig } from "@/lib/db/postgis";
import { readCookie } from "@/lib/http";
import { normalizeOfficerRole, type OfficerRole } from "@/lib/officer/roles";

export type DemoOfficerSession = {
  officerId: string;
  username: string;
  displayName: string;
  role: OfficerRole;
};

const demoSessionCookie = "smokecheck_officer_session";
const publicDemoUsername = "smokecheck-public-demo";

const defaultInMemorySession: Omit<DemoOfficerSession, "role"> = {
  officerId: "public-demo-officer",
  username: publicDemoUsername,
  displayName: "Public Demo Operator",
};

export async function loginMockSingpassOfficer() {
  if (!hasPostgisConfig()) {
    return createInMemorySession({ ...defaultInMemorySession, role: "admin" });
  }

  const { rows } = await getPostgisPool().query<{
    id: string;
    username: string;
    display_name: string;
    role: string;
  }>(
    `select o.id, c.username, o.display_name, o.role
     from public.officer_credentials c
     join public.officers o on o.id = c.officer_id
     where lower(c.username) = lower($1) and o.status = 'active'
     limit 1`,
    [publicDemoUsername],
  ).catch(() => ({ rows: [] }));
  const officer = rows[0];
  if (!officer) {
    if (process.env.VERCEL_ENV === "production") return undefined;
    return createInMemorySession({ ...defaultInMemorySession, role: "admin" });
  }

  const token = randomBytes(32).toString("base64url");
  await getPostgisPool().query(
    `insert into public.officer_sessions (token_hash, officer_id, expires_at)
     values ($1, $2, now() + interval '8 hours')`,
    [hashToken(token), officer.id],
  );
  await getPostgisPool().query(`update public.officer_credentials set last_login_at = now() where officer_id = $1`, [officer.id]);

  return {
    token,
      session: {
        officerId: officer.id,
        username: officer.username,
        displayName: officer.display_name,
        role: normalizeOfficerRole(officer.role) ?? "officer",
      },
  };
}

export async function getDemoOfficerSessionFromRequest(request: Request): Promise<DemoOfficerSession | undefined> {
  const headerSession = request.headers.get("x-smokecheck-officer-session")?.trim();
  const cookieSession = readCookie(request.headers.get("cookie"), demoSessionCookie);
  const token = headerSession ?? cookieSession;
  if (!token) return undefined;

  const record = inMemorySessions.get(token);
  if (record) {
    if (record.expiresAt <= Date.now()) {
      inMemorySessions.delete(token);
      return undefined;
    }
    return record.session;
  }
  if (!hasPostgisConfig()) return undefined;

  const { rows } = await getPostgisPool().query<{
    id: string;
    username: string;
    display_name: string;
    role: string;
  }>(
    `select o.id, c.username, o.display_name, o.role
     from public.officer_sessions s
     join public.officers o on o.id = s.officer_id
     join public.officer_credentials c on c.officer_id = o.id
     where s.token_hash = $1 and s.expires_at > now() and s.revoked_at is null and o.status = 'active'
     limit 1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return undefined;
  return {
    officerId: row.id,
    username: row.username,
    displayName: row.display_name,
    role: normalizeOfficerRole(row.role) ?? "officer",
  };
}

export function createInMemoryOfficerSessionForTesting(role: OfficerRole = "officer") {
  return createInMemorySession({ ...defaultInMemorySession, role });
}

export function buildOfficerSetCookie(token: string, requestUrl?: string) {
  const secure = requestUrl?.startsWith("https://") || process.env.VERCEL === "1" ? "; Secure" : "";
  return `${demoSessionCookie}=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 8}${secure}`;
}

export function buildCsrfSetCookie(token: string, requestUrl?: string) {
  const secure = requestUrl?.startsWith("https://") || process.env.VERCEL === "1" ? "; Secure" : "";
  return `smokecheck_csrf=${token}; SameSite=Lax; Path=/; Max-Age=${60 * 60 * 8}${secure}`;
}

export function createCsrfToken() {
  return randomBytes(24).toString("base64url");
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

type InMemorySession = { session: DemoOfficerSession; expiresAt: number };

// Route modules are evaluated independently in local Next.js development, so a
// module-local fallback map would make a login invisible to the dashboard route.
const demoSessionStore = globalThis as typeof globalThis & { smokecheckDemoSessions?: Map<string, InMemorySession> };
const inMemorySessions = demoSessionStore.smokecheckDemoSessions ??= new Map<string, InMemorySession>();

function createInMemorySession(session: DemoOfficerSession) {
  const token = randomBytes(32).toString("base64url");
  inMemorySessions.set(token, { session, expiresAt: Date.now() + 8 * 60 * 60 * 1000 });
  return { token, session };
}
