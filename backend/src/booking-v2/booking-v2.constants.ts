/** Third-party rail API base URLs (stations / search / availability). */
export const BOOKING_V2_RAIL_API_BASE = {
  stationsSuggest:
    'https://cttrainsapi.confirmtkt.com/api/v2/trains/stations/auto-suggestion',
  trainsSearch: 'https://cttrainsapi.confirmtkt.com/api/v1/trains/search',
  fetchAvailability:
    'https://cttrainsapi.confirmtkt.com/api/v1/availability/fetchAvailability',
} as const;

/**
 * Travel classes tried for “best available” path finding.
 * Order is used as a tie-break when multiple classes are confirmed (prefer earlier = typical budget order).
 */
export const BOOKING_V2_ALTERNATE_PATH_CLASSES = [
  'SL',
  '2S',
  '3A',
  '3E',
  '2A',
  '1A',
  '1H',
  'CC',
  'EC',
  'EA',
  'FC',
] as const;

/** Web-style client headers for availability POST (matches browser-shaped upstream expectations). */
export const BOOKING_V2_RAIL_API_AVAILABILITY_HEADERS: Record<string, string> =
  {
    Accept: '*/*',
    'Accept-Language': 'en-US,en;q=0.9',
    ApiKey: 'ct-web!2$',
    'CT-Token':
      '10D579F94FD6215A0486F4420D1306E574C1F48178356C7F8B17603E66374E04',
    'CT-Userkey':
      'C87DE5CEE4A90596896DD7A15FA3F2DD678136DD2431C3356C0CA5282C123E63',
    ClientId: 'ct-web',
    'Content-Type': 'application/json',
    DNT: '1',
    DeviceId: '2e886267-22b0-4da4-bdc5-636345e083f7',
    Origin: 'https://www.confirmtkt.com',
    Referer: 'https://www.confirmtkt.com/',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-site',
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
    'sec-ch-ua':
      '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"macOS"',
  };

export const BOOKING_V2_RAIL_API_HEADERS: Record<string, string> = {
  ...BOOKING_V2_RAIL_API_AVAILABILITY_HEADERS,
  ApiKey: 'ct-mweb!2$',
  ClientId: 'ct-mweb',
};

/** Station autocomplete uses the web client's credentials and browser headers. */
export const CONFIRMTKT_STATION_HEADERS: Record<string, string> = {
  ...BOOKING_V2_RAIL_API_AVAILABILITY_HEADERS,
  'CT-Token':
    '4C4D0A7339DA9229EDE6D49A797AD842F8064312CA350EAAD93FD2CB1B31E155',
  'CT-Userkey':
    '38ACB240BF42F6DFC10BC962DC42746779A86F3C62F9D3820F11BC8AF705EB49',
  DeviceId: 'e22a1dab-a86d-403a-963b-5e1ae7f649f2',
  'sec-ch-ua':
    '"Chromium";v="154", "Google Chrome";v="154", "Not A(Brand";v="99"',
  'User-Agent':
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
};

/**
 * Maximum stations before boarding or after destination to shift when auto-exploring fallbacks.
 */
export const BOOKING_V2_MAX_STATIONS_OFFSET = 3;
