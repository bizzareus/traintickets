import { PrismaClient } from '@prisma/client';

async function main() {
  const prisma = new PrismaClient({
    datasources: {
      db: {
        url: "postgresql://postgres:postgres@localhost:5432/railchart"
      }
    }
  });

  const row = await prisma.trainStationChartTime.findUnique({
    where: {
      trainNumber_stationCode: {
        trainNumber: '12472',
        stationCode: 'SZM'
      }
    }
  });

  console.log(JSON.stringify(row, null, 2));
  await prisma.$disconnect();
}

main();
