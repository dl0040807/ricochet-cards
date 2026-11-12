# Devpost submission draft — 다람쥐 키우기 (Squirrel Buddy, working title)

Link: https://daramji.vercel.app (open in the Meta Quest 3 browser, press **Enter XR**, hands only)

## Tagline (≤140 chars)

A pocket-sized squirrel lives on your real desk. Feed it, pet it, clean up after it — and see what it brings you tomorrow.

## Description (~500 words)

Squirrel Buddy is a mixed-reality desk pet for Meta Quest 3 that you care for with your bare hands. Put the headset on, sit at your desk, and a chubby little squirrel pops out of its tree house right in front of you, on your real desk in passthrough. Everything is within arm's reach, so you can play seated in a couple of minutes a day.

**Caring is touching.** There are no menus and no controllers. You pinch an acorn out of the basket and hold it to the squirrel's mouth: it grabs it with both paws and stuffs its cheeks. Keep feeding it and it flops on its back with a round belly and burps. Rest your hand on its head and it closes its eyes, wags its tail and floats hearts. Give it a cartoon finger flick and it squashes flat, yells "Ouch!", puffs its cheeks and turns its back, then pretends to stay cross the first time you pet it before melting. When it poops, you pinch the poop and drop it in the bin, and it claps for you. It watches your hand, sniffs a slow hand and flinches at a fast one. Every touch gets a sound and an animation within a frame, because there is no haptic feedback.

**Playing.** Wave a foxtail grass stem in front of it and it tracks the fluffy tip, then leaps at it; three catches and it rolls around happily. Toss the acorn ball across the desk and it runs after it, carries it back in its mouth and drops it in front of you, waiting for another throw. If the ball rolls off the desk, it peeks over the edge. A hungry squirrel won't play until it has been fed.

**A reason to come back.** Some days, when it is in a good mood, the squirrel disappears into its tree hole and comes back with a shiny key in its mouth. Hold out your open palm and it drops the key in. Turn the key in the chest lock with a twist of your wrist to reveal a new outfit. There are 12 to collect (common, rare and legendary, never a duplicate), from an acorn cap to a wizard hat, a cape and a golden coat. Empty wardrobe slots show a silhouette of what is still missing, which is a quiet invitation to come back tomorrow. Keys are random but never miss three days in a row, and you only get one when you have been kind. Time keeps passing while you are away: it gets hungry, a little poop piles up (never more than three, so it never feels like a chore), and if you were gone for a while it is asleep when you arrive, then wakes up and runs over to greet you.

**First five minutes.** The first visit compresses the whole loop: hello, hunger, feeding, petting, a poop to clean, a guaranteed key, the chest and your first outfit, so a first-time player sees the full cycle in about three minutes.

**How it is built.** Immersive Web SDK (WebXR) with passthrough, plane detection to find the desk (a floating pedestal if none is found), and WebXR hand tracking (25 joints per hand) to tell pets, flicks, pinches, open palms and wrist twists apart. The squirrel is built from simple parts and every reaction is animated in code, so no rigging is needed. There is no server, no account and no payment: progress is saved on the device.

## Hand interactions

| Action | Gesture |
| --- | --- |
| Pet | Rest a slow hand on its head or back for half a second |
| Flick (딱밤) | Hold the middle finger with the thumb, snap it out near the squirrel |
| Feed | Pinch an acorn from the basket and let go near its mouth |
| Clean | Pinch a poop and let go over the bin |
| Receive the key | Hold an open palm (facing up) near the squirrel |
| Open the chest | Pinch the key, hold it at the lock and twist your wrist 60° (or let go at the lock) |
| Dress up | Pinch an outfit and drop it on the squirrel; pinch a worn outfit to take it off |
| Play | Pinch the foxtail and wave the tip at its face; pinch the acorn ball and toss it |
| Rename | Pinch the little name sign by the tree |

## Notes for judges

- `https://daramji.vercel.app/?nextday` simulates the next day: it is hungry, there is poop to clean, it wakes up when you arrive and fetches a key after about 15 seconds.
- `https://daramji.vercel.app/?reset` starts over from the first visit.

## Checklist (from the PRD)

- [ ] Join the Meta VR Start program
- [ ] Redeploy the latest `main` to https://daramji.vercel.app and open it logged out
- [ ] Demo video under 3 minutes (public YouTube): care, reactions, key → chest → outfit, a "day 3" scene (use `?nextday`)
- [ ] Fill in the form in English using the text above
- [ ] Keep the link up through judging
