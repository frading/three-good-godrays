/*
 * Code taken + adapted from this demo: https://n8python.github.io/goodGodRays/
 * By: https://github.com/n8python
 *
 * With cleanup and minor changes
 */

import * as THREE from "three";
import { Disposable, Pass, Resizable } from "postprocessing";

import GodraysVertexShader from "./godrays.vert";
import GodraysFragmentShader from "./godrays.frag";
import GodraysCompositorShader from "./compositor.frag";
import GodraysCompositorVertexShader from "./compositor.vert";
import { BlueNoiseTextureDataURI } from "./bluenoise";

const GODRAYS_RESOLUTION_SCALE = 0.5;

const getBlueNoiseTexture = async (): Promise<THREE.Texture> => {
  const textureLoader = new THREE.TextureLoader();
  const blueNoiseTexture = await textureLoader.loadAsync(
    BlueNoiseTextureDataURI
  );

  blueNoiseTexture.wrapS = THREE.RepeatWrapping;
  blueNoiseTexture.wrapT = THREE.RepeatWrapping;
  blueNoiseTexture.magFilter = THREE.NearestFilter;
  blueNoiseTexture.minFilter = THREE.NearestFilter;
  return blueNoiseTexture;
};

class GodraysMaterial extends THREE.ShaderMaterial {
  constructor() {
    const uniforms = {
      density: { value: 1 / 128 },
      maxDensity: { value: 0.5 },
      distanceAttenuation: { value: 0.005 },
      sceneDepth: { value: null },
      lightPos: { value: new THREE.Vector3(0, 0, 0) },
      cameraPos: { value: new THREE.Vector3(0, 0, 0) },
      resolution: { value: new THREE.Vector2(1, 1) },
      projectionMatrixInv: { value: new THREE.Matrix4() },
      viewMatrixInv: { value: new THREE.Matrix4() },
      depthCube: { value: null },
      mapSize: { value: 1 },
      pointLightCameraNear: { value: 0.1 },
      pointLightCameraFar: { value: 1000 },
      blueNoise: { value: null as THREE.Texture | null },
      noiseResolution: { value: new THREE.Vector2(1, 1) },
    };

    super({
      name: "GodraysMaterial",
      uniforms,
      fragmentShader: GodraysFragmentShader,
      vertexShader: GodraysVertexShader,
    });

    getBlueNoiseTexture().then((blueNoiseTexture) => {
      uniforms.blueNoise.value = blueNoiseTexture;
      uniforms.noiseResolution.value.set(
        blueNoiseTexture.image.width,
        blueNoiseTexture.image.height
      );
    });
  }
}

class GodraysIllumPass extends Pass implements Resizable {
  private material: GodraysMaterial;
  private shadowMapSet = false;
  private props: GodraysPassProps;
  private lastParams: GodraysPassParams;

  constructor(props: GodraysPassProps, params: GodraysPassParams) {
    super("GodraysPass");

    this.props = props;
    this.lastParams = params;
    this.material = new GodraysMaterial();

    this.updateUniforms(props, params);

    this.fullscreenMaterial = this.material;
  }

  setSize(width: number, height: number): void {
    this.material.uniforms.resolution.value.set(
      Math.ceil(width * GODRAYS_RESOLUTION_SCALE),
      Math.ceil(height * GODRAYS_RESOLUTION_SCALE)
    );
  }

  render(
    renderer: THREE.WebGLRenderer,
    _inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
    _deltaTime?: number | undefined,
    _stencilTest?: boolean | undefined
  ): void {
    if (!this.shadowMapSet && this.props.pointLight.shadow.map?.texture) {
      this.updateUniforms(this.props, this.lastParams);
      this.shadowMapSet = true;
    }

    renderer.setRenderTarget(outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  setDepthTexture(
    depthTexture: THREE.Texture,
    depthPacking?: THREE.DepthPackingStrategies | undefined
  ): void {
    this.material.uniforms.sceneDepth.value = depthTexture;
    if (depthPacking && depthPacking !== THREE.BasicDepthPacking) {
      throw new Error("Only BasicDepthPacking is supported");
    }
  }

  public updateUniforms(
    { pointLight, camera }: GodraysPassProps,
    params: GodraysPassParams
  ): void {
    const pointLightShadow = pointLight.shadow;
    if (!pointLightShadow) {
      throw new Error("Point light must have shadow");
    }

    const depthCube = pointLightShadow.map?.texture ?? null;
    const mapSize = pointLightShadow.map?.height ?? 1;

    const uniforms = this.material.uniforms;
    uniforms.density.value = params.density;
    uniforms.maxDensity.value = params.maxDensity;
    uniforms.lightPos.value = pointLight.position;
    uniforms.cameraPos.value = camera.position;
    uniforms.projectionMatrixInv.value = camera.projectionMatrixInverse;
    uniforms.viewMatrixInv.value = camera.matrixWorld;
    uniforms.depthCube.value = depthCube;
    uniforms.mapSize.value = mapSize;
    uniforms.pointLightCameraNear.value = pointLightShadow?.camera.near ?? 0.1;
    uniforms.pointLightCameraFar.value = pointLightShadow?.camera.far ?? 1000;
    uniforms.density.value = params.density;
    uniforms.maxDensity.value = params.maxDensity;
    uniforms.distanceAttenuation.value = params.distanceAttenuation;
  }
}

interface GodraysCompositorMaterialProps {
  godrays: THREE.Texture;
  edgeStrength: number;
  edgeRadius: number;
  color: THREE.Color;
}

class GodraysCompositorMaterial
  extends THREE.ShaderMaterial
  implements Resizable
{
  constructor({
    godrays,
    edgeStrength,
    edgeRadius,
    color,
  }: GodraysCompositorMaterialProps) {
    const uniforms = {
      godrays: { value: godrays },
      sceneDiffuse: { value: null },
      sceneDepth: { value: null },
      edgeStrength: { value: edgeStrength },
      edgeRadius: { value: edgeRadius },
      color: { value: color },
      resolution: { value: new THREE.Vector2(1, 1) },
    };

    super({
      name: "GodraysCompositorMaterial",
      uniforms,
      depthWrite: false,
      depthTest: false,
      fragmentShader: GodraysCompositorShader,
      vertexShader: GodraysCompositorVertexShader,
    });

    this.updateUniforms(edgeStrength, edgeRadius, color);
  }

  public updateUniforms(
    edgeStrength: number,
    edgeRadius: number,
    color: THREE.Color
  ): void {
    this.uniforms.edgeStrength.value = edgeStrength;
    this.uniforms.edgeRadius.value = edgeRadius;
    this.uniforms.color.value = color;
  }

  setSize(width: number, height: number): void {
    this.uniforms.resolution.value.set(width, height);
  }
}

class GodraysCompositorPass extends Pass implements Resizable {
  constructor(props: GodraysCompositorMaterialProps) {
    super("GodraysCompositorPass");
    this.fullscreenMaterial = new GodraysCompositorMaterial(props);
  }

  public updateUniforms(params: GodraysPassParams): void {
    (this.fullscreenMaterial as GodraysCompositorMaterial).updateUniforms(
      params.edgeStrength,
      params.edgeRadius,
      params.color
    );
  }

  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget | null,
    _deltaTime?: number | undefined,
    _stencilTest?: boolean | undefined
  ): void {
    (
      this.fullscreenMaterial as GodraysCompositorMaterial
    ).uniforms.sceneDiffuse.value = inputBuffer.texture;
    renderer.setRenderTarget(outputBuffer);
    renderer.render(this.scene, this.camera);
  }

  setDepthTexture(
    depthTexture: THREE.Texture,
    depthPacking?: THREE.DepthPackingStrategies | undefined
  ): void {
    if (depthPacking && depthPacking !== THREE.BasicDepthPacking) {
      throw new Error("Only BasicDepthPacking is supported");
    }
    (
      this.fullscreenMaterial as GodraysCompositorMaterial
    ).uniforms.sceneDepth.value = depthTexture;
  }

  setSize(width: number, height: number): void {
    (this.fullscreenMaterial as GodraysCompositorMaterial).setSize(
      width,
      height
    );
  }
}

interface GodraysPassProps {
  pointLight: THREE.PointLight;
  camera: THREE.Camera;
}

export interface GodraysPassParams {
  /**
   * The rate of accumulation for the godrays.  Higher values roughly equate to more humid air/denser fog.
   */
  density: number;
  /**
   * The maximum density of the godrays.  Limits the maximum brightness of the godrays.
   */
  maxDensity: number;
  /**
   * TODO: Document this
   */
  edgeStrength: number;
  /**
   * TODO: Document this
   */
  edgeRadius: number;
  /**
   * Higher values decrease the accumulation of godrays the further away they are from the light source.
   */
  distanceAttenuation: number;
  /**
   * The color of the godrays.
   */
  color: THREE.Color;
}

const defaultParams: GodraysPassParams = {
  density: 1 / 128,
  maxDensity: 0.5,
  edgeStrength: 2,
  edgeRadius: 1,
  distanceAttenuation: 0.005,
  color: new THREE.Color(0xffffff),
};

const populateParams = (
  partialParams: Partial<GodraysPassParams>
): GodraysPassParams => {
  return {
    ...defaultParams,
    ...partialParams,
    color: new THREE.Color(partialParams.color ?? defaultParams.color),
  };
};

export class GodraysPass extends Pass implements Disposable {
  private props: GodraysPassProps;

  private godraysRenderTarget = new THREE.WebGLRenderTarget(1, 1, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });
  private illumPass: GodraysIllumPass;
  private compositorPass: GodraysCompositorPass;

  /**
   * Constructs a new GodraysPass.  Casts godrays from a point light source.  Add to your scene's composer like this:
   *
   * ```ts
   * import { EffectComposer, RenderPass } from 'postprocessing';
   * import { GodraysPass } from 'three-good-godrays';
   *
   * const composer = new EffectComposer(renderer);
   * const renderPass = new RenderPass(scene, camera);
   * renderPass.renderToScreen = false;
   * composer.addPass(renderPass);
   *
   * const godraysPass = new GodraysPass(pointLight, camera);
   * godraysPass.renderToScreen = true;
   * composer.addPass(godraysPass);
   *
   * function animate() {
   *   composer.render(scene, camera);
   * }
   * ```
   *
   * @param light The light source to use for the godrays.
   * @param camera The camera used to render the scene.
   * @param partialParams The parameters to use for the godrays effect.  Will use default values for any parameters not specified.
   */
  constructor(
    light: THREE.PointLight,
    camera: THREE.Camera,
    partialParams: Partial<GodraysPassParams> = {}
  ) {
    super("GodraysPass");

    this.props = {
      pointLight: light,
      camera,
    };
    const params = populateParams(partialParams);

    this.illumPass = new GodraysIllumPass(this.props, params);
    this.illumPass.needsDepthTexture = true;

    this.compositorPass = new GodraysCompositorPass({
      godrays: this.godraysRenderTarget.texture,
      edgeStrength: params.edgeStrength,
      edgeRadius: params.edgeRadius,
      color: params.color,
    });
    this.compositorPass.needsDepthTexture = true;

    // Indicate to the composer that this pass needs depth information from the previous pass
    this.needsDepthTexture = true;

    this.setParams(params);
  }

  /**
   * Updates the parameters used for the godrays effect.  Will use default values for any parameters not specified.
   */
  public setParams(partialParams: Partial<GodraysPassParams>): void {
    const params = populateParams(partialParams);
    this.illumPass.updateUniforms(this.props, params);
    this.compositorPass.updateUniforms(params);
  }

  render(
    renderer: THREE.WebGLRenderer,
    inputBuffer: THREE.WebGLRenderTarget,
    outputBuffer: THREE.WebGLRenderTarget,
    _deltaTime?: number | undefined,
    _stencilTest?: boolean | undefined
  ): void {
    this.illumPass.render(renderer, inputBuffer, this.godraysRenderTarget);

    this.compositorPass.render(
      renderer,
      inputBuffer,
      this.renderToScreen ? null : outputBuffer
    );
  }

  setDepthTexture(
    depthTexture: THREE.Texture,
    depthPacking?: THREE.DepthPackingStrategies | undefined
  ): void {
    this.illumPass.setDepthTexture(depthTexture, depthPacking);
    this.compositorPass.setDepthTexture(depthTexture, depthPacking);
  }

  setSize(width: number, height: number): void {
    this.godraysRenderTarget.setSize(
      Math.ceil(width * GODRAYS_RESOLUTION_SCALE),
      Math.ceil(height * GODRAYS_RESOLUTION_SCALE)
    );
    this.illumPass.setSize(width, height);
    this.compositorPass.setSize(width, height);
  }

  dispose(): void {
    this.godraysRenderTarget.dispose();
    this.illumPass.dispose();
    this.compositorPass.dispose();
    super.dispose();
  }
}