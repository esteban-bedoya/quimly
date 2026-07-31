import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const page = await readFile(new URL("../src/app/f/[token]/page.tsx", import.meta.url), "utf8");
const actions = await readFile(new URL("../src/app/f/[token]/actions.ts", import.meta.url), "utf8");

test("el registro de control interno exige company_admin autenticado", () => {
  assert.match(page, /userContext\?\.profile\.globalRole !== "company_admin"/);
  assert.match(page, /getSupabaseRlsClient\(\)/);
  assert.match(actions, /!session \|\| userContext\?\.profile\.globalRole !== "company_admin"/);
  assert.match(actions, /if \(requestedAdminMode && !adminSubmissionContext\)[\s\S]*requiere una sesión activa de administrador/);
});
