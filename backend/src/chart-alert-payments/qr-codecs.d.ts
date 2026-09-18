/**
 * Minimal ambient typings for the QR decode path (decode-only slice of each
 * library). Neither package ships usable types for this Nest setup.
 */
declare module 'jsqr' {
  export interface DecodedQr {
    data: string;
  }
  export default function jsQR(
    data: Uint8ClampedArray,
    width: number,
    height: number,
  ): DecodedQr | null;
}

declare module 'pngjs' {
  export class PNG {
    width: number;
    height: number;
    data: Buffer;
    static sync: {
      read(buffer: Buffer): PNG;
    };
  }
}
