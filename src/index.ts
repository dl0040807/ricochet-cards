import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { SceneColliderSystem } from './colliders.js';
import { startOnline } from './online.js';
import { ThrowSystem } from './throw.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(SceneColliderSystem);
  world.registerSystem(ThrowSystem);
  startOnline(); // no-op unless the URL has ?host=1 or ?room=ABCD
});
