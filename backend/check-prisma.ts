import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
console.log('Models:', Object.keys(prisma).filter(k => !k.startsWith('_') && !k.startsWith('$')));
prisma.$disconnect();
