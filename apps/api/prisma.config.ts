// Prisma 7 no longer loads .env files automatically, so it must be done
// explicitly here. Copy .env.example (repo root) to apps/api/.env locally —
// that file is git-ignored and must never be committed.
import "dotenv/config";
import { defineConfig, env } from "prisma/config";

type Env = {
  DATABASE_URL: string;
};

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: env<Env>("DATABASE_URL"),
  },
});
