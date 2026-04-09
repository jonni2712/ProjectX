/// <reference types="vite/client" />

declare module 'qrcode' {
  export function toCanvas(
    canvas: HTMLCanvasElement,
    text: string,
    options?: Record<string, any>,
  ): Promise<void>;
}
