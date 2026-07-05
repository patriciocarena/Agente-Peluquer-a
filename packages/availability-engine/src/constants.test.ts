/**
 * src/constants.test.ts — valida el contrato de la ventana de reserva
 * (D-04/D-05) antes de que computeSlots la consuma (Wave 2+).
 */
import { describe, expect, it } from "vitest";

import { BOOKING_MAX_ADVANCE_DAYS, BOOKING_MIN_LEAD_MINUTES } from "./constants";

describe("constants", () => {
  it("BOOKING_MIN_LEAD_MINUTES es exactamente 60 (D-04)", () => {
    expect(BOOKING_MIN_LEAD_MINUTES).toBe(60);
  });

  it("BOOKING_MAX_ADVANCE_DAYS es exactamente 30 (D-04)", () => {
    expect(BOOKING_MAX_ADVANCE_DAYS).toBe(30);
  });
});
