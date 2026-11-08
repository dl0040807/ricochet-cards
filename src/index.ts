import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { SceneColliderSystem } from './colliders.js';
import { ThrowSystem } from './throw.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(SceneColliderSystem);
  world.registerSystem(ThrowSystem);
});
