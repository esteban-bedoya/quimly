import assert from "node:assert/strict";
import test from "node:test";

import { getPublicFormOrigin } from "../src/lib/operational-forms.ts";

const originalPublicAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalAppUrl = process.env.APP_URL;

test.after(() => {
  if (originalPublicAppUrl === undefined) {
    delete process.env.NEXT_PUBLIC_APP_URL;
  } else {
    process.env.NEXT_PUBLIC_APP_URL = originalPublicAppUrl;
  }

  if (originalAppUrl === undefined) {
    delete process.env.APP_URL;
  } else {
    process.env.APP_URL = originalAppUrl;
  }
});

test("los QR usan el dominio público configurado y no el host de la solicitud", () => {
  process.env.NEXT_PUBLIC_APP_URL = "https://quimly.co/ruta-ignorada";
  delete process.env.APP_URL;

  assert.equal(
    getPublicFormOrigin("https://preview-interno.vercel.app/dashboard/sedes/empresa/sede/operacion/formularios-operarios.pdf"),
    "https://quimly.co",
  );
});

test("los QR conservan el origen de la solicitud si no hay dominio público configurado", () => {
  delete process.env.NEXT_PUBLIC_APP_URL;
  delete process.env.APP_URL;

  assert.equal(
    getPublicFormOrigin("http://localhost:3000/dashboard/sedes/empresa/sede/operacion/formularios-operarios.pdf"),
    "http://localhost:3000",
  );
});
