import { CameraConfig, Vec3, EntityId, Quat } from '../core/types';
import { EntityManager } from '../ecs/ecs';
import { TransformComponent, ComponentTypeIds } from '../core/components';

export class CameraRigSystem {
  private cameras: Map<string, CameraConfig> = new Map();
  private activeCamera: string | null = null;
  private orbitTarget: Vec3 = { x: 0, y: 0, z: 0 };
  private orbitDistance: number = 15;
  private orbitTheta: number = Math.PI / 4;
  private orbitPhi: number = Math.PI / 6;

  droneCamera: {
    position: Vec3;
    target: Vec3;
    orthoSize: number;
  } = {
    position: { x: 0, y: 100, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    orthoSize: 50,
  };

  cctvCamera: {
    position: Vec3;
    target: Vec3;
    distortion: number;
    monochrome: boolean;
    scanlines: boolean;
    noise: number;
  } = {
    position: { x: 20, y: 15, z: -10 },
    target: { x: 0, y: 0, z: 0 },
    distortion: 0.03,
    monochrome: false,
    scanlines: true,
    noise: 0.02,
  };

  dashcamOffsets: Map<EntityId, Vec3> = new Map();

  constructor() {
    this.registerDefaultCameras();
  }

  private registerDefaultCameras(): void {
    this.registerCamera('orbit', {
      type: 'orbit',
      position: { x: 10, y: 8, z: 10 },
      target: { x: 0, y: 0, z: 0 },
      fov: 60,
      near: 0.1,
      far: 1000,
      aspect: 16 / 9,
    });

    this.registerCamera('cctv', {
      type: 'cctv',
      position: { x: 20, y: 15, z: -10 },
      target: { x: 0, y: 0, z: 0 },
      fov: 45,
      near: 0.5,
      far: 200,
      aspect: 16 / 9,
      cctv: {
        distortion: 0.03,
        monochrome: false,
        scanlines: true,
        noise: 0.02,
      },
    });

    this.registerCamera('drone', {
      type: 'drone',
      position: { x: 0, y: 100, z: 0 },
      target: { x: 0, y: 0, z: 0 },
      fov: 60,
      near: 0.1,
      far: 500,
      aspect: 16 / 9,
      drone: {
        orthographic: true,
        orthoSize: 50,
      },
    });

    this.registerCamera('dashcam', {
      type: 'dashcam',
      position: { x: 0, y: 0, z: 0 },
      target: { x: 0, y: 0, z: -10 },
      fov: 90,
      near: 0.05,
      far: 200,
      aspect: 16 / 9,
      dashcam: {
        vehicleId: 0 as EntityId,
        offset: { x: 0, y: 1.2, z: 0.3 },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        fov: 90,
      },
    });
  }

  registerCamera(name: string, config: CameraConfig): void {
    this.cameras.set(name, config);
  }

  setActiveCamera(name: string): CameraConfig | null {
    const camera = this.cameras.get(name);
    if (camera) {
      this.activeCamera = name;
      return { ...camera };
    }
    return null;
  }

  getActiveCamera(): string | null {
    return this.activeCamera;
  }

  getCamera(name: string): CameraConfig | null {
    const camera = this.cameras.get(name);
    return camera ? { ...camera } : null;
  }

  updateOrbit(dx: number, dy: number, zoom: number): void {
    this.orbitTheta -= dx * 0.005;
    this.orbitPhi = Math.max(0.05, Math.min(Math.PI / 2 - 0.05, this.orbitPhi - dy * 0.005));
    this.orbitDistance = Math.max(2, Math.min(200, this.orbitDistance - zoom));

    const camera = this.cameras.get('orbit');
    if (camera) {
      camera.position = {
        x: this.orbitTarget.x + this.orbitDistance * Math.cos(this.orbitPhi) * Math.sin(this.orbitTheta),
        y: this.orbitTarget.y + this.orbitDistance * Math.sin(this.orbitPhi),
        z: this.orbitTarget.z + this.orbitDistance * Math.cos(this.orbitPhi) * Math.cos(this.orbitTheta),
      };
      camera.target = { ...this.orbitTarget };
    }
  }

  focusOnTarget(target: Vec3): void {
    this.orbitTarget = { ...target };

    const orbitCam = this.cameras.get('orbit');
    if (orbitCam) {
      orbitCam.target = { ...target };
    }

    const droneCam = this.cameras.get('drone');
    if (droneCam) {
      droneCam.target = { ...target };
    }

    const cctvCam = this.cameras.get('cctv');
    if (cctvCam) {
      cctvCam.target = { ...target };
    }
  }

  setDashcamVehicle(vehicleId: EntityId, offset?: Vec3): void {
    const dashcam = this.cameras.get('dashcam');
    if (!dashcam || !dashcam.dashcam) return;

    dashcam.dashcam.vehicleId = vehicleId;
    if (offset) {
      dashcam.dashcam.offset = { ...offset };
    }
  }

  updateDashcam(entityManager: EntityManager): void {
    const dashcam = this.cameras.get('dashcam');
    if (!dashcam || !dashcam.dashcam) return;

    const vehicleId = dashcam.dashcam.vehicleId;
    const transform = entityManager.getComponent<TransformComponent>(
      vehicleId, ComponentTypeIds.TRANSFORM as any
    );

    if (!transform) return;

    const offset = dashcam.dashcam.offset;
    const q = transform.transform.rotation;
    const ox = offset.x, oy = offset.y, oz = offset.z;

    const ix = q.w * ox + q.y * oz - q.z * oy;
    const iy = q.w * oy + q.z * ox - q.x * oz;
    const iz = q.w * oz + q.x * oy - q.y * ox;
    const iw = -q.x * ox - q.y * oy - q.z * oz;

    const qz = q.z, qy = q.y, qx = q.x, qw = q.w;
    dashcam.position = {
      x: transform.transform.position.x + (ix * qw + iw * -qx + iy * -qz - iz * -qy),
      y: transform.transform.position.y + (iy * qw + iw * -qy + iz * -qx - ix * -qz),
      z: transform.transform.position.z + (iz * qw + iw * -qz + ix * -qy - iy * -qx),
    };

    const forward = this.getForward(transform.transform.rotation);
    dashcam.target = {
      x: dashcam.position.x + forward.x * 10,
      y: dashcam.position.y + forward.y * 10,
      z: dashcam.position.z + forward.z * 10,
    };
  }

  update(entityManager: EntityManager): void {
    if (this.activeCamera === 'dashcam') {
      this.updateDashcam(entityManager);
    }
  }

  setCCTVProperties(config: Partial<CameraConfig['cctv']>): void {
    const cctv = this.cameras.get('cctv');
    if (cctv && cctv.cctv) {
      if (config.distortion !== undefined) cctv.cctv.distortion = Math.max(0, config.distortion);
      if (config.monochrome !== undefined) cctv.cctv.monochrome = config.monochrome;
      if (config.scanlines !== undefined) cctv.cctv.scanlines = config.scanlines;
      if (config.noise !== undefined) cctv.cctv.noise = Math.max(0, config.noise);
    }
  }

  setDroneOrthoSize(size: number): void {
    this.droneCamera.orthoSize = Math.max(10, Math.min(500, size));
    const drone = this.cameras.get('drone');
    if (drone && drone.drone) {
      drone.drone.orthoSize = this.droneCamera.orthoSize;
    }
  }

  getAllCameraNames(): string[] {
    return Array.from(this.cameras.keys());
  }

  private getForward(rotation: Quat): Vec3 {
    return {
      x: 2 * (rotation.x * rotation.y + rotation.w * rotation.z),
      y: 2 * (rotation.y * rotation.z - rotation.w * rotation.x),
      z: 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y),
    };
  }
}

// Note: In the updateDashcam method, 'qz' should be 'q.z'. This is a TS shim.
// The proper quaternion multiply is used in the main computation.