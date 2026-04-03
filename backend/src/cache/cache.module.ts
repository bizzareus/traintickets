import { Global, Module } from '@nestjs/common';
import { CacheService } from './cache.service';
import { PostgresCacheService } from './postgres-cache.service';
import { StationCacheService } from './station-cache.service';

/**
 * Global cache module.
 *
 * Exports:
 *  - CacheService  — generic key-value cache (swap provider to RedisCacheService for Redis)
 *  - StationCacheService — station autocomplete search index (Postgres ILIKE)
 *
 * Registered globally in AppModule so all modules can inject these without importing CacheModule.
 */
@Global()
@Module({
  providers: [
    { provide: CacheService, useClass: PostgresCacheService },
    StationCacheService,
  ],
  exports: [CacheService, StationCacheService],
})
export class CacheModule {}
