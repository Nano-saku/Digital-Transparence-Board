import type { AuditLog } from "../../types";
import { defineColumns, field, newId, nullable, sb, subscribeToTables, unwrap, DESC, type AuditEntry, type Row } from "./core";

const auditLogs = defineColumns<AuditLog>({
  actorUserId: nullable("actor_user_id"),
  actorName: "actor_name",
  actorRole: "actor_role",
  action: "action",
  entityType: "entity_type",
  entityId: nullable("entity_id"),
  description: "description",
  metadata: field("metadata", (value) => value ?? {}),
  createdAt: "created_at",
});

const newestFirst = (options?: { count: "exact" }) =>
  sb().from("audit_logs").select("*", options).order("created_at", DESC);

export const auditLogsService = {
  /**
   * Create one audit entry. Never queued offline: an entry records an action
   * that reached the database, so a queued operation writes its entry when
   * it replays.
   */
  async create(input: AuditEntry): Promise<AuditLog> {
    const row = {
      id: newId(),
      actor_user_id: input.actorUserId ?? null,
      actor_name: input.actorName,
      actor_role: input.actorRole,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      description: input.description,
      metadata: input.metadata ?? {},
    };
    return auditLogs.fromRow(await unwrap<Row>(sb().from("audit_logs").insert(row).select().single()));
  },

  getRecent: (limit = 8): Promise<AuditLog[]> => auditLogs.list(newestFirst().limit(limit)),

  getPage(
    page: number,
    pageSize: number,
    options?: { entityTypes?: readonly string[]; actorRoles?: readonly string[] },
  ): Promise<{ data: AuditLog[]; total: number }> {
    let query = newestFirst({ count: "exact" });
    if (options?.entityTypes?.length) query = query.in("entity_type", [...options.entityTypes]);
    if (options?.actorRoles?.length) query = query.in("actor_role", [...options.actorRoles]);
    return auditLogs.page(query, page, pageSize);
  },

  subscribe: (onChange: () => void): (() => void) =>
    subscribeToTables(["audit_logs"], onChange, "audit-logs-live"),
};
