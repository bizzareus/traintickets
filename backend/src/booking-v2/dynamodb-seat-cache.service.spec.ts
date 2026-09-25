import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
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
});
