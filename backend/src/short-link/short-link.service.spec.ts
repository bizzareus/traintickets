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
        update: jest.fn(),
      },
      shortLinkClick: {
        create: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
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
      clickCount: 0,
      lastClickedAt: null,
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

  it('should generate a search short link with query and channel payload', async () => {
    (prisma.shortLink.findUnique as jest.Mock).mockResolvedValue(null);
    (prisma.shortLink.create as jest.Mock).mockResolvedValue({
      id: 'sl_456',
      code: 'xyz9876',
      url: 'https://lastberth.com/search?from=UMB&to=BDTS&date=2026-08-29&trainNo=12472',
      payload: {
        type: 'search_redirect',
        from: 'UMB',
        to: 'BDTS',
        date: '2026-08-29',
        trainNo: '12472',
        channel: 'whatsapp',
        recipient: '919876543210',
      },
      clickCount: 0,
      lastClickedAt: null,
      createdAt: new Date(),
      expiresAt: null,
    });

    const shortUrl = await service.createSearchShortLink({
      from: 'UMB',
      to: 'BDTS',
      date: '2026-08-29',
      trainNo: '12472',
      channel: 'whatsapp',
      recipient: '919876543210',
    });

    expect(shortUrl).toMatch(/\/s\/[a-z0-9]{7}/);
    expect(prisma.shortLink.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          code: expect.any(String),
          url: expect.stringContaining(
            '/search?from=UMB&to=BDTS&date=2026-08-29',
          ),
          payload: expect.objectContaining({
            type: 'search_redirect',
            channel: 'whatsapp',
            recipient: '919876543210',
          }),
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
      clickCount: 0,
      lastClickedAt: null,
      createdAt: new Date(),
      expiresAt: null,
    };
    (prisma.shortLink.findUnique as jest.Mock).mockResolvedValue(mockLink);

    const result = await service.getShortLink('abc1234');
    expect(result).toEqual(mockLink);
  });

  it('should record click with user agent, IP, and increment count', async () => {
    const mockLink = {
      id: 'sl_123',
      code: 'abc1234',
      url: 'https://lastberth.com/search?from=UMB&to=BDTS',
      payload: { type: 'search_redirect' },
      clickCount: 2,
      lastClickedAt: new Date(),
      createdAt: new Date(),
      expiresAt: null,
    };
    (prisma.shortLink.findUnique as jest.Mock).mockResolvedValue(mockLink);
    (prisma.shortLink.update as jest.Mock).mockResolvedValue({
      ...mockLink,
      clickCount: 3,
      lastClickedAt: new Date(),
    });
    (prisma.shortLinkClick.create as jest.Mock).mockResolvedValue({
      id: 'click_1',
      shortLinkId: 'sl_123',
      clickedAt: new Date(),
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      ipAddress: '203.0.113.195',
      referer: 'https://web.whatsapp.com/',
      metadata: {},
    });

    const result = await service.recordClick('abc1234', {
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
      ipAddress: '203.0.113.195, 10.0.0.1',
      referer: 'https://web.whatsapp.com/',
    });

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.shortLink.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'sl_123' },
        data: expect.objectContaining({
          clickCount: { increment: 1 },
        }),
      }),
    );
    expect(prisma.shortLinkClick.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          shortLinkId: 'sl_123',
          userAgent: expect.stringContaining('iPhone'),
          ipAddress: '203.0.113.195',
          referer: 'https://web.whatsapp.com/',
        }),
      }),
    );
    expect(result.clickCount).toBe(3);
  });
});
