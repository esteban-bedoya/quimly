import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migrationUrl = new URL("../supabase/20260731_public_qr_access.sql", import.meta.url);

async function readOptionalMigration() {
  try {
    return await readFile(migrationUrl, "utf8");
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return null;
    }

    throw error;
  }
}

const migration = await readOptionalMigration();
const sqlSources = [["schema", schema], ...(migration ? [["migration", migration]] : [])];

for (const [name, sql] of sqlSources) {
  test(`${name}: los QR públicos no dependen de la sesión del administrador`, () => {
    assert.match(sql, /create or replace function public\.company_has_operational_entitlement\(target_company_id uuid\)/);
    assert.match(sql, /create or replace function public\.can_company_operate\(target_company_id uuid\)[\s\S]*?select public\.company_has_operational_entitlement\(target_company_id\)/);
    assert.doesNotMatch(
      sql.match(/create or replace function public\.company_has_operational_entitlement[\s\S]*?\n\$\$;/)?.[0] ?? "",
      /can_access_company/,
    );

    if (name === "migration") {
      return;
    }

    const publicQrFunctions = sql.match(/create or replace function public\.(?:get_public_operational_form|submit_public_operational_form)[\s\S]*?(?=\ncreate or replace function public\.|\nrevoke all on function public\.company_has_operational_entitlement|$)/g) ?? [];
    assert.ok(publicQrFunctions.length >= 2);

    for (const publicQrFunction of publicQrFunctions) {
      assert.match(publicQrFunction, /public\.company_has_operational_entitlement\(qr\.company_id\)/);
      assert.doesNotMatch(publicQrFunction, /public\.can_company_operate\(qr\.company_id\)/);
      assert.doesNotMatch(publicQrFunction, /public\.company_requires_capacity_resolution\(qr\.company_id\)/);
    }
  });
}
