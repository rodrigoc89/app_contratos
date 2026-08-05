-- CreateEnum
CREATE TYPE "estado_contrato" AS ENUM ('borrador', 'vigente', 'dado_de_baja', 'anulado');

-- CreateEnum
CREATE TYPE "tipo_documento_firmado" AS ENUM ('condiciones_generales', 'comodato');

-- CreateEnum
CREATE TYPE "tipo_evento_contrato" AS ENUM ('creado', 'firmado', 'dado_de_baja', 'anulado', 'equipos_restituidos');

-- CreateTable
CREATE TABLE "plantillas_contrato" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "contenido_html" TEXT NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "checksum" TEXT,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plantillas_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "firmantes_comodante" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "dni" TEXT NOT NULL,
    "imagen_firma_png" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "firmantes_comodante_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contratos" (
    "id" TEXT NOT NULL,
    "numero" INTEGER,
    "estado" "estado_contrato" NOT NULL DEFAULT 'borrador',
    "comodatario_nombre_completo" TEXT NOT NULL,
    "comodatario_dni" TEXT NOT NULL,
    "comodatario_domicilio_calle" TEXT NOT NULL,
    "comodatario_ciudad" TEXT NOT NULL,
    "comodatario_whatsapp" TEXT NOT NULL,
    "equipo_antena_modelo" TEXT NOT NULL,
    "equipo_antena_mac" TEXT NOT NULL,
    "equipo_poe" BOOLEAN NOT NULL,
    "equipo_cano_metros" DECIMAL(5,2) NOT NULL,
    "plazo_meses" INTEGER,
    "plazo_fecha_inicio" DATE,
    "plazo_fecha_vencimiento" DATE,
    "fecha_firma" DATE,
    "plantilla_version_id" TEXT,
    "firmante_id" TEXT,
    "contexto_tecnico_id" TEXT,
    "contexto_dispositivo_id" TEXT,
    "contexto_capturado_en" TIMESTAMPTZ,
    "contexto_ip" TEXT,
    "contexto_user_agent" TEXT,
    "contexto_geo_latitud" DOUBLE PRECISION,
    "contexto_geo_longitud" DOUBLE PRECISION,
    "motivo_baja" TEXT,
    "fecha_baja" DATE,
    "motivo_anulacion" TEXT,
    "fecha_anulacion" DATE,
    "fecha_restitucion" DATE,
    "reemplaza_a" TEXT,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_firmas" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "documento" "tipo_documento_firmado" NOT NULL,
    "imagen_png" TEXT NOT NULL,
    "trazos" JSONB NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_firmas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_documentos" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "documento" "tipo_documento_firmado" NOT NULL,
    "ruta" TEXT NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_eventos" (
    "id" TEXT NOT NULL,
    "contrato_id" TEXT NOT NULL,
    "tipo" "tipo_evento_contrato" NOT NULL,
    "fecha" DATE,
    "detalle" TEXT,
    "registrado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contrato_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "plantillas_contrato_version_key" ON "plantillas_contrato"("version");

-- CreateIndex
CREATE UNIQUE INDEX "firmantes_comodante_version_key" ON "firmantes_comodante"("version");

-- CreateIndex
CREATE INDEX "idx_firmantes_comodante_activo" ON "firmantes_comodante"("activo");

-- CreateIndex
CREATE UNIQUE INDEX "contratos_numero_key" ON "contratos"("numero");

-- CreateIndex
CREATE INDEX "idx_contratos_comodatario_dni" ON "contratos"("comodatario_dni");

-- CreateIndex
CREATE INDEX "idx_contratos_estado" ON "contratos"("estado");

-- CreateIndex
CREATE INDEX "idx_contratos_estado_restitucion" ON "contratos"("estado", "fecha_restitucion");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_firmas_contrato_id_documento_key" ON "contrato_firmas"("contrato_id", "documento");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_documentos_contrato_id_documento_key" ON "contrato_documentos"("contrato_id", "documento");

-- CreateIndex
CREATE INDEX "idx_contrato_eventos_contrato_id" ON "contrato_eventos"("contrato_id");

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_plantilla_version_id_fkey" FOREIGN KEY ("plantilla_version_id") REFERENCES "plantillas_contrato"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_firmante_id_fkey" FOREIGN KEY ("firmante_id") REFERENCES "firmantes_comodante"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contratos" ADD CONSTRAINT "contratos_reemplaza_a_fkey" FOREIGN KEY ("reemplaza_a") REFERENCES "contratos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_firmas" ADD CONSTRAINT "contrato_firmas_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_documentos" ADD CONSTRAINT "contrato_documentos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_eventos" ADD CONSTRAINT "contrato_eventos_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contratos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateSequence
-- The contract number is allocated by the server (ContratoRepository.siguienteNumero),
-- never by a column default: "numero" must stay NULL for every draft and is
-- only ever assigned once, at signing. Detached from the column on purpose
-- so no INSERT can accidentally consume a number.
CREATE SEQUENCE "contrato_numero_seq" START WITH 1 INCREMENT BY 1;

-- CreatePartialUniqueIndex
-- Enforces "at most one active comodante signatory" at the database level.
-- Prisma's schema language in this version cannot express a filtered unique
-- index reliably, so it is added here as raw SQL; the plain (non-unique)
-- "idx_firmantes_comodante_activo" index from the generated DDL above stays
-- so `prisma migrate diff`/introspection keeps tracking the column.
CREATE UNIQUE INDEX "ux_firmantes_comodante_activo" ON "firmantes_comodante" ("activo") WHERE "activo" = true;

-- CreatePartialIndex
-- The office panel's "company hardware still at a former customer's home"
-- report (DESIGN.md §3): terminated contracts with no restitution recorded.
-- A true partial index on exactly that predicate, in addition to the
-- broader "idx_contratos_estado_restitucion" composite index above.
CREATE INDEX "idx_contratos_equipos_pendientes" ON "contratos" ("numero")
  WHERE "estado" = 'dado_de_baja' AND "fecha_restitucion" IS NULL;

-- AppendOnlyGuard
-- The event log is append-only (DESIGN.md §3: "Every state change is an
-- append-only event, never a mutation"). A trigger enforces it at the
-- database level rather than trusting application discipline.
CREATE FUNCTION "prevent_contrato_eventos_mutation"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'contrato_eventos es de solo append: no se permite UPDATE ni DELETE';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "contrato_eventos_append_only"
  BEFORE UPDATE OR DELETE ON "contrato_eventos"
  FOR EACH ROW EXECUTE FUNCTION "prevent_contrato_eventos_mutation"();
