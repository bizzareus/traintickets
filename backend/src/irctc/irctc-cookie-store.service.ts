import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';

export type IrctcCookieRecord = {
  cookie: string;
  updatedAt: string;
  source?: string;
  sessionId?: string;
};

/**
 * File-backed store for the IRCTC cookie bundle. The session keeper writes the
 * freshly harvested cookie string here; IrctcService reads it for every
 * protected request. Falls back to the IRCTC_COOKIES env var when the file is
 * missing (e.g. before the keeper's first run, or if the keeper is disabled).
 *
 * Path is configurable via IRCTC_COOKIE_FILE; defaults to ./irctc-cookies.json
 * in the process working directory. Note: on Railway the filesystem is per
 * instance and resets on deploy — that's fine because the keeper re-harvests on
 * boot. For multi-replica setups, point IRCTC_COOKIE_FILE at a shared volume or
 * swap this store for a DB/Redis-backed one.
 */
@Injectable()
export class IrctcCookieStoreService {
  private readonly logger = new Logger(IrctcCookieStoreService.name);
  private readonly filePath =
    process.env.IRCTC_COOKIE_FILE?.trim() ||
    path.join(process.cwd(), 'irctc-cookies.json');

  private cached: IrctcCookieRecord | null = null;
  private cachedMtimeMs = 0;

  /** Current cookie string: from the file if present/fresh, else the env var. */
  getCookie(): string {
    const fromFile = this.readFile()?.cookie?.trim();
    if (fromFile) return fromFile;
    return process.env.IRCTC_COOKIES?.trim() ?? '';
  }

  /** Full record (for status/diagnostics), or null when only the env var exists. */
  getRecord(): IrctcCookieRecord | null {
    return this.readFile();
  }

  get cookieFilePath(): string {
    return this.filePath;
  }

  /** Atomically persist a freshly harvested cookie bundle. */
  setCookie(
    cookie: string,
    meta?: { source?: string; sessionId?: string },
  ): void {
    const record: IrctcCookieRecord = {
      cookie: cookie.trim(),
      updatedAt: new Date().toISOString(),
      source: meta?.source,
      sessionId: meta?.sessionId,
    };
    const dir = path.dirname(this.filePath);
    fs.mkdirSync(dir, { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(record, null, 2), 'utf8');
    fs.renameSync(tmp, this.filePath);
    this.cached = record;
    try {
      this.cachedMtimeMs = fs.statSync(this.filePath).mtimeMs;
    } catch {
      this.cachedMtimeMs = Date.now();
    }
    this.logger.log(
      `[irctc-cookies] wrote ${record.cookie.length} chars source=${record.source ?? 'n/a'} -> ${this.filePath}`,
    );
  }

  /** Read + cache the file, re-reading only when its mtime changes. */
  private readFile(): IrctcCookieRecord | null {
    try {
      const stat = fs.statSync(this.filePath);
      if (this.cached && stat.mtimeMs === this.cachedMtimeMs) {
        return this.cached;
      }
      const raw = fs.readFileSync(this.filePath, 'utf8');
      const parsed = JSON.parse(raw) as IrctcCookieRecord;
      this.cached = parsed;
      this.cachedMtimeMs = stat.mtimeMs;
      return parsed;
    } catch {
      // Missing or unreadable file is expected before the first harvest.
      this.cached = null;
      this.cachedMtimeMs = 0;
      return null;
    }
  }
}
