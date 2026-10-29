import { PostHogTopRoutesService } from './posthog-top-routes.service';

describe('demand-driven route-date warming', () => {
  const previousEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...previousEnv };
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  it('preserves actual future travel dates and one-letter station codes', async () => {
    jest
      .useFakeTimers({ doNotFake: ['setTimeout'] })
      .setSystemTime(new Date('2030-11-04T06:00:00Z'));
    process.env.POSTHOG_PROJECT_ID = '123';
    process.env.POSTHOG_PERSONAL_API_KEY = 'test-only';
    const fetch = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          results: [
            ['R', 'G', '2030-11-15', 20],
            ['NDLS', 'PNBE', '2030-11-05', 10],
            ['G', 'R', '2030-11-03', 5],
            ['R#G', 'G', '2030-11-05', 4],
          ],
        }),
      ),
    );
    const routes = await new PostHogTopRoutesService().getTopRoutes();
    expect(routes).toEqual([
      { from: 'R', to: 'G', date: '2030-11-15', searches: 20 },
      { from: 'NDLS', to: 'PNBE', date: '2030-11-05', searches: 10 },
    ]);
    const body = fetch.mock.calls[0][1]?.body;
    if (typeof body !== 'string')
      throw new Error('Expected a JSON request body');
    const payload = JSON.parse(body) as { query: { query: string } };
    const query = payload.query.query;
    expect(query).toContain('GROUP BY frm, dest, journey_date');
    expect(query).toContain("journey_date >= '2030-11-04'");
  });
});
