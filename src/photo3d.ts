// 2.5D photo: a finely divided plane pushed forward by the depth map, edges faded so stretched borders don't show.
import { CanvasTexture, DoubleSide, Mesh, MeshBasicMaterial, PlaneGeometry, SRGBColorSpace } from '@iwsdk/core';

type Img = CanvasImageSource & { width: number; height: number };
const SEG = 160; // vertices across; ~20k triangles
export const DEPTH = 0.32; // how far the nearest thing pops out, as a fraction of the photo width (capped so edges don't tear)

let fade: CanvasTexture | null = null;
function edgeFade() { // white middle, soft black border = alpha
  const c = new OffscreenCanvas(128, 128), g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 128, 128);
  g.filter = 'blur(7px)';
  g.fillStyle = '#fff'; g.fillRect(14, 14, 100, 100);
  return new CanvasTexture(c as unknown as HTMLCanvasElement);
}

/** Width 1 m (scale it), facing +Z, centred. */
export function makePhoto3D(photo: Img, depth: Img) {
  const aspect = photo.height / photo.width, sx = SEG, sy = Math.round(SEG * aspect);
  const geo = new PlaneGeometry(1, aspect, sx, sy);
  const c = new OffscreenCanvas(sx + 1, sy + 1), g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(depth, 0, 0, sx + 1, sy + 1);
  const px = g.getImageData(0, 0, sx + 1, sy + 1).data;
  let lo = 255, hi = 0;
  for (let i = 0; i < px.length; i += 4) { lo = Math.min(lo, px[i]); hi = Math.max(hi, px[i]); }
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) { // PlaneGeometry rows go top -> bottom, like the image
    const d = (px[i * 4] - lo) / Math.max(1, hi - lo);
    pos.setZ(i, (d * d * 0.7 + d * 0.3) * DEPTH - DEPTH * 0.35); // ease so the background stays calm
  }
  geo.computeVertexNormals();
  const map = new CanvasTexture(photo as HTMLCanvasElement);
  map.colorSpace = SRGBColorSpace;
  return new Mesh(geo, new MeshBasicMaterial({ map, alphaMap: (fade ??= edgeFade()), transparent: true, side: DoubleSide, depthWrite: true }));
}
