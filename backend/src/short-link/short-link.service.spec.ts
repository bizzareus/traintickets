/* eslint-disable @typescript-eslint/unbound-method */
import { ShortLinkService, parseUserAgent } from './short-link.service';
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
        count: jest.fn(),
        findMany: jest.fn(),
      },
      shortLinkClick: {
        create: jest.fn(),
        count: jest.fn(),
        findMany: jest.fn(),
      },
      user: {
        findMany: jest.fn(),
      },
      $transaction: jest.fn((promises) => Promise.all(promises)),
      $queryRaw: jest.fn(),
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
    expect(result.clickCount).toBe(3);
  });

  it('should parse user agent into browser, os, and device', () => {
    const iphone = parseUserAgent(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 WhatsApp/24.1.75',
    );
    expect(iphone.os).toBe('iOS');
    expect(iphone.deviceType).toBe('mobile');
    expect(iphone.browser).toBe('WhatsApp In-App');

    const chromeMac = parseUserAgent(
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    );
    expect(chromeMac.os).toBe('macOS');
    expect(chromeMac.deviceType).toBe('desktop');
    expect(chromeMac.browser).toBe('Google Chrome');
  });

  it('should return admin overview statistics and daily trends', async () => {
    (prisma.shortLink.count as jest.Mock)
      .mockResolvedValueOnce(10) // totalLinks
      .mockResolvedValueOnce(6); // clickedLinksCount
    (prisma.shortLinkClick.count as jest.Mock)
      .mockResolvedValueOnce(25) // totalClicks
      .mockResolvedValueOnce(3) // recentClicks24h
      .mockResolvedValueOnce(15); // recentClicks7d
    (prisma.shortLink.findMany as jest.Mock).mockResolvedValueOnce([
      {
        id: '1',
        payload: {
          type: 'search_redirect',
          email: 'user1@example.com',
          channel: 'email',
        },
        clickCount: 2,
        createdAt: new Date(),
      },
      {
        id: '2',
        payload: {
          type: 'chart_alert',
          mobile: '919876543210',
          channel: 'whatsapp',
        },
        clickCount: 4,
        createdAt: new Date(),
      },
    ]);
    (prisma.shortLinkClick.findMany as jest.Mock).mockResolvedValueOnce([
      {
        clickedAt: new Date(),
        shortLink: {
          payload: {
            type: 'search_redirect',
            channel: 'email',
          },
        },
      },
    ]);

    const result = await service.getAdminOverview();
    expect(result.summary.totalLinks).toBe(10);
    expect(result.summary.totalClicks).toBe(25);
    expect(result.summary.clickedLinksCount).toBe(6);
    expect(result.summary.clickThroughRate).toBe(60);
    expect(result.summary.uniqueUsersCount).toBe(2);
    expect(Array.isArray(result.dailyTrends)).toBe(true);
  });

  it('should return formatted clicks with user and device details', async () => {
    (prisma.shortLinkClick.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'click_1',
        shortLinkId: 'sl_1',
        clickedAt: new Date(),
        userAgent:
          'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Mobile/15E148 WhatsApp/2.23',
        ipAddress: '103.21.244.2',
        referer: 'https://web.whatsapp.com',
        metadata: {},
        shortLink: {
          id: 'sl_1',
          code: 'train12',
          url: 'https://lastberth.com/search?from=NDLS&to=MMCT',
          clickCount: 1,
          createdAt: new Date(),
          payload: {
            type: 'search_redirect',
            recipient: '919876543210',
            channel: 'whatsapp',
            trainNo: '12952',
            from: 'NDLS',
            to: 'MMCT',
          },
        },
      },
    ]);
    (prisma.shortLinkClick.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { name: 'Rahul Sharma', email: null, phone: '919876543210' },
    ]);

    const result = await service.getAdminClicks({ page: 1, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.clicks).toHaveLength(1);
    expect(result.clicks[0].user.name).toBe('Rahul Sharma');
    expect(result.clicks[0].user.mobile).toBe('919876543210');
    expect(result.clicks[0].device.deviceType).toBe('mobile');
    expect(result.clicks[0].trainContext.trainNumber).toBe('12952');
  });

  it('should return formatted short links with click breakdown', async () => {
    (prisma.shortLink.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sl_1',
        code: 'alert01',
        url: 'https://lastberth.com/alerts/subscribe?trainNo=12002',
        clickCount: 5,
        createdAt: new Date(),
        lastClickedAt: new Date(),
        expiresAt: null,
        payload: {
          type: 'chart_alert',
          email: 'kartik@example.com',
          trainNumber: '12002',
          fromStationCode: 'NDLS',
          toStationCode: 'BPL',
        },
        clicks: [],
      },
    ]);
    (prisma.shortLink.count as jest.Mock).mockResolvedValue(1);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([
      { name: 'Kartik', email: 'kartik@example.com', phone: null },
    ]);

    const result = await service.getAdminLinks({ page: 1, limit: 10 });
    expect(result.total).toBe(1);
    expect(result.links).toHaveLength(1);
    expect(result.links[0].user.email).toBe('kartik@example.com');
    expect(result.links[0].user.name).toBe('Kartik');
    expect(result.links[0].trainContext.fromStation).toBe('NDLS');
  });

  it('should return aggregated user attribution', async () => {
    (prisma.shortLink.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'sl_1',
        code: 'u1_link1',
        clickCount: 3,
        createdAt: new Date(),
        lastClickedAt: new Date(),
        payload: {
          email: 'user@test.com',
          channel: 'email',
          trainNumber: '12951',
          fromStationCode: 'MMCT',
          toStationCode: 'NDLS',
        },
        clicks: [{ clickedAt: new Date(), userAgent: 'Mozilla/5.0' }],
      },
      {
        id: 'sl_2',
        code: 'u1_link2',
        clickCount: 0,
        createdAt: new Date(),
        lastClickedAt: null,
        payload: {
          email: 'user@test.com',
          channel: 'email',
          trainNumber: '12952',
        },
        clicks: [],
      },
    ]);
    (prisma.user.findMany as jest.Mock).mockResolvedValue([]);

    const result = await service.getAdminUsers();
    expect(result.totalUsers).toBe(1);
    expect(result.users[0].email).toBe('user@test.com');
    expect(result.users[0].totalLinks).toBe(2);
    expect(result.users[0].totalClicks).toBe(3);
    expect(result.users[0].clickedLinksCount).toBe(1);
    expect(result.users[0].clickRate).toBe(50);
  });

  it('should return aggregated day-on-day stats with created and clicked metrics', async () => {
    (prisma.$queryRaw as jest.Mock).mockResolvedValue([
      {
        date: '2026-08-28',
        total_links_created: 10,
        links_with_clicks: 4,
        search_links_created: 6,
        alert_links_created: 4,
        total_clicks: 15,
        unique_links_clicked: 4,
        unique_click_ips: 12,
        whatsapp_clicks: 10,
        email_clicks: 5,
      },
      {
        date: '2026-08-29',
        total_links_created: 20,
        links_with_clicks: 8,
        search_links_created: 12,
        alert_links_created: 8,
        total_clicks: 25,
        unique_links_clicked: 7,
        unique_click_ips: 18,
        whatsapp_clicks: 15,
        email_clicks: 10,
      },
    ]);

    const result = await service.getAdminDailyStats({
      groupBy: 'day',
      startDate: '2026-08-28',
      endDate: '2026-08-29',
    });

    expect(result.groupBy).toBe('day');
    expect(result.dailyStats).toHaveLength(2);
    expect(result.dailyStats[0].totalLinksCreated).toBe(10);
    expect(result.dailyStats[0].totalClicks).toBe(15);
    expect(result.dailyStats[0].createdChange).toBeNull();
    expect(result.dailyStats[1].totalLinksCreated).toBe(20);
    expect(result.dailyStats[1].createdChange).toBe(10);
    expect(result.dailyStats[1].createdGrowthPct).toBe(100);
    expect(result.dailyStats[1].clicksChange).toBe(10);
    expect(result.dailyStats[1].clicksGrowthPct).toBe(66.67);

    expect(result.summary.totalLinksCreated).toBe(30);
    expect(result.summary.totalClicks).toBe(40);
    expect(result.summary.totalWhatsappClicks).toBe(25);
    expect(result.summary.totalEmailClicks).toBe(15);
    expect(result.summary.overallCtrPct).toBe(133.33);
    expect(result.summary.avgLinksCreatedPerPeriod).toBe(15);
    expect(result.summary.avgClicksPerPeriod).toBe(20);
    expect(result.summary.peakCreationDay).toEqual({
      date: '2026-08-29',
      count: 20,
    });
    expect(result.summary.peakClickDay).toEqual({
      date: '2026-08-29',
      count: 25,
    });
  });
});
