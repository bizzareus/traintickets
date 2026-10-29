import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  BatchWriteCommand,
  DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { DynamoDbSeatCacheService } from './dynamodb-seat-cache.service';

describe('DynamoDbSeatCacheService cache inventory', () => {
  afterEach(() => {
    delete process.env.DISABLE_DYNAMODB_CACHE;
    jest.restoreAllMocks();
  });

  it('aggregates only valid seat items and separates route and summary records', async () => {
    process.env.DISABLE_DYNAMODB_CACHE = '1';
    const service = new DynamoDbSeatCacheService();
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: 'ap-south-1' }),
    );
    const nowSecs = Math.floor(Date.now() / 1000);
    jest.spyOn(client, 'send').mockResolvedValue({
      ScannedCount: 6,
      Items: [
        {
          trainNumber: '22436',
          dateClass: '2026-10-01#CC',
          travelClass: 'CC',
          updatedAt: '2026-09-25T10:00:00.000Z',
          ttl: nowSecs + 3600,
        },
        {
          trainNumber: '22436',
          dateClass: '2026-10-02#EC',
          travelClass: 'EC',
          updatedAt: '2026-09-25T11:00:00.000Z',
          ttl: nowSecs + 7200,
        },
        {
          trainNumber: '05047',
          dateClass: '2026-10-01#3A',
          travelClass: '3A',
          ttl: nowSecs + 1800,
        },
        {
          trainNumber: 'ROUTE#NDLS#BSB',
          dateClass: '2026-10-01',
          ttl: nowSecs + 3600,
        },
        {
          trainNumber: 'SUMMARY#ALL',
          dateClass: 'LATEST',
          ttl: nowSecs + 3600,
        },
        {
          trainNumber: 'EXPIRED',
          dateClass: '2026-09-01#SL',
          ttl: nowSecs - 1,
        },
      ],
    } as never);
    Object.assign(service, { docClient: client });

    const inventory = await service.getCacheInventory();

    expect(inventory).toEqual(
      expect.objectContaining({
        available: true,
        scannedItemCount: 6,
        validItemCount: 5,
        trainCount: 2,
        seatItemCount: 3,
        routeCount: 1,
        summaryCount: 1,
      }),
    );
    expect(inventory.trains).toEqual([
      expect.objectContaining({
        trainNumber: '05047',
        itemCount: 1,
        dates: ['2026-10-01'],
        classes: ['3A'],
      }),
      expect.objectContaining({
        trainNumber: '22436',
        itemCount: 2,
        dates: ['2026-10-01', '2026-10-02'],
        classes: ['CC', 'EC'],
        updatedAt: '2026-09-25T11:00:00.000Z',
      }),
    ]);
  });

  it('reports unavailable when DynamoDB is disabled', async () => {
    process.env.DISABLE_DYNAMODB_CACHE = '1';
    const inventory = await new DynamoDbSeatCacheService().getCacheInventory();

    expect(inventory).toEqual(
      expect.objectContaining({
        available: false,
        validItemCount: 0,
        trains: [],
      }),
    );
  });

  it('enqueues records asynchronously and flushes them in batches via BatchWriteCommand', async () => {
    process.env.DISABLE_DYNAMODB_CACHE = '1';
    const service = new DynamoDbSeatCacheService();
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: 'ap-south-1' }),
    );
    const sendSpy = jest.spyOn(client, 'send').mockResolvedValue({
      UnprocessedItems: {},
    } as never);
    Object.assign(service, { docClient: client });

    await service.saveRouteCachedSearch('NDLS', 'MMCT', '2026-11-05', {
      success: true,
      data: {
        trainList: [
          {
            trainNumber: '12952',
            availabilityCache: {
              '3A': { availabilityDisplayName: 'AVAILABLE 12', fare: 1800 },
              '2A': { availabilityDisplayName: 'WL 5', fare: 2500 },
            },
          },
        ],
      },
    });

    // Immediate read-after-write from pending queue/L1
    const readImmediate = await service.getRouteCachedSearch(
      'NDLS',
      'MMCT',
      '2026-11-05',
    );
    expect(readImmediate.status).toBe('hit');
    expect(readImmediate.value).toEqual(
      expect.objectContaining({ success: true }),
    );

    // Now flush the queue
    await service.flushQueue();

    // Verify BatchWriteCommand was sent
    expect(sendSpy).toHaveBeenCalled();
    const callArgs = sendSpy.mock.calls[0][0];
    expect(callArgs.input).toHaveProperty('RequestItems');
  });

  it('handles throttled BatchWriteCommand and re-queues failed items gracefully', async () => {
    process.env.DISABLE_DYNAMODB_CACHE = '1';
    const service = new DynamoDbSeatCacheService();
    const client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: 'ap-south-1' }),
    );
    const err = new Error(
      'The level of configured provisioned throughput for the table was exceeded',
    );
    err.name = 'ProvisionedThroughputExceededException';
    const sendSpy = jest
      .spyOn(client, 'send')
      .mockRejectedValueOnce(err as never)
      .mockResolvedValue({ UnprocessedItems: {} } as never);
    Object.assign(service, { docClient: client });

    await service.saveBestTrain('NDLS', 'MMCT', '05-11-2026', {
      found: true,
      train: { trainNumber: '12952' },
    });

    // Flush will encounter throttle on attempt 1, back off and retry
    await service.flushQueue();

    expect(sendSpy).toHaveBeenCalledTimes(2);
  });
});

describe('DynamoDB availability freshness and route identity', () => {
  let service: DynamoDbSeatCacheService;
  let client: DynamoDBDocumentClient;
  const now = Date.parse('2030-11-04T06:00:00Z');
  const rawSearch = {
    data: {
      trainList: [
        {
          trainNumber: '22436',
          availabilityCache: { CC: { availabilityDisplayName: 'AVAILABLE 5' } },
        },
      ],
    },
  };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(now);
    process.env.DISABLE_DYNAMODB_CACHE = '1';
    service = new DynamoDbSeatCacheService();
    client = DynamoDBDocumentClient.from(
      new DynamoDBClient({ region: 'ap-south-1' }),
    );
    Object.assign(service, { docClient: client });
  });

  afterEach(() => {
    delete process.env.DISABLE_DYNAMODB_CACHE;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('supports single-letter stations and isolates seat writes by journey segment', async () => {
    const send = jest.spyOn(client, 'send').mockResolvedValue({} as never);
    await service.saveRouteCachedSearch('R', 'G', '2030-11-05', rawSearch);
    await service.saveRouteCachedSearch('R', 'RIG', '2030-11-05', rawSearch);
    expect(
      await service.getRouteCachedSearch('R', 'G', '2030-11-05'),
    ).toMatchObject({ status: 'hit', layer: 'memory', ageMs: 0 });
    await service.flushQueue();
    const items = send.mock.calls.flatMap(([command]) =>
      command instanceof BatchWriteCommand
        ? (command.input.RequestItems?.['lastberth-train-seat-cache'] ?? [])
        : [],
    );
    expect(items.map((item) => item.PutRequest?.Item?.dateClass)).toEqual(
      expect.arrayContaining([
        'SEAT#R#G#2030-11-05#CC',
        'SEAT#R#RIG#2030-11-05#CC',
      ]),
    );
  });

  it('does not serve stale same-day availability from memory or the pending write queue', async () => {
    await service.saveRouteCachedSearch('R', 'G', '2030-11-04', rawSearch);
    jest.setSystemTime(now + 601000);
    expect(
      await service.getRouteCachedSearch('R', 'G', '2030-11-04'),
    ).toMatchObject({ status: 'miss', missReason: 'stale', layer: 'queue' });
  });

  it('preserves actual nearby-station endpoints instead of inventing full-route availability', async () => {
    const send = jest.spyOn(client, 'send').mockResolvedValue({} as never);
    await service.saveRouteCachedSearch('NDLS', 'BSB', '2030-11-05', {
      data: {
        trainList: [
          {
            ...rawSearch.data.trainList[0],
            fromStnCode: 'NZM',
            toStnCode: 'BSB',
          },
        ],
      },
    });
    await service.flushQueue();
    const keys = send.mock.calls.flatMap(([command]) =>
      command instanceof BatchWriteCommand
        ? (
            command.input.RequestItems?.['lastberth-train-seat-cache'] ?? []
          ).map((entry) => entry.PutRequest?.Item?.dateClass)
        : [],
    );
    expect(keys).toContain('SEAT#NZM#BSB#2030-11-05#CC');
    expect(keys).not.toContain('SEAT#NDLS#BSB#2030-11-05#CC');
  });

  it('does not expose stale category-summary seat counts', async () => {
    await service.saveAvailabilitySummary('premium', {
      fresh: { freshUntil: now / 1000 + 600, totalAvailableSeats: 5 },
      expired: { freshUntil: now / 1000 - 1, totalAvailableSeats: 5 },
      legacy: { totalAvailableSeats: 5 },
    });
    expect(await service.getAvailabilitySummary('premium')).toEqual({
      fresh: { freshUntil: now / 1000 + 600, totalAvailableSeats: 5 },
    });
  });

  it('preserves snapshot age across DynamoDB and memory reads', async () => {
    jest.spyOn(client, 'send').mockResolvedValue({
      Item: {
        rawSearch,
        updatedAt: new Date(now - 590000).toISOString(),
        ttl: now / 1000 + 86400,
      },
    } as never);
    expect(
      await service.getRouteCachedSearch('R', 'G', '2030-11-04'),
    ).toMatchObject({ status: 'hit', layer: 'dynamodb', ageMs: 590000 });
    jest.setSystemTime(now + 11000);
    expect(
      await service.getRouteCachedSearch('R', 'G', '2030-11-04'),
    ).toMatchObject({ status: 'miss', layer: 'memory', missReason: 'stale' });
  });

  it('rejects records that DynamoDB TTL has not physically deleted yet', async () => {
    jest.spyOn(client, 'send').mockResolvedValue({
      Item: {
        rawSearch,
        updatedAt: new Date(now).toISOString(),
        ttl: now / 1000 - 1,
      },
    } as never);
    expect(
      await service.getRouteCachedSearch('R', 'G', '2030-11-04'),
    ).toMatchObject({ status: 'miss', missReason: 'expired' });
  });

  it('reads only fresh seats for the requested route', async () => {
    const base = {
      trainNumber: '22436',
      date: '2030-11-05',
      from: 'R',
      to: 'G',
      updatedAt: new Date(now).toISOString(),
      ttl: now / 1000 + 86400,
      freshUntil: now / 1000 + 3600,
    };
    jest.spyOn(client, 'send').mockResolvedValue({
      Items: [
        base,
        { ...base, to: 'RIG' },
        { ...base, freshUntil: now / 1000 - 1 },
      ],
    } as never);
    expect(await service.getTrainCachedSeats('22436', 'R', 'G')).toHaveLength(
      1,
    );
  });
});
