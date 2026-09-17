declare module 'jsqr' {
  export interface QRCode {
    data: string;
    version: number;
    location: { topRightCorner: [number, number]; topLeftCorner: [number, number]; bottomRightCorner: [number, number]; bottomLeftCorner: [number, number] };
  }
  export default function jsQR(
    imageData: Uint8ClampedArray,
    width: number,
    height: number,
    config?: object
  ): QRCode | null;
}
