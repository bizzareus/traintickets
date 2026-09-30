import type OpenAI from 'openai';
import type { ComputerUseBrowser } from './computer-use-browser';
import {
  runComputerUse,
  type ComputerUseRunOptions,
} from './openai-computer-use';

describe('OpenAI native computer-use loop', () => {
  const create = jest.fn();
  const client = { responses: { create } } as unknown as OpenAI;
  const computer = {
    assertReady: jest.fn(),
    act: jest.fn(),
    screenshot: jest.fn(),
  };
  let options: ComputerUseRunOptions;
  const computerCall = (overrides = {}) => ({
    type: 'computer_call',
    id: 'cu1',
    call_id: 'call1',
    status: 'completed',
    pending_safety_checks: [],
    actions: [{ type: 'screenshot' }],
    ...overrides,
  });
  const response = (output: unknown[], overrides = {}) => ({
    id: 'response1',
    status: 'completed',
    output,
    ...overrides,
  });
  const finish = {
    type: 'function_call',
    name: 'finish',
    arguments: '{"pnr":"1234567890"}',
  };
  const run = () =>
    runComputerUse(client, computer as unknown as ComputerUseBrowser, options);

  beforeEach(() => {
    jest.resetAllMocks();
    computer.screenshot.mockResolvedValue(Buffer.from('image'));
    options = {
      model: 'computer-model',
      instructions: 'Only book this leg',
      task: 'booking data',
      finishTool: {
        type: 'function',
        name: 'finish',
        description: '',
        strict: true,
        parameters: {},
      },
      maxTurns: 4,
      signal: new AbortController().signal,
      onTurn: jest.fn(),
    };
  });

  it('executes every batched action in order and returns screenshots with matching call IDs', async () => {
    const actions = [
      { type: 'click', button: 'left', x: 25, y: 30 },
      { type: 'type', text: 'Test' },
    ];
    create
      .mockResolvedValueOnce(response([computerCall({ actions })]))
      .mockResolvedValueOnce(response([finish]));
    await expect(run()).resolves.toBe(finish.arguments);
    expect(computer.act.mock.calls).toEqual(actions.map((action) => [action]));
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        model: 'computer-model',
        instructions: options.instructions,
        tools: [{ type: 'computer' }, options.finishTool],
        previous_response_id: 'response1',
        input: [
          {
            type: 'computer_call_output',
            call_id: 'call1',
            output: {
              type: 'computer_screenshot',
              detail: 'original',
              image_url: 'data:image/png;base64,aW1hZ2U=',
            },
          },
        ],
      }),
      { signal: options.signal },
    );
    expect(options.onTurn).toHaveBeenCalledWith(
      1,
      ['click', 'type'],
      Buffer.from('image'),
    );
  });

  it('supports a screenshot-only first turn and legacy single-action payloads', async () => {
    create
      .mockResolvedValueOnce(
        response([
          computerCall({ actions: undefined, action: { type: 'screenshot' } }),
        ]),
      )
      .mockResolvedValueOnce(response([finish]));
    await run();
    expect(computer.act).toHaveBeenCalledWith({ type: 'screenshot' });
  });

  it.each([
    [
      'safety review',
      response([computerCall({ pending_safety_checks: [{ id: 'safety1' }] })]),
    ],
    ['incomplete', response([computerCall()], { status: 'incomplete' })],
    [
      'Incomplete computer action',
      response([computerCall({ status: 'incomplete' })]),
    ],
    ['batch size', response([computerCall({ actions: [] })])],
    ['without a reservation result', response([{ type: 'message' }])],
    ['Unexpected', response([{ ...finish, name: 'exec' }])],
    ['Unexpected', response([finish, computerCall()])],
  ])(
    'stops before input when the response contains %s',
    async (message, value) => {
      create.mockResolvedValueOnce(value);
      await expect(run()).rejects.toThrow(message);
      expect(computer.act).not.toHaveBeenCalled();
    },
  );

  it('does not execute another action on the last allowed turn', async () => {
    options.maxTurns = 1;
    create.mockResolvedValue(response([computerCall()]));
    await expect(run()).rejects.toThrow('turn limit');
    expect(computer.act).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('honors cancellation between actions', async () => {
    const controller = new AbortController();
    options.signal = controller.signal;
    create.mockResolvedValueOnce(
      response([
        computerCall({ actions: [{ type: 'screenshot' }, { type: 'wait' }] }),
      ]),
    );
    computer.act.mockImplementationOnce(() =>
      controller.abort(new Error('Cancelled')),
    );
    await expect(run()).rejects.toThrow('Cancelled');
    expect(computer.act).toHaveBeenCalledTimes(1);
  });

  it('does not expose API request contents on errors', async () => {
    create.mockRejectedValueOnce(
      new Error('request containing passenger and secret'),
    );
    await expect(run()).rejects.toThrow(/^OpenAI computer-use request failed$/);
  });
});
