import { Injectable, Logger } from '@nestjs/common';
import { BrowserUse } from 'browser-use-sdk/v3';

@Injectable()
export class IrctcBrowserUseService {
  private readonly logger = new Logger(IrctcBrowserUseService.name);
  private readonly client: BrowserUse;

  constructor() {
    this.client = new BrowserUse({
      apiKey: process.env.BROWSER_USE_API_KEY,
      baseUrl: process.env.BROWSER_USE_BASE_URL || 'https://api.browseruse.com',
    });
  }

  /**
   * Fetches the train chart using Browser Use AI agent.
   * This runs the browser automation in the cloud via the Browser Use API.
   */
  async getTrainChart(
    trainNumber: string,
    journeyDate: string,
    boardingStation: string,
  ) {
    const task = `
Go to https://www.irctc.co.in/online-charts/.
1. Enter the train number "${trainNumber}" in the first input field.
2. Select the first suggestion that appears for the train.
3. Enter the journey date "${journeyDate}" in the date field.
4. Enter the boarding station "${boardingStation}" in the station field and select the matching option.
5. Click the "GET TRAIN CHART" button.
6. Once the chart results are displayed, take a high-quality screenshot of the whole page or the result table.
7. Return the screenshot URL and confirm if the chart was successfully found.
`.trim();

    this.logger.log(`Triggering Browser Use agent for task: ${task}`);

    try {
      // client.run() returns the final output as a string by default if no schema is provided.
      // In v3, it can also return a Session object or similar depending on the SDK version.
      // Based on README, await client.run(task) returns the output.
      
      const response = await this.client.run(task);

      this.logger.log(`Browser Use agent completed. Response: ${JSON.stringify(response)}`);

      return {
        ok: true,
        agentResponse: response,
      };
    } catch (error) {
      this.logger.error(`Browser Use agent failed: ${error.message}`, error.stack);
      return {
        ok: false,
        error: error.message,
      };
    }
  }
}
