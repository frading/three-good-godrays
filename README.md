# `three-good-godrays`

Good godrays effect for three.js using the [pmndrs `postprocessing` library](https://github.com/pmndrs/postprocessing)

Adapted from [original implementation](https://github.com/n8python/goodGodRays) by [@n8python](https://github.com/n8python)

![A screenshot showing the three-good-godrays effect in action within the sponza demo scene. A white sphere in the middle of a terrace with pillars has white godrays emanating from it along with prominent shadows.](https://ameo.link/u/al8.jpg)

Demo: <https://three-good-godrays.ameo.design>

## Usage

```ts
import * as THREE from 'three';
import { EffectComposer, RenderPass } from 'postprocessing';
import { GodraysPass } from 'three-good-godrays';

const { scene, camera, renderer } = init();

// shadowmaps are needed for this effect
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = true;

// Make sure to set applicable objects in your scene to cast + receive shadows
// so that this effect will work
scene.traverse((obj) => {
  if (obj instanceof THREE.Mesh) {
    obj.castShadow = true;
    obj.receiveShadow = true;
  }
});

// godrays are cast from a pointlight
const lightPos = new THREE.Vector3(0, 20, 0);
const pointLight = new THREE.PointLight(0xffffff, 1, 10000);
pointLight.castShadow = true;
pointLight.shadow.mapSize.width = 1024;
pointLight.shadow.mapSize.height = 1024;
pointLight.shadow.autoUpdate = true;
pointLight.shadow.camera.near = 0.1;
pointLight.shadow.camera.far = 1000;
pointLight.shadow.camera.updateProjectionMatrix();
pointLight.position.copy(lightPos);
scene.add(pointLight);

// set up rendering pipeline and add godrays pass at the end
const composer = new EffectComposer(renderer);

const renderPass = new RenderPass(scene, camera);
renderPass.renderToScreen = false;
composer.addPass(renderPass);

const godraysPass = new GodraysPass(pointLight, camera);
// If this is the last pass in your pipeline, set `renderToScreen` to `true`
godraysPass.renderToScreen = true;
composer.addPass(godraysPass);

function animate() {
  requestAnimationFrame(animate);
  composer.render();
}
requestAnimationFrame(animate);
```