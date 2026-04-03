declare module "flowbite-datepicker/Datepicker" {
  export default class Datepicker {
    constructor(element: HTMLElement, options?: Record<string, unknown>);
    destroy(): void;
    setDate(
      date: Date | string | number | null,
      options?: { autohide?: boolean },
    ): unknown;
  }
}
