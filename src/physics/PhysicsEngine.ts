import { EntityId, CollisionEvent, ContactPoint, Vec3 } from '../core/types';
import { World } from '../ecs/ecs';
import { PhysicsComponent, ComponentTypeIds } from '../core/components';
import { CollisionDetectionSystem } from './collision/CollisionSystem';
import { DeformationSystem } from './deformation/DeformationSystem';
import { FragmentationSystem } from './fragmentation/FragmentationSystem';

export class PhysicsEngine {
  private world: World;
  private collisionSystem: CollisionDetectionSystem;
  private deformationSystem: DeformationSystem;
  private fragmentationSystem: FragmentationSystem;

  private collisionEvents: CollisionEvent[] = [];
  private lastEventFrame: number = -1;

  gravity: Vec3 = { x: 0, y: -9.81, z: 0 };
  worldFriction: number = 0.8;
  allowSleeping: boolean = true;

  constructor(
    world: World,
    collisionSystem: CollisionDetectionSystem,
    deformationSystem: DeformationSystem,
    fragmentationSystem: FragmentationSystem
  ) {
    this.world = world;
    this.collisionSystem = collisionSystem;
    this.deformationSystem = deformationSystem;
    this.fragmentationSystem = fragmentationSystem;
  }

  stepSimulation(deltaTime: number, maxSubSteps: number, fixedTimeStep: number): void {
    let remainingTime = deltaTime;
    let subSteps = 0;

    while (remainingTime > 0 && subSteps < maxSubSteps) {
      const stepDt = Math.min(remainingTime, fixedTimeStep);
      remainingTime -= stepDt;

      this.internalStep(stepDt);
      subSteps++;
    }

    this.resolveCollisions();
  }

  private internalStep(dt: number): void {
    const allEntities = this.world.entityManager.getAllEntities();

    for (const entityId of allEntities) {
      const physics = this.world.entityManager.getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS as any);
      if (!physics || physics.isStatic) continue;

      this.integrateForces(entityId, physics, dt);
      this.integrateVelocities(entityId, physics, dt);
    }
  }

  private integrateForces(entityId: EntityId, physics: PhysicsComponent, dt: number): void {
    const invMass = 1.0 / physics.mass;

    physics.linearVelocity.x += (physics.appliedForce.x * invMass + this.gravity.x) * dt;
    physics.linearVelocity.y += (physics.appliedForce.y * invMass + this.gravity.y) * dt;
    physics.linearVelocity.z += (physics.appliedForce.z * invMass + this.gravity.z) * dt;

    const invInertia = this.calculateInverseInertia(entityId, physics.mass);
    physics.angularVelocity.x += physics.appliedTorque.x * invInertia * dt;
    physics.angularVelocity.y += physics.appliedTorque.y * invInertia * dt;
    physics.angularVelocity.z += physics.appliedTorque.z * invInertia * dt;

    physics.appliedForce = { x: 0, y: 0, z: 0 };
    physics.appliedTorque = { x: 0, y: 0, z: 0 };
  }

  private integrateVelocities(entityId: EntityId, physics: PhysicsComponent, dt: number): void {
    const transform = this.world.entityManager.getComponent(entityId, ComponentTypeIds.TRANSFORM as any) as any;
    if (!transform) return;

    if (this.allowSleeping) {
      const speed = Math.sqrt(
        physics.linearVelocity.x ** 2 +
        physics.linearVelocity.y ** 2 +
        physics.linearVelocity.z ** 2
      );
      if (speed < 0.01) {
        physics.linearVelocity = { x: 0, y: 0, z: 0 };
        physics.angularVelocity = { x: 0, y: 0, z: 0 };
        return;
      }
    }

    transform.transform.position.x += physics.linearVelocity.x * dt;
    transform.transform.position.y += physics.linearVelocity.y * dt;
    transform.transform.position.z += physics.linearVelocity.z * dt;

    const angMag = Math.sqrt(
      physics.angularVelocity.x ** 2 +
      physics.angularVelocity.y ** 2 +
      physics.angularVelocity.z ** 2
    );

    if (angMag > 0.0001) {
      const halfAngle = angMag * dt * 0.5;
      const sinHalf = Math.sin(halfAngle);
      const s = sinHalf / angMag;

      const dqx = physics.angularVelocity.x * s;
      const dqy = physics.angularVelocity.y * s;
      const dqz = physics.angularVelocity.z * s;
      const dqw = Math.cos(halfAngle);

      const q = transform.transform.rotation;
      const nx = q.w * dqx + q.x * dqw + q.y * dqz - q.z * dqy;
      const ny = q.w * dqy - q.x * dqz + q.y * dqw + q.z * dqx;
      const nz = q.w * dqz + q.x * dqy - q.y * dqx + q.z * dqw;
      const nw = q.w * dqw - q.x * dqx - q.y * dqy - q.z * dqz;

      const len = Math.sqrt(nx * nx + ny * ny + nz * nz + nw * nw);
      transform.transform.rotation = { x: nx / len, y: ny / len, z: nz / len, w: nw / len };
    }

    if (transform.transform.position.y < -50) {
      transform.transform.position.y = 5;
      physics.linearVelocity = { x: 0, y: 0, z: 0 };
      physics.angularVelocity = { x: 0, y: 0, z: 0 };
    }
  }

  private calculateInverseInertia(entityId: EntityId, mass: number): number {
    return 1.0 / (mass * 0.4);
  }

  private resolveCollisions(): void {
    this.collisionEvents = this.collisionSystem.detectCollisions(this.world.entityManager);

    for (const event of this.collisionEvents) {
      this.deformationSystem.applyDeformation(event, this.world.entityManager);
      this.fragmentationSystem.checkFragmentation(event, this.world.entityManager);
    }
  }

  applyForce(entityId: EntityId, force: Vec3): void {
    const physics = this.world.entityManager.getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS as any);
    if (physics && !physics.isStatic) {
      physics.appliedForce.x += force.x;
      physics.appliedForce.y += force.y;
      physics.appliedForce.z += force.z;
    }
  }

  applyImpulse(entityId: EntityId, impulse: Vec3, point: Vec3): void {
    const physics = this.world.entityManager.getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS as any);
    if (!physics || physics.isStatic) return;

    const invMass = 1.0 / physics.mass;
    physics.linearVelocity.x += impulse.x * invMass;
    physics.linearVelocity.y += impulse.y * invMass;
    physics.linearVelocity.z += impulse.z * invMass;

    const transform = this.world.entityManager.getComponent(entityId, ComponentTypeIds.TRANSFORM as any) as any;
    if (!transform) return;

    const rx = point.x - transform.transform.position.x;
    const ry = point.y - transform.transform.position.y;
    const rz = point.z - transform.transform.position.z;

    const invInertia = this.calculateInverseInertia(entityId, physics.mass);
    physics.angularVelocity.x += (ry * impulse.z - rz * impulse.y) * invInertia;
    physics.angularVelocity.y += (rz * impulse.x - rx * impulse.z) * invInertia;
    physics.angularVelocity.z += (rx * impulse.y - ry * impulse.x) * invInertia;
  }

  setBodyTransform(entityId: EntityId, position: Vec3, rotation: { x: number; y: number; z: number; w: number }): void {
    const transform = this.world.entityManager.getComponent(entityId, ComponentTypeIds.TRANSFORM as any) as any;
    if (transform) {
      transform.transform.position = { ...position };
      transform.transform.rotation = { ...rotation };
    }
  }

  setBodyVelocity(entityId: EntityId, linear: Vec3, angular: Vec3): void {
    const physics = this.world.entityManager.getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS as any);
    if (physics) {
      physics.linearVelocity = { ...linear };
      physics.angularVelocity = { ...angular };
    }
  }

  getCollisionEvents(): CollisionEvent[] {
    const events = [...this.collisionEvents];
    this.collisionEvents = [];
    return events;
  }

  getGravity(): Vec3 {
    return { ...this.gravity };
  }

  setGravity(gravity: Vec3): void {
    this.gravity = { ...gravity };
  }

  setWorldFriction(friction: number): void {
    this.worldFriction = Math.max(0, Math.min(1, friction));
  }

  reset(): void {
    this.collisionEvents = [];
  }
}