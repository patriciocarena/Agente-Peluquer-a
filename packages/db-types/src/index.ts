/**
 * @turnosbot/db-types
 *
 * The SINGLE shared type source both apps/dashboard (RLS path) and
 * apps/bot (service-role tenantScoped path) import from — the structural
 * foundation for CORE-03 (typed tenant-scoped query layer). Keeping both
 * apps pointed at this package prevents the two query paths from drifting
 * on row shape.
 *
 * `database.types.ts` is generated from the LIVE schema of the
 * `bdgufnitakelyialjoqg` Supabase project (Management API typescript
 * endpoint / `supabase gen types`). Regenerate it whenever the schema
 * changes so this package stays the source of truth.
 */

export type { Database, Json } from "./database.types.js";
import type { Database } from "./database.types.js";

/** Convenience helpers over the generated schema. */
export type Tables<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TablesInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Update"];
