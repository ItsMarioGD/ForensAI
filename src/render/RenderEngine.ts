import { EntityManager } from '../ecs/ecs';
import { PostProcessConfig, HDRIConfig, LightConfig, MaterialPBR, CameraConfig, MaterialPresets } from '../core/types';
import { TransformComponent, ComponentTypeIds } from '../core/components';

export class RenderEngine {
  private scene: any;
  private renderer: any;
  private camera: any;
  private controls: any;
  private ambientLight: any;
  private directionalLight: any;
  private hdri: any;
  private postProcess: any;
  private animations: Map<string, any> = new Map();
  private meshes: Map<number, any> = new Map();
  private activeCamera: CameraConfig | null = null;

  hdriConfig: HDRIConfig = {
    url: '',
    intensity: 1.0,
    rotation: 0,
    exposure: 1.0,
    blur: 0,
  };

  postProcessConfig: PostProcessConfig = {
    ssao: { enabled: true, kernelSize: 32, radius: 0.5, intensity: 1.0, bias: 0.05 },
    bloom: { enabled: true, threshold: 0.8, strength: 1.5, radius: 0.4 },
    taa: { enabled: true, jitterOffset: 0.5, blendFactor: 0.9 },
    fxaa: { enabled: false },
    colorGrading: { enabled: true, exposure: 1.0, contrast: 1.0, saturation: 1.0, temperature: 6500, tint: 0 },
  };

  materialPresets: MaterialPresets = {
    carPaint: { albedo: { x: 0.8, y: 0.1, z: 0.1 }, metalness: 0.05, roughness: 0.1, clearcoat: 1.0, clearcoatRoughness: 0.05, normalScale: 1.0, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 1.0, ior: 1.5, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    carGlass: { albedo: { x: 0.9, y: 0.9, z: 0.95 }, metalness: 0, roughness: 0.0, clearcoat: 0, clearcoatRoughness: 0, normalScale: 1.0, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 0.3, ior: 1.52, transmission: 0.9, thickness: 0.5, attenuationDistance: 0.1, attenuationColor: { x: 1, y: 1, z: 1 } },
    carChrome: { albedo: { x: 0.95, y: 0.95, z: 0.95 }, metalness: 1.0, roughness: 0.05, clearcoat: 0, clearcoatRoughness: 0, normalScale: 1.0, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 1.0, ior: 2.5, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    carRubber: { albedo: { x: 0.05, y: 0.05, z: 0.05 }, metalness: 0, roughness: 0.9, clearcoat: 0, clearcoatRoughness: 0, normalScale: 1.0, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 1.0, ior: 1.3, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    carPlastic: { albedo: { x: 0.2, y: 0.2, z: 0.2 }, metalness: 0, roughness: 0.6, clearcoat: 0, clearcoatRoughness: 0, normalScale: 1.0, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 1.0, ior: 1.4, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    asphalt: { albedo: { x: 0.15, y: 0.15, z: 0.16 }, metalness: 0, roughness: 0.95, clearcoat: 0, clearcoatRoughness: 0, normalScale: 2.0, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 1.0, ior: 1.3, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    concrete: { albedo: { x: 0.6, y: 0.58, z: 0.55 }, metalness: 0, roughness: 0.9, clearcoat: 0, clearcoatRoughness: 0, normalScale: 1.5, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 1.0, ior: 1.3, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    dirt: { albedo: { x: 0.35, y: 0.25, z: 0.15 }, metalness: 0, roughness: 1.0, clearcoat: 0, clearcoatRoughness: 0, normalScale: 1.0, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 1.0, ior: 1.3, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    grass: { albedo: { x: 0.2, y: 0.5, z: 0.1 }, metalness: 0, roughness: 1.0, clearcoat: 0, clearcoatRoughness: 0, normalScale: 1.0, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 1.0, ior: 1.3, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    snow: { albedo: { x: 0.95, y: 0.97, z: 1.0 }, metalness: 0, roughness: 0.7, clearcoat: 0, clearcoatRoughness: 0, normalScale: 0.5, emissive: { x: 0.1, y: 0.1, z: 0.15 }, emissiveIntensity: 0.1, opacity: 1.0, ior: 1.3, transmission: 0, thickness: 0, attenuationDistance: 0, attenuationColor: { x: 1, y: 1, z: 1 } },
    ice: { albedo: { x: 0.8, y: 0.85, z: 0.9 }, metalness: 0, roughness: 0.05, clearcoat: 0, clearcoatRoughness: 0, normalScale: 0.3, emissive: { x: 0.05, y: 0.05, z: 0.1 }, emissiveIntensity: 0.05, opacity: 0.7, ior: 1.31, transmission: 0.3, thickness: 0.2, attenuationDistance: 0.5, attenuationColor: { x: 1, y: 1, z: 1 } },
    water: { albedo: { x: 0.1, y: 0.3, z: 0.6 }, metalness: 0, roughness: 0.0, clearcoat: 0, clearcoatRoughness: 0, normalScale: 0.1, emissive: { x: 0, y: 0, z: 0 }, emissiveIntensity: 0, opacity: 0.4, ior: 1.33, transmission: 0.8, thickness: 1.0, attenuationDistance: 2.0, attenuationColor: { x: 0.2, y: 0.6, z: 0.8 } },
  };

  constructor() {}

  initialize(canvas: HTMLCanvasElement): void {
    this.renderer = this.createRenderer(canvas);
    this.scene = this.createScene();
    this.camera = this.createCamera();
    this.setupLights();
    this.setupPostProcessing();
  }

  private createRenderer(canvas: HTMLCanvasElement): any {
    return {
      canvas,
      pixelRatio: window.devicePixelRatio,
      toneMapping: 'ACESFilmic',
      toneMappingExposure: 1.0,
      outputColorSpace: 'srgb',
      shadowMap: { enabled: true, type: 'pcfsoft', width: 4096, height: 4096 },
    };
  }

  private createScene(): any {
    return {
      background: null,
      fog: { type: 'exp2', density: 0.01, color: { r: 0.8, g: 0.85, b: 0.9 } },
      environment: null,
    };
  }

  private createCamera(): any {
    return {
      type: 'perspective',
      fov: 60,
      aspect: 16 / 9,
      near: 0.1,
      far: 1000,
      position: { x: 10, y: 8, z: 10 },
      target: { x: 0, y: 0, z: 0 },
    };
  }

  private setupLights(): void {
    this.directionalLight = {
      type: 'directional',
      color: { r: 1, g: 0.95, b: 0.9 },
      intensity: 2.0,
      position: { x: 50, y: 100, z: 30 },
      target: { x: 0, y: 0, z: 0 },
      shadow: {
        cameraNear: 0.5,
        cameraFar: 200,
        cameraLeft: -50,
        cameraRight: 50,
        cameraTop: 50,
        cameraBottom: -50,
        mapSize: { width: 4096, height: 4096 },
        bias: -0.001,
        normalBias: 0.02,
        radius: 4,
        cascades: [
          { far: 10, mapSize: 4096 },
          { far: 30, mapSize: 2048 },
          { far: 60, mapSize: 1024 },
          { far: 200, mapSize: 512 },
        ],
      },
    };

    this.ambientLight = {
      type: 'hemisphere',
      skyColor: { r: 0.8, g: 0.85, b: 1.0 },
      groundColor: { r: 0.2, g: 0.15, b: 0.1 },
      intensity: 0.4,
    };
  }

  private setupPostProcessing(): void {
    this.postProcess = {
      ssao: { enabled: true, kernelRadius: 0.5, kernelSize: 32, intensity: 1.0, bias: 0.05 },
      bloom: { enabled: true, threshold: 0.8, strength: 1.5, radius: 0.4 },
      taa: { enabled: true, factor: 0.9, jitter: 0.5 },
    };
  }

  updateTransforms(entityManager: EntityManager): void {
    for (const entityId of entityManager.getAllEntities()) {
      const transform = entityManager.getComponent<TransformComponent>(
        entityId, ComponentTypeIds.TRANSFORM as any
      );
      const mesh = this.meshes.get(entityId as number);
      if (transform && mesh) {
        mesh.position = { ...transform.transform.position };
        mesh.quaternion = { ...transform.transform.rotation };
        mesh.scale = { ...transform.transform.scale };
      }
    }
  }

  registerMesh(entityId: number, mesh: any): void {
    this.meshes.set(entityId, mesh);
  }

  unregisterMesh(entityId: number): void {
    this.meshes.delete(entityId);
  }

  setActiveCamera(config: CameraConfig): void {
    this.activeCamera = config;
    this.camera.fov = config.fov;
    this.camera.near = config.near;
    this.camera.far = config.far;
  }

  setHDRI(config: HDRIConfig): void {
    this.hdriConfig = { ...config };
    if (this.scene) {
      this.scene.environment = { type: 'hdr', url: config.url, intensity: config.intensity, rotation: config.rotation };
    }
  }

  setDirectionalShadow(enabled: boolean, mapSize: number = 4096): void {
    if (this.directionalLight) {
      this.directionalLight.shadow.mapSize = { width: mapSize, height: mapSize };
    }
  }

  applyMaterial(entityId: number, material: MaterialPBR): void {
    const mesh = this.meshes.get(entityId);
    if (mesh) {
      mesh.material = {
        metalness: material.metalness,
        roughness: material.roughness,
        clearcoat: material.clearcoat,
        clearcoatRoughness: material.clearcoatRoughness,
        normalScale: material.normalScale,
        emissive: material.emissive,
        emissiveIntensity: material.emissiveIntensity,
        opacity: material.opacity,
        ior: material.ior,
        transmission: material.transmission,
        thickness: material.thickness,
        attenuationDistance: material.attenuationDistance,
        attenuationColor: material.attenuationColor,
      };
    }
  }

  updateWeatherFog(density: number, color: { r: number; g: number; b: number }): void {
    if (this.scene) {
      this.scene.fog = { type: 'exp2', density, color };
    }
  }

  updateRain(active: boolean, intensity: number): void {
  }

  render(): void {
    if (this.renderer && this.scene && this.camera) {
      this.applyPostProcessing();
      // renderer.render(scene, camera) call
    }
  }

  private applyPostProcessing(): void {
    if (this.postProcess) {
      this.postProcess.ssao.enabled = this.postProcessConfig.ssao.enabled;
      this.postProcess.bloom.enabled = this.postProcessConfig.bloom.enabled;
      this.postProcess.bloom.threshold = this.postProcessConfig.bloom.threshold;
      this.postProcess.bloom.strength = this.postProcessConfig.bloom.strength;
      this.postProcess.bloom.radius = this.postProcessConfig.bloom.radius;
      this.postProcess.taa.enabled = this.postProcessConfig.taa.enabled;
    }
  }

  resize(width: number, height: number): void {
    if (this.camera) {
      this.camera.aspect = width / height;
    }
    if (this.renderer) {
      this.renderer.pixelRatio = window.devicePixelRatio;
    }
  }

  getScene(): any { return this.scene; }
  getCamera(): any { return this.camera; }
  getRenderer(): any { return this.renderer; }

  dispose(): void {
    this.meshes.clear();
    this.animations.clear();
  }
}