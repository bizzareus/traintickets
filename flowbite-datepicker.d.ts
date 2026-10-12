declare module "flowbite-datepicker/Datepicker" {
  export default class Datepicker {
    constructor(element: HTMLElement, options?: Record<string, unknown>);
    destroy(): void;
    setOptions(options: Record<string, unknown>): void;
    setDate(
      date: Date | string | number | null,
      options?: { autohide?: boolean; clear?: boolean },
    ): unknown;
  }
}
