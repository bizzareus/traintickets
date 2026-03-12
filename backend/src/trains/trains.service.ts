import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class TrainsService {
  constructor(private prisma: PrismaService) {}

  findAll() {
    return this.prisma.train.findMany({
      where: { active: true },
      include: {
        chartRules: { where: { active: true }, orderBy: { sequenceNumber: "asc" } },
      },
    });
  }

  async findOne(id: string) {
    const train = await this.prisma.train.findUnique({
      where: { id },
      include: {
        chartRules: { where: { active: true }, orderBy: { sequenceNumber: "asc" } },
      },
    });
    if (!train) throw new NotFoundException("Train not found");
    return train;
  }
}
