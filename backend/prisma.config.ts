import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import { prismaConnectionUrl } from './prisma/connection-url';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    // CLI only. PrismaService keeps using DATABASE_URL for application traffic.
    url: prismaConnectionUrl(process.env),
  },
});
