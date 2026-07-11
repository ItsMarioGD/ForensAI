export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
}

export interface Mat4 {
  elements: Float32Array;
}

export interface Transform {
  position: Vec3;
  rotation: Quat;
  scale: Vec3;
}

export interface AABB {
  min: Vec3;
  max: Vec3;
}

export interface RaycastResult {
  hasHit: boolean;
  hitPoint: Vec3;
  hitNormal: Vec3;
  distance: number;
  entityId: number | null;
  bodyId: number | null;
}

export interface ContactPoint {
  pointA: Vec3;
  pointB: Vec3;
  normal: Vec3;
  distance: number;
  impulse: number;
}

export interface CollisionEvent {
  entityA: number;
  entityB: number;
  contacts: ContactPoint[];
  totalImpulse: number;
  timestamp: number;
}

export type EntityId = number & { readonly __brand: unique symbol };
export type ComponentId = number & { readonly __brand: unique symbol };
export type SystemId = number & { readonly __brand: unique symbol };

export function createEntityId(id: number): EntityId {
  return id as EntityId;
}

export function createComponentId(id: number): ComponentId {
  return id as ComponentId;
}

export function createSystemId(id: number): SystemId {
  return id as SystemId;
}

export interface Snapshot {
  frame: number;
  timestamp: number;
  entities: Map<EntityId, EntitySnapshot>;
}

export interface EntitySnapshot {
  entityId: EntityId;
  transform: Transform;
  linearVelocity: Vec3;
  angularVelocity: Vec3;
  forces: Vec3;
  torques: Vec3;
}

export interface SimulationState {
  currentFrame: number;
  currentTime: number;
  fixedTimeStep: number;
  maxSubSteps: number;
  isPaused: boolean;
  isRewinding: boolean;
  timeScale: number;
  snapshots: Snapshot[];
  maxSnapshots: number;
}

export interface VehicleConfig {
  mass: number;
  chassisDimensions: Vec3;
  wheelBase: number;
  trackWidth: number;
  centerOfMass: Vec3;
  engineTorque: number;
  engineMaxRpm: number;
  engineIdleRpm: number;
  gearRatios: number[];
  finalDriveRatio: number;
  differentialType: 'open' | 'limited_slip' | 'locking';
  suspensionStiffness: number;
  suspensionCompression: number;
  suspensionDamping: number;
  suspensionRestLength: number;
  suspensionTravel: number;
  wheelRadius: number;
  wheelWidth: number;
  frictionSlip: number;
  pacejkaB: number;
  pacejkaC: number;
  pacejkaD: number;
  pacejkaE: number;
  brakeForce: number;
  maxSteerAngle: number;
  steerSpeed: number;
}

export interface WheelState {
  rotation: number;
  deltaRotation: number;
  steerAngle: number;
  suspensionLength: number;
  isInContact: boolean;
  contactPoint: Vec3;
  contactNormal: Vec3;
  sideSlip: number;
  longitudinalSlip: number;
  lateralForce: number;
  longitudinalForce: number;
  rpm: number;
}

export interface VehicleTelemetry {
  entityId: EntityId;
  speed: number;
  velocity: Vec3;
  localVelocity: Vec3;
  acceleration: Vec3;
  gForceLateral: number;
  gForceLongitudinal: number;
  gForceVertical: number;
  steerAngle: number;
  throttle: number;
  brake: number;
  gear: number;
  rpm: number;
  wheelStates: WheelState[];
  pitch: number;
  roll: number;
  yaw: number;
  angularVelocity: Vec3;
}

export interface MaterialPBR {
  albedo: Vec3;
  metalness: number;
  roughness: number;
  clearcoat: number;
  clearcoatRoughness: number;
  normalScale: number;
  emissive: Vec3;
  emissiveIntensity: number;
  opacity: number;
  ior: number;
  transmission: number;
  thickness: number;
  attenuationDistance: number;
  attenuationColor: Vec3;
}

export interface MaterialPresets {
  carPaint: MaterialPBR;
  carGlass: MaterialPBR;
  carChrome: MaterialPBR;
  carRubber: MaterialPBR;
  carPlastic: MaterialPBR;
  asphalt: MaterialPBR;
  concrete: MaterialPBR;
  dirt: MaterialPBR;
  grass: MaterialPBR;
  snow: MaterialPBR;
  ice: MaterialPBR;
  water: MaterialPBR;
}

export interface LightConfig {
  type: 'directional' | 'point' | 'spot' | 'hemisphere';
  color: Vec3;
  intensity: number;
  position?: Vec3;
  direction?: Vec3;
  distance?: number;
  decay?: number;
  angle?: number;
  penumbra?: number;
  castShadow: boolean;
  shadowMapSize?: number;
  shadowCameraNear?: number;
  shadowCameraFar?: number;
  shadowBias?: number;
  shadowNormalBias?: number;
}

export interface HDRIConfig {
  url: string;
  intensity: number;
  rotation: number;
  exposure: number;
  blur: number;
}

export interface PostProcessConfig {
  ssao: {
    enabled: boolean;
    kernelSize: number;
    radius: number;
    intensity: number;
    bias: number;
  };
  bloom: {
    enabled: boolean;
    threshold: number;
    strength: number;
    radius: number;
  };
  taa: {
    enabled: boolean;
    jitterOffset: number;
    blendFactor: number;
  };
  fxaa: {
    enabled: boolean;
  };
  colorGrading: {
    enabled: boolean;
    exposure: number;
    contrast: number;
    saturation: number;
    temperature: number;
    tint: number;
  };
}

export interface ParticleConfig {
  maxParticles: number;
  lifetime: number;
  startSize: number;
  endSize: number;
  startColor: Vec3;
  endColor: Vec3;
  startAlpha: number;
  endAlpha: number;
  emissionRate: number;
  emissionBurst: number;
  velocity: Vec3;
  velocityVariation: Vec3;
  acceleration: Vec3;
  gravity: number;
  drag: number;
  angularVelocity: number;
  angularVelocityVariation: number;
  textureUrl?: string;
  blendMode: 'additive' | 'alpha' | 'opaque';
  depthWrite: boolean;
  depthTest: boolean;
}

export interface GlassShatterConfig extends ParticleConfig {
  shardCount: number;
  shardMinSize: number;
  shardMaxSize: number;
  radialVelocity: number;
  radialVariation: number;
  thickness: number;
  ior: number;
}

export interface SparkConfig extends ParticleConfig {
  minSpeed: number;
  maxSpeed: number;
  minLifetime: number;
  maxLifetime: number;
  colorStart: Vec3;
  colorEnd: Vec3;
}

export interface FluidConfig extends ParticleConfig {
  viscosity: number;
  surfaceTension: number;
  particleSpacing: number;
  restDensity: number;
  gasConstant: number;
}

export interface SkidMarkPoint {
  position: Vec3;
  normal: Vec3;
  intensity: number;
  width: number;
  timestamp: number;
}

export interface SkidMarkConfig {
  minSlipAngle: number;
  maxSkidMarks: number;
  segmentLength: number;
  width: number;
  textureUrl: string;
  lifetime: number;
  fadeTime: number;
}

export interface WeatherState {
  timeOfDay: number;
  sunIntensity: number;
  sunColor: Vec3;
  moonIntensity: number;
  moonColor: Vec3;
  ambientIntensity: number;
  ambientColor: Vec3;
  fogDensity: number;
  fogColor: Vec3;
  fogNear: number;
  fogFar: number;
  precipitationType: 'none' | 'rain' | 'snow' | 'hail';
  precipitationIntensity: number;
  windDirection: Vec3;
  windSpeed: number;
  cloudCover: number;
  temperature: number;
  humidity: number;
}

export interface RoadCondition {
  type: 'dry' | 'wet' | 'dirt' | 'snow' | 'ice';
  frictionCoefficient: number;
  rollingResistance: number;
  puddleCoverage: number;
  icePatchProbability: number;
}

export interface CameraConfig {
  type: 'orbit' | 'cctv' | 'drone' | 'dashcam';
  position: Vec3;
  target: Vec3;
  fov: number;
  near: number;
  far: number;
  aspect: number;
  cctv?: {
    distortion: number;
    monochrome: boolean;
    scanlines: boolean;
    noise: number;
  };
  drone?: {
    orthographic: boolean;
    orthoSize: number;
  };
  dashcam?: {
    vehicleId: EntityId;
    offset: Vec3;
    rotation: Quat;
    fov: number;
  };
}

export interface DecalConfig {
  position: Vec3;
  normal: Vec3;
  size: Vec3;
  rotation: number;
  textureUrl: string;
  opacity: number;
  lifetime: number;
  fadeTime: number;
}

export interface JointConfig {
  entityA: EntityId;
  entityB: EntityId;
  anchorA: Vec3;
  anchorB: Vec3;
  axis: Vec3;
  breakingThreshold: number;
  collisionEnabled: boolean;
}

export interface DeformationConfig {
  enabled: boolean;
  damageRadius: number;
  maxDisplacement: number;
  falloffExponent: number;
  vertexMass: number;
  stiffness: number;
  damping: number;
  plasticDeformationThreshold: number;
  maxPlasticStrain: number;
}

export interface AssetManifest {
  vehicles: VehicleAsset[];
  environments: EnvironmentAsset[];
  materials: MaterialAsset[];
  particles: ParticleAsset[];
  audio: AudioAsset[];
}

export interface VehicleAsset {
  id: string;
  name: string;
  url: string;
  config: VehicleConfig;
  subMeshes: SubMeshConfig[];
}

export interface SubMeshConfig {
  name: string;
  nodeName: string;
  materialId: string;
  isDetachable: boolean;
  jointConfig?: JointConfig;
  deformationConfig?: DeformationConfig;
}

export interface MaterialAsset {
  id: string;
  name: string;
  pbr: MaterialPBR;
  textures: {
    albedo?: string;
    normal?: string;
    metalness?: string;
    roughness?: string;
    clearcoat?: string;
    clearcoatRoughness?: string;
    emissive?: string;
    opacity?: string;
    transmission?: string;
    thickness?: string;
  };
}

export interface EnvironmentAsset {
  id: string;
  name: string;
  type: 'highway' | 'urban' | 'roundabout' | 'rural';
  url: string;
  roadConditions: RoadCondition[];
  spawnPoints: Vec3[];
}

export interface ParticleAsset {
  id: string;
  name: string;
  config: ParticleConfig;
  textureUrl?: string;
}

export interface AudioAsset {
  id: string;
  name: string;
  url: string;
  type: 'engine' | 'tire' | 'impact' | 'ambient' | 'siren';
  loop: boolean;
  volume: number;
  pitch: number;
  spatial: boolean;
}