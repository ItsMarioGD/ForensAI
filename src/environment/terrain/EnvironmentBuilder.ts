import { EntityManager } from '../ecs/ecs';
import { Vec3, RoadCondition, EnvironmentAsset, VehicleConfig } from '../core/types';

export class EnvironmentBuilder {
  private terrain: any = null;
  private roads: any[] = [];
  private buildings: any[] = [];
  private foliage: any[] = [];
  private roadSigns: any[] = [];
  private environmentBounds: { min: Vec3; max: Vec3 } = {
    min: { x: -500, y: -10, z: -500 },
    max: { x: 500, y: 50, z: 500 },
  };

  currentRoadCondition: RoadCondition = {
    type: 'dry',
    frictionCoefficient: 0.8,
    rollingResistance: 0.015,
    puddleCoverage: 0,
    icePatchProbability: 0,
  };

  constructor() {}

  buildHighway(length: number = 1000, lanes: number = 3): void {
    const roadWidth = lanes * 3.7 + 2;
    const segmentLength = 20;
    const segments = Math.ceil(length / segmentLength);

    for (let i = 0; i < segments; i++) {
      const z = -length / 2 + i * segmentLength;
      this.roads.push({
        type: 'highway',
        position: { x: 0, y: 0.05, z },
        size: { x: roadWidth, y: 0.1, z: segmentLength },
        lanes,
        laneWidth: 3.7,
        markings: this.generateRoadMarkings(roadWidth, segmentLength),
        barriers: {
          left: { type: 'concrete', height: 0.8 },
          right: { type: 'metal', height: 0.75 },
        },
      });
    }

    this.currentRoadCondition = {
      type: 'dry',
      frictionCoefficient: 0.8,
      rollingResistance: 0.015,
      puddleCoverage: 0,
      icePatchProbability: 0,
    };
  }

  buildUrbanIntersection(size: number = 40): void {
    this.roads.push({
      type: 'intersection',
      position: { x: 0, y: 0.05, z: 0 },
      size: { x: size, y: 0.1, z: size },
      roads: [
        { direction: 'north-south', lanes: 2, width: 8 },
        { direction: 'east-west', lanes: 2, width: 8 },
      ],
      trafficLights: [
        { position: { x: -4, y: 5, z: -4 }, state: 'red', timer: 0 },
        { position: { x: 4, y: 5, z: 4 }, state: 'green', timer: 0 },
      ],
    });

    this.buildings.push(...this.generateUrbanBuildings(size));
  }

  buildRoundabout(radius: number = 20, roadWidth: number = 7): void {
    const segments = 32;

    for (let i = 0; i < segments; i++) {
      const theta = (i / segments) * Math.PI * 2;
      const nextTheta = ((i + 1) / segments) * Math.PI * 2;

      const cx = Math.cos(theta) * radius;
      const cz = Math.sin(theta) * radius;
      const nx = Math.cos(nextTheta) * radius;
      const nz = Math.sin(nextTheta) * radius;

      this.roads.push({
        type: 'roundabout',
        position: { x: (cx + nx) / 2, y: 0.05, z: (cz + nz) / 2 },
        size: { x: roadWidth, y: 0.1, z: Math.sqrt((nx - cx) ** 2 + (nz - cz) ** 2) },
        innerRadius: radius - roadWidth / 2,
        outerRadius: radius + roadWidth / 2,
      });
    }

    for (let i = 0; i < 4; i++) {
      const angle = (i / 4) * Math.PI * 2;
      const exitX = Math.cos(angle) * (radius + 5);
      const exitZ = Math.sin(angle) * (radius + 5);

      this.roads.push({
        type: 'exit',
        position: { x: exitX, y: 0.05, z: exitZ },
        size: { x: 7, y: 0.1, z: 30 },
        angle,
        parentRoundabout: true,
      });
    }
  }

  buildRural(config: { width: number; segments: number; curvature: number }): void {
    const { width, segments, curvature } = config;
    let x = 0, z = 0;
    let angle = 0;

    for (let i = 0; i < segments; i++) {
      angle += (Math.random() - 0.5) * curvature;
      const segLen = 15 + Math.random() * 10;
      const dx = Math.sin(angle) * segLen;
      const dz = Math.cos(angle) * segLen;

      this.roads.push({
        type: 'rural',
        position: { x: x + dx / 2, y: 0.05, z: z + dz / 2 },
        size: { x: width, y: 0.1, z: segLen },
        rotation: angle,
        vegetation: {
          density: 0.3 + Math.random() * 0.5,
          treeSpacing: 5 + Math.random() * 10,
        },
      });

      x += dx;
      z += dz;
    }

    this.currentRoadCondition = {
      type: 'dirt',
      frictionCoefficient: 0.5,
      rollingResistance: 0.04,
      puddleCoverage: 0.1,
      icePatchProbability: 0.01,
    };
  }

  setRoadCondition(condition: RoadCondition): void {
    this.currentRoadCondition = condition;
  }

  getGlobalFriction(): number {
    return this.currentRoadCondition.frictionCoefficient;
  }

  getTerrainHeight(x: number, z: number): number {
    for (const road of this.roads) {
      const dx = x - road.position.x;
      const dz = z - road.position.z;
      if (Math.abs(dx) < road.size.x / 2 && Math.abs(dz) < road.size.z / 2) {
        return road.position.y + 0.1;
      }
    }
    return 0;
  }

  getSpawnPoint(index: number): Vec3 {
    if (this.roads.length > 0) {
      const road = this.roads[index % this.roads.length];
      return {
        x: road.position.x - 0,
        y: road.position.y + 1,
        z: road.position.z - 50,
      };
    }
    return { x: 0, y: 1, z: -50 };
  }

  getEnvironmentBounds(): { min: Vec3; max: Vec3 } {
    return this.environmentBounds;
  }

  private generateRoadMarkings(width: number, length: number): any[] {
    const markings: any[] = [];
    const centerLineX = 0;

    for (let i = 0; i < Math.floor(length / 3); i++) {
      markings.push({
        type: 'center',
        position: { x: centerLineX, y: 0.06, z: -length / 2 + i * 3 },
        size: { x: 0.15, y: 0.01, z: 2 },
        color: { r: 1, g: 1, b: 0 },
      });

      for (let lane = 1; lane < width / 3.7; lane++) {
        const offset = (lane - width / (2 * 3.7 * 2)) * width;
        markings.push({
          type: 'lane',
          position: { x: offset, y: 0.06, z: -length / 2 + i * 3 },
          size: { x: 0.1, y: 0.01, z: 2 },
          color: { r: 1, g: 1, b: 1 },
        });
      }
    }

    return markings;
  }

  private generateUrbanBuildings(size: number): any[] {
    const buildings: any[] = [];
    const spacing = 10;

    for (let x = -size; x <= size; x += spacing) {
      for (let z = -size; z <= size; z += spacing) {
        if (Math.abs(x) < size / 4 && Math.abs(z) < size / 4) continue;

        buildings.push({
          position: { x, y: 0, z },
          size: {
            x: 4 + Math.random() * 8,
            y: 5 + Math.random() * 40,
            z: 4 + Math.random() * 8,
          },
          color: {
            r: 0.5 + Math.random() * 0.3,
            g: 0.5 + Math.random() * 0.3,
            b: 0.55 + Math.random() * 0.3,
          },
          windows: Math.floor(5 + Math.random() * 20),
        });
      }
    }

    return buildings;
  }

  getRoadData(): any[] { return this.roads; }
  getBuildings(): any[] { return this.buildings; }
  getFoliage(): any[] { return this.foliage; }

  reset(): void {
    this.roads = [];
    this.buildings = [];
    this.foliage = [];
    this.roadSigns = [];
    this.terrain = null;
  }
}