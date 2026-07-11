import { Vec3, CollisionEvent, ContactPoint } from '../../core/types';
import { EntityManager } from '../../ecs/ecs';
import { DeformationComponent, TransformComponent, ComponentTypeIds } from '../../core/components';

interface DeformedVertex {
  index: number;
  originalPosition: Vec3;
  currentDisplacement: Vec3;
  plasticStrain: number;
}

export class DeformationSystem {
  private readonly DAMAGE_RADIUS: number = 2.0;
  private readonly MAX_DISPLACEMENT: number = 0.5;
  private readonly FALLOFF_EXPONENT: number = 2.0;
  private readonly STIFFNESS: number = 0.8;
  private readonly DAMPING: number = 0.3;
  private readonly PLASTIC_THRESHOLD: number = 500.0;
  private readonly MAX_PLASTIC_STRAIN: number = 0.8;

  applyDeformation(event: CollisionEvent, entityManager: EntityManager): void {
    for (const contact of event.contacts) {
      this.applyDeformationToEntity(event.entityA, contact, entityManager);
      this.applyDeformationToEntity(event.entityB, contact, entityManager);
    }
  }

  private applyDeformationToEntity(entityId: number, contact: ContactPoint, entityManager: EntityManager): void {
    const decomp = entityManager.getComponent<DeformationComponent>(entityId as any, ComponentTypeIds.DEFORMATION as any);
    if (!decomp || decomp.vertexCount === 0) return;

    const transform = entityManager.getComponent<TransformComponent>(entityId as any, ComponentTypeIds.TRANSFORM as any);
    if (!transform) return;

    const impactForce = contact.impulse;
    if (impactForce < 100) return;

    const intensity = Math.min(1.0, impactForce / 10000);
    const damageRadius = this.DAMAGE_RADIUS * (0.5 + intensity * 0.5);

    const impactWorld = contact.pointA;
    const localImpact = this.worldToLocal(impactWorld, transform.transform);

    for (let i = 0; i < decomp.vertexCount; i++) {
      const idx = i * 3;
      const vx = decomp.originalPositions[idx];
      const vy = decomp.originalPositions[idx + 1];
      const vz = decomp.originalPositions[idx + 2];

      const dx = vx - localImpact.x;
      const dy = vy - localImpact.y;
      const dz = vz - localImpact.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (dist > damageRadius) continue;

      const falloff = Math.pow(1.0 - dist / damageRadius, this.FALLOFF_EXPONENT);
      const displacement = this.MAX_DISPLACEMENT * intensity * falloff;

      if (impactForce > this.PLASTIC_THRESHOLD) {
        const plasticStrain = Math.min(
          this.MAX_PLASTIC_STRAIN,
          (impactForce - this.PLASTIC_THRESHOLD) / 10000 * falloff
        );

        const plasticDisp = displacement * (1 + plasticStrain);
        decomp.currentPositions[idx] = vx + contact.normal.x * plasticDisp;
        decomp.currentPositions[idx + 1] = vy + contact.normal.y * plasticDisp;
        decomp.currentPositions[idx + 2] = vz + contact.normal.z * plasticDisp;
      } else {
        const springForce = (decomp.currentPositions[idx] - vx) * this.STIFFNESS;
        const dampingForce = (decomp.currentPositions[idx] - decomp.currentPositions[idx]) * this.DAMPING;
        const totalDisp = displacement + springForce + dampingForce;

        decomp.currentPositions[idx] = vx + contact.normal.x * totalDisp;
        decomp.currentPositions[idx + 1] = vy + contact.normal.y * totalDisp;
        decomp.currentPositions[idx + 2] = vz + contact.normal.z * totalDisp;
      }
    }
  }

  private worldToLocal(worldPos: Vec3, transform: { position: Vec3; rotation: { x: number; y: number; z: number; w: number }; scale: Vec3 }): Vec3 {
    const dx = worldPos.x - transform.position.x;
    const dy = worldPos.y - transform.position.y;
    const dz = worldPos.z - transform.position.z;

    const q = transform.rotation;
    const qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;

    const ix = qw * dx + qy * dz - qz * dy;
    const iy = qw * dy + qz * dx - qx * dz;
    const iz = qw * dz + qx * dy - qy * dx;
    const iw = -qx * dx - qy * dy - qz * dz;

    return {
      x: (ix * qw + iw * -qx + iy * -qz - iz * -qy) / transform.scale.x,
      y: (iy * qw + iw * -qy + iz * -qx - ix * -qz) / transform.scale.y,
      z: (iz * qw + iw * -qz + ix * -qy - iy * -qx) / transform.scale.z,
    };
  }

  setDamageRadius(radius: number): void {
    // @ts-ignore
    this.DAMAGE_RADIUS = radius;
  }

  setMaxDisplacement(displacement: number): void {
    // @ts-ignore
    this.MAX_DISPLACEMENT = displacement;
  }
}