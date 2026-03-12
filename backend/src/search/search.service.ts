import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  search(from: string, to: string, _journeyDate: string) {
    return this.prisma.train.findMany({
      where: {
        active: true,
        originStation: from.toUpperCase(),
        destinationStation: to.toUpperCase(),
      },
      include: {
        chartRules: { where: { active: true }, orderBy: { sequenceNumber: "asc" } },
      },
    });
  }
}
