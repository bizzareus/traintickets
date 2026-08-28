import { getBaseUrl } from "@/lib/site-url";

export interface LinksetTarget {
  href: string;
  type?: string;
  title?: string;
}

export interface ApiCatalogEntry {
  anchor: string;
  "service-desc": LinksetTarget[];
  "service-doc"?: LinksetTarget[];
  status?: LinksetTarget[];
  "service-meta"?: LinksetTarget[];
}

export interface ApiCatalogLinkset {
  linkset: ApiCatalogEntry[];
}

export const RFC9727_MEDIA_TYPE = 'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"';

/**
 * Builds the RFC 9727 Linkset JSON payload representing the published API catalog.
 */
export function buildApiCatalog(origin?: string): ApiCatalogLinkset {
  const baseUrl = origin ? origin.replace(/\/+$/, "") : getBaseUrl();
  const openApiSpecUrl = `${baseUrl}/openapi.json`;
  const healthUrl = `${baseUrl}/api/health`;

  return {
    linkset: [
      {
        anchor: `${baseUrl}/api/booking-v2/alternate-paths`,
        "service-desc": [
          {
            href: openApiSpecUrl,
            type: "application/json",
            title: "LastBerth OpenAPI 3.1 Specification",
          },
        ],
        "service-doc": [
          {
            href: `${baseUrl}/blog`,
            type: "text/html",
            title: "LastBerth Railway Booking Guides and Documentation",
          },
        ],
        status: [
          {
            href: healthUrl,
            type: "application/json",
            title: "LastBerth API Health Check",
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/booking-v2/pnr`,
        "service-desc": [
          {
            href: openApiSpecUrl,
            type: "application/json",
            title: "LastBerth OpenAPI 3.1 Specification",
          },
        ],
        "service-doc": [
          {
            href: `${baseUrl}/pnr-status`,
            type: "text/html",
            title: "Live PNR Status and Waitlist Confirmation Prediction",
          },
        ],
        status: [
          {
            href: healthUrl,
            type: "application/json",
            title: "LastBerth API Health Check",
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/chart-times-data`,
        "service-desc": [
          {
            href: openApiSpecUrl,
            type: "application/json",
            title: "LastBerth OpenAPI 3.1 Specification",
          },
        ],
        "service-doc": [
          {
            href: `${baseUrl}/chart-times`,
            type: "text/html",
            title: "Station-by-Station Train Chart Preparation Schedules",
          },
        ],
        status: [
          {
            href: healthUrl,
            type: "application/json",
            title: "LastBerth API Health Check",
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/booking-v2/trains/search`,
        "service-desc": [
          {
            href: openApiSpecUrl,
            type: "application/json",
            title: "LastBerth OpenAPI 3.1 Specification",
          },
        ],
        "service-doc": [
          {
            href: baseUrl,
            type: "text/html",
            title: "LastBerth Train Search and Seat Availability Finder",
          },
        ],
        status: [
          {
            href: healthUrl,
            type: "application/json",
            title: "LastBerth API Health Check",
          },
        ],
      },
      {
        anchor: `${baseUrl}/api/booking-v2/stations/suggest`,
        "service-desc": [
          {
            href: openApiSpecUrl,
            type: "application/json",
            title: "LastBerth OpenAPI 3.1 Specification",
          },
        ],
        "service-doc": [
          {
            href: baseUrl,
            type: "text/html",
            title: "LastBerth Station Directory and Search",
          },
        ],
        status: [
          {
            href: healthUrl,
            type: "application/json",
            title: "LastBerth API Health Check",
          },
        ],
      },
    ],
  };
}
