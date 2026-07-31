import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const schema = await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8");
const migration = await readFile(new URL("../supabase/20260731_public_qr_access.sql", import.meta.url), "utf8");

for (const [name, sql] of [["schema", schema], ["migration", migration]]) {
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
