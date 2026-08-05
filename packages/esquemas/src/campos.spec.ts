import { describe, expect, it } from "vitest";

import {
  EsquemaDireccionMac,
  EsquemaDni,
  EsquemaMetrosCano,
  EsquemaNumeroWhatsapp,
  textoRequerido,
} from "./campos";

/** The message, not the boolean — every message here is read by a person. */
const errorDe = (resultado: { success: boolean; error?: unknown }): string => {
  const error = resultado.error as
    | { issues: ReadonlyArray<{ message: string }> }
    | undefined;

  return (error?.issues ?? []).map((issue) => issue.message).join(" | ");
};

describe("EsquemaDni", () => {
  it.each(["27582030", "5582030", "27.582.030", "  27 582 030 "])(
    "accepts %j, the shapes people actually write",
    (entrada) => {
      expect(EsquemaDni.safeParse(entrada).success).toBe(true);
    },
  );

  it.each(["123456", "123456789", "2758203X", "   ", ""])(
    "rejects %j",
    (entrada) => {
      expect(EsquemaDni.safeParse(entrada).success).toBe(false);
    },
  );

  it("rejects a non-string without crashing", () => {
    expect(EsquemaDni.safeParse(27582030).success).toBe(false);
  });

  it("says what is wrong, in Spanish, so the form can show one line", () => {
    expect(errorDe(EsquemaDni.safeParse("123"))).toMatch(/DNI/i);
  });

  // Same rule as the domain's own `Dni`: a national ID number must not travel
  // into a log or an error tracker as part of a message.
  it("never echoes the attempted document", () => {
    expect(errorDe(EsquemaDni.safeParse("30123456789"))).not.toContain(
      "30123456789",
    );
  });
});

describe("EsquemaDireccionMac", () => {
  it.each([
    "AC:8B:A9:12:34:56",
    "ac:8b:a9:12:34:56",
    "AC-8B-A9-12-34-56",
    "AC8BA9123456",
    "  AC8BA9123456\n",
  ])("accepts %j, which a sticker or a scanner can produce", (entrada) => {
    expect(EsquemaDireccionMac.safeParse(entrada).success).toBe(true);
  });

  it.each(["AC8BA91234", "AC8BA912345678", "AC:8B:A9:12:34:5G", "", "nope"])(
    "rejects %j",
    (entrada) => {
      expect(EsquemaDireccionMac.safeParse(entrada).success).toBe(false);
    },
  );

  it("explains what is wrong", () => {
    expect(errorDe(EsquemaDireccionMac.safeParse("nope"))).toMatch(/MAC/i);
  });

  it("refuses an absurdly long value before doing any work on it", () => {
    expect(EsquemaDireccionMac.safeParse("A".repeat(5000)).success).toBe(false);
  });
});

describe("EsquemaNumeroWhatsapp", () => {
  it.each([
    "3854123456",
    "03854123456",
    "0385154123456",
    "+5493854123456",
    "543854123456",
    "005493854123456",
    "+54 9 (385) 412-3456",
  ])("accepts %j, which is how a technician types it", (entrada) => {
    expect(EsquemaNumeroWhatsapp.safeParse(entrada).success).toBe(true);
  });

  it.each(["385412", "38541234567890", "+13854123456", "", "123"])(
    "rejects %j",
    (entrada) => {
      expect(EsquemaNumeroWhatsapp.safeParse(entrada).success).toBe(false);
    },
  );

  it("never echoes the attempted number", () => {
    expect(errorDe(EsquemaNumeroWhatsapp.safeParse("3854123456789"))).not.toContain(
      "3854123456789",
    );
  });
});

describe("EsquemaMetrosCano", () => {
  it.each([6, 7.5, 0, "7.5", "7,5"])(
    "accepts %j, since an input field yields either a number or a string",
    (entrada) => {
      expect(EsquemaMetrosCano.safeParse(entrada).success).toBe(true);
    },
  );

  it.each([-1, 201, 6.123, "seis", "", Number.POSITIVE_INFINITY, Number.NaN])(
    "rejects %j",
    (entrada) => {
      expect(EsquemaMetrosCano.safeParse(entrada).success).toBe(false);
    },
  );

  it("names the range so the technician knows what to type", () => {
    expect(errorDe(EsquemaMetrosCano.safeParse(201))).toMatch(/200/);
  });

  it("says decimals when the problem is decimals", () => {
    expect(errorDe(EsquemaMetrosCano.safeParse(6.123))).toMatch(/decimal/i);
  });

  it("rejects a boolean, which JSON makes easy to send by accident", () => {
    expect(EsquemaMetrosCano.safeParse(true).success).toBe(false);
  });
});

describe("textoRequerido", () => {
  const esquema = textoRequerido("la ciudad", 20);

  it("trims and accepts real text", () => {
    expect(esquema.parse("  La Banda  ")).toBe("La Banda");
  });

  it("rejects whitespace-only input", () => {
    expect(esquema.safeParse("   ").success).toBe(false);
  });

  it("names the field in the message, because the form shows it under a box", () => {
    expect(errorDe(esquema.safeParse(""))).toContain("la ciudad");
  });

  it("caps the length, so a paste cannot become a payload", () => {
    expect(esquema.safeParse("x".repeat(21)).success).toBe(false);
  });
});
