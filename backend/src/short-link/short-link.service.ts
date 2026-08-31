import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import * as crypto from 'crypto';
export type AlertShortLinkPayload = {
  type: 'chart_alert';
  trainNumber: string;
  trainName?: string;
  fromStationCode: string;
  toStationCode: string;
  journeyDate: string;
  classCode?: string;
  email?: string;
  mobile?: string;
};

export type SearchShortLinkPayload = {
  type: 'search_redirect';
  from: string;
  to: string;
  date: string;
  trainNo?: string;
  channel?: 'whatsapp' | 'email';
  recipient?: string;
  [key: string]: unknown;
};

export type ShortLinkClickMeta = {
  userAgent?: string;
  ipAddress?: string;
  referer?: string;
  metadata?: Record<string, unknown>;
};

export type ResolvedLinkUser = {
  email: string | null;
  mobile: string | null;
  name: string | null;
  channel: string | null;
  recipient: string | null;
};

export type ResolvedLinkTrainContext = {
  trainNumber: string | null;
  trainName: string | null;
  fromStation: string | null;
  toStation: string | null;
  journeyDate: string | null;
  classCode: string | null;
  notificationType: string | null;
};

export type ParsedUserAgent = {
  browser: string;
  os: string;
  deviceType: 'mobile' | 'desktop' | 'tablet' | 'bot';
};

export function parseUserAgent(ua?: string | null): ParsedUserAgent {
  if (!ua) {
    return { browser: 'Unknown', os: 'Unknown', deviceType: 'desktop' };
  }
  const s = ua.toLowerCase();

  // OS detection
  let os = 'Unknown OS';
  if (/iphone|ipad|ipod/.test(s)) os = 'iOS';
  else if (/android/.test(s)) os = 'Android';
  else if (/macintosh|mac os x/.test(s)) os = 'macOS';
  else if (/windows nt/.test(s)) os = 'Windows';
  else if (/linux/.test(s)) os = 'Linux';

  // Device detection
  let deviceType: 'mobile' | 'desktop' | 'tablet' | 'bot' = 'desktop';
  if (/ipad|tablet|(android(?!.*mobile))/.test(s)) {
    deviceType = 'tablet';
  } else if (
    /mobile|iphone|ipod|android|blackberry|iemobile|opera mini/.test(s)
  ) {
    deviceType = 'mobile';
  }

  // Browser detection
  let browser = 'Unknown Browser';
  if (/whatsapp/.test(s)) browser = 'WhatsApp In-App';
  else if (/instagram/.test(s)) browser = 'Instagram In-App';
  else if (/fban|fbav/.test(s)) browser = 'Facebook In-App';
  else if (/edg\//.test(s)) browser = 'Microsoft Edge';
  else if (/opr\/|opera/.test(s)) browser = 'Opera';
  else if (/chrome|crios/.test(s) && !/edg\//.test(s))
    browser = 'Google Chrome';
  else if (/safari/.test(s) && !/chrome|crios/.test(s)) browser = 'Safari';
  else if (/firefox|fxios/.test(s)) browser = 'Firefox';

  if (
    /(bot|crawler|spider|slurp|facebookexternalhit|preview|curl|wget)/.test(
      s,
    ) &&
    !s.includes('mobile')
  ) {
    deviceType = 'bot';
    browser = 'Bot / Preview Crawler';
  }

  return { browser, os, deviceType };
}

@Injectable()
export class ShortLinkService {
  private readonly logger = new Logger(ShortLinkService.name);

  constructor(private readonly prisma: PrismaService) {}

  private generateCode(): string {
    return crypto.randomBytes(4).toString('hex').slice(0, 7);
  }

  private resolveLinkAttributes(
    payloadRaw: unknown,
    userNameMap?: Map<string, string>,
  ): { user: ResolvedLinkUser; trainContext: ResolvedLinkTrainContext } {
    const payload =
      typeof payloadRaw === 'object' && payloadRaw !== null
        ? (payloadRaw as Record<string, unknown>)
        : {};

    const rawEmail =
      typeof payload.email === 'string' && payload.email.trim()
        ? payload.email.trim()
        : typeof payload.recipient === 'string' &&
            payload.recipient.includes('@')
          ? payload.recipient.trim()
          : null;

    const rawMobile =
      typeof payload.mobile === 'string' && payload.mobile.trim()
        ? payload.mobile.trim()
        : typeof payload.recipient === 'string' &&
            !payload.recipient.includes('@') &&
            /\d{7,}/.test(payload.recipient)
          ? payload.recipient.trim()
          : null;

    const matchedName =
      (rawEmail ? userNameMap?.get(rawEmail.toLowerCase()) : null) ||
      (rawMobile ? userNameMap?.get(rawMobile.replace(/\D/g, '')) : null) ||
      (typeof payload.name === 'string' && payload.name.trim()
        ? payload.name.trim()
        : null);

    const channel =
      typeof payload.channel === 'string' && payload.channel.trim()
        ? payload.channel.trim().toLowerCase()
        : rawMobile
          ? 'whatsapp'
          : rawEmail
            ? 'email'
            : null;

    const user: ResolvedLinkUser = {
      email: rawEmail,
      mobile: rawMobile,
      name: matchedName,
      channel,
      recipient:
        typeof payload.recipient === 'string' ? payload.recipient : null,
    };

    const trainNumber =
      typeof payload.trainNumber === 'string' && payload.trainNumber.trim()
        ? payload.trainNumber.trim()
        : typeof payload.trainNo === 'string' && payload.trainNo.trim()
          ? payload.trainNo.trim()
          : null;

    const trainName =
      typeof payload.trainName === 'string' && payload.trainName.trim()
        ? payload.trainName.trim()
        : null;

    const fromStation =
      typeof payload.fromStationCode === 'string' &&
      payload.fromStationCode.trim()
        ? payload.fromStationCode.trim().toUpperCase()
        : typeof payload.from === 'string' && payload.from.trim()
          ? payload.from.trim().toUpperCase()
          : null;

    const toStation =
      typeof payload.toStationCode === 'string' && payload.toStationCode.trim()
        ? payload.toStationCode.trim().toUpperCase()
        : typeof payload.to === 'string' && payload.to.trim()
          ? payload.to.trim().toUpperCase()
          : null;

    const journeyDate =
      typeof payload.journeyDate === 'string' && payload.journeyDate.trim()
        ? payload.journeyDate.trim().slice(0, 10)
        : typeof payload.date === 'string' && payload.date.trim()
          ? payload.date.trim().slice(0, 10)
          : null;

    const classCode =
      typeof payload.classCode === 'string' && payload.classCode.trim()
        ? payload.classCode.trim().toUpperCase()
        : typeof payload.class === 'string' && payload.class.trim()
          ? payload.class.trim().toUpperCase()
          : null;

    const notificationType =
      typeof payload.notificationType === 'string' &&
      payload.notificationType.trim()
        ? payload.notificationType.trim()
        : typeof payload.type === 'string' && payload.type === 'chart_alert'
          ? 'chart_alert_subscription'
          : null;

    const trainContext: ResolvedLinkTrainContext = {
      trainNumber,
      trainName,
      fromStation,
      toStation,
      journeyDate,
      classCode,
      notificationType,
    };

    return { user, trainContext };
  }

  private async buildUserNameMap(
    emails: string[],
    mobiles: string[],
  ): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const cleanEmails = Array.from(
      new Set(emails.filter(Boolean).map((e) => e.toLowerCase())),
    );
    const cleanMobiles = Array.from(
      new Set(mobiles.filter(Boolean).map((m) => m.replace(/\D/g, ''))),
    );

    if (cleanEmails.length === 0 && cleanMobiles.length === 0) {
      return map;
    }

    try {
      const users = await this.prisma.user.findMany({
        where: {
          OR: [
            ...(cleanEmails.length > 0 ? [{ email: { in: cleanEmails } }] : []),
            ...(cleanMobiles.length > 0
              ? [{ phone: { in: cleanMobiles } }]
              : []),
          ],
        },
        select: { name: true, email: true, phone: true },
      });

      for (const u of users) {
        if (u.name) {
          if (u.email) map.set(u.email.toLowerCase(), u.name);
          if (u.phone) map.set(u.phone.replace(/\D/g, ''), u.name);
        }
      }
    } catch (err) {
      this.logger.warn(
        `Failed to resolve user names: ${err instanceof Error ? err.message : String(err)}`,
      );
    }

    return map;
  }

  /**
   * Creates a tracked short URL pointing to an arbitrary destination URL.
   */
  async createShortLink(params: {
    url: string;
    payload?: Record<string, unknown>;
    expiresAt?: Date;
  }): Promise<string> {
    const { url, payload, expiresAt } = params;
    let code = this.generateCode();
    for (let i = 0; i < 5; i++) {
      const existing = await this.prisma.shortLink.findUnique({
        where: { code },
      });
      if (!existing) break;
      code = this.generateCode();
    }

    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';

    await this.prisma.shortLink.create({
      data: {
        code,
        url,
        payload: (payload ?? {}) as object,
        expiresAt,
      },
    });

    return `${baseUrl}/s/${code}`;
  }

  /**
   * Creates a tracked short link for LastBerth train search pages.
   */
  async createSearchShortLink(params: {
    from: string;
    to: string;
    date: string;
    trainNo?: string;
    channel?: 'whatsapp' | 'email';
    recipient?: string;
    metadata?: Record<string, unknown>;
  }): Promise<string> {
    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const query = new URLSearchParams({
      from: params.from.trim().toUpperCase(),
      to: params.to.trim().toUpperCase(),
      date: params.date.trim(),
    });
    if (params.trainNo?.trim()) {
      query.set('trainNo', params.trainNo.trim());
    }

    const redirectUrl = `${baseUrl}/search?${query.toString()}`;
    const payload: SearchShortLinkPayload = {
      type: 'search_redirect',
      from: params.from,
      to: params.to,
      date: params.date,
      trainNo: params.trainNo,
      channel: params.channel,
      recipient: params.recipient,
      ...params.metadata,
    };

    return this.createShortLink({ url: redirectUrl, payload });
  }

  async createAlertShortLink(
    payload: Omit<AlertShortLinkPayload, 'type'>,
  ): Promise<string> {
    const fullPayload: AlertShortLinkPayload = {
      type: 'chart_alert',
      ...payload,
    };

    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const query = new URLSearchParams({
      trainNo: payload.trainNumber,
      from: payload.fromStationCode,
      to: payload.toStationCode,
      date: payload.journeyDate,
    });
    if (payload.trainName) query.set('trainName', payload.trainName);
    if (payload.classCode) query.set('class', payload.classCode);
    if (payload.email) query.set('email', payload.email);
    if (payload.mobile) query.set('mobile', payload.mobile);

    const redirectUrl = `${baseUrl}/alerts/subscribe?${query.toString()}`;
    return this.createShortLink({ url: redirectUrl, payload: fullPayload });
  }

  async getShortLink(code: string) {
    const link = await this.prisma.shortLink.findUnique({
      where: { code },
    });
    if (!link) {
      throw new NotFoundException('Short link not found');
    }
    return link;
  }

  /**
   * Resolves a short link and records the click event in the database.
   */
  async recordClick(code: string, meta?: ShortLinkClickMeta) {
    const link = await this.prisma.shortLink.findUnique({
      where: { code },
    });
    if (!link) {
      throw new NotFoundException('Short link not found');
    }

    const now = new Date();
    const cleanIp = meta?.ipAddress
      ? String(meta.ipAddress).split(',')[0].trim()
      : undefined;

    try {
      const [updatedLink] = await this.prisma.$transaction([
        this.prisma.shortLink.update({
          where: { id: link.id },
          data: {
            clickCount: { increment: 1 },
            lastClickedAt: now,
          },
        }),
        this.prisma.shortLinkClick.create({
          data: {
            shortLinkId: link.id,
            clickedAt: now,
            userAgent: meta?.userAgent?.slice(0, 500),
            ipAddress: cleanIp?.slice(0, 100),
            referer: meta?.referer?.slice(0, 500),
            metadata: (meta?.metadata ?? {}) as object,
          },
        }),
      ]);

      return updatedLink;
    } catch (err) {
      this.logger.warn(
        `Failed to record click for short link ${code}: ${err instanceof Error ? err.message : String(err)}`,
      );
      return link;
    }
  }

  /**
   * ADMIN: High-level KPI metrics and activity breakdown.
   */
  async getAdminOverview(params?: { startDate?: string; endDate?: string }) {
    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const now = new Date();
    const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const past7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const dateFilter =
      params?.startDate || params?.endDate
        ? {
            createdAt: {
              ...(params.startDate
                ? { gte: new Date(`${params.startDate}T00:00:00.000Z`) }
                : {}),
              ...(params.endDate
                ? { lte: new Date(`${params.endDate}T23:59:59.999Z`) }
                : {}),
            },
          }
        : {};

    const [
      totalLinks,
      totalClicks,
      clickedLinksCount,
      recentClicks24h,
      recentClicks7d,
      allLinksWithPayload,
      allClicksWithShortLink,
    ] = await Promise.all([
      this.prisma.shortLink.count({ where: dateFilter }),
      this.prisma.shortLinkClick.count({
        where:
          params?.startDate || params?.endDate
            ? {
                clickedAt: {
                  ...(params.startDate
                    ? { gte: new Date(`${params.startDate}T00:00:00.000Z`) }
                    : {}),
                  ...(params.endDate
                    ? { lte: new Date(`${params.endDate}T23:59:59.999Z`) }
                    : {}),
                },
              }
            : {},
      }),
      this.prisma.shortLink.count({
        where: {
          ...dateFilter,
          clickCount: { gt: 0 },
        },
      }),
      this.prisma.shortLinkClick.count({
        where: { clickedAt: { gte: past24h } },
      }),
      this.prisma.shortLinkClick.count({
        where: { clickedAt: { gte: past7d } },
      }),
      this.prisma.shortLink.findMany({
        where: dateFilter,
        select: { id: true, payload: true, clickCount: true, createdAt: true },
      }),
      this.prisma.shortLinkClick.findMany({
        where: {
          clickedAt: {
            gte: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
          },
        },
        select: { clickedAt: true, shortLink: { select: { payload: true } } },
        orderBy: { clickedAt: 'asc' },
      }),
    ]);

    // Unique users / recipients
    const uniqueUsersSet = new Set<string>();
    const clicksByChannel = { whatsapp: 0, email: 0, direct: 0 };
    const linksByType = { search_redirect: 0, chart_alert: 0, other: 0 };

    for (const link of allLinksWithPayload) {
      const { user } = this.resolveLinkAttributes(link.payload);
      const userKey = user.email || user.mobile;
      if (userKey) uniqueUsersSet.add(userKey);

      const typeKey = (link.payload as Record<string, unknown>)?.type;
      if (typeKey === 'search_redirect') linksByType.search_redirect++;
      else if (typeKey === 'chart_alert') linksByType.chart_alert++;
      else linksByType.other++;
    }

    // Daily trends for last 14 days
    const dailyMap = new Map<
      string,
      { date: string; clicks: number; whatsapp: number; email: number }
    >();
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      dailyMap.set(key, { date: key, clicks: 0, whatsapp: 0, email: 0 });
    }

    for (const c of allClicksWithShortLink) {
      const dateKey = c.clickedAt.toISOString().slice(0, 10);
      const entry = dailyMap.get(dateKey);
      const { user } = this.resolveLinkAttributes(c.shortLink?.payload);
      if (user.channel === 'whatsapp') clicksByChannel.whatsapp++;
      else if (user.channel === 'email') clicksByChannel.email++;
      else clicksByChannel.direct++;

      if (entry) {
        entry.clicks++;
        if (user.channel === 'whatsapp') entry.whatsapp++;
        else if (user.channel === 'email') entry.email++;
      }
    }

    const clickThroughRate =
      totalLinks > 0
        ? Math.round((clickedLinksCount / totalLinks) * 1000) / 10
        : 0;

    return {
      baseUrl,
      summary: {
        totalLinks,
        totalClicks,
        clickedLinksCount,
        unclickedLinksCount: Math.max(0, totalLinks - clickedLinksCount),
        clickThroughRate,
        uniqueUsersCount: uniqueUsersSet.size,
        recentClicks24h,
        recentClicks7d,
        clicksByChannel,
        linksByType,
      },
      dailyTrends: Array.from(dailyMap.values()),
    };
  }

  /**
   * ADMIN: Day-on-day link generation & click performance analytics.
   */
  async getAdminDailyStats(params?: {
    groupBy?: 'day' | 'week' | 'month';
    startDate?: string;
    endDate?: string;
  }) {
    const groupBy = params?.groupBy || 'day';
    const startDate = params?.startDate;
    const endDate = params?.endDate;

    const periodSqlCreated =
      groupBy === 'week'
        ? Prisma.sql`DATE_TRUNC('week', sl.created_at AT TIME ZONE 'Asia/Kolkata')::date::text`
        : groupBy === 'month'
          ? Prisma.sql`DATE_TRUNC('month', sl.created_at AT TIME ZONE 'Asia/Kolkata')::date::text`
          : Prisma.sql`DATE(sl.created_at AT TIME ZONE 'Asia/Kolkata')::text`;

    const periodSqlClicked =
      groupBy === 'week'
        ? Prisma.sql`DATE_TRUNC('week', slc.clicked_at AT TIME ZONE 'Asia/Kolkata')::date::text`
        : groupBy === 'month'
          ? Prisma.sql`DATE_TRUNC('month', slc.clicked_at AT TIME ZONE 'Asia/Kolkata')::date::text`
          : Prisma.sql`DATE(slc.clicked_at AT TIME ZONE 'Asia/Kolkata')::text`;

    const createdWhere =
      startDate && endDate
        ? Prisma.sql`WHERE sl.created_at >= ${startDate}::timestamp AND sl.created_at <= (${endDate} || ' 23:59:59')::timestamp`
        : startDate
          ? Prisma.sql`WHERE sl.created_at >= ${startDate}::timestamp`
          : endDate
            ? Prisma.sql`WHERE sl.created_at <= (${endDate} || ' 23:59:59')::timestamp`
            : Prisma.empty;

    const clickedWhere =
      startDate && endDate
        ? Prisma.sql`WHERE slc.clicked_at >= ${startDate}::timestamp AND slc.clicked_at <= (${endDate} || ' 23:59:59')::timestamp`
        : startDate
          ? Prisma.sql`WHERE slc.clicked_at >= ${startDate}::timestamp`
          : endDate
            ? Prisma.sql`WHERE slc.clicked_at <= (${endDate} || ' 23:59:59')::timestamp`
            : Prisma.empty;

    const rawRows = await this.prisma.$queryRaw<
      Array<{
        date: string;
        total_links_created: number;
        links_with_clicks: number;
        search_links_created: number;
        alert_links_created: number;
        total_clicks: number;
        unique_links_clicked: number;
        unique_click_ips: number;
        whatsapp_clicks: number;
        email_clicks: number;
      }>
    >`
      WITH created_stats AS (
        SELECT 
          ${periodSqlCreated} AS date,
          COUNT(sl.id)::int AS total_links_created,
          COUNT(CASE WHEN sl.click_count > 0 THEN sl.id END)::int AS links_with_clicks,
          COUNT(CASE WHEN (sl.payload->>'type') = 'search_redirect' THEN sl.id END)::int AS search_links_created,
          COUNT(CASE WHEN (sl.payload->>'type') = 'chart_alert' THEN sl.id END)::int AS alert_links_created
        FROM "short_link" sl
        ${createdWhere}
        GROUP BY 1
      ),
      clicked_stats AS (
        SELECT 
          ${periodSqlClicked} AS date,
          COUNT(slc.id)::int AS total_clicks,
          COUNT(DISTINCT slc.short_link_id)::int AS unique_links_clicked,
          COUNT(DISTINCT COALESCE(slc.ip_address, slc.id))::int AS unique_click_ips,
          COUNT(CASE WHEN (sl.payload->>'channel') = 'whatsapp' OR (sl.payload->>'mobile') IS NOT NULL THEN slc.id END)::int AS whatsapp_clicks,
          COUNT(CASE WHEN (sl.payload->>'channel') = 'email' OR ((sl.payload->>'channel') != 'whatsapp' AND (sl.payload->>'email') IS NOT NULL) THEN slc.id END)::int AS email_clicks
        FROM "short_link_click" slc
        JOIN "short_link" sl ON slc.short_link_id = sl.id
        ${clickedWhere}
        GROUP BY 1
      )
      SELECT 
        COALESCE(c.date, k.date) AS date,
        COALESCE(c.total_links_created, 0)::int AS total_links_created,
        COALESCE(c.links_with_clicks, 0)::int AS links_with_clicks,
        COALESCE(c.search_links_created, 0)::int AS search_links_created,
        COALESCE(c.alert_links_created, 0)::int AS alert_links_created,
        COALESCE(k.total_clicks, 0)::int AS total_clicks,
        COALESCE(k.unique_links_clicked, 0)::int AS unique_links_clicked,
        COALESCE(k.unique_click_ips, 0)::int AS unique_click_ips,
        COALESCE(k.whatsapp_clicks, 0)::int AS whatsapp_clicks,
        COALESCE(k.email_clicks, 0)::int AS email_clicks
      FROM created_stats c
      FULL OUTER JOIN clicked_stats k ON c.date = k.date
      ORDER BY date ASC
    `;

    let runningCreated = 0;
    let runningClicks = 0;
    let runningWhatsappClicks = 0;
    let runningEmailClicks = 0;
    let peakCreatedCount = 0;
    let peakCreatedDate = '';
    let peakClickCount = 0;
    let peakClickDate = '';

    const formattedRows = rawRows.map((row, idx) => {
      const created = Number(row.total_links_created);
      const clicks = Number(row.total_clicks);
      const uniqueLinksClicked = Number(row.unique_links_clicked);
      const whatsappClicks = Number(row.whatsapp_clicks);
      const emailClicks = Number(row.email_clicks);
      const ctrPct =
        created > 0 ? Number(((clicks / created) * 100).toFixed(2)) : 0;

      const prevCreated =
        idx > 0 ? Number(rawRows[idx - 1].total_links_created) : null;
      const createdChange = prevCreated !== null ? created - prevCreated : null;
      const createdGrowthPct =
        prevCreated && prevCreated > 0
          ? Number((((created - prevCreated) / prevCreated) * 100).toFixed(2))
          : null;

      const prevClicks = idx > 0 ? Number(rawRows[idx - 1].total_clicks) : null;
      const clicksChange = prevClicks !== null ? clicks - prevClicks : null;
      const clicksGrowthPct =
        prevClicks && prevClicks > 0
          ? Number((((clicks - prevClicks) / prevClicks) * 100).toFixed(2))
          : null;

      runningCreated += created;
      runningClicks += clicks;
      runningWhatsappClicks += whatsappClicks;
      runningEmailClicks += emailClicks;

      if (created > peakCreatedCount) {
        peakCreatedCount = created;
        peakCreatedDate = row.date;
      }
      if (clicks > peakClickCount) {
        peakClickCount = clicks;
        peakClickDate = row.date;
      }

      return {
        date: row.date,
        totalLinksCreated: created,
        totalClicks: clicks,
        uniqueLinksClicked,
        uniqueClickIps: Number(row.unique_click_ips),
        searchLinksCreated: Number(row.search_links_created),
        alertLinksCreated: Number(row.alert_links_created),
        whatsappClicks,
        emailClicks,
        ctrPct,
        createdChange,
        createdGrowthPct,
        clicksChange,
        clicksGrowthPct,
        periodChange: createdChange,
        growthPercentage: createdGrowthPct,
      };
    });

    const totalPeriods = formattedRows.length;
    const overallCtr =
      runningCreated > 0
        ? Number(((runningClicks / runningCreated) * 100).toFixed(2))
        : 0;

    return {
      groupBy,
      dailyStats: formattedRows,
      stats: formattedRows,
      summary: {
        totalLinksCreated: runningCreated,
        totalClicks: runningClicks,
        totalWhatsappClicks: runningWhatsappClicks,
        totalEmailClicks: runningEmailClicks,
        overallCtrPct: overallCtr,
        totalDays: totalPeriods,
        totalPeriods,
        avgLinksCreatedPerPeriod:
          totalPeriods > 0
            ? Number((runningCreated / totalPeriods).toFixed(2))
            : 0,
        avgClicksPerPeriod:
          totalPeriods > 0
            ? Number((runningClicks / totalPeriods).toFixed(2))
            : 0,
        peakCreationDay: peakCreatedDate
          ? { date: peakCreatedDate, count: peakCreatedCount }
          : null,
        peakClickDay: peakClickDate
          ? { date: peakClickDate, count: peakClickCount }
          : null,
      },
    };
  }

  /**
   * ADMIN: Paginated feed of click events with rich user and train context.
   */
  async getAdminClicks(params: {
    page?: number;
    limit?: number;
    search?: string;
    channel?: string;
    code?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const page = Math.max(1, Number(params.page || 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit || 25)));
    const skip = (page - 1) * limit;

    const where: Prisma.ShortLinkClickWhereInput = {};
    if (params.code?.trim()) {
      where.shortLink = { code: params.code.trim() };
    }
    if (params.startDate || params.endDate) {
      where.clickedAt = {
        ...(params.startDate
          ? { gte: new Date(`${params.startDate}T00:00:00.000Z`) }
          : {}),
        ...(params.endDate
          ? { lte: new Date(`${params.endDate}T23:59:59.999Z`) }
          : {}),
      };
    }

    const [clicks, total] = await Promise.all([
      this.prisma.shortLinkClick.findMany({
        where,
        include: {
          shortLink: true,
        },
        orderBy: { clickedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.shortLinkClick.count({ where }),
    ]);

    // Gather emails & mobiles to resolve names
    const emails: string[] = [];
    const mobiles: string[] = [];
    for (const c of clicks) {
      const payload = c.shortLink?.payload as Record<string, unknown> | null;
      if (typeof payload?.email === 'string') emails.push(payload.email);
      if (typeof payload?.mobile === 'string') mobiles.push(payload.mobile);
      if (typeof payload?.recipient === 'string') {
        if (payload.recipient.includes('@')) emails.push(payload.recipient);
        else mobiles.push(payload.recipient);
      }
    }

    const userNameMap = await this.buildUserNameMap(emails, mobiles);

    const formattedClicks = clicks.map((c) => {
      const link = c.shortLink;
      const { user, trainContext } = this.resolveLinkAttributes(
        link?.payload,
        userNameMap,
      );
      const parsedDevice = parseUserAgent(c.userAgent);

      return {
        id: c.id,
        clickedAt: c.clickedAt.toISOString(),
        ipAddress: c.ipAddress || null,
        userAgent: c.userAgent || null,
        referer: c.referer || null,
        device: parsedDevice,
        shortLink: link
          ? {
              id: link.id,
              code: link.code,
              shortUrl: `${baseUrl}/s/${link.code}`,
              targetUrl: link.url,
              clickCount: link.clickCount,
              createdAt: link.createdAt.toISOString(),
            }
          : null,
        user,
        trainContext,
      };
    });

    // If search or channel filter applied client-side criteria that wasn't in SQL
    let filtered = formattedClicks;
    if (params.channel?.trim()) {
      const targetChannel = params.channel.trim().toLowerCase();
      filtered = filtered.filter((item) => item.user.channel === targetChannel);
    }
    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.user.email?.toLowerCase().includes(q) ||
          item.user.mobile?.includes(q) ||
          item.user.name?.toLowerCase().includes(q) ||
          item.trainContext.trainNumber?.toLowerCase().includes(q) ||
          item.trainContext.trainName?.toLowerCase().includes(q) ||
          item.shortLink?.code.toLowerCase().includes(q) ||
          item.ipAddress?.includes(q),
      );
    }

    return {
      clicks: filtered,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * ADMIN: Paginated directory of short links with click counts, recipient info, and recent clicks.
   */
  async getAdminLinks(params: {
    page?: number;
    limit?: number;
    search?: string;
    filter?: 'all' | 'clicked' | 'unclicked';
    channel?: string;
    type?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const baseUrl = process.env.FRONTEND_URL || 'https://lastberth.com';
    const page = Math.max(1, Number(params.page || 1));
    const limit = Math.min(100, Math.max(1, Number(params.limit || 25)));
    const skip = (page - 1) * limit;

    const where: Prisma.ShortLinkWhereInput = {};
    if (params.filter === 'clicked') {
      where.clickCount = { gt: 0 };
    } else if (params.filter === 'unclicked') {
      where.clickCount = 0;
    }
    if (params.startDate || params.endDate) {
      where.createdAt = {
        ...(params.startDate
          ? { gte: new Date(`${params.startDate}T00:00:00.000Z`) }
          : {}),
        ...(params.endDate
          ? { lte: new Date(`${params.endDate}T23:59:59.999Z`) }
          : {}),
      };
    }

    const [links, total] = await Promise.all([
      this.prisma.shortLink.findMany({
        where,
        include: {
          clicks: {
            take: 5,
            orderBy: { clickedAt: 'desc' },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.shortLink.count({ where }),
    ]);

    const emails: string[] = [];
    const mobiles: string[] = [];
    for (const l of links) {
      const payload = l.payload as Record<string, unknown> | null;
      if (typeof payload?.email === 'string') emails.push(payload.email);
      if (typeof payload?.mobile === 'string') mobiles.push(payload.mobile);
      if (typeof payload?.recipient === 'string') {
        if (payload.recipient.includes('@')) emails.push(payload.recipient);
        else mobiles.push(payload.recipient);
      }
    }

    const userNameMap = await this.buildUserNameMap(emails, mobiles);

    const formattedLinks = links.map((link) => {
      const { user, trainContext } = this.resolveLinkAttributes(
        link.payload,
        userNameMap,
      );
      const payloadType =
        (link.payload as Record<string, unknown>)?.type || 'generic';

      const recentClicks = link.clicks.map((c) => ({
        id: c.id,
        clickedAt: c.clickedAt.toISOString(),
        ipAddress: c.ipAddress || null,
        device: parseUserAgent(c.userAgent),
        referer: c.referer || null,
      }));

      return {
        id: link.id,
        code: link.code,
        shortUrl: `${baseUrl}/s/${link.code}`,
        targetUrl: link.url,
        type: payloadType,
        clickCount: link.clickCount,
        createdAt: link.createdAt.toISOString(),
        lastClickedAt: link.lastClickedAt?.toISOString() || null,
        expiresAt: link.expiresAt?.toISOString() || null,
        user,
        trainContext,
        recentClicks,
      };
    });

    let filtered = formattedLinks;
    if (params.channel?.trim()) {
      const targetChannel = params.channel.trim().toLowerCase();
      filtered = filtered.filter((item) => item.user.channel === targetChannel);
    }
    if (params.type?.trim() && params.type !== 'all') {
      filtered = filtered.filter((item) => item.type === params.type);
    }
    if (params.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      filtered = filtered.filter(
        (item) =>
          item.code.toLowerCase().includes(q) ||
          item.user.email?.toLowerCase().includes(q) ||
          item.user.mobile?.includes(q) ||
          item.user.name?.toLowerCase().includes(q) ||
          item.trainContext.trainNumber?.toLowerCase().includes(q) ||
          item.targetUrl?.toLowerCase().includes(q),
      );
    }

    return {
      links: filtered,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * ADMIN: User attribution aggregated view showing who clicked what.
   */
  async getAdminUsers(params?: {
    search?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const where: Prisma.ShortLinkWhereInput = {};
    if (params?.startDate || params?.endDate) {
      where.createdAt = {
        ...(params.startDate
          ? { gte: new Date(`${params.startDate}T00:00:00.000Z`) }
          : {}),
        ...(params.endDate
          ? { lte: new Date(`${params.endDate}T23:59:59.999Z`) }
          : {}),
      };
    }

    const links = await this.prisma.shortLink.findMany({
      where,
      include: {
        clicks: {
          orderBy: { clickedAt: 'desc' },
          select: { clickedAt: true, userAgent: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const emails: string[] = [];
    const mobiles: string[] = [];
    for (const l of links) {
      const payload = l.payload as Record<string, unknown> | null;
      if (typeof payload?.email === 'string') emails.push(payload.email);
      if (typeof payload?.mobile === 'string') mobiles.push(payload.mobile);
      if (typeof payload?.recipient === 'string') {
        if (payload.recipient.includes('@')) emails.push(payload.recipient);
        else mobiles.push(payload.recipient);
      }
    }

    const userNameMap = await this.buildUserNameMap(emails, mobiles);

    type UserAggregate = {
      key: string;
      email: string | null;
      mobile: string | null;
      name: string | null;
      channels: Set<string>;
      totalLinks: number;
      totalClicks: number;
      clickedLinksCount: number;
      firstSeenAt: string;
      lastClickedAt: string | null;
      trains: Set<string>;
    };

    const userMap = new Map<string, UserAggregate>();

    for (const link of links) {
      const { user, trainContext } = this.resolveLinkAttributes(
        link.payload,
        userNameMap,
      );
      const userKey = user.email || user.mobile || 'anonymous';
      let record = userMap.get(userKey);
      if (!record) {
        record = {
          key: userKey,
          email: user.email,
          mobile: user.mobile,
          name: user.name,
          channels: new Set<string>(),
          totalLinks: 0,
          totalClicks: 0,
          clickedLinksCount: 0,
          firstSeenAt: link.createdAt.toISOString(),
          lastClickedAt: null,
          trains: new Set<string>(),
        };
        userMap.set(userKey, record);
      }

      if (user.channel) record.channels.add(user.channel);
      if (trainContext.trainNumber) {
        const route =
          trainContext.fromStation && trainContext.toStation
            ? `${trainContext.trainNumber} (${trainContext.fromStation}→${trainContext.toStation})`
            : trainContext.trainNumber;
        record.trains.add(route);
      }

      record.totalLinks++;
      record.totalClicks += link.clickCount;
      if (link.clickCount > 0) record.clickedLinksCount++;

      if (link.lastClickedAt) {
        const linkLastClickedIso = link.lastClickedAt.toISOString();
        if (
          !record.lastClickedAt ||
          new Date(linkLastClickedIso) > new Date(record.lastClickedAt)
        ) {
          record.lastClickedAt = linkLastClickedIso;
        }
      }
    }

    let userList = Array.from(userMap.values()).map((u) => ({
      key: u.key,
      email: u.email,
      mobile: u.mobile,
      name: u.name,
      channels: Array.from(u.channels),
      totalLinks: u.totalLinks,
      totalClicks: u.totalClicks,
      clickedLinksCount: u.clickedLinksCount,
      clickRate:
        u.totalLinks > 0
          ? Math.round((u.clickedLinksCount / u.totalLinks) * 1000) / 10
          : 0,
      firstSeenAt: u.firstSeenAt,
      lastClickedAt: u.lastClickedAt,
      trains: Array.from(u.trains),
    }));

    if (params?.search?.trim()) {
      const q = params.search.trim().toLowerCase();
      userList = userList.filter(
        (u) =>
          u.email?.toLowerCase().includes(q) ||
          u.mobile?.includes(q) ||
          u.name?.toLowerCase().includes(q) ||
          u.trains.some((t) => t.toLowerCase().includes(q)),
      );
    }

    // Sort: most recent clicks first, then total clicks
    userList.sort((a, b) => {
      if (a.lastClickedAt && b.lastClickedAt) {
        return (
          new Date(b.lastClickedAt).getTime() -
          new Date(a.lastClickedAt).getTime()
        );
      }
      if (a.lastClickedAt) return -1;
      if (b.lastClickedAt) return 1;
      return b.totalClicks - a.totalClicks;
    });

    return {
      users: userList,
      totalUsers: userList.length,
    };
  }
}
