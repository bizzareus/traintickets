import type { ComputerAction } from 'openai/resources/responses/responses';
import type { Page } from 'playwright';

const KEYS: Record<string, string> = {
  ENTER: 'Enter',
  RETURN: 'Enter',
  ESC: 'Escape',
  ESCAPE: 'Escape',
  TAB: 'Tab',
  SPACE: 'Space',
  BACKSPACE: 'Backspace',
  DELETE: 'Delete',
  DEL: 'Delete',
  HOME: 'Home',
  END: 'End',
  PAGEUP: 'PageUp',
  PAGEDOWN: 'PageDown',
  UP: 'ArrowUp',
  ARROWUP: 'ArrowUp',
  DOWN: 'ArrowDown',
  ARROWDOWN: 'ArrowDown',
  LEFT: 'ArrowLeft',
  ARROWLEFT: 'ArrowLeft',
  RIGHT: 'ArrowRight',
  ARROWRIGHT: 'ArrowRight',
  CTRL: 'Control',
  CONTROL: 'Control',
  SHIFT: 'Shift',
  OPTION: 'Alt',
  ALT: 'Alt',
  META: 'Meta',
  CMD: 'Meta',
  COMMAND: 'Meta',
};

const normalizeKey = (key: string) => KEYS[key.toUpperCase()] ?? key;

/** Executes input only; the model decides what to do from viewport screenshots. */
export async function executeComputerAction(
  page: Page,
  action: ComputerAction & { keys?: string[] },
): Promise<void> {
  const viewport = page.viewportSize();
  const points = 'path' in action ? action.path : 'x' in action ? [action] : [];
  if (
    points.some(
      ({ x, y }) =>
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        x < 0 ||
        y < 0 ||
        !viewport ||
        x >= viewport.width ||
        y >= viewport.height,
    )
  )
    throw new Error('Computer action coordinates are outside the viewport');

  const heldKeys: string[] = [];
  try {
    if (action.type !== 'keypress') {
      for (const key of action.keys ?? []) {
        const normalized = normalizeKey(key);
        if (!['Control', 'Shift', 'Alt', 'Meta'].includes(normalized)) {
          throw new Error('Unsupported mouse modifier');
        }
        await page.keyboard.down(normalized);
        heldKeys.push(normalized);
      }
    }
    switch (action.type) {
      case 'click':
        if (action.button === 'back' || action.button === 'forward') {
          throw new Error('Browser history mouse buttons are not supported');
        }
        await page.mouse.click(action.x, action.y, {
          button: action.button === 'wheel' ? 'middle' : action.button,
        });
        break;
      case 'double_click':
        await page.mouse.dblclick(action.x, action.y);
        break;
      case 'move':
        await page.mouse.move(action.x, action.y);
        break;
      case 'scroll':
        if (![action.scroll_x, action.scroll_y].every(Number.isFinite)) {
          throw new Error('Invalid scroll distance');
        }
        await page.mouse.move(action.x, action.y);
        await page.mouse.wheel(action.scroll_x, action.scroll_y);
        break;
      case 'drag':
        if (action.path.length < 2 || action.path.length > 100) {
          throw new Error('Drag requires between 2 and 100 points');
        }
        await page.mouse.move(action.path[0].x, action.path[0].y);
        await page.mouse.down();
        try {
          for (const { x, y } of action.path.slice(1))
            await page.mouse.move(x, y);
        } finally {
          await page.mouse.up();
        }
        break;
      case 'keypress':
        if (!action.keys.length || action.keys.length > 5) {
          throw new Error('Invalid key combination');
        }
        await page.keyboard.press(action.keys.map(normalizeKey).join('+'));
        break;
      case 'type':
        if (action.text.length > 4_000)
          throw new Error('Computer text input is too long');
        await page.keyboard.insertText(action.text);
        break;
      case 'wait':
        await page.waitForTimeout(1_000);
        break;
      case 'screenshot':
        break;
      default:
        throw new Error('Unsupported computer action');
    }
  } finally {
    for (const key of heldKeys.reverse()) await page.keyboard.up(key);
  }
}
