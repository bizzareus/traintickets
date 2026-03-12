import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const connectionString = process.env.DATABASE_URL ?? "postgresql://localhost:5432/railchart";
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

async function main() {
  const train1 = await prisma.train.upsert({
    where: { trainNumber: "12952" },
    update: {},
    create: {
      trainNumber: "12952",
      trainName: "Paschim Express",
      originStation: "MMCT",
      destinationStation: "NDLS",
      departureTime: "00:25",
      arrivalTime: "16:35",
      active: true,
    },
  });

  const rules1 = [
    { stationCode: "NDLS", chartTimeLocal: "07:00", sequenceNumber: 1 },
    { stationCode: "KOTA", chartTimeLocal: "11:00", sequenceNumber: 2 },
    { stationCode: "BRC", chartTimeLocal: "14:30", sequenceNumber: 3 },
  ];
  for (const r of rules1) {
    const existing = await prisma.chartRule.findFirst({
      where: { trainId: train1.id, stationCode: r.stationCode },
    });
    if (!existing) {
      await prisma.chartRule.create({
        data: { trainId: train1.id, ...r, active: true },
      });
    }
  }

  const train2 = await prisma.train.upsert({
    where: { trainNumber: "12302" },
    update: {},
    create: {
      trainNumber: "12302",
      trainName: "Rajdhani Express",
      originStation: "NDLS",
      destinationStation: "HWH",
      departureTime: "16:55",
      arrivalTime: "08:35",
      active: true,
    },
  });

  const existing2 = await prisma.chartRule.findFirst({
    where: { trainId: train2.id, stationCode: "NDLS" },
  });
  if (!existing2) {
    await prisma.chartRule.create({
      data: {
        trainId: train2.id,
        stationCode: "NDLS",
        chartTimeLocal: "14:00",
        sequenceNumber: 1,
        active: true,
      },
    });
  }

  console.log("Seed completed: trains and chart rules created.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
