import express, { Request, Response } from 'express';

async function start() {
  const { gotScraping } = await import('got-scraping');

  const PORT = Number(process.env.PORT || 3008);
  const TARGET_HOST = 'https://www.irctc.co.in';

  const app = express();
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Healthcheck endpoint
  app.get('/health', (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      service: 'irctc-local-proxy',
      timestamp: new Date().toISOString(),
    });
  });

  // Proxy all requests to IRCTC
  app.use(async (req: Request, res: Response) => {
    const t0 = Date.now();
    const targetUrl = `${TARGET_HOST}${req.originalUrl}`;
    const method = req.method.toUpperCase();

    console.log(`[Proxy] --> ${method} ${req.originalUrl}`);

    const forwardedHeaders: Record<string, string> = {
      Accept: 'application/json',
      'Accept-Language': 'en-US,en;q=0.9',
      'Content-Type': 'application/json',
      DNT: '1',
      Origin: TARGET_HOST,
      Referer: `${TARGET_HOST}/online-charts/`,
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36',
      'sec-ch-ua':
        '"Chromium";v="146", "Not-A.Brand";v="24", "Google Chrome";v="146"',
      'sec-ch-ua-mobile': '?0',
      'sec-ch-ua-platform': '"macOS"',
    };

    // Forward incoming cookies if present
    if (typeof req.headers['cookie'] === 'string') {
      forwardedHeaders['Cookie'] = req.headers['cookie'];
    }

    try {
      const upstreamRes = await gotScraping({
        url: targetUrl,
        method: method as any,
        headers: forwardedHeaders,
        json: method !== 'GET' && method !== 'HEAD' ? req.body : undefined,
        timeout: { request: 15_000 },
        retry: { limit: 0 },
        throwHttpErrors: false,
      });

      const ms = Date.now() - t0;
      console.log(
        `[Proxy] <-- ${upstreamRes.statusCode} (${ms}ms) bytes=${upstreamRes.body?.length ?? 0}`,
      );

      // Pass through content-type
      if (upstreamRes.headers['content-type']) {
        res.setHeader('Content-Type', upstreamRes.headers['content-type']);
      }

      res.status(upstreamRes.statusCode).send(upstreamRes.body);
    } catch (err: any) {
      const ms = Date.now() - t0;
      console.error(`[Proxy] ERROR after ${ms}ms:`, err.message || err);
      res.status(502).json({
        error: 'Proxy forwarding failed',
        message: err.message || String(err),
        targetUrl,
      });
    }
  });

  app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`🚂 IRCTC Local Proxy running on http://localhost:${PORT}`);
    console.log(`👉 Target: ${TARGET_HOST}`);
    console.log(`🔗 To expose via ngrok, run: ngrok http ${PORT}`);
    console.log('='.repeat(60));
  });
}

start().catch((err) => {
  console.error('Failed to start proxy:', err);
  process.exit(1);
});
