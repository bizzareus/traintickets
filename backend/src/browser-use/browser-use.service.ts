import { Injectable } from "@nestjs/common";

const BROWSER_USE_BASE_URL = process.env.BROWSER_USE_BASE_URL ?? "https://api.browseruse.com";
const BROWSER_USE_API_KEY = process.env.BROWSER_USE_API_KEY;

@Injectable()
export class BrowserUseService {
  async executeAvailabilityCheck(params: {
    trainNumber: string;
    stationCode: string;
    classCode: string;
    journeyDate: string;
    callbackUrl: string;
  }): Promise<{ jobId: string }> {
    const payload = {
      task_type: "availability_check",
      train_number: params.trainNumber,
      station_code: params.stationCode,
      class_code: params.classCode,
      journey_date: params.journeyDate,
      callback_url: params.callbackUrl,
    };

    const res = await fetch(`${BROWSER_USE_BASE_URL}/jobs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(BROWSER_USE_API_KEY && { Authorization: `Bearer ${BROWSER_USE_API_KEY}` }),
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Browser Use API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as { job_id?: string };
    if (!data?.job_id) throw new Error(`Invalid Browser Use response: ${JSON.stringify(data)}`);
    return { jobId: data.job_id };
  }
}
