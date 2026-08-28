import { Controller, Get, Head, Res } from '@nestjs/common';
import type { Response } from 'express';
import { AppService } from './app.service';

const RFC9727_MEDIA_TYPE =
  'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';

function getBackendCatalog(origin: string) {
  const baseUrl = origin.replace(/\/+$/, '');
  const openApiSpecUrl = `${baseUrl}/openapi.json`;
  const healthUrl = `${baseUrl}/api/health`;

  return {
    linkset: [
      {
        anchor: `${baseUrl}/api/booking-v2/alternate-paths`,
        'service-desc': [
          {
            href: openApiSpecUrl,
            type: 'application/json',
            title: 'LastBerth OpenAPI 3.1 Specification',
          },
        ],
        'service-doc': [
          {
            href: `${baseUrl}/blog`,
            type: 'text/html',
            title: 'LastBerth Railway Booking Guides and Documentation',
          },
        ],
        status: [
          {
            href: healthUrl,
            type: 'application/json',
            title: 'LastBerth API Health Check',
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/booking-v2/pnr`,
        'service-desc': [
          {
            href: openApiSpecUrl,
            type: 'application/json',
            title: 'LastBerth OpenAPI 3.1 Specification',
          },
        ],
        'service-doc': [
          {
            href: `${baseUrl}/pnr-status`,
            type: 'text/html',
            title: 'Live PNR Status and Waitlist Confirmation Prediction',
          },
        ],
        status: [
          {
            href: healthUrl,
            type: 'application/json',
            title: 'LastBerth API Health Check',
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/chart-times-data`,
        'service-desc': [
          {
            href: openApiSpecUrl,
            type: 'application/json',
            title: 'LastBerth OpenAPI 3.1 Specification',
          },
        ],
        'service-doc': [
          {
            href: `${baseUrl}/chart-times`,
            type: 'text/html',
            title: 'Station-by-Station Train Chart Preparation Schedules',
          },
        ],
        status: [
          {
            href: healthUrl,
            type: 'application/json',
            title: 'LastBerth API Health Check',
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/booking-v2/trains/search`,
        'service-desc': [
          {
            href: openApiSpecUrl,
            type: 'application/json',
            title: 'LastBerth OpenAPI 3.1 Specification',
          },
        ],
        'service-doc': [
          {
            href: baseUrl,
            type: 'text/html',
            title: 'LastBerth Train Search and Seat Availability Finder',
          },
        ],
        status: [
          {
            href: healthUrl,
            type: 'application/json',
            title: 'LastBerth API Health Check',
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/booking-v2/stations/suggest`,
        'service-desc': [
          {
            href: openApiSpecUrl,
            type: 'application/json',
            title: 'LastBerth OpenAPI 3.1 Specification',
          },
        ],
        'service-doc': [
          {
            href: baseUrl,
            type: 'text/html',
            title: 'LastBerth Station Directory and Search',
          },
        ],
        status: [
          {
            href: healthUrl,
            type: 'application/json',
            title: 'LastBerth API Health Check',
          },
        ],
      },
    ],
  };
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get(['health', 'api/health'])
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'lastberth-backend',
    };
  }

  @Get('.well-known/api-catalog')
  getApiCatalog(@Res() res: Response) {
    const origin =
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://lastberth.com';
    res.setHeader('Content-Type', RFC9727_MEDIA_TYPE);
    res.setHeader(
      'Link',
      `<${origin}/.well-known/api-catalog>; rel="self", <${origin}/.well-known/api-catalog>; rel="api-catalog"`,
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(getBackendCatalog(origin));
  }

  @Head('.well-known/api-catalog')
  headApiCatalog(@Res() res: Response) {
    const origin =
      process.env.FRONTEND_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      'https://lastberth.com';
    res.setHeader('Content-Type', RFC9727_MEDIA_TYPE);
    res.setHeader(
      'Link',
      `<${origin}/.well-known/api-catalog>; rel="self", <${origin}/.well-known/api-catalog>; rel="api-catalog"`,
    );
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end();
  }
}
