import { getBaseUrl } from "@/lib/site-url";

/**
 * Builds the OpenAPI 3.1.0 document for LastBerth APIs.
 */
export function buildOpenApiSpec(origin?: string) {
  const baseUrl = origin ? origin.replace(/\/+$/, "") : getBaseUrl();

  return {
    openapi: "3.1.0",
    info: {
      title: "LastBerth API",
      version: "1.0.0",
      description:
        "Public API for Indian Railways alternate seat availability, split booking predictions, live PNR status tracking, and reservation chart preparation schedules.",
      contact: {
        name: "LastBerth Support",
        url: `${baseUrl}/contact`,
      },
    },
    servers: [
      {
        url: baseUrl,
        description: "Primary Server",
      },
    ],
    paths: {
      "/api/health": {
        get: {
          summary: "API Health Check",
          description: "Returns the health and operational status of the service.",
          operationId: "getHealth",
          responses: {
            "200": {
              description: "Service is healthy",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      status: { type: "string", example: "ok" },
                      timestamp: { type: "string", format: "date-time" },
                      service: { type: "string", example: "lastberth" },
                    },
                    required: ["status", "timestamp"],
                  },
                },
              },
            },
          },
        },
      },
      "/api/booking-v2/stations/suggest": {
        get: {
          summary: "Station Autocomplete",
          description: "Search Indian Railways stations by name or code for autocomplete.",
          operationId: "suggestStations",
          parameters: [
            {
              name: "q",
              in: "query",
              required: true,
              description: "Search query (min 2 characters, e.g., 'NDLS' or 'DELHI')",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "List of matching stations",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        code: { type: "string", example: "NDLS" },
                        name: { type: "string", example: "NEW DELHI" },
                        state: { type: "string", example: "DELHI" },
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Query string too short",
            },
          },
        },
      },
      "/api/booking-v2/trains/search": {
        get: {
          summary: "Search Trains",
          description: "Find all trains running between origin and destination on a given date.",
          operationId: "searchTrains",
          parameters: [
            {
              name: "from",
              in: "query",
              required: true,
              description: "Origin station code (e.g. NDLS)",
              schema: { type: "string" },
            },
            {
              name: "to",
              in: "query",
              required: true,
              description: "Destination station code (e.g. MMCT)",
              schema: { type: "string" },
            },
            {
              name: "date",
              in: "query",
              required: true,
              description: "Journey date in YYYY-MM-DD or DD-MM-YYYY format",
              schema: { type: "string" },
            },
          ],
          responses: {
            "200": {
              description: "List of available trains",
              content: {
                "application/json": {
                  schema: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        trainNumber: { type: "string", example: "12952" },
                        trainName: { type: "string", example: "MUMBAI TEJAS RAJ" },
                        fromStation: { type: "string", example: "NDLS" },
                        toStation: { type: "string", example: "MMCT" },
                        departureTime: { type: "string", example: "16:55" },
                        arrivalTime: { type: "string", example: "08:35" },
                        classes: {
                          type: "array",
                          items: { type: "string" },
                          example: ["3A", "2A", "1A"],
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Missing or invalid query parameters",
            },
          },
        },
      },
      "/api/booking-v2/alternate-paths": {
        post: {
          summary: "Find Alternate Seat Options",
          description: "Calculates alternate seat options and split journey booking opportunities.",
          operationId: "findAlternatePaths",
          requestBody: {
            required: true,
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    trainNumber: { type: "string", example: "12952" },
                    from: { type: "string", example: "NDLS" },
                    to: { type: "string", example: "MMCT" },
                    date: { type: "string", example: "2026-09-01" },
                    quota: { type: "string", default: "GN", example: "GN" },
                    avlClasses: {
                      type: "array",
                      items: { type: "string" },
                      example: ["3A", "2A"],
                    },
                  },
                  required: ["trainNumber", "from", "to", "date"],
                },
              },
            },
          },
          responses: {
            "200": {
              description: "Alternate path search results",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      directAvailability: { type: "array", items: { type: "object" } },
                      alternatePaths: { type: "array", items: { type: "object" } },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid request payload",
            },
          },
        },
      },
      "/api/booking-v2/pnr/{pnr}": {
        get: {
          summary: "Live PNR Status",
          description: "Get real-time PNR booking status, current berth allocation, and confirmation chances.",
          operationId: "getPnrStatus",
          parameters: [
            {
              name: "pnr",
              in: "path",
              required: true,
              description: "10-digit Indian Railways PNR number",
              schema: { type: "string", pattern: "^\\d{10}$", example: "2456789012" },
            },
          ],
          responses: {
            "200": {
              description: "PNR details and passenger status",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      pnr: { type: "string" },
                      trainNumber: { type: "string" },
                      trainName: { type: "string" },
                      dateOfJourney: { type: "string" },
                      passengers: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            bookingStatus: { type: "string" },
                            currentStatus: { type: "string" },
                            coach: { type: "string" },
                            berth: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "400": {
              description: "Invalid PNR format",
            },
          },
        },
      },
      "/api/chart-times-data/{id}": {
        get: {
          summary: "Train Chart Preparation Times",
          description: "Get station-wise reservation chart preparation schedules and historic timings.",
          operationId: "getChartTimes",
          parameters: [
            {
              name: "id",
              in: "path",
              required: true,
              description: "Train number or slug (e.g., '12952' or '12952-mumbai-rajdhani')",
              schema: { type: "string", example: "12952" },
            },
          ],
          responses: {
            "200": {
              description: "Chart preparation time metadata and station schedule",
              content: {
                "application/json": {
                  schema: {
                    type: "object",
                    properties: {
                      trainNumber: { type: "string", example: "12952" },
                      trainName: { type: "string", example: "MUMBAI RAJDHANI" },
                      stations: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            stationCode: { type: "string" },
                            stationName: { type: "string" },
                            estimatedChartTime: { type: "string" },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
            "404": {
              description: "Train chart data not found",
            },
          },
        },
      },
    },
  };
}
