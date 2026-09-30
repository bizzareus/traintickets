import { readResponseText } from './fetch-with-timeout';

describe('readResponseText', () => {
  it('rejects a declared oversized response without buffering it', async () => {
    const response = new Response('large', {
      headers: { 'content-length': '100' },
    });

    await expect(readResponseText(response, 10)).rejects.toThrow(
      'Upstream response exceeds 10 bytes',
    );
  });

  it('rejects a streamed response once it crosses the limit', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('123456'));
          controller.enqueue(new TextEncoder().encode('789012'));
          controller.close();
        },
      }),
    );

    await expect(readResponseText(response, 10)).rejects.toThrow(
      'Upstream response exceeds 10 bytes',
    );
  });
});
