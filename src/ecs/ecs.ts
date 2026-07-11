import { EntityId, ComponentId, SystemId, createEntityId, createComponentId, createSystemId } from '../core/types';

export abstract class Component {
  readonly entityId: EntityId;
  readonly componentId: ComponentId;
  enabled: boolean = true;

  constructor(entityId: EntityId) {
    this.entityId = entityId;
    this.componentId = createComponentId(ComponentRegistry.getNextId());
  }

  abstract getTypeId(): ComponentId;
  abstract clone(entityId: EntityId): Component;
  abstract serialize(): object;
  abstract deserialize(data: object): void;
}

export abstract class System {
  readonly systemId: SystemId;
  readonly priority: number;
  enabled: boolean = true;

  constructor(priority: number = 0) {
    this.systemId = createSystemId(SystemRegistry.getNextId());
    this.priority = priority;
  }

  abstract update(deltaTime: number, entities: EntityManager): void;
  abstract getRequiredComponents(): ComponentId[];
  onEntityAdded(entityId: EntityId, entityManager: EntityManager): void {}
  onEntityRemoved(entityId: EntityId, entityManager: EntityManager): void {}
}

export class EntityManager {
  private entities: Map<EntityId, Set<ComponentId>> = new Map();
  private components: Map<ComponentId, Component> = new Map();
  private componentTypeMap: Map<ComponentId, ComponentId> = new Map();
  private nextEntityId: number = 1;

  createEntity(): EntityId {
    const entityId = createEntityId(this.nextEntityId++);
    this.entities.set(entityId, new Set());
    return entityId;
  }

  destroyEntity(entityId: EntityId): void {
    const componentIds = this.entities.get(entityId);
    if (componentIds) {
      for (const componentId of componentIds) {
        this.removeComponent(entityId, componentId);
      }
      this.entities.delete(entityId);
    }
  }

  addComponent<T extends Component>(entityId: EntityId, component: T): T {
    const entityComponents = this.entities.get(entityId);
    if (!entityComponents) {
      throw new Error(`Entity ${entityId} does not exist`);
    }

    const componentId = component.componentId;
    entityComponents.add(componentId);
    this.components.set(componentId, component);
    this.componentTypeMap.set(componentId, component.getTypeId());

    return component;
  }

  removeComponent(entityId: EntityId, componentId: ComponentId): boolean {
    const entityComponents = this.entities.get(entityId);
    if (!entityComponents || !entityComponents.has(componentId)) {
      return false;
    }

    entityComponents.delete(componentId);
    this.components.delete(componentId);
    this.componentTypeMap.delete(componentId);
    return true;
  }

  getComponent<T extends Component>(entityId: EntityId, typeId: ComponentId): T | null {
    const entityComponents = this.entities.get(entityId);
    if (!entityComponents) return null;

    for (const componentId of entityComponents) {
      if (this.componentTypeMap.get(componentId) === typeId) {
        return this.components.getComponent as unknown as T;
      }
    }
    return null;
  }

  getComponentById<T extends Component>(componentId: ComponentId): T | null {
    return this.components.get(componentId) as T | null;
  }

  hasComponent(entityId: EntityId, typeId: ComponentId): boolean {
    const entityComponents = this.entities.get(entityId);
    if (!entityComponents) return false;

    for (const componentId of entityComponents) {
      if (this.componentTypeMap.get(componentId) === typeId) {
        return true;
      }
    }
    return false;
  }

  getEntitiesWithComponent(typeId: ComponentId): EntityId[] {
    const result: EntityId[] = [];
    for (const [entityId, componentIds] of this.entities) {
      for (const componentId of componentIds) {
        if (this.componentTypeMap.get(componentId) === typeId) {
          result.push(entityId);
          break;
        }
      }
    }
    return result;
  }

  getEntitiesWithComponents(typeIds: ComponentId[]): EntityId[] {
    const result: EntityId[] = [];
    for (const [entityId, componentIds] of this.entities) {
      let hasAll = true;
      for (const typeId of typeIds) {
        let hasType = false;
        for (const componentId of componentIds) {
          if (this.componentTypeMap.get(componentId) === typeId) {
            hasType = true;
            break;
          }
        }
        if (!hasType) {
          hasAll = false;
          break;
        }
      }
      if (hasAll) result.push(entityId);
    }
    return result;
  }

  getAllEntities(): EntityId[] {
    return Array.from(this.entities.keys());
  }

  getComponentCount(): number {
    return this.components.size;
  }

  getEntityCount(): number {
    return this.entities.size;
  }
}

class ComponentRegistry {
  private static idCounter: number = 0;

  static getNextId(): number {
    return ++ComponentRegistry.idCounter;
  }

  static register<T extends Component>(componentClass: new (...args: any[]) => T): ComponentId {
    return createComponentId(ComponentRegistry.getNextId());
  }
}

class SystemRegistry {
  private static idCounter: number = 0;

  static getNextId(): number {
    return ++SystemRegistry.idCounter;
  }

  static register(systemClass: new (...args: any[]) => System): SystemId {
    return createSystemId(SystemRegistry.getNextId());
  }
}

export class SystemManager {
  private systems: System[] = [];
  private entityManager: EntityManager;

  constructor(entityManager: EntityManager) {
    this.entityManager = entityManager;
  }

  addSystem(system: System): void {
    this.systems.push(system);
    this.systems.sort((a, b) => a.priority - b.priority);
  }

  removeSystem(systemId: SystemId): boolean {
    const index = this.systems.findIndex(s => s.systemId === systemId);
    if (index !== -1) {
      this.systems.splice(index, 1);
      return true;
    }
    return false;
  }

  update(deltaTime: number): void {
    for (const system of this.systems) {
      if (system.enabled) {
        system.update(deltaTime, this.entityManager);
      }
    }
  }

  getSystem<T extends System>(systemId: SystemId): T | null {
    return this.systems.find(s => s.systemId === systemId) as T | null;
  }

  getAllSystems(): System[] {
    return [...this.systems];
  }
}

export class World {
  readonly entityManager: EntityManager;
  readonly systemManager: SystemManager;

  constructor() {
    this.entityManager = new EntityManager();
    this.systemManager = new SystemManager(this.entityManager);
  }

  update(deltaTime: number): void {
    this.systemManager.update(deltaTime);
  }

  createEntity(): EntityId {
    return this.entityManager.createEntity();
  }

  destroyEntity(entityId: EntityId): void {
    this.entityManager.destroyEntity(entityId);
  }

  addComponent<T extends Component>(entityId: EntityId, component: T): T {
    return this.entityManager.addComponent(entityId, component);
  }

  removeComponent(entityId: EntityId, componentId: ComponentId): boolean {
    return this.entityManager.removeComponent(entityId, componentId);
  }
}

export interface Query {
  all: ComponentId[];
  any: ComponentId[];
  none: ComponentId[];
}

export function createQuery(options: { all?: ComponentId[]; any?: ComponentId[]; none?: ComponentId[] } = {}): Query {
  return {
    all: options.all || [],
    any: options.any || [],
    none: options.none || [],
  };
}

export function matchesQuery(entityManager: EntityManager, entityId: EntityId, query: Query): boolean {
  for (const typeId of query.all) {
    if (!entityManager.hasComponent(entityId, typeId)) return false;
  }

  if (query.any.length > 0) {
    let hasAny = false;
    for (const typeId of query.any) {
      if (entityManager.hasComponent(entityId, typeId)) {
        hasAny = true;
        break;
      }
    }
    if (!hasAny) return false;
  }

  for (const typeId of query.none) {
    if (entityManager.hasComponent(entityId, typeId)) return false;
  }

  return true;
}

export function queryEntities(entityManager: EntityManager, query: Query): EntityId[] {
  const candidates = query.all.length > 0
    ? entityManager.getEntitiesWithComponents(query.all)
    : entityManager.getAllEntities();

  return candidates.filter(entityId => matchesQuery(entityManager, entityId, query));
}