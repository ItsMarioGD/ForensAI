import { Vec3, Quat, VehicleConfig, WheelState, EntityId } from '../../core/types';
import { EntityManager } from '../../ecs/ecs';
import { VehicleComponent, TransformComponent, PhysicsComponent, ComponentTypeIds } from '../../core/components';

export class ForensicVehicleController {
  updateVehicle(vehicleId: EntityId, entityManager: EntityManager, dt: number, globalFriction: number): void {
    const vehicle = entityManager.getComponent<VehicleComponent>(vehicleId, ComponentTypeIds.VEHICLE as any);
    const transform = entityManager.getComponent<TransformComponent>(vehicleId, ComponentTypeIds.TRANSFORM as any);
    const physics = entityManager.getComponent<PhysicsComponent>(vehicleId, ComponentTypeIds.PHYSICS as any);

    if (!vehicle || !transform || !physics) return;

    const config = vehicle.config;

    this.updateSuspension(vehicle, transform, entityManager, dt);
    this.updateWheelForces(vehicle, transform, physics, dt, globalFriction);
    this.updateEngine(vehicle, dt);
    this.updateTransmission(vehicle, dt);
    this.applyWeightTransfer(vehicle, transform, physics);
    this.applyChassisForces(vehicle, transform, physics, dt);

    vehicle.speed = Math.sqrt(
      physics.linearVelocity.x ** 2 +
      physics.linearVelocity.y ** 2 +
      physics.linearVelocity.z ** 2
    );
  }

  private updateSuspension(vehicle: VehicleComponent, transform: TransformComponent, entityManager: EntityManager, dt: number): void {
    const config = vehicle.config;

    const wheelPositions = this.getWheelPositions(transform, config);

    for (let i = 0; i < 4; i++) {
      const wheel = vehicle.wheels[i];
      const wheelWorld = wheelPositions[i];

      const groundY = 0;
      const suspensionCompression = Math.max(0, Math.min(1,
        (groundY - wheelWorld.y + config.suspensionRestLength) / config.suspensionTravel
      ));

      wheel.suspensionLength = config.suspensionRestLength - suspensionCompression * config.suspensionTravel;
      wheel.isInContact = groundY > wheelWorld.y - config.suspensionRestLength - config.suspensionTravel;

      if (wheel.isInContact) {
        const springForce = config.suspensionStiffness * suspensionCompression;
        const compressionVelocity = (wheel.suspensionLength - config.suspensionRestLength) / dt;
        const dampingForce = config.suspensionDamping * compressionVelocity;

        const forceMagnitude = springForce + dampingForce;

        wheel.contactPoint = { x: wheelWorld.x, y: groundY, z: wheelWorld.z };
        wheel.contactNormal = { x: 0, y: 1, z: 0 };
      }
    }
  }

  private getWheelPositions(transform: TransformComponent, config: VehicleConfig): Vec3[] {
    const positions: Vec3[] = [];
    const halfLength = config.wheelBase / 2;
    const halfWidth = config.trackWidth / 2;

    const xOffsets = [-halfLength, -halfLength, halfLength, halfLength];
    const zOffsets = [-halfWidth, halfWidth, -halfWidth, halfWidth];

    for (let i = 0; i < 4; i++) {
      const local = {
        x: xOffsets[i],
        y: -config.suspensionRestLength,
        z: zOffsets[i],
      };

      const world = this.localToWorld(local, transform.transform);
      positions.push(world);
    }

    return positions;
  }

  private updateWheelForces(vehicle: VehicleComponent, transform: TransformComponent, physics: PhysicsComponent, dt: number, globalFriction: number): void {
    const config = vehicle.config;
    const vx = physics.linearVelocity.x;
    const vz = physics.linearVelocity.z;
    const speed = Math.sqrt(vx * vx + vz * vz);

    const forward = this.getForward(transform.transform.rotation);
    const right = this.getRight(transform.transform.rotation);
    const localVx = vx * forward.x + vz * forward.z;
    const localVz = vx * right.x + vz * right.z;

    for (let i = 0; i < 4; i++) {
      const wheel = vehicle.wheels[i];
      if (!wheel.isInContact) continue;

      const isFront = i < 2;
      const steerRad = isFront ? vehicle.steerAngle : 0;

      wheel.sideSlip = -localVz * Math.cos(steerRad) + localVx * Math.sin(steerRad);

      wheel.longitudinalSlip = speed > 0.1
        ? (wheel.rpm * config.wheelRadius - localVx * Math.cos(steerRad)) / speed
        : 0;

      const fz = this.calculateNormalForce(wheel, config);
      const slipAngle = Math.atan2(wheel.sideSlip, Math.abs(localVx) + 0.1);

      const pacejkaForce = this.calculatePacejkaForce(slipAngle, fz, config, globalFriction);

      wheel.lateralForce = pacejkaForce * Math.sin(slipAngle);
      wheel.longitudinalForce = this.calculateLongitudinalForce(wheel, config, globalFriction, fz, dt);

      const wheelWorldPos = this.getWheelPositions(transform, config)[i];
      const forceDir = this.getForward(transform.transform.rotation);

      const finalForce = wheel.longitudinalForce;
      physics.appliedForce.x += forceDir.x * finalForce * dt;
      physics.appliedForce.y += 0;
      physics.appliedForce.z += forceDir.z * finalForce * dt;
    }
  }

  private calculateNormalForce(wheel: WheelState, config: VehicleConfig): number {
    const suspensionLoad = config.suspensionStiffness *
      (1 - wheel.suspensionLength / config.suspensionRestLength);
    return Math.max(0, suspensionLoad * 9.81 * 0.25);
  }

  private calculatePacejkaForce(slipAngle: number, normalForce: number, config: VehicleConfig, friction: number): number {
    const D = config.pacejkaD * normalForce * friction;
    const B = config.pacejkaB;
    const C = config.pacejkaC;
    const E = config.pacejkaE;
    const Bx = B * slipAngle;

    return D * Math.sin(C * Math.atan(Bx - E * (Bx - Math.atan(Bx))));
  }

  private calculateLongitudinalForce(wheel: WheelState, config: VehicleConfig, friction: number, normalForce: number, dt: number): number {
    const slipRatio = Math.abs(wheel.longitudinalSlip);
    const D = config.pacejkaD * normalForce * friction;
    const B = config.pacejkaB * 0.5;
    const C = config.pacejkaC * 1.1;
    const E = config.pacejkaE * 0.5;

    const Bx = B * slipRatio;
    const forceMagnitude = D * Math.sin(C * Math.atan(Bx - E * (Bx - Math.atan(Bx))));

    return Math.sign(wheel.longitudinalSlip) * forceMagnitude;
  }

  private updateEngine(vehicle: VehicleComponent, dt: number): void {
    const config = vehicle.config;
    const throttleLoad = vehicle.throttle;

    const engineAngularVelocity = vehicle.engineRpm * Math.PI / 30;
    const torqueCurve = config.engineTorque * (1 - Math.pow(engineAngularVelocity / (config.engineMaxRpm * Math.PI / 30), 2));
    const throttleTorque = torqueCurve * throttleLoad;

    const brakingTorque = vehicle.brake * config.brakeForce;
    const netTorque = throttleTorque - brakingTorque;

    vehicle.engineRpm += netTorque * dt / 0.1;

    vehicle.engineRpm = Math.max(config.engineIdleRpm,
      Math.min(config.engineMaxRpm, vehicle.engineRpm));
  }

  private updateTransmission(vehicle: VehicleComponent, dt: number): void {
    const config = vehicle.config;
    const gear = Math.max(0, Math.min(config.gearRatios.length - 1, vehicle.currentGear));
    const gearRatio = config.gearRatios[gear] * config.finalDriveRatio;
    const wheelRpm = vehicle.wheels.reduce((sum, w) => sum + Math.abs(w.rpm), 0) / 4;
    vehicle.engineRpm = wheelRpm * gearRatio;

    if (vehicle.engineRpm > config.engineMaxRpm * 0.9 && vehicle.currentGear < config.gearRatios.length - 1) {
      vehicle.currentGear++;
    } else if (vehicle.engineRpm < config.engineIdleRpm * 1.2 && vehicle.currentGear > 0) {
      vehicle.currentGear--;
    }

    const finalRatio = config.gearRatios[vehicle.currentGear] * config.finalDriveRatio;
    for (let i = 0; i < 4; i++) {
      if (vehicle.wheels[i].isInContact) {
        vehicle.wheels[i].rpm = vehicle.engineRpm / finalRatio;
      }
    }
  }

  private applyWeightTransfer(vehicle: VehicleComponent, transform: TransformComponent, physics: PhysicsComponent): void {
    const config = vehicle.config;
    const vx = physics.linearVelocity.x;
    const vz = physics.linearVelocity.z;
    const forward = this.getForward(transform.transform.rotation);

    const localAx = (vx - (physics as any).prevVx || 0) / 0.016;
    const localAz = (vz - (physics as any).prevVz || 0) / 0.016;
    (physics as any).prevVx = vx;
    (physics as any).prevVz = vz;

    const longAccel = localAx * forward.x + localAz * forward.z;
    const latAccel = localAx * this.getRight(transform.transform.rotation).x +
                     localAz * this.getRight(transform.transform.rotation).z;

    const pitchTransfer = longAccel * config.centerOfMass.y / config.wheelBase;
    const rollTransfer = latAccel * config.centerOfMass.y / config.trackWidth;

    const totalPitch = Math.atan2(pitchTransfer * config.mass, config.mass * 9.81);
    const totalRoll = Math.atan2(rollTransfer * config.mass, config.mass * 9.81);

    vehicle.acceleration.x = localAx;
    vehicle.acceleration.y = 0;
    vehicle.acceleration.z = localAz;
  }

  private applyChassisForces(vehicle: VehicleComponent, transform: TransformComponent, physics: PhysicsComponent, dt: number): void {
    const config = vehicle.config;
    const speed = Math.sqrt(
      physics.linearVelocity.x ** 2 +
      physics.linearVelocity.y ** 2 +
      physics.linearVelocity.z ** 2
    );

    const dragCoeff = 0.5;
    const dragForce = -dragCoeff * speed * speed;

    if (speed > 0.01) {
      const normX = physics.linearVelocity.x / speed;
      const normZ = physics.linearVelocity.z / speed;
      physics.appliedForce.x += normX * dragForce;
      physics.appliedForce.z += normZ * dragForce;
    }

    const forward = this.getForward(transform.transform.rotation);
    const steeringTorque = forward.y * vehicle.steerAngle * 100;
    physics.appliedTorque.y += steeringTorque * dt;
  }

  setInput(vehicle: VehicleComponent, throttle: number, brake: number, steer: number): void {
    vehicle.throttle = Math.max(0, Math.min(1, throttle));
    vehicle.brake = Math.max(0, Math.min(1, brake));

    const config = vehicle.config;
    const steerTarget = steer * config.maxSteerAngle;
    vehicle.steerAngle += (steerTarget - vehicle.steerAngle) * 0.1;

    for (let i = 0; i < 2 && i < vehicle.wheels.length; i++) {
      vehicle.wheels[i].steerAngle = vehicle.steerAngle;
    }
  }

  getForward(rotation: Quat): Vec3 {
    const qx = rotation.x, qy = rotation.y, qz = rotation.z, qw = rotation.w;
    return {
      x: 2 * (qx * qy + qw * qz),
      y: 2 * (qy * qz - qw * qx),
      z: 1 - 2 * (qx * qx + qy * qy),
    };
  }

  private getRight(rotation: Quat): Vec3 {
    const qx = rotation.x, qy = rotation.y, qz = rotation.z, qw = rotation.w;
    return {
      x: 1 - 2 * (qy * qy + qz * qz),
      y: 2 * (qx * qy - qw * qz),
      z: 2 * (qx * qz + qw * qy),
    };
  }

  private localToWorld(local: Vec3, transform: { position: Vec3; rotation: Quat; scale: Vec3 }): Vec3 {
    const q = transform.rotation;
    const qx = q.x, qy = q.y, qz = q.z, qw = q.w;

    const ix = qw * local.x + qy * local.z - qz * local.y;
    const iy = qw * local.y + qz * local.x - qx * local.z;
    const iz = qw * local.z + qx * local.y - qy * local.x;
    const iw = -qx * local.x - qy * local.y - qz * local.z;

    return {
      x: ix * qw + iw * -qx + iy * -qz - iz * -qy + transform.position.x,
      y: iy * qw + iw * -qy + iz * -qx - ix * -qz + transform.position.y,
      z: iz * qw + iw * -qz + ix * -qy - iy * -qx + transform.position.z,
    };
  }
}