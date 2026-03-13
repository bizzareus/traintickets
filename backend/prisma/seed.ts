import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const connectionString =
  process.env.DATABASE_URL ?? 'postgresql://localhost:5432/railchart';
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

function parseTrainListFile(
  filePath: string,
): { trainNumber: string; label: string }[] {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const lines = raw
    .split(/\r?\n/)
    .map((line) =>
      line
        .trim()
        .replace(/^"|",?$/g, '')
        .trim(),
    )
    .filter(Boolean);
  return lines
    .map((label) => {
      const trainNumber = label.includes(' - ')
        ? label.split(' - ')[0].trim()
        : label.trim();
      return { trainNumber, label };
    })
    .filter(({ trainNumber }) => trainNumber.length > 0);
}

async function main() {
  const train1 = await prisma.train.upsert({
    where: { trainNumber: '12952' },
    update: {},
    create: {
      trainNumber: '12952',
      trainName: 'Paschim Express',
      originStation: 'MMCT',
      destinationStation: 'NDLS',
      departureTime: '00:25',
      arrivalTime: '16:35',
      active: true,
    },
  });

  const rules1 = [
    { stationCode: 'NDLS', chartTimeLocal: '07:00', sequenceNumber: 1 },
    { stationCode: 'KOTA', chartTimeLocal: '11:00', sequenceNumber: 2 },
    { stationCode: 'BRC', chartTimeLocal: '14:30', sequenceNumber: 3 },
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
    where: { trainNumber: '12302' },
    update: {},
    create: {
      trainNumber: '12302',
      trainName: 'Rajdhani Express',
      originStation: 'NDLS',
      destinationStation: 'HWH',
      departureTime: '16:55',
      arrivalTime: '08:35',
      active: true,
    },
  });

  const existing2 = await prisma.chartRule.findFirst({
    where: { trainId: train2.id, stationCode: 'NDLS' },
  });
  if (!existing2) {
    await prisma.chartRule.create({
      data: {
        trainId: train2.id,
        stationCode: 'NDLS',
        chartTimeLocal: '14:00',
        sequenceNumber: 1,
        active: true,
      },
    });
  }

  const schedule12958 = {
    trainNumber: '12958',
    trainName: 'SWRAN J RAJDHANI',
    stationFrom: 'NDLS',
    stationTo: 'SBIB',
    stationList: [
      {
        stationCode: 'NDLS',
        stationName: 'NEW DELHI',
        arrivalTime: '--',
        departureTime: '19:55',
        routeNumber: '1',
        haltTime: '--',
        distance: '0',
        dayCount: '1',
        stnSerialNumber: '1',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'DEC',
        stationName: 'DELHI CANTT',
        arrivalTime: '20:23',
        departureTime: '20:25',
        routeNumber: '1',
        haltTime: '02:00',
        distance: '16',
        dayCount: '1',
        stnSerialNumber: '2',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'GGN',
        stationName: 'GURGAON',
        arrivalTime: '20:41',
        departureTime: '20:43',
        routeNumber: '1',
        haltTime: '02:00',
        distance: '32',
        dayCount: '1',
        stnSerialNumber: '3',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'JP',
        stationName: 'JAIPUR JN',
        arrivalTime: '23:45',
        departureTime: '23:55',
        routeNumber: '1',
        haltTime: '10:00',
        distance: '309',
        dayCount: '1',
        stnSerialNumber: '6',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'AII',
        stationName: 'AJMER JN',
        arrivalTime: '01:35',
        departureTime: '01:40',
        routeNumber: '1',
        haltTime: '05:00',
        distance: '443',
        dayCount: '2',
        stnSerialNumber: '7',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'FA',
        stationName: 'FALNA',
        arrivalTime: '03:48',
        departureTime: '03:50',
        routeNumber: '1',
        haltTime: '02:00',
        distance: '650',
        dayCount: '2',
        stnSerialNumber: '8',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'ABR',
        stationName: 'ABU ROAD',
        arrivalTime: '04:53',
        departureTime: '05:00',
        routeNumber: '1',
        haltTime: '07:00',
        distance: '748',
        dayCount: '2',
        stnSerialNumber: '9',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'PNU',
        stationName: 'PALANPUR JN',
        arrivalTime: '05:58',
        departureTime: '06:00',
        routeNumber: '1',
        haltTime: '02:00',
        distance: '801',
        dayCount: '2',
        stnSerialNumber: '10',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'MSH',
        stationName: 'MAHESANA JN',
        arrivalTime: '06:48',
        departureTime: '06:50',
        routeNumber: '1',
        haltTime: '02:00',
        distance: '866',
        dayCount: '2',
        stnSerialNumber: '11',
        boardingDisabled: 'false',
      },
      {
        stationCode: 'SBIB',
        stationName: 'SABARMATI BG',
        arrivalTime: '08:05',
        departureTime: '--',
        routeNumber: '1',
        haltTime: '--',
        distance: '929',
        dayCount: '2',
        stnSerialNumber: '12',
        boardingDisabled: 'false',
      },
    ] as object,
  };
  await prisma.trainScheduleCache.upsert({
    where: { trainNumber: '12958' },
    update: {
      trainName: schedule12958.trainName,
      stationFrom: schedule12958.stationFrom,
      stationTo: schedule12958.stationTo,
      stationList: schedule12958.stationList,
    },
    create: schedule12958,
  });

  const trainListPath = path.join(__dirname, 'trainlist.txt');
  if (fs.existsSync(trainListPath)) {
    const entries = parseTrainListFile(trainListPath);
    const BATCH = 500;
    for (let i = 0; i < entries.length; i += BATCH) {
      const batch = entries.slice(i, i + BATCH);
      await prisma.trainList.createMany({
        data: batch,
        skipDuplicates: true,
      });
      if ((i + BATCH) % 2000 === 0 || i + BATCH >= entries.length) {
        console.log(
          `Train list: ${Math.min(i + BATCH, entries.length)}/${entries.length}...`,
        );
      }
    }
    console.log(`Train list: ${entries.length} entries seeded.`);
  } else {
    console.log('trainlist.txt not found, skipping train list seed.');
  }

  // Chart times (meta): when chart is prepared per train/station, e.g. train 29251 from NDLS at 19:54
  await prisma.trainStationChartTime.upsert({
    where: {
      trainNumber_stationCode: { trainNumber: '29251', stationCode: 'NDLS' },
    },
    create: {
      trainNumber: '29251',
      stationCode: 'NDLS',
      chartTimeLocal: '19:54',
    },
    update: { chartTimeLocal: '19:54' },
  });
  await prisma.trainStationChartTime.upsert({
    where: {
      trainNumber_stationCode: { trainNumber: '12958', stationCode: 'NDLS' },
    },
    create: {
      trainNumber: '12958',
      stationCode: 'NDLS',
      chartTimeLocal: '19:54',
    },
    update: { chartTimeLocal: '19:54' },
  });

  console.log(
    'Seed completed: trains, chart rules, schedule cache (12958), train list, chart times.',
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
