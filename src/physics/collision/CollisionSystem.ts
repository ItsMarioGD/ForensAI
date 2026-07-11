import { EntityId, CollisionEvent, ContactPoint, Vec3, AABB } from '../../core/types';
import { EntityManager } from '../../ecs/ecs';
import { TransformComponent, PhysicsComponent, ComponentTypeIds } from '../../core/components';

interface ColliderData {
  entityId: EntityId;
  aabb: AABB;
  radius: number;
  transform: { position: Vec3; rotation: { x: number; y: number; z: number; w: number } };
}

export class CollisionDetectionSystem {
  private broadphaseCache: Map<number, ColliderData> = new Map();
  private pairCache: Set<string> = new Set();

  detectCollisions(entityManager: EntityManager): CollisionEvent[] {
    const events: CollisionEvent[] = [];
    const candidates = this.broadphase(entityManager);

    for (let i = 0; i < candidates.length; i++) {
      for (let j = i + 1; j < candidates.length; j++) {
        const a = candidates[i];
        const b = candidates[j];

        if (!this.aabbOverlap(a.aabb, b.aabb)) continue;

        if (this.pairCache.has(`${a.entityId}:${b.entityId}`)) continue;
        this.pairCache.add(`${a.entityId}:${b.entityId}`);

        const contacts = this.narrowphase(a, b);
        if (contacts.length > 0) {
          const totalImpulse = contacts.reduce((sum, c) => sum + c.impulse, 0);
          events.push({
            entityA: a.entityId,
            entityB: b.entityId,
            contacts,
            totalImpulse,
            timestamp: performance.now(),
          });
        }
      }
    }

    if (this.pairCache.size > 10000) {
      this.pairCache.clear();
    }

    return events;
  }

  private broadphase(entityManager: EntityManager): ColliderData[] {
    const candidates: ColliderData[] = [];

    for (const entityId of entityManager.getAllEntities()) {
      const transform = entityManager.getComponent<TransformComponent>(entityId, ComponentTypeIds.TRANSFORM as any);
      const physics = entityManager.getComponent<PhysicsComponent>(entityId, ComponentTypeIds.PHYSICS as any);

      if (!transform || !physics) continue;

      const aabb = this.computeAABB(transform.transform.position, 1.0);
      candidates.push({
        entityId,
        aabb,
        radius: 1.0,
        transform: { position: transform.transform.position, rotation: transform.transform.rotation },
      });
    }

    return candidates;
  }

  private computeAABB(position: Vec3, radius: number): AABB {
    return {
      min: { x: position.x - radius, y: position.y - radius, z: position.z - radius },
      max: { x: position.x + radius, y: position.y + radius, z: position.z + radius },
    };
  }

  private aabbOverlap(a: AABB, b: AABB): boolean {
    return (
      a.min.x <= b.max.x && a.max.x >= b.min.x &&
      a.min.y <= b.max.y && a.max.y >= b.min.y &&
      a.min.z <= b.max.z && a.max.z >= b.min.z
    );
  }

  private narrowphase(a: ColliderData, b: ColliderData): ContactPoint[] {
    const dx = b.transform.position.x - a.transform.position.x;
    const dy = b.transform.position.y - a.transform.position.y;
    const dz = b.transform.position.z - a.transform.position.z;
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const combinedRadius = a.radius + b.radius;

    if (dist >= combinedRadius || dist < 0.0001) return [];

    const penetration = combinedRadius - dist;
    const nx = dx / dist;
    const ny = dy / dist;
    const nz = dz / dist;

    const contactX = a.transform.position.x + nx * (a.radius - penetration * 0.5);
    const contactY = a.transform.position.y + ny * (a.radius - penetration * 0.5);
    const contactZ = a.transform.position.z + nz * (a.radius - penetration * 0.5);

    const relativeVelocity = Math.sqrt(
      (b.transform.position.x - a.transform.position.x) ** 2 +
      (b.transform.position.y - a.transform.position.y) ** 2 +
      (b.transform.position.z - a.transform.position.z) ** 2
    );

    const impulse = relativeVelocity * 0.5 + penetration * 100;

    return [{
      pointA: { x: contactX, y: contactY, z: contactZ },
      pointB: { x: contactX, y: contactY, z: contactZ },
      normal: { x: nx, y: ny, z: nz },
      distance: -penetration,
      impulse,
    }];
  }

  clearCache(): void {
    this.broadphaseCache.clear();
    this.pairCache.clear();
  }
}