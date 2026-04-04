/**
 * Fine-Grained Authorization (FGA) permission store.
 *
 * Uses Auth0 FGA / OpenFGA SDK for the authorization model and check API.
 * When FGA environment variables are configured (FGA_STORE_ID, FGA_CLIENT_ID,
 * FGA_CLIENT_SECRET), all permission checks go through the real FGA API.
 * Otherwise, falls back to a local JSON store with the same API surface.
 *
 * Authorization model (OpenFGA DSL):
 *
 *   model
 *     schema 1.1
 *
 *   type user
 *
 *   type service
 *     relations
 *       define can_read: [user]
 *       define can_reply: [user]
 *       define can_delete: [user]
 *       define can_create: [user]
 *       define can_comment: [user]
 *       define can_approve: [user]
 *       define can_send: [user]
 */

import {
  CredentialsMethod,
  OpenFgaClient,
  type TypeDefinition,
  type WriteAuthorizationModelRequest,
  type ClientCheckRequest,
  ConsistencyPreference,
} from "@openfga/sdk";
import sql, { ensureTables } from "./db";
import { sanitizeUserId } from "./storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceName = "gmail" | "calendar" | "github" | "slack";
export type PermissionAction =
  | "can_read"
  | "can_reply"
  | "can_delete"
  | "can_create"
  | "can_comment"
  | "can_approve"
  | "can_send";

export interface GmailPermissions {
  can_read: boolean;
  can_reply: boolean;
  can_delete: boolean;
}

export interface CalendarPermissions {
  can_read: boolean;
  can_create: boolean;
  can_delete: boolean;
}

export interface GitHubPermissions {
  can_read: boolean;
  can_comment: boolean;
  can_approve: boolean;
}

export interface SlackPermissions {
  can_read: boolean;
  can_send: boolean;
}

export interface AgentAutonomy {
  auto_act: boolean;
}

export interface UserPermissions {
  gmail: GmailPermissions;
  calendar: CalendarPermissions;
  github: GitHubPermissions;
  slack: SlackPermissions;
  autonomy: AgentAutonomy;
}

// ---------------------------------------------------------------------------
// FGA Authorization Model (OpenFGA JSON format)
// ---------------------------------------------------------------------------

/**
 * The authorization model expressed as an OpenFGA WriteAuthorizationModelRequest.
 * This is the JSON equivalent of the DSL shown in the module docstring.
 *
 * Each service (gmail, calendar, github, slack) is modeled as a `service`
 * type with relations for each permitted action. Users are assigned to
 * relations via tuples like: user:alice -> can_read -> service:gmail
 */

const SERVICE_RELATIONS: Record<string, string[]> = {
  gmail: ["can_read", "can_reply", "can_delete"],
  calendar: ["can_read", "can_create", "can_delete"],
  github: ["can_read", "can_comment", "can_approve"],
  slack: ["can_read", "can_send"],
};

/** All unique relation names across all services. */
const ALL_RELATIONS = [
  "can_read",
  "can_reply",
  "can_delete",
  "can_create",
  "can_comment",
  "can_approve",
  "can_send",
] as const;

function buildRelationMap(): Record<string, { this: object }> {
  const relations: Record<string, { this: object }> = {};
  for (const rel of ALL_RELATIONS) {
    relations[rel] = { this: {} };
  }
  return relations;
}

function buildRelationMetadata(): {
  relations: Record<string, { directly_related_user_types: Array<{ type: string }> }>;
} {
  const relations: Record<
    string,
    { directly_related_user_types: Array<{ type: string }> }
  > = {};
  for (const rel of ALL_RELATIONS) {
    relations[rel] = { directly_related_user_types: [{ type: "user" }] };
  }
  return { relations };
}

const FGA_TYPE_DEFINITIONS: TypeDefinition[] = [
  { type: "user" },
  {
    type: "service",
    relations: buildRelationMap(),
    metadata: buildRelationMetadata(),
  },
];

/**
 * The full authorization model request, exported so the UI or tests
 * can inspect the model structure.
 */
export const FGA_AUTHORIZATION_MODEL: WriteAuthorizationModelRequest = {
  schema_version: "1.1",
  type_definitions: FGA_TYPE_DEFINITIONS,
};

// ---------------------------------------------------------------------------
// FGA mode detection
// ---------------------------------------------------------------------------

export type FgaMode = "api" | "local";

function detectFgaMode(): FgaMode {
  const hasStoreId = !!process.env.FGA_STORE_ID;
  const hasClientId = !!process.env.FGA_CLIENT_ID;
  const hasClientSecret = !!process.env.FGA_CLIENT_SECRET;

  if (hasStoreId && hasClientId && hasClientSecret) {
    return "api";
  }
  return "local";
}

/** Cached mode — evaluated once per process lifetime. */
let _fgaMode: FgaMode | null = null;

export function getFgaMode(): FgaMode {
  if (_fgaMode === null) {
    _fgaMode = detectFgaMode();
    if (_fgaMode === "local") {
      console.warn(
        "[FGA] No FGA credentials found (FGA_STORE_ID, FGA_CLIENT_ID, FGA_CLIENT_SECRET). " +
          "Using local JSON store as fallback. " +
          "Set environment variables to use the Auth0 FGA API. " +
          "See: https://dashboard.fga.dev"
      );
    } else {
      console.log("[FGA] Using Auth0 FGA API");
    }
  }
  return _fgaMode;
}

// ---------------------------------------------------------------------------
// OpenFGA Client (real API mode)
// ---------------------------------------------------------------------------

let _fgaClient: OpenFgaClient | null = null;

function getFgaClient(): OpenFgaClient {
  if (!_fgaClient) {
    _fgaClient = new OpenFgaClient({
      apiUrl: process.env.FGA_API_URL || "https://api.us1.fga.dev",
      storeId: process.env.FGA_STORE_ID!,
      credentials: {
        method: CredentialsMethod.ClientCredentials,
        config: {
          apiTokenIssuer:
            process.env.FGA_API_TOKEN_ISSUER || "fga.us.auth0.com",
          apiAudience:
            process.env.FGA_API_AUDIENCE || "https://api.us1.fga.dev/",
          clientId: process.env.FGA_CLIENT_ID!,
          clientSecret: process.env.FGA_CLIENT_SECRET!,
        },
      },
    });
  }
  return _fgaClient;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

export function defaultPermissions(): UserPermissions {
  return {
    gmail: { can_read: true, can_reply: false, can_delete: false },
    calendar: { can_read: true, can_create: false, can_delete: false },
    github: { can_read: true, can_comment: false, can_approve: false },
    slack: { can_read: true, can_send: false },
    autonomy: { auto_act: false },
  };
}

// ---------------------------------------------------------------------------
// Local DB store implementation (Neon Postgres fallback mode)
// ---------------------------------------------------------------------------

async function loadPermissionsLocal(userId: string): Promise<UserPermissions> {
  try {
    await ensureTables();
    const key = sanitizeUserId(userId);
    const rows = await sql`SELECT data FROM permissions WHERE user_id = ${key}`;
    if (rows.length === 0) {
      return defaultPermissions();
    }
    const data = rows[0].data as Partial<UserPermissions>;
    const defaults = defaultPermissions();
    return {
      gmail: { ...defaults.gmail, ...data.gmail },
      calendar: { ...defaults.calendar, ...data.calendar },
      github: { ...defaults.github, ...data.github },
      slack: { ...defaults.slack, ...data.slack },
      autonomy: { ...defaults.autonomy, ...(data as any).autonomy },
    };
  } catch {
    return defaultPermissions();
  }
}

async function updatePermissionsLocal(
  userId: string,
  partial: Partial<
    Record<
      ServiceName,
      Partial<
        GmailPermissions &
          CalendarPermissions &
          GitHubPermissions &
          SlackPermissions
      >
    >
  >
): Promise<UserPermissions> {
  await ensureTables();

  const current = await loadPermissionsLocal(userId);

  const services: ServiceName[] = ["gmail", "calendar", "github", "slack"];
  for (const svc of services) {
    if (partial[svc]) {
      const updates = partial[svc]!;
      for (const [key, val] of Object.entries(updates)) {
        if (typeof val === "boolean" && key in current[svc]) {
          (current[svc] as unknown as Record<string, boolean>)[key] = val;
        }
      }
    }
  }

  const key = sanitizeUserId(userId);
  await sql`
    INSERT INTO permissions (user_id, data)
    VALUES (${key}, ${JSON.stringify(current)}::jsonb)
    ON CONFLICT (user_id)
    DO UPDATE SET data = ${JSON.stringify(current)}::jsonb
  `;
  return current;
}

async function checkPermissionLocal(
  userId: string,
  service: ServiceName,
  action: PermissionAction
): Promise<boolean> {
  try {
    const perms = await loadPermissionsLocal(userId);
    const svcPerms = perms[service] as unknown as
      | Record<string, boolean>
      | undefined;
    return svcPerms?.[action] ?? false;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// FGA API implementation (real Auth0 FGA)
// ---------------------------------------------------------------------------

/**
 * Build the FGA user identifier from a user ID string.
 * FGA expects the format "user:<id>".
 */
function fgaUser(userId: string): string {
  return `user:${sanitizeUserId(userId)}`;
}

/**
 * Load all permissions for a user by running batch checks against the FGA API.
 */
async function loadPermissionsFGA(userId: string): Promise<UserPermissions> {
  const client = getFgaClient();
  const user = fgaUser(userId);
  const defaults = defaultPermissions();

  const services: ServiceName[] = ["gmail", "calendar", "github", "slack"];
  const checks: Array<{
    service: ServiceName;
    action: string;
    request: ClientCheckRequest;
  }> = [];

  for (const svc of services) {
    const relations = SERVICE_RELATIONS[svc];
    for (const rel of relations) {
      checks.push({
        service: svc,
        action: rel,
        request: {
          user,
          relation: rel,
          object: `service:${svc}`,
        },
      });
    }
  }

  // Run all checks in parallel
  const results = await Promise.allSettled(
    checks.map((c) =>
      client.check(c.request, {
        consistency: ConsistencyPreference.HigherConsistency,
      })
    )
  );

  const perms = defaults;
  for (let i = 0; i < checks.length; i++) {
    const { service, action } = checks[i];
    const result = results[i];
    if (result.status === "fulfilled") {
      (perms[service] as unknown as Record<string, boolean>)[action] =
        result.value.allowed ?? false;
    }
    // On rejection, keep the default (fail-closed for write actions, open for read)
  }

  return perms;
}

/**
 * Update permissions in FGA by writing/deleting relationship tuples.
 * For each toggled permission, we either write a tuple (grant) or
 * delete it (revoke).
 */
async function updatePermissionsFGA(
  userId: string,
  partial: Partial<
    Record<
      ServiceName,
      Partial<
        GmailPermissions &
          CalendarPermissions &
          GitHubPermissions &
          SlackPermissions
      >
    >
  >
): Promise<UserPermissions> {
  const client = getFgaClient();
  const user = fgaUser(userId);

  const writes: Array<{ user: string; relation: string; object: string }> = [];
  const deletes: Array<{ user: string; relation: string; object: string }> = [];

  const services: ServiceName[] = ["gmail", "calendar", "github", "slack"];
  for (const svc of services) {
    if (partial[svc]) {
      const updates = partial[svc]!;
      const validRelations = SERVICE_RELATIONS[svc];
      for (const [key, val] of Object.entries(updates)) {
        if (typeof val === "boolean" && validRelations.includes(key)) {
          const tuple = { user, relation: key, object: `service:${svc}` };
          if (val) {
            writes.push(tuple);
          } else {
            deletes.push(tuple);
          }
        }
      }
    }
  }

  // Write and delete tuples
  if (writes.length > 0 || deletes.length > 0) {
    await client.write(
      {
        writes: writes.length > 0 ? writes : undefined,
        deletes: deletes.length > 0 ? deletes : undefined,
      },
      { authorizationModelId: undefined }
    );
  }

  // Return the updated state
  return loadPermissionsFGA(userId);
}

/**
 * Check a single permission via the FGA API.
 */
async function checkPermissionFGA(
  userId: string,
  service: ServiceName,
  action: PermissionAction
): Promise<boolean> {
  try {
    const client = getFgaClient();
    const request: ClientCheckRequest = {
      user: fgaUser(userId),
      relation: action,
      object: `service:${service}`,
    };

    const response = await client.check(request, {
      consistency: ConsistencyPreference.HigherConsistency,
    });

    return response.allowed ?? false;
  } catch (err) {
    console.error("[FGA] Check failed, denying access:", err);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Public API (delegates to FGA API or local store based on configuration)
// ---------------------------------------------------------------------------

/**
 * Load permissions for a user.
 * Returns defaults (read-only) if the store is empty or on error.
 */
export async function loadPermissions(
  userId: string
): Promise<UserPermissions> {
  if (getFgaMode() === "api") {
    return loadPermissionsFGA(userId);
  }
  return loadPermissionsLocal(userId);
}

/**
 * Persist updated permissions for a user.
 * Accepts a partial payload -- missing services/actions keep their previous value.
 */
export async function updatePermissions(
  userId: string,
  partial: Partial<
    Record<
      ServiceName,
      Partial<
        GmailPermissions &
          CalendarPermissions &
          GitHubPermissions &
          SlackPermissions
      >
    >
  >
): Promise<UserPermissions> {
  if (getFgaMode() === "api") {
    return updatePermissionsFGA(userId, partial);
  }
  return updatePermissionsLocal(userId, partial);
}

/**
 * Check a single permission.
 * Returns false on error (fail-closed -- deny on error).
 */
export async function checkPermission(
  userId: string,
  service: ServiceName,
  action: PermissionAction
): Promise<boolean> {
  if (getFgaMode() === "api") {
    return checkPermissionFGA(userId, service, action);
  }
  return checkPermissionLocal(userId, service, action);
}
