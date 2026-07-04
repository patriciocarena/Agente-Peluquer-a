#!/usr/bin/env bash
# Structural test for supabase/migrations/0001_schema_core.sql
# TDD RED phase: this test MUST fail before the migration file exists / is complete.
# Verifies (Plan 01-03, Task 1 acceptance criteria):
#   - exactly 14 CREATE TABLE statements
#   - btree_gist extension + EXCLUDE USING gist anti-double-booking constraint on turno
#   - tenant_id present on every business table (>= 12 occurrences outside comments)
#   - no naive `timestamp` (non-tz) on schedule/appointment columns
#   - perfil table has the Phase-2 superadmin nullability forward-note
#   - no cross-project leakage (restaurant project references)

set -uo pipefail

MIGRATION_FILE="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/migrations/0001_schema_core.sql"
FAIL=0

fail() {
  echo "FAIL: $1"
  FAIL=1
}

pass() {
  echo "PASS: $1"
}

if [ ! -f "$MIGRATION_FILE" ]; then
  fail "migration file does not exist: $MIGRATION_FILE"
  echo ""
  echo "RED: 0/6 checks passed (file missing)"
  exit 1
fi

# 1. Exactly 14 CREATE TABLE statements
TABLE_COUNT=$(grep -c "^CREATE TABLE" "$MIGRATION_FILE" || true)
if [ "$TABLE_COUNT" -eq 14 ]; then
  pass "exactly 14 CREATE TABLE statements"
else
  fail "expected 14 CREATE TABLE statements, found $TABLE_COUNT"
fi

# 2. btree_gist extension present
if grep -q "CREATE EXTENSION IF NOT EXISTS btree_gist" "$MIGRATION_FILE"; then
  pass "btree_gist extension present"
else
  fail "btree_gist extension missing"
fi

# 3. EXCLUDE USING gist with estado != 'cancelado' filter
if grep -q "EXCLUDE USING gist" "$MIGRATION_FILE" && grep -q "estado != 'cancelado'" "$MIGRATION_FILE"; then
  pass "EXCLUDE USING gist anti-double-booking constraint present"
else
  fail "EXCLUDE USING gist constraint (with estado != 'cancelado' filter) missing"
fi

# 4. tenant_id appears >= 12 times outside comments
TENANT_ID_COUNT=$(grep -viE '^\s*--' "$MIGRATION_FILE" | grep -c "tenant_id" || true)
if [ "$TENANT_ID_COUNT" -ge 12 ]; then
  pass "tenant_id present on >= 12 lines outside comments ($TENANT_ID_COUNT found)"
else
  fail "tenant_id found only $TENANT_ID_COUNT times outside comments, expected >= 12"
fi

# 5. No naive timestamp on schedule/appointment columns
NAIVE_TS=$(grep -viE '^\s*--' "$MIGRATION_FILE" | grep -iE '\b(inicio|fin|_at|ventana_expira|programado)\b[^;]*\btimestamp\b' | grep -vi 'timestamptz\|with time zone' || true)
if [ -z "$NAIVE_TS" ]; then
  pass "no naive (non-tz) timestamp on schedule/appointment columns"
else
  fail "found naive timestamp usage: $NAIVE_TS"
fi

# 6. No cross-project (restaurant) leakage
LEAK_COUNT=$(grep -Eci "hzgunbftloevclkohcdf|menu_items|restaurants|call_logs" "$MIGRATION_FILE" || true)
if [ "$LEAK_COUNT" -eq 0 ]; then
  pass "no cross-project (restaurant) references"
else
  fail "found $LEAK_COUNT cross-project reference(s) — CRITICAL isolation violation"
fi

# 7. perfil table has the Phase-2 superadmin forward-note
if grep -qi "superadmin" "$MIGRATION_FILE" && grep -qi "nullable" "$MIGRATION_FILE" && grep -qi "perfil" "$MIGRATION_FILE"; then
  pass "perfil table has Phase-2 superadmin nullability forward-note"
else
  fail "perfil table missing Phase-2 superadmin nullability forward-note comment"
fi

echo ""
if [ "$FAIL" -eq 0 ]; then
  echo "GREEN: all checks passed"
  exit 0
else
  echo "RED: one or more checks failed"
  exit 1
fi
