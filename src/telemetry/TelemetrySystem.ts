import { EntityManager } from '../ecs/ecs';
import { VehicleTelemetry, Vec3, EntityId } from '../core/types';
import { VehicleComponent, TransformComponent, PhysicsComponent, ComponentTypeIds } from '../core/components';

export class TelemetrySystem {
  private vehicleData: Map<EntityId, VehicleTelemetry> = new Map();
  private previousVelocities: Map<EntityId, Vec3> = new Map();
  private updateFrequency: number = 60;
  private frameCounter: number = 0;

  constructor(updateFrequency: number = 60) {
    this.updateFrequency = updateFrequency;
  }

  update(entityManager: EntityManager): void {
    this.frameCounter++;

    if (this.frameCounter % Math.max(1, Math.floor(60 / this.updateFrequency)) !== 0) {
      return;
    }

    for (const entityId of entityManager.getAllEntities()) {
      const vehicle = entityManager.getComponent<VehicleComponent>(entityId, ComponentTypeIds.VEHICLE as any);
      if (!vehicle) continue;

      const transform = entityManager.getComponent<TransformComponent>(entityId, ComponentTypeIds.TRANSFORM as any);
      const physics = entityManager.getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS as any);
      if (!transform || !physics) continue;

      const telemetry = this.computeTelemetry(entityId, vehicle, transform, physics, entityManager);
      this.vehicleData.set(entityId, telemetry);
    }
  }

  private computeTelemetry(
    entityId: EntityId,
    vehicle: VehicleComponent,
    transform: TransformComponent,
    physics: PhysicsComponent,
    entityManager: EntityManager
  ): VehicleTelemetry {
    const speed = Math.sqrt(
      physics.linearVelocity.x ** 2 +
      physics.linearVelocity.y ** 2 +
      physics.linearVelocity.z ** 2
    );

    const originalVelocity = physics.linearVelocity;

    const forward = this.getForward(transform.transform.rotation);
    const right = this.getRight(transform.transform.rotation);

    const localVx = originalVelocity.x * forward.x +
                    originalVelocity.y * forward.y +
                    originalVelocity.z * forward.z;
    const localVy = originalVelocity.x * right.x +
                    originalVelocity.y * right.y +
                    originalVelocity.z * right.z;
    const localVz = originalVelocity.x * 0 +
                    originalVelocity.y * 1 +
                    originalVelocity.z * 0;

    const prevVel = this.previousVelocities.get(entityId) || { x: 0, y: 0, z: 0 };
    const dt = 1 / 60;
    const accelX = (originalVelocity.x - prevVel.x) / dt;
    const accelY = (originalVelocity.y - prevVel.y) / dt;
    const accelZ = (originalVelocity.z - prevVel.z) / dt;

    this.previousVelocities.set(entityId, { ...originalVelocity });

    const localAccelX = accelX * forward.x + accelY * forward.y + accelZ * forward.z;
    const localAccelZ = accelX * right.x + accelY * right.y + accelZ * right.z;
    const localAccelY = accelX * 0 + accelY * 1 + accelZ * 0;

    return {
      entityId,
      speed,
      velocity: { ...originalVelocity },
      localVelocity: { x: localVx, y: localVy, z: localVz },
      acceleration: { x: accelX, y: accelY, z: accelZ },
      gForceLateral: localAccelZ / 9.81,
      gForceLongitudinal: localAccelX / 9.81,
      gForceVertical: localAccelY / 9.81,
      steerAngle: vehicle.steerAngle,
      throttle: vehicle.throttle,
      brake: vehicle.brake,
      gear: vehicle.currentGear + 1,
      rpm: vehicle.engineRpm,
      wheelStates: vehicle.wheels.map(w => ({
        rotation: w.rotation,
        deltaRotation: w.deltaRotation,
        steerAngle: w.steerAngle,
        suspensionLength: w.suspensionLength,
        isInContact: w.isInContact,
        contactPoint: { ...w.contactPoint },
        contactNormal: { ...w.contactNormal },
        sideSlip: w.sideSlip,
        longitudinalSlip: w.longitudinalSlip,
        lateralForce: w.lateralForce,
        longitudinalForce: w.longitudinalForce,
        rpm: w.rpm,
      })),
      pitch: Math.asin(2 * (transform.transform.rotation.w * transform.transform.rotation.x - transform.transform.rotation.y * transform.transform.rotation.z)),
      roll: Math.atan2(
        2 * (transform.transform.rotation.w * transform.transform.rotation.y + transform.transform.rotation.x * transform.transform.rotation.z),
        1 - 2 * (transform.transform.rotation.x ** 2 + transform.transform.rotation.y ** 2)
      ),
      yaw: Math.atan2(
        2 * (transform.transform.rotation.w * transform.transform.rotation.z + transform.transform.rotation.x * transform.transform.rotation.y),
        1 - 2 * (transform.transform.rotation.y ** 2 + transform.transform.rotation.z ** 2)
      ),
      angularVelocity: { ...physics.angularVelocity },
    };
  }

  getTelemetry(entityId: EntityId): VehicleTelemetry | undefined {
    return this.vehicleData.get(entityId);
  }

  getAllTelemetry(): Map<EntityId, VehicleTelemetry> {
    return new Map(this.vehicleData);
  }

  getFormattedTelemetry(entityId: EntityId): string | null {
    const data = this.vehicleData.get(entityId);
    if (!data) return null;

    return [
      `Speed: ${(data.speed * 3.6).toFixed(1)} km/h | ${(data.speed).toFixed(1)} m/s`,
      `Accel: ${data.acceleration.x.toFixed(1)} m/s²`,
      `G-Force: L${data.gForceLateral.toFixed(2)}g / Lo${data.gForceLongitudinal.toFixed(2)}g / V${data.gForceVertical.toFixed(2)}g`,
      `Steer: ${(data.steerAngle * 180 / Math.PI).toFixed(1)}°`,
      `Gear: ${data.gear} | RPM: ${data.rpm.toFixed(0)}`,
      `Throttle: ${(data.throttle * 100).toFixed(0)}% | Brake: ${(data.brake * 100).toFixed(0)}%`,
      `Pitch: ${(data.pitch * 180 / Math.PI).toFixed(1)}° | Roll: ${(data.roll * 180 / Math.PI).toFixed(1)}°`,
    ].join('\n');
  }

  getSpeedKmh(entityId: EntityId): number | null {
    const data = this.vehicleData.get(entityId);
    return data ? data.speed * 3.6 : null;
  }

  clear(): void {
    this.vehicleData.clear();
    this.previousVelocities.clear();
  }

  setUpdateFrequency(freq: number): void {
    this.updateFrequency = Math.max(1, Math.min(240, freq));
  }

  private getForward(rotation: { x: number; y: number; z: number; w: number }): Vec3 {
    const qx = rotation.x, qy = rotation.y, qz = rotation.z, qw = rotation.w;
    return {
      x: 2 * (qx * qy + qw * qz),
      y: 2 * (qy * qz - qw * qx),
      z: 1 - 2 * (qx * qx + qy * qy),
    };
  }

  private getRight(rotation: { x: number; y: number; z: number; w: number }): Vec3 {
    const qx = rotation.x, qy = rotation.y, qz = rotation.z, qw = rotation.w;
    return {
      x: 1 - 2 * (qy * qy + qz * qz),
      y: 2 * (qx * qy - qw * qz),
      z: 2 * (qx * qz + qw * qy),
    };
  }
}