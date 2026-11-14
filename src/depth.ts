// In-browser depth estimation (Depth Anything V2 small, Transformers.js). No server: the model downloads once and is cached.
let est: Promise<any> | null = null;

async function load(onStatus: (s: string) => void) {
  const { pipeline } = await import('@huggingface/transformers');
  const model = 'onnx-community/depth-anything-v2-small';
  const progress = (p: any) => { if (p.status === 'progress' && p.file?.endsWith('.onnx')) onStatus(`Downloading the depth model ${Math.round(p.progress)}%`); };
  if ('gpu' in navigator) {
    try { return await pipeline('depth-estimation', model, { device: 'webgpu', dtype: 'fp16', progress_callback: progress }); } catch {} // fall back to wasm
  }
  return pipeline('depth-estimation', model, { device: 'wasm', dtype: 'q8', progress_callback: progress });
}

/** Photo blob -> greyscale depth PNG (bright = near), same size as the photo. */
export async function estimateDepth(photo: Blob, onStatus: (s: string) => void = () => {}) {
  est ??= load(onStatus);
  const run = await est;
  onStatus('Working out the depth of your photo…');
  const { RawImage } = await import('@huggingface/transformers');
  const out = await run(await RawImage.fromBlob(photo));
  return (await out.depth.toBlob('image/png')) as Blob;
}

/** Shrink a picked photo for storage and the texture (longest side 1600 px, JPEG). */
export async function shrinkPhoto(file: Blob, max = 1600) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = new OffscreenCanvas(Math.round(bmp.width * k), Math.round(bmp.height * k));
  c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
  return c.convertToBlob({ type: 'image/jpeg', quality: 0.86 });
}
