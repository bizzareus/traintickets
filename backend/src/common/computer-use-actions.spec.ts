import type { Page } from 'playwright';
import { executeComputerAction } from './computer-use-actions';

describe('Computer action adapter', () => {
  const page = {
    viewportSize: () => ({ width: 1280, height: 800 }),
    mouse: {
      click: jest.fn(),
      dblclick: jest.fn(),
      move: jest.fn(),
      down: jest.fn(),
      up: jest.fn(),
      wheel: jest.fn(),
    },
    keyboard: {
      press: jest.fn(),
      down: jest.fn(),
      up: jest.fn(),
      insertText: jest.fn(),
    },
    waitForTimeout: jest.fn(),
  };
  const act = (action: Parameters<typeof executeComputerAction>[1]) =>
    executeComputerAction(page as unknown as Page, action);
  beforeEach(() => jest.resetAllMocks());

  it('maps key names and handles text without logging it', async () => {
    await act({ type: 'keypress', keys: ['CTRL', 'a'] });
    await act({ type: 'keypress', keys: ['ENTER'] });
    await act({ type: 'type', text: 'Passenger' });
    expect(page.keyboard.press.mock.calls).toEqual([['Control+a'], ['Enter']]);
    expect(page.keyboard.insertText).toHaveBeenCalledWith('Passenger');
  });

  it('releases held modifiers after a failed mouse action', async () => {
    page.mouse.click.mockRejectedValueOnce(new Error('closed'));
    await expect(
      act({ type: 'click', button: 'wheel', x: 1, y: 1, keys: ['SHIFT'] }),
    ).rejects.toThrow('closed');
    expect(page.mouse.click).toHaveBeenCalledWith(1, 1, { button: 'middle' });
    expect(page.keyboard.up).toHaveBeenCalledWith('Shift');
  });

  it('releases the mouse after a failed drag', async () => {
    page.mouse.move
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('closed'));
    await expect(
      act({
        type: 'drag',
        path: [
          { x: 1, y: 1 },
          { x: 10, y: 10 },
        ],
      }),
    ).rejects.toThrow('closed');
    expect(page.mouse.up).toHaveBeenCalledTimes(1);
  });

  it('rejects out-of-viewport coordinates before acting', async () => {
    await expect(
      act({ type: 'click', button: 'left', x: 1280, y: 800 }),
    ).rejects.toThrow('outside');
    expect(page.mouse.click).not.toHaveBeenCalled();
  });

  it('moves to the scroll target before scrolling', async () => {
    await act({ type: 'scroll', x: 100, y: 150, scroll_x: 0, scroll_y: 400 });
    expect(page.mouse.move).toHaveBeenCalledWith(100, 150);
    expect(page.mouse.wheel).toHaveBeenCalledWith(0, 400);
  });
});
