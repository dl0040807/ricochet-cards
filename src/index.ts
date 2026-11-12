import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PetSystem } from './pet.js';

World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions).then((world) => {
  world.registerSystem(PetSystem);
});
