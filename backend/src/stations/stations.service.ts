import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

const STATIONS: { code: string; name: string }[] = [
  { code: "NDLS", name: "New Delhi" },
  { code: "MMCT", name: "Mumbai Central" },
  { code: "KOTA", name: "Kota Junction" },
  { code: "BRC", name: "Vadodara Junction" },
  { code: "HWH", name: "Howrah Junction" },
  { code: "PNBE", name: "Patna Junction" },
  { code: "MAS", name: "Chennai Central" },
  { code: "SBC", name: "Bangalore City" },
];

@Injectable()
export class StationsService {
  constructor(private prisma: PrismaService) {}

  async findAll() {
    const fromDb = await this.prisma.train.findMany({
      select: { originStation: true, destinationStation: true },
    });
    const codes = new Set<string>();
    fromDb.forEach((t) => {
      codes.add(t.originStation);
      codes.add(t.destinationStation);
    });
    const list = [...STATIONS];
    codes.forEach((code) => {
      if (!list.some((s) => s.code === code)) list.push({ code, name: code });
    });
    return list;
  }
}
