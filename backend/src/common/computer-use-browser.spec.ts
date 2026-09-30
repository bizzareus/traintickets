import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { ComputerUseBrowser } from './computer-use-browser';

/** Real Chromium, local fixture only: no portal credentials or OpenAI calls. */
describe('Computer-use browser integration', () => {
  let server: Server;
  let origin: string;
  let forbiddenRequests: number;
  let submittedBody: string;
  let computer: ComputerUseBrowser | undefined;

  beforeAll(async () => {
    server = createServer((request, response) => {
      if (request.url === '/forbidden') forbiddenRequests++;
      if (request.url === '/redirect-chain') {
        response.writeHead(302, { location: '/redirect' });
        response.end();
        return;
      }
      if (request.url === '/redirect') {
        response.writeHead(302, {
          location: origin.replace('127.0.0.1', 'localhost') + '/forbidden',
        });
        response.end();
        return;
      }
      if (request.method === 'POST') {
        request.on('data', (chunk: Buffer) => {
          submittedBody += chunk.toString();
        });
        request.on('end', () => {
          response.end('<body>Reservation confirmed. PNR: 1234567890</body>');
        });
        return;
      }
      response.setHeader('Content-Type', 'text/html');
      response.end(`<!doctype html><body>
        <form method="post" action="/confirm">
          <input name="username" aria-label="Username" style="position:absolute;left:10px;top:10px;width:200px;height:30px">
          <input name="password" type="password" aria-label="Password" style="position:absolute;left:10px;top:60px;width:200px;height:30px">
          <button style="position:absolute;left:10px;top:110px;width:200px;height:30px">Reserve</button>
        </form></body>`);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  beforeEach(() => {
    forbiddenRequests = 0;
    submittedBody = '';
  });
  afterEach(async () => {
    await computer?.close();
    computer = undefined;
  });
  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  const open = (url = origin, signal = new AbortController().signal) =>
    ComputerUseBrowser.open(
      {
        url,
        allowedOrigins: [origin],
        headless: true,
        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
        username: 'fixture-agent',
        password: 'fixture-password',
      },
      signal,
    );

  it('executes screenshot-coordinate actions and injects login placeholders locally', async () => {
    computer = await open();
    const screenshot = await computer.screenshot();
    expect([screenshot.readUInt32BE(16), screenshot.readUInt32BE(20)]).toEqual([
      1280, 800,
    ]);
    await computer.act({ type: 'click', button: 'left', x: 50, y: 25 });
    await computer.act({ type: 'type', text: '{{TRIPMGT_USERNAME}}' });
    await computer.act({ type: 'keypress', keys: ['TAB'] });
    await computer.act({ type: 'type', text: '{{TRIPMGT_PASSWORD}}' });
    await computer.act({ type: 'click', button: 'left', x: 50, y: 125 });
    expect(await computer.visibleText()).toContain('PNR: 1234567890');
    expect(submittedBody).toBe(
      'username=fixture-agent&password=fixture-password',
    );
  }, 30_000);

  it.each(['/redirect', '/redirect-chain'])(
    'blocks %s before the disallowed destination receives a request',
    async (redirect) => {
      await expect(open(origin + redirect)).rejects.toThrow();
      expect(forbiddenRequests).toBe(0);
    },
    30_000,
  );

  it('refuses password injection into a non-password field', async () => {
    computer = await open();
    await computer.act({ type: 'click', button: 'left', x: 50, y: 25 });
    await expect(
      computer.act({ type: 'type', text: '{{TRIPMGT_PASSWORD}}' }),
    ).rejects.toThrow('Login field');
  }, 30_000);

  it('cancels the browser and refuses subsequent actions', async () => {
    const controller = new AbortController();
    computer = await open(origin, controller.signal);
    controller.abort(new Error('Booking cancelled'));
    await expect(
      computer.act({ type: 'type', text: 'never sent' }),
    ).rejects.toThrow('Booking cancelled');
    expect(submittedBody).toBe('');
  }, 30_000);
});
