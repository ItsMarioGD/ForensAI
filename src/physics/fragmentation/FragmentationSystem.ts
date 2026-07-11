import { Vec3, CollisionEvent, ContactPoint } from '../../core/types';
import { EntityManager, EntityId } from '../../ecs/ecs';
import { JointComponent, TransformComponent, PhysicsComponent, ComponentTypeIds } from '../../core/components';

interface DetachedPart {
  originalEntityId: EntityId;
  newEntityId: EntityId;
  worldPosition: Vec3;
  worldVelocity: Vec3;
  worldAngularVelocity: Vec3;
  mass: number;
}

export class FragmentationSystem {
  private detachedParts: DetachedPart[] = [];

  checkFragmentation(event: CollisionEvent, entityManager: EntityManager): void {
    this.checkEntityJoints(event.entityA, event, entityManager);
    this.checkEntityJoints(event.entityB, event, entityManager);
  }

  private checkEntityJoints(entityId: number, event: CollisionEvent, entityManager: EntityManager): void {
    const entityComponents = (entityManager as any).entities.get(entityId);
    if (!entityComponents) return;

    for (const componentId of entityComponents) {
      const component = entityManager.getComponentById(componentId);
      if (!component || component.getTypeId() !== (ComponentTypeIds.JOINT as unknown as any)) continue;

      const joint = component as JointComponent;
      if (joint.isBroken) continue;

      const impactForce = this.calculateImpactForce(event.entityA, event.entityB);
      if (impactForce > joint.breakingThreshold) {
        this.breakJoint(joint, entityManager, event);
      }
    }
  }

  private calculateImpactForce(entityA: number, entityB: number): number {
    return Math.abs(entityA - entityB) * 10 + 1000;
  }

  private breakJoint(joint: JointComponent, entityManager: EntityManager, event: CollisionEvent): void {
    joint.isBroken = true;

    const newEntityId = entityManager.createEntity();
    const srcTransform = entityManager.getComponent<TransformComponent>(
      joint.entityB,
      ComponentTypeIds.TRANSFORM as any
    );

    if (srcTransform) {
      const newTransform = new TransformComponent(
        newEntityId,
        { ...srcTransform.transform.position },
        { ...srcTransform.transform.rotation },
        { ...srcTransform.transform.scale }
      );
      entityManager.addComponent(newEntityId, newTransform);

      const velocity: Vec3 = {
        x: (Math.random() - 0.5) * 10 + event.contacts[0].normal.x * event.totalImpulse * 0.01,
        y: Math.abs(event.contacts[0].normal.y) * event.totalImpulse * 0.01 + 2,
        z: (Math.random() - 0.5) * 10 + event.contacts[0].normal.z * event.totalImpulse * 0.01,
      };

      const newPhysics = new PhysicsComponent(newEntityId, 5, false);
      newPhysics.linearVelocity = velocity;
      newPhysics.angularVelocity = {
        x: (Math.random() - 0.5) * 10,
        y: (Math.random() - 0.5) * 10,
        z: (Math.random() - 0.5) * 10,
      };
      entityManager.addComponent(newEntityId, newPhysics);

      this.detachedParts.push({
        originalEntityId: joint.entityB,
        newEntityId,
        worldPosition: { ...srcTransform.transform.position },
        worldVelocity: velocity,
        worldAngularVelocity: { ...newPhysics.angularVelocity },
        mass: 5,
      });
    }
  }

  getDetachedParts(): DetachedPart[] {
    const parts = [...this.detachedParts];
    return parts;
  }

  getDetachedPartCount(): number {
    return this.detachedParts.length;
  }

  clearDetachedParts(): void {
    this.detachedParts = [];
  }
}