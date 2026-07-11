import { Vec3, SkidMarkConfig, SkidMarkPoint } from '../core/types';
import { EntityManager } from '../ecs/ecs';
import { VehicleComponent, TransformComponent, PhysicsComponent, ComponentTypeIds } from '../core/components';

interface SkidMarkSegment {
  points: SkidMarkPoint[];
  meshData: { vertices: Float32Array; indices: Uint16Array; uvs: Float32Array } | null;
  isDirty: boolean;
  age: number;
  initialOpacity: number;
}

export class SkidMarkSystem {
  private activeMarks: Map<number, SkidMarkSegment> = new Map();
  private config: SkidMarkConfig = {
    minSlipAngle: 5,
    maxSkidMarks: 100,
    segmentLength: 0.3,
    width: 0.3,
    textureUrl: 'textures/skidmark.png',
    lifetime: 60,
    fadeTime: 10,
  };
  private vehicleLastPositions: Map<number, Vec3> = new Map();
  private segmentIdCounter: number = 0;

  constructor(config?: Partial<SkidMarkConfig>) {
    if (config) {
      Object.assign(this.config, config);
    }
  }

  update(entityManager: EntityManager, dt: number): void {
    const minSlipRad = (this.config.minSlipAngle * Math.PI) / 180;

    for (const entityId of entityManager.getAllEntities()) {
      const vehicle = entityManager.getComponent<VehicleComponent>(entityId, ComponentTypeIds.VEHICLE as any);
      const transform = entityManager.getComponent<TransformComponent>(entityId, ComponentTypeIds.TRANSFORM as any);

      if (!vehicle || !transform) continue;

      for (let i = 0; i < vehicle.wheels.length; i++) {
        const wheel = vehicle.wheels[i];
        const absSlip = Math.abs(wheel.sideSlip);
        const slipAngle = Math.atan2(absSlip, Math.abs(
          Math.sqrt(
            (physics?.linearVelocity.x ?? 0) ** 2 +
            (physics?.linearVelocity.z ?? 0) ** 2
          ) + 0.01
        ));

        const physics = entityManager.getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS as any);
        const wheelPos = this.getWheelWorldPosition(transform, i);

        if (wheel.isInContact && slipAngle > minSlipRad && physics) {
          const speed = Math.sqrt(
            physics.linearVelocity.x ** 2 +
            physics.linearVelocity.z ** 2
          );

          if (speed > 0.5) {
            this.addSkidMarkPoint(entityId as number, {
              position: { ...wheelPos },
              normal: { x: 0, y: 1, z: 0 },
              intensity: Math.min(1, slipAngle / (Math.PI / 4)),
              width: this.config.width * (0.5 + Math.abs(wheel.longitudinalSlip) * 0.5),
              timestamp: performance.now(),
            });
          }
        }
      }
    }

    this.updateAging(dt);
    this.generateGeometry();
    this.cleanup();
  }

  private getWheelWorldPosition(transform: TransformComponent, wheelIndex: number): Vec3 {
    const halfBase = 1.5;
    const halfTrack = 0.9;
    const forward = this.getForward(transform.transform.rotation);
    const right = this.getRight(transform.transform.rotation);

    const fwdOffset = wheelIndex < 2 ? -halfBase : halfBase;
    const latOffset = wheelIndex % 2 === 0 ? -halfTrack : halfTrack;

    return {
      x: transform.transform.position.x + forward.x * fwdOffset + right.x * latOffset,
      y: this.getGroundHeight(transform.transform.position),
      z: transform.transform.position.z + forward.z * fwdOffset + right.z * latOffset,
    };
  }

  private getGroundHeight(position: Vec3): number {
    return 0.05;
  }

  private addSkidMarkPoint(entityId: number, point: SkidMarkPoint): void {
    const lastPos = this.vehicleLastPositions.get(entityId);

    if (lastPos) {
      const dx = point.position.x - lastPos.x;
      const dz = point.position.z - lastPos.z;
      const dist = Math.sqrt(dx * dx + dz * dz);

      if (dist < this.config.segmentLength) return;
    }

    let segment = this.activeMarks.get(entityId);
    if (!segment) {
      segment = {
        points: [],
        meshData: null,
        isDirty: true,
        age: 0,
        initialOpacity: 1.0,
      };
      this.activeMarks.set(entityId, segment);
    }

    segment.points.push({ ...point });
    segment.isDirty = true;
    this.vehicleLastPositions.set(entityId, { ...point.position });
  }

  private generateGeometry(): void {
    for (const [, segment] of this.activeMarks) {
      if (!segment.isDirty || segment.points.length < 2) continue;

      const pointCount = segment.points.length;
      const vertexCount = pointCount * 4;
      const indexCount = (pointCount - 1) * 6;

      const vertices = new Float32Array(vertexCount * 3);
      const indices = new Uint16Array(indexCount);
      const uvs = new Float32Array(vertexCount * 2);

      for (let i = 0; i < pointCount; i++) {
        const pt = segment.points[i];
        const width = pt.width;
        const idx = i * 4;
        const vIdx = idx * 3;
        const tIdx = idx * 2;

        const rightDir = this.getPerpendicularDirection(pt, i, segment);

        vertices[vIdx] = pt.position.x - rightDir.x * width;
        vertices[vIdx + 1] = pt.position.y + 0.02;
        vertices[vIdx + 2] = pt.position.z - rightDir.z * width;
        uvs[tIdx] = 0;
        uvs[tIdx + 1] = i / (pointCount - 1);

        vertices[vIdx + 3] = pt.position.x - rightDir.x * width * 0.3;
        vertices[vIdx + 4] = pt.position.y + 0.02;
        vertices[vIdx + 5] = pt.position.z - rightDir.z * width * 0.3;
        uvs[tIdx + 2] = 0.3;
        uvs[tIdx + 3] = i / (pointCount - 1);

        vertices[vIdx + 6] = pt.position.x + rightDir.x * width * 0.3;
        vertices[vIdx + 7] = pt.position.y + 0.02;
        vertices[vIdx + 8] = pt.position.z + rightDir.z * width * 0.3;
        uvs[tIdx + 4] = 0.7;
        uvs[tIdx + 5] = i / (pointCount - 1);

        vertices[vIdx + 9] = pt.position.x + rightDir.x * width;
        vertices[vIdx + 10] = pt.position.y + 0.02;
        vertices[vIdx + 11] = pt.position.z + rightDir.z * width;
        uvs[tIdx + 6] = 1;
        uvs[tIdx + 7] = i / (pointCount - 1);
      }

      for (let i = 0; i < pointCount - 1; i++) {
        const base = i * 4;
        const iIdx = i * 6;
        indices[iIdx] = base;
        indices[iIdx + 1] = base + 4;
        indices[iIdx + 2] = base + 1;
        indices[iIdx + 3] = base + 1;
        indices[iIdx + 4] = base + 4;
        indices[iIdx + 5] = base + 5;
      }

      segment.meshData = { vertices, indices, uvs };
      segment.isDirty = false;
    }
  }

  private getPerpendicularDirection(point: SkidMarkPoint, index: number, segment: SkidMarkSegment): Vec3 {
    if (index < segment.points.length - 1) {
      const next = segment.points[index + 1];
      const dx = next.position.x - point.position.x;
      const dz = next.position.z - point.position.z;
      const len = Math.sqrt(dx * dx + dz * dz);
      if (len > 0.001) {
        return { x: -dz / len, y: 0, z: dx / len };
      }
    }
    return { x: 1, y: 0, z: 0 };
  }

  private updateAging(dt: number): void {
    for (const [, segment] of this.activeMarks) {
      segment.age += dt;
    }
  }

  private cleanup(): void {
    const toRemove: number[] = [];
    for (const [entityId, segment] of this.activeMarks) {
      if (segment.age > this.config.lifetime || this.activeMarks.size > this.config.maxSkidMarks) {
        toRemove.push(entityId);
      }
    }
    for (const id of toRemove) {
      this.activeMarks.delete(id);
      this.vehicleLastPositions.delete(id);
    }
  }

  getActiveMarkCount(): number {
    return this.activeMarks.size;
  }

  getSegmentData(entityId: number): { vertices: Float32Array; indices: Uint16Array; uvs: Float32Array } | null {
    const segment = this.activeMarks.get(entityId);
    return segment?.meshData || null;
  }

  getAllSegmentData(): Map<number, { vertices: Float32Array; indices: Uint16Array; uvs: Float32Array } | null> {
    const result = new Map();
    for (const [entityId, segment] of this.activeMarks) {
      result.set(entityId, segment.meshData);
    }
    return result;
  }

  getAllSegments(): Map<number, SkidMarkSegment> {
    return new Map(this.activeMarks);
  }

  setMinSlipAngle(degrees: number): void {
    this.config.minSlipAngle = Math.max(0, degrees);
  }

  clear(): void {
    this.activeMarks.clear();
    this.vehicleLastPositions.clear();
  }

  private getForward(rotation: { x: number; y: number; z: number; w: number }): Vec3 {
    return {
      x: 2 * (rotation.x * rotation.y + rotation.w * rotation.z),
      y: 2 * (rotation.y * rotation.z - rotation.w * rotation.x),
      z: 1 - 2 * (rotation.x * rotation.x + rotation.y * rotation.y),
    };
  }

  private getRight(rotation: { x: number; y: number; z: number; w: number }): Vec3 {
    return {
      x: 1 - 2 * (rotation.y * rotation.y + rotation.z * rotation.z),
      y: 2 * (rotation.x * rotation.y - rotation.w * rotation.z),
      z: 2 * (rotation.x * rotation.z + rotation.w * rotation.y),
    };
  }
}