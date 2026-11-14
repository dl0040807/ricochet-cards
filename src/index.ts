import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { dayKey, patchEntry } from './db.js';
import { estimateDepth, shrinkPhoto } from './depth.js';
import { DiarySystem } from './diary.js';

const $ = (id: string) => document.getElementById(id)!;
const intro = $('intro');
let world: World | null = null;

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((w) => {
  world = w;
  w.registerSystem(DiarySystem);
  w.renderer.xr.addEventListener('sessionend', () => (intro.hidden = false)); // back to the 2D screen after VR
});

const enterVR = () => { if (!world) return; intro.hidden = true; world.launchXR(); };
$('sample').addEventListener('click', enterVR);
$('enter').addEventListener('click', enterVR);

// 2D screen before XR: pick today's photo from the headset gallery; depth is computed here, once, and stored with it.
const input = $('photo') as HTMLInputElement, status = $('status'), bar = $('bar');
input.addEventListener('change', async () => {
  const file = input.files?.[0];
  if (!file) return;
  $('landing').hidden = true;
  $('depth').hidden = false;
  const photo = await shrinkPhoto(file);
  ($('orig') as HTMLImageElement).src = URL.createObjectURL(photo);
  await patchEntry(dayKey(new Date()), { photo, depth: undefined, sample: undefined, done: false });
  window.dispatchEvent(new Event('diary:changed'));
  try {
    const depth = await estimateDepth(photo, (s) => {
      status.textContent = s;
      const pct = /(\d+)%/.exec(s)?.[1];
      bar.style.width = pct ? `${5 + +pct * 0.6}%` : '70%';
    });
    await patchEntry(dayKey(new Date()), { depth });
    window.dispatchEvent(new Event('diary:changed'));
    ($('dimg') as HTMLImageElement).src = URL.createObjectURL(depth);
    $('dimg').hidden = false;
    $('dph').hidden = true;
    bar.style.width = '100%';
    status.textContent = 'Ready in 3D. Brighter means closer.';
  } catch (e) {
    console.error(e);
    status.textContent = 'Depth failed. Your photo was saved flat.';
  }
});
