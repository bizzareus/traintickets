import OpenAI from 'openai';
import type {
  FunctionTool,
  ResponseInputItem,
} from 'openai/resources/responses/responses';
import type { ComputerUseBrowser } from './computer-use-browser';

export interface ComputerUseRunOptions {
  model: string;
  instructions: string;
  task: string;
  finishTool: FunctionTool;
  maxTurns: number;
  signal: AbortSignal;
  onTurn: (
    turn: number,
    actions: string[],
    screenshot: Buffer,
  ) => Promise<void>;
}

/** Native Responses API computer tool, with bounded, ordered action batches. */
export async function runComputerUse(
  client: OpenAI,
  computer: ComputerUseBrowser,
  options: ComputerUseRunOptions,
): Promise<string> {
  let previousResponseId: string | undefined;
  let input: ResponseInputItem[] = [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: options.task },
        {
          type: 'input_image',
          image_url: `data:image/png;base64,${(await computer.screenshot()).toString('base64')}`,
          detail: 'original',
        },
      ],
    },
  ];

  for (let turn = 1; turn <= options.maxTurns; turn++) {
    options.signal.throwIfAborted();
    computer.assertReady();
    const response = await client.responses
      .create(
        {
          model: options.model,
          instructions: options.instructions,
          tools: [{ type: 'computer' }, options.finishTool],
          parallel_tool_calls: false,
          previous_response_id: previousResponseId,
          input,
          max_output_tokens: 4096,
        },
        { signal: options.signal },
      )
      .catch((error: unknown) => {
        if (options.signal.aborted) options.signal.throwIfAborted();
        const status =
          error instanceof OpenAI.APIError && typeof error.status === 'number'
            ? error.status
            : undefined;
        throw new Error(
          `OpenAI computer-use request failed${status ? ` (HTTP ${status})` : ''}`,
        );
      });
    options.signal.throwIfAborted();
    if (response.status !== 'completed')
      throw new Error('OpenAI returned an incomplete computer-use response');
    const calls = response.output.filter(
      (item) => item.type === 'computer_call' || item.type === 'function_call',
    );
    if (!calls.length)
      throw new Error('Computer use ended without a reservation result');

    input = [];
    for (const call of calls) {
      if (call.type === 'function_call') {
        if (call.name !== options.finishTool.name || calls.length !== 1) {
          throw new Error('Unexpected computer-use completion tool');
        }
        return call.arguments;
      }
      if (call.status !== 'completed')
        throw new Error('Incomplete computer action');
      if (call.pending_safety_checks?.length) {
        throw new Error(
          'OpenAI requested a safety review; reservation stopped for operator review',
        );
      }
      if (turn === options.maxTurns) {
        throw new Error(
          'Computer-use turn limit reached; inspect the booking before retrying',
        );
      }
      const actions = call.actions ?? (call.action ? [call.action] : []);
      if (!actions.length || actions.length > 50)
        throw new Error('Invalid computer action batch size');
      for (const action of actions) {
        options.signal.throwIfAborted();
        await computer.act(action);
      }
      const screenshot = await computer.screenshot();
      await options.onTurn(
        turn,
        actions.map((action) => action.type),
        screenshot,
      );
      const output = {
        type: 'computer_screenshot' as const,
        image_url: `data:image/png;base64,${screenshot.toString('base64')}`,
        detail: 'original' as const,
      };
      input.push({
        type: 'computer_call_output',
        call_id: call.call_id,
        output,
      });
    }
    previousResponseId = response.id;
  }
  throw new Error(
    'Computer-use turn limit reached; inspect the booking before retrying',
  );
}
