import { Test, TestingModule } from '@nestjs/testing';
import type { Response } from 'express';
import { AppController } from './app.controller';
import { AppService } from './app.service';

interface MockResponse {
  setHeader: jest.Mock<Response, [string, string]>;
  json: jest.Mock<Response, [unknown]>;
  end: jest.Mock<Response, []>;
}

function createMockResponse(): MockResponse {
  return {
    setHeader: jest.fn(),
    json: jest.fn(),
    end: jest.fn(),
  };
}

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health', () => {
    it('should return healthy status', () => {
      const res = appController.getHealth();
      expect(res.status).toBe('ok');
      expect(res.service).toBe('lastberth-backend');
      expect(res.timestamp).toBeDefined();
    });
  });

  describe('api-catalog', () => {
    it('should serve RFC 9727 linkset catalog', () => {
      const mockRes = createMockResponse();

      appController.getApiCatalog(mockRes as unknown as Response);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      );
      expect(mockRes.json).toHaveBeenCalled();
      const firstCall = mockRes.json.mock.calls[0];
      const payload = (firstCall ? firstCall[0] : undefined) as
        | { linkset: Array<{ anchor: string; 'service-desc': unknown[] }> }
        | undefined;
      expect(payload).toBeDefined();
      expect(payload).toHaveProperty('linkset');
      expect(Array.isArray(payload?.linkset)).toBe(true);
      expect(payload?.linkset.length).toBeGreaterThan(0);
      expect(payload?.linkset[0]).toHaveProperty('anchor');
      expect(payload?.linkset[0]).toHaveProperty('service-desc');
    });

    it('should handle HEAD request for api-catalog', () => {
      const mockRes = createMockResponse();

      appController.headApiCatalog(mockRes as unknown as Response);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Type',
        'application/linkset+json; profile="https://www.rfc-editor.org/info/rfc9727"',
      );
      expect(mockRes.end).toHaveBeenCalled();
    });
  });
});
