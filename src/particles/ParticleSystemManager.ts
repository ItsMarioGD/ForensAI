import { ParticleConfig, CollisionEvent, Vec3, EntityId, GlassShatterConfig, SparkConfig, FluidConfig, DecalConfig } from '../core/types';
import { EntityManager } from '../ecs/ecs';

interface Particle {
  active: boolean;
  position: Vec3;
  velocity: Vec3;
  size: number;
  color: Vec3;
  alpha: number;
  lifetime: number;
  maxLifetime: number;
  rotation: number;
  angularVelocity: number;
  mass: number;
  drag: number;
}

interface ParticleEmitter {
  entityId: EntityId;
  config: ParticleConfig;
  active: boolean;
  particles: Particle[];
  emissionAccumulator: number;
  worldPosition: Vec3;
}

export class ParticleSystemManager {
  private emitters: Map<EntityId, ParticleEmitter> = new Map();
  private decals: DecalConfig[] = [];
  private maxParticlesPerEmitter: number = 2000;
  private globalTime: number = 0;

  constructor(maxParticlesPerEmitter: number = 2000) {
    this.maxParticlesPerEmitter = maxParticlesPerEmitter;
  }

  createEmitter(entityId: EntityId, config: ParticleConfig, worldPosition: Vec3): void {
    this.emitters.set(entityId, {
      entityId,
      config,
      active: true,
      particles: [],
      emissionAccumulator: 0,
      worldPosition,
    });
  }

  removeEmitter(entityId: EntityId): void {
    this.emitters.delete(entityId);
  }

  onCollision(event: CollisionEvent): void {
    for (const contact of event.contacts) {
      if (event.totalImpulse > 500) {
        this.spawnGlassShatter(contact.pointA, event.totalImpulse, contact.normal);
      }

      if (event.totalImpulse > 100) {
        this.spawnSparks(contact.pointA, event.totalImpulse, contact.normal);

        if (event.totalImpulse > 300) {
          this.spawnFluidDecal(contact.pointA, 'coolant');
        }
      }
    }
  }

  spawnGlassShatter(position: Vec3, force: number, normal: Vec3): void {
    const shardCount = Math.min(1000, Math.floor(500 + force * 0.05));

    for (let i = 0; i < shardCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 5 + Math.random() * 15 + force * 0.01;

      const dir: Vec3 = {
        x: Math.sin(phi) * Math.cos(theta) + normal.x * 0.5,
        y: Math.abs(Math.sin(phi) * Math.sin(theta)) + 1,
        z: Math.cos(phi) + normal.z * 0.5,
      };

      const len = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
      dir.x /= len; dir.y /= len; dir.z /= len;

      const tempEmitter: EntityId = -1 as any;
      this.emitParticle({
        active: true,
        position: { ...position },
        velocity: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed },
        size: 0.02 + Math.random() * 0.08,
        color: { x: 0.8 + Math.random() * 0.2, y: 0.85 + Math.random() * 0.15, z: 0.9 + Math.random() * 0.1 },
        alpha: 0.6 + Math.random() * 0.4,
        lifetime: 1.5 + Math.random() * 3,
        maxLifetime: 1.5 + Math.random() * 3,
        rotation: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 20,
        mass: 0.01 + Math.random() * 0.05,
        drag: 0.5 + Math.random() * 0.3,
      });
    }
  }

  spawnSparks(position: Vec3, force: number, normal: Vec3): void {
    const sparkCount = Math.min(200, Math.floor(50 + force * 0.02));

    for (let i = 0; i < sparkCount; i++) {
      const theta = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 10 + force * 0.005;
      const spread = 0.3;

      const dir: Vec3 = {
        x: Math.sin(theta) * spread + normal.x * 0.3,
        y: Math.random() * 0.5 + 0.5,
        z: Math.cos(theta) * spread + normal.z * 0.3,
      };

      const len = Math.sqrt(dir.x ** 2 + dir.y ** 2 + dir.z ** 2);
      dir.x /= len; dir.y /= len; dir.z /= len;

      this.emitParticle({
        active: true,
        position: {
          x: position.x + normal.x * 0.1 + (Math.random() - 0.5) * 0.2,
          y: position.y + normal.y * 0.1,
          z: position.z + normal.z * 0.1 + (Math.random() - 0.5) * 0.2,
        },
        velocity: { x: dir.x * speed, y: dir.y * speed, z: dir.z * speed },
        size: 0.005 + Math.random() * 0.01,
        color: { x: 1.0, y: 0.7 + Math.random() * 0.3, z: Math.random() * 0.3 },
        alpha: 1.0,
        lifetime: 0.1 + Math.random() * 0.4,
        maxLifetime: 0.1 + Math.random() * 0.4,
        rotation: Math.random() * Math.PI * 2,
        angularVelocity: (Math.random() - 0.5) * 30,
        mass: 0.001,
        drag: 0.1,
      });
    }
  }

  spawnFluidDecal(position: Vec3, fluidType: string): void {
    this.decals.push({
      position: { ...position },
      normal: { x: 0, y: 1, z: 0 },
      size: { x: 0.5 + Math.random() * 1.0, y: 0.01, z: 0.5 + Math.random() * 1.0 },
      rotation: Math.random() * Math.PI * 2,
      textureUrl: `textures/decals/${fluidType}.png`,
      opacity: 0.6 + Math.random() * 0.3,
      lifetime: 30 + Math.random() * 60,
      fadeTime: 10,
    });
  }

  private emitParticle(particle: Particle): void {
    const tempEmitter = this.emitters.get(-1 as any);
    if (tempEmitter) {
      tempEmitter.particles.push(particle);
      if (tempEmitter.particles.length > this.maxParticlesPerEmitter) {
        tempEmitter.particles.shift();
      }
    }
  }

  update(dt: number): void {
    this.globalTime += dt;

    for (const [entityId, emitter] of this.emitters) {
      if (!emitter.active) continue;

      emitter.emissionAccumulator += emitter.config.emissionRate * dt;

      while (emitter.emissionAccumulator >= 1) {
        if (emitter.particles.length < this.maxParticlesPerEmitter) {
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(2 * Math.random() - 1);

          emitter.particles.push({
            active: true,
            position: { ...emitter.worldPosition },
            velocity: {
              x: emitter.config.velocity.x + (Math.random() - 0.5) * emitter.config.velocityVariation.x,
              y: emitter.config.velocity.y + (Math.random() - 0.5) * emitter.config.velocityVariation.y,
              z: emitter.config.velocity.z + (Math.random() - 0.5) * emitter.config.velocityVariation.z,
            },
            size: emitter.config.startSize,
            color: { ...emitter.config.startColor },
            alpha: emitter.config.startAlpha,
            lifetime: emitter.config.lifetime * (0.5 + Math.random() * 0.5),
            maxLifetime: emitter.config.lifetime,
            rotation: Math.random() * Math.PI * 2,
            angularVelocity: (Math.random() - 0.5) * emitter.config.angularVelocity * 2,
            mass: 0.01,
            drag: emitter.config.drag,
          });
        }
        emitter.emissionAccumulator -= 1;
      }

      for (let i = emitter.particles.length - 1; i >= 0; i--) {
        const p = emitter.particles[i];
        p.lifetime -= dt;

        if (p.lifetime <= 0) {
          emitter.particles.splice(i, 1);
          continue;
        }

        const life = 1 - p.lifetime / p.maxLifetime;

        p.velocity.x *= (1 - p.drag * dt);
        p.velocity.y *= (1 - p.drag * dt);
        p.velocity.z *= (1 - p.drag * dt);
        p.velocity.y += emitter.config.gravity * dt;

        p.position.x += p.velocity.x * dt;
        p.position.y += p.velocity.y * dt;
        p.position.z += p.velocity.z * dt;

        p.rotation += p.angularVelocity * dt;

        const s = life;
        p.size = emitter.config.startSize + (emitter.config.endSize - emitter.config.startSize) * s;
        p.color.x = emitter.config.startColor.x + (emitter.config.endColor.x - emitter.config.startColor.x) * s;
        p.color.y = emitter.config.startColor.y + (emitter.config.endColor.y - emitter.config.startColor.y) * s;
        p.color.z = emitter.config.startColor.z + (emitter.config.endColor.z - emitter.config.startColor.z) * s;
        p.alpha = emitter.config.startAlpha + (emitter.config.endAlpha - emitter.config.startAlpha) * s;
      }
    }

    for (let i = this.decals.length - 1; i >= 0; i--) {
      const decal = this.decals[i];
      decal.lifetime -= dt;
      if (decal.lifetime <= 0) {
        this.decals.splice(i, 1);
      } else if (decal.lifetime < decal.fadeTime) {
        decal.opacity *= Math.max(0, decal.lifetime / decal.fadeTime);
      }
    }
  }

  getActiveParticleCount(): number {
    let count = 0;
    for (const [, emitter] of this.emitters) {
      count += emitter.particles.length;
    }
    return count;
  }

  getDecalCount(): number {
    return this.decals.length;
  }

  getDecals(): DecalConfig[] {
    return [...this.decals];
  }

  clearAll(): void {
    this.emitters.clear();
    this.decals = [];
  }

  updateEmitterPosition(entityId: EntityId, position: Vec3): void {
    const emitter = this.emitters.get(entityId);
    if (emitter) {
      emitter.worldPosition = { ...position };
    }
  }
}