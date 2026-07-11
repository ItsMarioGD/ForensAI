import { World } from '../ecs/ecs';
import { SimulationState, Snapshot, EntitySnapshot, EntityId, Vec3 } from '../core/types';

export class SimulationManager {
  private world: World;
  private state: SimulationState;
  private physicsEngine: PhysicsEngine;
  private renderer: RenderEngine;
  private particleManager: ParticleManager;
  private telemetrySystem: TelemetrySystem;

  constructor(
    world: World,
    physicsEngine: PhysicsEngine,
    renderer: RenderEngine,
    particleManager: ParticleManager,
    telemetrySystem: TelemetrySystem
  ) {
    this.world = world;
    this.physicsEngine = physicsEngine;
    this.renderer = renderer;
    this.particleManager = particleManager;
    this.telemetrySystem = telemetrySystem;

    this.state = {
      currentFrame: 0,
      currentTime: 0,
      fixedTimeStep: 1 / 60,
      maxSubSteps: 10,
      isPaused: false,
      isRewinding: false,
      timeScale: 1.0,
      snapshots: [],
      maxSnapshots: 3600,
    };
  }

  getState(): SimulationState {
    return this.state;
  }

  play(): void {
    this.state.isPaused = false;
    this.state.isRewinding = false;
  }

  pause(): void {
    this.state.isPaused = true;
  }

  togglePause(): void {
    this.state.isPaused = !this.state.isPaused;
  }

  rewind(): void {
    this.state.isRewinding = true;
    this.state.isPaused = false;
  }

  stepForward(): void {
    this.state.isPaused = true;
    this.state.isRewinding = false;
    this.tick(this.state.fixedTimeStep);
  }

  stepBackward(): void {
    this.state.isPaused = true;
    this.restoreSnapshot(this.state.currentFrame - 1);
  }

  setTimeScale(scale: number): void {
    this.state.timeScale = Math.max(0.1, Math.min(10, scale));
  }

  setFixedTimeStep(step: number): void {
    this.state.fixedTimeStep = Math.max(1 / 240, Math.min(1 / 30, step));
  }

  jumpToFrame(frame: number): void {
    const snapshot = this.state.snapshots.find(s => s.frame === frame);
    if (snapshot) {
      this.restoreSnapshot(frame);
    }
  }

  private takeSnapshot(): void {
    const snapshot: Snapshot = {
      frame: this.state.currentFrame,
      timestamp: this.state.currentTime,
      entities: new Map(),
    };

    const allEntities = this.world.entityManager.getAllEntities();
    for (const entityId of allEntities) {
      const transformComponent = this.world.entityManager
        .getComponent<TransformComponent>(entityId, ComponentTypeIds.TRANSFORM);
      const physicsComponent = this.world.entityManager
        .getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS);

      if (transformComponent && physicsComponent) {
        snapshot.entities.set(entityId, {
          entityId,
          transform: {
            position: { ...transformComponent.transform.position },
            rotation: { ...transformComponent.transform.rotation },
            scale: { ...transformComponent.transform.scale },
          },
          linearVelocity: { ...physicsComponent.linearVelocity },
          angularVelocity: { ...physicsComponent.angularVelocity },
          forces: { x: 0, y: 0, z: 0 },
          torques: { x: 0, y: 0, z: 0 },
        });
      }
    }

    this.state.snapshots.push(snapshot);
    if (this.state.snapshots.length > this.state.maxSnapshots) {
      this.state.snapshots.shift();
    }
  }

  private restoreSnapshot(frame: number): void {
    const snapshot = this.state.snapshots.find(s => s.frame === frame);
    if (!snapshot) return;

    for (const [entityId, entitySnapshot] of snapshot.entities) {
      const transformComponent = this.world.entityManager
        .getComponent<TransformComponent>(entityId, ComponentTypeIds.TRANSFORM);
      const physicsComponent = this.world.entityManager
        .getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS);

      if (transformComponent) {
        transformComponent.transform = {
          position: { ...entitySnapshot.transform.position },
          rotation: { ...entitySnapshot.transform.rotation },
          scale: { ...entitySnapshot.transform.scale },
        };
      }

      if (physicsComponent) {
        physicsComponent.linearVelocity = { ...entitySnapshot.linearVelocity };
        physicsComponent.angularVelocity = { ...entitySnapshot.angularVelocity };
        this.physicsEngine.setBodyTransform(
          entityId,
          entitySnapshot.transform.position,
          entitySnapshot.transform.rotation
        );
        this.physicsEngine.setBodyVelocity(
          entityId,
          entitySnapshot.linearVelocity,
          entitySnapshot.angularVelocity
        );
      }
    }

    this.state.currentFrame = frame;
    this.state.currentTime = frame * this.state.fixedTimeStep;
  }

  private tick(deltaTime: number): void {
    const adjustedDt = deltaTime * this.state.timeScale;

    this.physicsEngine.stepSimulation(adjustedDt, this.state.maxSubSteps, this.state.fixedTimeStep);

    this.world.update(adjustedDt);

    this.particleManager.update(adjustedDt);

    this.telemetrySystem.update(this.world.entityManager);

    const collisionEvents = this.physicsEngine.getCollisionEvents();
    for (const event of collisionEvents) {
      this.particleManager.onCollision(event);
    }

    this.renderer.updateTransforms(this.world.entityManager);
    this.renderer.render();

    this.takeSnapshot();
    this.state.currentFrame++;
    this.state.currentTime += adjustedDt;
  }

  update(): void {
    const now = performance.now();

    if (this.state.isRewinding) {
      if (this.state.currentFrame > 0) {
        this.restoreSnapshot(this.state.currentFrame - 1);
        this.renderer.updateTransforms(this.world.entityManager);
        this.renderer.render();
      } else {
        this.state.isRewinding = false;
      }
      return;
    }

    if (!this.state.isPaused) {
      this.tick(this.state.fixedTimeStep);
    }
  }

  getFrameCount(): number {
    return this.state.currentFrame;
  }

  getTotalTime(): number {
    return this.state.currentTime;
  }
}

import { RenderEngine } from '../render/RenderEngine';
import { PhysicsEngine } from '../physics/PhysicsEngine';
import { ParticleManager } from '../particles/ParticleSystemManager';
import { TelemetrySystem } from '../telemetry/TelemetrySystem';
import { TransformComponent, ComponentTypeIds } from '../core/components';
import { PhysicsComponent } from '../core/components';