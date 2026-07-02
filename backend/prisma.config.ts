import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations (DDL, advisory locks, multi-statement txns) can't run through
    // the transaction pooler (port 6543). Use DIRECT_URL — the session pooler
    // (5432) or a direct connection — for the CLI/migrate, and fall back to
    // DATABASE_URL for local dev where they're the same.
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
