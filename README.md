# VR Diary

A 30-second mixed-reality diary for Meta Quest 3. Your desk becomes the
diary: pick a mood orb, write one line, drop in today's photo, and the
calendar fills with color. Old days open as 2.5D photos you can step inside.

Live: https://vrdiary.vercel.app

## How it works

1. **Before VR (2D screen):** pick today's photo. Depth Anything V2 (small,
   via Transformers.js) turns it into a depth map right in the browser — no
   server, no upload.
2. **In VR (passthrough):** a diary card and a calendar sit on your desk.
   Pinch a date to open it, swipe to change months, pinch today to record.
3. **Record:** drop a mood orb on the card → type one line on the poke
   keyboard (or use a quick phrase) → drop the photo on today → Save.
4. **Memories:** "A week ago today" opens as a 2.5D frame. Spread it with both
   hands or press *Step inside*; push with an open palm to close.

Everything is stored locally in IndexedDB. 12 sample diaries are included so
the calendar is not empty on first run.

## Run

```sh
npm install
npm run dev
```

The dev server is managed by the IWSDK CLI and opens an XR emulator (IWER) in
a managed browser. `iwsdk.config.json` is the project config. To test on a
Quest, open a URL from `npx @iwsdk/cli dev status` on the same Wi-Fi.

## Code

| File | What |
| --- | --- |
| `index.html` | 2D intro: photo pick and depth preview |
| `src/index.ts` | World setup, photo → depth pipeline |
| `src/diary.ts` | Desk, calendar, record flow, memories, hand input |
| `src/panel.ts` | Canvas-drawn panels with pinchable buttons |
| `src/depth.ts` | In-browser depth estimation |
| `src/photo3d.ts` | Depth-displaced 2.5D photo mesh |
| `src/db.ts` | IndexedDB entries |
| `src/samples.ts` | Sample diaries |
| `src/audio.ts` | Sound effects and mood pads |

Real sample photos go in `public/samples/NN.jpg`; run `npm run sample-depth`
to precompute their depth maps.
