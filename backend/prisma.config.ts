import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Single source of truth: DATABASE_URL. It must be a session-pooler (5432)
    // or direct connection — NOT the transaction pooler (6543), which can't run
    // migrations (DDL / advisory locks / multi-statement txns).
    url: process.env["DATABASE_URL"],
  },
});
