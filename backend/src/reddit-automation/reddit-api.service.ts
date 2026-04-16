import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { lastValueFrom } from 'rxjs';

@Injectable()
export class RedditApiService {
  private token: string | null = null;
  private readonly logger = new Logger(RedditApiService.name);

  constructor(private readonly http: HttpService) {}

  private async refreshToken() {
    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;
    const username = process.env.REDDIT_USERNAME;
    const password = process.env.REDDIT_PASSWORD;

    if (!clientId || !clientSecret || !username || !password) {
      this.logger.warn('Reddit credentials missing. Polling disabled.');
      return;
    }

    try {
      const resp = await lastValueFrom(
        this.http.post(
          'https://www.reddit.com/api/v1/access_token',
          new URLSearchParams({
            grant_type: 'password',
            username,
            password,
          }).toString(),
          {
            auth: { username: clientId, password: clientSecret },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        ),
      );
      this.token = resp.data.access_token;
      this.logger.log('Successfully obtained Reddit access token');
    } catch (e) {
      this.logger.error('Failed to obtain Reddit access token', e);
    }
  }

  async getLatestComments(threadId: string): Promise<any[]> {
    if (!this.token) {
      await this.refreshToken();
      if (!this.token) return [];
    }

    try {
      const resp = await lastValueFrom(
        this.http.get(
          `https://oauth.reddit.com/comments/${threadId}?limit=100`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              'User-Agent': 'LastBerthBot/1.0',
            },
          },
        ),
      );
      const data = resp.data as Record<string, any>;
      // Reddit returns an array: [0] is post, [1] is comments
      return (data[1]?.data?.children as any[]) || [];
    } catch (e: any) {
      const err = e as { response?: { status: number }; message?: string };
      if (err.response?.status === 401) {
        this.token = null; // refresh next time
      }
      this.logger.warn(
        'Failed to fetch reddit comments: ' + (err.message || String(e)),
      );
      return [];
    }
  }

  async getCommentsFromUrl(url: string): Promise<any[]> {
    try {
      // Use the .json URL directly
      const jsonUrl = url.endsWith('.json') ? url : `${url}.json`;
      const resp = await lastValueFrom(
        this.http.get(jsonUrl, {
          headers: {
            'User-Agent': 'LastBerthBot/1.0',
          },
        }),
      );
      const data = resp.data as any[];
      // Reddit returns an array: [0] is post, [1] is comments
      return (data[1]?.data?.children as any[]) || [];
    } catch (e: any) {
      this.logger.error(`Failed to fetch reddit comments from URL: ${url}`, e);
      return [];
    }
  }

  async replyToComment(commentId: string, markdown: string): Promise<boolean> {
    if (!this.token) {
      await this.refreshToken();
      if (!this.token) return false;
    }

    try {
      await lastValueFrom(
        this.http.post(
          'https://oauth.reddit.com/api/comment',
          new URLSearchParams({
            thing_id: `t1_${commentId}`,
            text: markdown,
          }).toString(),
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              'User-Agent': 'LastBerthBot/1.0',
            },
          },
        ),
      );
      this.logger.log(`Successfully replied to comment ${commentId}`);
      return true;
    } catch (e: any) {
      this.logger.error(`Failed to reply to comment ${commentId}`, e);
      return false;
    }
  }
}
