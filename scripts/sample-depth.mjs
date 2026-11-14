// npm run sample-depth — precompute depth maps for your own sample photos (public/samples/01.jpg … 12.jpg) on the laptop.
import { pipeline, RawImage } from '@huggingface/transformers';
import { readdirSync } from 'node:fs';
const dir = 'public/samples';
const est = await pipeline('depth-estimation', 'onnx-community/depth-anything-v2-small');
for (const f of readdirSync(dir).filter((f) => /^\d\d\.jpg$/.test(f))) {
  const out = await est(await RawImage.read(`${dir}/${f}`));
  await out.depth.save(`${dir}/${f.replace('.jpg', '-depth.png')}`);
  console.log('depth', f);
}
