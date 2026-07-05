import { describe, expect, test } from "vitest";

import {
  createTenantWithNegocioSchema,
  negocioAdminSchema,
  tenantSchema,
} from "./admin";

describe("tenantSchema", () => {
  test("acepta un nombre válido", () => {
    const result = tenantSchema.safeParse({ nombre: "Grupo Norte" });
    expect(result.success).toBe(true);
  });

  test("rechaza un nombre vacío", () => {
    const result = tenantSchema.safeParse({ nombre: "" });
    expect(result.success).toBe(false);
  });
});

describe("negocioAdminSchema", () => {
  const base = {
    nombre: "Barbería Norte",
    timezone: "America/Argentina/Buenos_Aires",
  };

  test("acepta datos generales + config WhatsApp no-secreta", () => {
    const result = negocioAdminSchema.safeParse({
      ...base,
      direccion: "Av. Siempre Viva 123, CABA",
      telefono: "+54 9 11 0000-0001",
      granularidad_min: 30,
      whatsapp_phone_number_id: "fake-phone-number-id",
      waba_id: "fake-waba-id",
      display_phone_number: "+54 9 11 0000-0001",
    });
    expect(result.success).toBe(true);
  });

  test("acepta solo los campos requeridos (nombre + timezone)", () => {
    const result = negocioAdminSchema.safeParse(base);
    expect(result.success).toBe(true);
    if (result.success) {
      // granularidad_min tiene default 30 cuando no se manda.
      expect(result.data.granularidad_min).toBe(30);
    }
  });

  test("rechaza un nombre vacío", () => {
    const result = negocioAdminSchema.safeParse({ ...base, nombre: "" });
    expect(result.success).toBe(false);
  });

  test("rechaza un timezone vacío", () => {
    const result = negocioAdminSchema.safeParse({ ...base, timezone: "" });
    expect(result.success).toBe(false);
  });

  test("rechaza una granularidad que no sea 15 o 30", () => {
    const result = negocioAdminSchema.safeParse({ ...base, granularidad_min: 45 });
    expect(result.success).toBe(false);
  });

  test("rechaza la presencia de un campo de token (D-04 / T-02-24)", () => {
    const result = negocioAdminSchema.safeParse({
      ...base,
      whatsapp_token: "esto-nunca-deberia-aceptarse",
    });
    expect(result.success).toBe(false);
  });
});

describe("createTenantWithNegocioSchema", () => {
  test("acepta el alta combinada Tenant + dueño + primer Negocio", () => {
    const result = createTenantWithNegocioSchema.safeParse({
      tenantNombre: "Grupo Norte",
      ownerEmail: "owner@turnosbot-seed.test",
      ownerPassword: "SuperSecreta123",
      negocio: {
        nombre: "Barbería Norte",
        timezone: "America/Argentina/Buenos_Aires",
      },
    });
    expect(result.success).toBe(true);
  });

  test("rechaza una contraseña de dueño demasiado corta", () => {
    const result = createTenantWithNegocioSchema.safeParse({
      tenantNombre: "Grupo Norte",
      ownerEmail: "owner@turnosbot-seed.test",
      ownerPassword: "corta",
      negocio: {
        nombre: "Barbería Norte",
        timezone: "America/Argentina/Buenos_Aires",
      },
    });
    expect(result.success).toBe(false);
  });

  test("rechaza un email de dueño inválido", () => {
    const result = createTenantWithNegocioSchema.safeParse({
      tenantNombre: "Grupo Norte",
      ownerEmail: "no-es-un-email",
      ownerPassword: "SuperSecreta123",
      negocio: {
        nombre: "Barbería Norte",
        timezone: "America/Argentina/Buenos_Aires",
      },
    });
    expect(result.success).toBe(false);
  });
});
