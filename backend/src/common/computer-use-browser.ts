import { existsSync } from 'node:fs';
import { chromium, type Browser, type Page } from 'playwright';
import type { ComputerAction } from 'openai/resources/responses/responses';
import { executeComputerAction } from './computer-use-actions';

export interface ComputerBrowserOptions {
  url: string;
  allowedOrigins: string[];
  headless: boolean;
  executablePath?: string;
  cookies?: string;
  username?: string;
  password?: string;
}

/** One isolated context per reservation; no generated code is evaluated. */
export class ComputerUseBrowser {
  private blocked = false;

  private constructor(
    private readonly browser: Browser,
    private readonly page: Page,
    private readonly options: ComputerBrowserOptions,
    private readonly signal: AbortSignal,
  ) {}

  static async open(options: ComputerBrowserOptions, signal: AbortSignal) {
    signal.throwIfAborted();
    const origin = new URL(options.url).origin;
    if (!options.allowedOrigins.includes(origin)) {
      throw new Error(
        'TRIPMGT_BOOKING_URL must be on the computer-use origin allowlist',
      );
    }
    const executablePath =
      options.executablePath ||
      [
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/usr/bin/google-chrome',
      ].find(existsSync);
    const browser = await chromium.launch({
      headless: options.headless,
      executablePath,
      env: {},
      args: [
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-file-system',
      ],
      timeout: 30_000,
    });
    const closeOnAbort = () => {
      void browser.close().catch(() => undefined);
    };
    signal.addEventListener('abort', closeOnAbort, { once: true });
    browser.on('disconnected', () =>
      signal.removeEventListener('abort', closeOnAbort),
    );
    try {
      signal.throwIfAborted();
      const context = await browser.newContext({
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        acceptDownloads: false,
        serviceWorkers: 'block',
      });
      context.setDefaultTimeout(10_000);
      context.setDefaultNavigationTimeout(30_000);
      const page = await context.newPage();
      const computer = new ComputerUseBrowser(browser, page, options, signal);
      await context.route('**/*', async (route) => {
        const request = route.request();
        let isBookingPage = false;
        try {
          isBookingPage = request.frame().page() === page;
        } catch {
          // Popup navigations can start before Playwright exposes their frame.
        }
        if (!isBookingPage) {
          computer.blocked = true;
          await route.abort('blockedbyclient');
          return;
        }
        if (!computer.isAllowed(request.url())) {
          // Optional third-party assets may fail without stopping the reservation.
          if (
            request.isNavigationRequest() ||
            ['xhr', 'fetch'].includes(request.resourceType())
          ) {
            computer.blocked = true;
          }
          await route.abort('blockedbyclient');
          return;
        }
        await route.continue();
      });
      // Playwright routes only the first hop. CDP checks every redirect before it
      // reaches the network, without reissuing potentially stateful requests.
      const cdp = await context.newCDPSession(page);
      cdp.on('Fetch.requestPaused', (event) => {
        const allowed = computer.isAllowed(event.request.url);
        if (
          !allowed &&
          ['Document', 'XHR', 'Fetch'].includes(event.resourceType)
        ) {
          computer.blocked = true;
        }
        const command = allowed
          ? cdp.send('Fetch.continueRequest', { requestId: event.requestId })
          : cdp.send('Fetch.failRequest', {
              requestId: event.requestId,
              errorReason: 'BlockedByClient',
            });
        void command.catch(() => undefined); // Browser closure cancels paused requests.
      });
      await cdp.send('Fetch.enable', {
        patterns: [{ urlPattern: '*', requestStage: 'Request' }],
      });
      await context.routeWebSocket('**/*', (socket) => {
        const url = new URL(socket.url());
        url.protocol = url.protocol === 'wss:' ? 'https:' : 'http:';
        if (computer.isAllowed(url.href)) socket.connectToServer();
        else void socket.close();
      });
      context.on('page', (popup) => {
        computer.blocked = true;
        void popup.close().catch(() => undefined);
      });
      if (options.cookies) {
        await context.addCookies(
          options.cookies.split(';').flatMap((pair) => {
            const match = /^\s*([^=\s]+)=(.*)$/.exec(pair);
            return match
              ? [{ name: match[1], value: match[2].trim(), url: origin }]
              : [];
          }),
        );
      }
      await computer.navigate(options.url);
      return computer;
    } catch (error) {
      await browser.close().catch(() => undefined);
      throw error;
    }
  }

  private isAllowed(value: string): boolean {
    const url = new URL(value);
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      this.options.allowedOrigins.includes(url.origin)
    );
  }

  assertReady(): void {
    this.signal.throwIfAborted();
    if (this.page.isClosed()) {
      throw new Error('Booking browser was closed');
    }
    if (this.blocked || !this.isAllowed(this.page.url())) {
      throw new Error(
        'Computer use stopped at an unapproved origin or popup; operator review is required',
      );
    }
  }

  async navigate(url: string): Promise<void> {
    this.signal.throwIfAborted();
    if (!this.isAllowed(url))
      throw new Error('Navigation outside the origin allowlist');
    await this.page.goto(url, { waitUntil: 'domcontentloaded' });
    this.assertReady();
  }

  async act(action: ComputerAction): Promise<void> {
    this.assertReady();
    if (
      action.type === 'type' &&
      /^\{\{TRIPMGT_(USERNAME|PASSWORD)\}\}$/.test(action.text)
    ) {
      const isPassword = action.text === '{{TRIPMGT_PASSWORD}}';
      const value = isPassword ? this.options.password : this.options.username;
      if (!value)
        throw new Error('TripMgt login credentials are not configured');
      // Credentials never enter model context and may only target the login origin.
      if (
        new URL(this.page.url()).origin !== new URL(this.options.url).origin
      ) {
        throw new Error('TripMgt credentials cannot be entered on this origin');
      }
      const input = this.page.locator(
        isPassword ? 'input[type="password"]:focus' : 'input:focus',
      );
      if ((await input.count()) !== 1)
        throw new Error(
          'Login field must be focused before entering credentials',
        );
      await input.fill(value);
    } else {
      await executeComputerAction(this.page, action);
    }
    // Let navigation, popup creation and rendering settle before the next action.
    await this.page.waitForTimeout(250);
    this.assertReady();
  }

  async screenshot(): Promise<Buffer> {
    this.assertReady();
    return this.page.screenshot({ type: 'png', fullPage: false });
  }

  async visibleText(): Promise<string> {
    this.assertReady();
    return this.page.locator('body').innerText();
  }

  close(): Promise<void> {
    return this.browser.close();
  }
}
