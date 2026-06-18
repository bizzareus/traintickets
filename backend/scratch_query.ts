import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const q = '12958';
  const rows = await prisma.trainList.findMany({
    where: {
      OR: [
        { trainNumber: { contains: q, mode: 'insensitive' } },
        { label: { contains: q, mode: 'insensitive' } },
      ],
    },
    take: 20,
    orderBy: { label: 'asc' },
  });
  console.log(rows.length);
  console.log(rows);
}
main().catch(console.error).finally(() => prisma.$disconnect());
