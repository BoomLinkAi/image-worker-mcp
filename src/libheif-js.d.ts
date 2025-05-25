declare module 'libheif-js/wasm-bundle' {
  interface HeifImage {
    get_width(): number;
    get_height(): number;
    display(payload: any, cb: (displayData: { data: any }) => void);
  }
  // Add other exports from libheif-js if needed
  export class HeifDecoder {
    decode(buffer: Buffer | ArrayBufferLike): HeifImage[];
  }
}
