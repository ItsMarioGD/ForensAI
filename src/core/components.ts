import { Component } from '../ecs/ecs';
import { EntityId, Transform, Vec3, Quat, VehicleConfig, WheelState } from '../core/types';

export class ComponentTypeIds {
  static TRANSFORM = 1 as const;
  static PHYSICS = 2 as const;
  static VEHICLE = 3 as const;
  static MESH = 4 as const;
  static JOINT = 5 as const;
  static DEFORMATION = 6 as const;
  static CAMERA = 7 as const;
  static COLLIDER = 8 as const;
  static PARTICLE_EMITTER = 9 as const;
  static ENVIRONMENT = 10 as const;
  static WEATHER = 11 as const;
  static LIGHT = 12 as const;
  static WHEEL = 13 as const;
  static DECAL = 14 as const;
  static SKID_MARK = 15 as const;
}

export class TransformComponent extends Component {
  static TYPE = ComponentTypeIds.TRANSFORM;

  transform: Transform;

  constructor(entityId: EntityId, position: Vec3 = { x: 0, y: 0, z: 0 }, rotation: Quat = { x: 0, y: 0, z: 0, w: 1 }, scale: Vec3 = { x: 1, y: 1, z: 1 }) {
    super(entityId);
    this.transform = { position, rotation, scale };
  }

  getTypeId(): ComponentId { return TransformComponent.TYPE as unknown as ComponentId; }
  clone(entityId: EntityId): TransformComponent {
    return new TransformComponent(entityId, { ...this.transform.position }, { ...this.transform.rotation }, { ...this.transform.scale });
  }
  serialize(): object { return { ...this.transform }; }
  deserialize(data: any): void { this.transform = data; }
}

export class PhysicsComponent extends Component {
  static TYPE = ComponentTypeIds.PHYSICS;

  mass: number;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
  appliedForce: Vec3;
  appliedTorque: Vec3;
  isStatic: boolean;
  frictionCoefficient: number;
  restitution: number;

  constructor(entityId: EntityId, mass: number = 1, isStatic: boolean = false) {
    super(entityId);
    this.mass = mass;
    this.linearVelocity = { x: 0, y: 0, z: 0 };
    this.angularVelocity = { x: 0, y: 0, z: 0 };
    this.appliedForce = { x: 0, y: 0, z: 0 };
    this.appliedTorque = { x: 0, y: 0, z: 0 };
    this.isStatic = isStatic;
    this.frictionCoefficient = 0.8;
    this.restitution = 0.1;
  }

  getTypeId(): ComponentId { return PhysicsComponent.TYPE as unknown as ComponentId; }
  clone(entityId: EntityId): PhysicsComponent { return new PhysicsComponent(entityId, this.mass, this.isStatic); }
  serialize(): object {
    return { mass: this.mass, linearVelocity: this.linearVelocity, angularVelocity: this.angularVelocity, isStatic: this.isStatic };
  }
  deserialize(data: any): void {
    this.mass = data.mass;
    this.linearVelocity = data.linearVelocity;
    this.angularVelocity = data.angularVelocity;
    this.isStatic = data.isStatic;
  }
}

export class VehicleComponent extends Component {
  static TYPE = ComponentTypeIds.VEHICLE;

  config: VehicleConfig;
  wheels: WheelState[];
  currentGear: number;
  engineRpm: number;
  throttle: number;
  brake: number;
  steerAngle: number;
  speed: number;
  acceleration: Vec3;

  constructor(entityId: EntityId, config: VehicleConfig) {
    super(entityId);
    this.config = config;
    this.wheels = [];
    this.currentGear = 0;
    this.engineRpm = 0;
    this.throttle = 0;
    this.brake = 0;
    this.steerAngle = 0;
    this.speed = 0;
    this.acceleration = { x: 0, y: 0, z: 0 };

    for (let i = 0; i < 4; i++) {
      this.wheels.push({
        rotation: 0,
        deltaRotation: 0,
        steerAngle: 0,
        suspensionLength: config.suspensionRestLength,
        isInContact: false,
        contactPoint: { x: 0, y: 0, z: 0 },
        contactNormal: { x: 0, y: 1, z: 0 },
        sideSlip: 0,
        longitudinalSlip: 0,
        lateralForce: 0,
        longitudinalForce: 0,
        rpm: 0,
      });
    }
  }

  getTypeId(): ComponentId { return VehicleComponent.TYPE as unknown as ComponentId; }
  clone(entityId: EntityId): VehicleComponent { return new VehicleComponent(entityId, { ...this.config }); }
  serialize(): object { return { config: this.config, currentGear: this.currentGear, engineRpm: this.engineRpm }; }
  deserialize(data: any): void {
    this.config = data.config;
    this.currentGear = data.currentGear;
    this.engineRpm = data.engineRpm;
  }
}

export class JointComponent extends Component {
  static TYPE = ComponentTypeIds.JOINT;

  entityB: EntityId;
  anchorA: Vec3;
  anchorB: Vec3;
  axis: Vec3;
  breakingThreshold: number;
  collisionEnabled: boolean;
  isBroken: boolean;

  constructor(entityId: EntityId, entityB: EntityId, anchorA: Vec3, anchorB: Vec3, axis: Vec3, breakingThreshold: number) {
    super(entityId);
    this.entityB = entityB;
    this.anchorA = anchorA;
    this.anchorB = anchorB;
    this.axis = axis;
    this.breakingThreshold = breakingThreshold;
    this.collisionEnabled = false;
    this.isBroken = false;
  }

  getTypeId(): ComponentId { return JointComponent.TYPE as unknown as ComponentId; }
  clone(entityId: EntityId): JointComponent { return new JointComponent(entityId, this.entityB, this.anchorA, this.anchorB, this.axis, this.breakingThreshold); }
  serialize(): object {
    return { entityB: this.entityB, anchorA: this.anchorA, anchorB: this.anchorB, axis: this.axis, breakingThreshold: this.breakingThreshold, isBroken: this.isBroken };
  }
  deserialize(data: any): void {
    this.isBroken = data.isBroken;
  }
}

export class DeformationComponent extends Component {
  static TYPE = ComponentTypeIds.DEFORMATION;

  originalPositions: Float32Array;
  currentPositions: Float32Array;
  normals: Float32Array;
  vertexCount: number;
  displacementScale: number;

  constructor(entityId: EntityId, vertexCount: number) {
    super(entityId);
    this.vertexCount = vertexCount;
    this.originalPositions = new Float32Array(vertexCount * 3);
    this.currentPositions = new Float32Array(vertexCount * 3);
    this.normals = new Float32Array(vertexCount * 3);
    this.displacementScale = 1.0;
  }

  getTypeId(): ComponentId { return DeformationComponent.TYPE as unknown as ComponentId; }
  clone(entityId: EntityId): DeformationComponent {
    const c = new DeformationComponent(entityId, this.vertexCount);
    c.originalPositions.set(this.originalPositions);
    c.currentPositions.set(this.currentPositions);
    c.normals.set(this.normals);
    c.displacementScale = this.displacementScale;
    return c;
  }
  serialize(): object { return { vertexCount: this.vertexCount, displacementScale: this.displacementScale }; }
  deserialize(data: any): void {
    this.displacementScale = data.displacementScale;
  }
}

import { ComponentId } from '../core/types';