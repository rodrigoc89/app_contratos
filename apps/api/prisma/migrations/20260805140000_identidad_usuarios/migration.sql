-- Identity: users, roles, and revocable refresh tokens (DESIGN.md §9).
--
-- Nothing here touches the existing contract tables; it is additive only.

-- CreateEnum
CREATE TYPE "rol_usuario" AS ENUM ('tecnico', 'oficina', 'admin');

-- CreateEnum
CREATE TYPE "motivo_revocacion_token" AS ENUM ('rotacion', 'cierre_de_sesion', 'reuso_detectado', 'usuario_inactivo');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" TEXT NOT NULL,
    "nombre_usuario" TEXT NOT NULL,
    "nombre_completo" TEXT NOT NULL,
    "rol" "rol_usuario" NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "hash_contrasena" TEXT NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
-- The plaintext refresh token is never stored: only "token_hash", the SHA-256
-- of it. A database dump therefore does not hand an attacker a working session
-- on every tablet in the fleet, and revoking one lost device is a row update
-- rather than a rotation of the JWT secret that would sign out everybody.
CREATE TABLE "usuario_tokens_refresco" (
    "id" TEXT NOT NULL,
    "usuario_id" TEXT NOT NULL,
    "familia_id" TEXT NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expira_en" TIMESTAMPTZ NOT NULL,
    "creado_en" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revocado_en" TIMESTAMPTZ,
    "motivo_revocacion" "motivo_revocacion_token",
    "reemplazado_por" TEXT,

    CONSTRAINT "usuario_tokens_refresco_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_nombre_usuario_key" ON "usuarios"("nombre_usuario");

-- CreateIndex
CREATE INDEX "idx_usuarios_rol" ON "usuarios"("rol");

-- CreateIndex
-- Unique as well as indexed: the refresh endpoint's only lookup is by this
-- column, and two rows sharing a digest would make "which token is this?"
-- ambiguous at exactly the moment reuse detection needs a definite answer.
CREATE UNIQUE INDEX "usuario_tokens_refresco_token_hash_key" ON "usuario_tokens_refresco"("token_hash");

-- CreateIndex
-- Family revocation is the operational move: "this tablet was lost, kill it".
CREATE INDEX "idx_tokens_refresco_familia" ON "usuario_tokens_refresco"("familia_id");

-- CreateIndex
CREATE INDEX "idx_tokens_refresco_usuario" ON "usuario_tokens_refresco"("usuario_id");

-- AddForeignKey
-- CASCADE, unlike the contract tables' RESTRICT: a refresh token is a session,
-- not evidence. Deleting a user should not be blocked by their sessions, and
-- an orphan session row would be a live credential with no owner.
ALTER TABLE "usuario_tokens_refresco" ADD CONSTRAINT "usuario_tokens_refresco_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreatePartialIndex
-- The revocation statement only ever touches live tokens
-- (revocado_en IS NULL), which is a small fraction of the table once the
-- system has been running for a while.
CREATE INDEX "idx_tokens_refresco_vivos" ON "usuario_tokens_refresco" ("familia_id")
  WHERE "revocado_en" IS NULL;

-- ConsistencyGuard
-- A revoked row must say why, and a row with a reason must be revoked. The
-- domain refuses to rehydrate a row that breaks this (TokenDeRefresco.rehidratar);
-- the constraint makes it impossible to write one in the first place.
ALTER TABLE "usuario_tokens_refresco"
  ADD CONSTRAINT "usuario_tokens_refresco_revocacion_completa"
  CHECK (("revocado_en" IS NULL) = ("motivo_revocacion" IS NULL));
