// Data layer. Implementation lives in ./db/*; core.ts holds the shared
// helpers (column maps, offline-aware tables, paging, audit, realtime).
export { OFFICIAL_LSC_POSITIONS } from "../types";
export { checkSupabaseConnection, subscribeToTables } from "./db/core";
export * from "./db/auditLogs";
export * from "./db/students";
export * from "./db/events";
export * from "./db/attendance";
export * from "./db/finance";
export * from "./db/feedback";
export * from "./db/requirementFiles";
export * from "./db/officers";
