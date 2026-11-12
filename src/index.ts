import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';

// 다람쥐 키우기: game systems are registered here as they are built.
World.create(document.getElementById('scene-container') as HTMLDivElement, projectOptions);
