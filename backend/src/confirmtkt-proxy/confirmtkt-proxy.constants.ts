/** Static ConfirmTkt client headers (trial proxy — rotate if keys expire). */
export const CONFIRMTKT_UPSTREAM_BASE =
  'https://cttrainsapi.confirmtkt.com/api/v1/availability/fetchAvailability';

export const CONFIRMTKT_STATIC_HEADERS: Record<string, string> = {
  Accept: '*/*',
  'Accept-Language': 'en-US,en;q=0.9',
  /** Interpreted from browser snippet (ClientId ct-web). */
  ApiKey: 'ct-web!2$',
  'CT-Token':
    '10D579F94FD6215A0486F4420D1306E574C1F48178356C7F8B17603E66374E04',
  'CT-Userkey':
    'C87DE5CEE4A90596896DD7A15FA3F2DD678136DD2431C3356C0CA5282C123E63',
  ClientId: 'ct-web',
  'Content-Type': 'application/json',
  DNT: '1',
  DeviceId: '2e90ec18-ce02-4b2f-9e3c-5760fc4c0289',
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
