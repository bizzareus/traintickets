import { ShortLinkService } from './short-link.service';
import { PrismaService } from '../prisma/prisma.service';

describe('ShortLinkService', () => {
  let service: ShortLinkService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(() => {
    prisma = {
      shortLink: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;

    service = new ShortLinkService(prisma);
  });

  it('should generate a short link and save to database', async () => {
    (prisma.shortLink.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.shortLink.create as jest.Mock).mockResolvedValue({
      id: 'sl_123',
      code: 'abc1234',
      url: 'https://lastberth.com/alerts/subscribe?trainNo=11039&from=PUNE&to=NGP&date=2026-08-10',
      payload: {},
      createdAt: new Date(),
      expiresAt: null,
    });

    const shortUrl = await service.createAlertShortLink({
      trainNumber: '11039',
      trainName: 'Maharashtra Exp',
      fromStationCode: 'PUNE',
      toStationCode: 'NGP',
      journeyDate: '2026-08-10',
      classCode: 'SL',
      email: 'test@example.com',
      mobile: '9999224767',
    });

    expect(shortUrl).toMatch(/\/s\/[a-z0-9]{7}/);
    expect(prisma.shortLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: expect.any(String),
          url: expect.stringContaining('/alerts/subscribe?trainNo=11039'),
        }),
      }),
    );
  });

  it('should resolve an existing short link', async () => {
    const mockLink = {
      id: 'sl_123',
      code: 'abc1234',
      url: 'https://lastberth.com/alerts/subscribe?trainNo=11039',
      payload: { type: 'chart_alert' },
      createdAt: new Date(),
      expiresAt: null,
    };
    (prisma.shortLink.findUnique as jest.Mock).mockResolvedValue(mockLink);

    const result = await service.getShortLink('abc1234');
    expect(result).toEqual(mockLink);
  });
});
