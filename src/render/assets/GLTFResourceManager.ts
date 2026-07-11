import { AssetManifest, VehicleAsset, EnvironmentAsset, MaterialAsset, SubMeshConfig } from '../../core/types';

export class GLTFResourceManager {
  private loadingManager: any;
  private cache: Map<string, any> = new Map();
  private progressCallbacks: Array<(progress: number) => void> = [];
  private basePath: string = '/assets/';

  constructor(basePath: string = '/assets/') {
    this.basePath = basePath;
    this.loadingManager = this.createLoadingManager();
  }

  private createLoadingManager(): any {
    let totalFiles = 0;
    let loadedFiles = 0;

    return {
      onStart: (url: string, itemsLoaded: number, itemsTotal: number) => {
        totalFiles = itemsTotal;
        loadedFiles = itemsLoaded;
        this.notifyProgress(loadedFiles / Math.max(1, totalFiles));
      },
      onProgress: (url: string, itemsLoaded: number, itemsTotal: number) => {
        loadedFiles = itemsLoaded;
        totalFiles = itemsTotal;
        this.notifyProgress(loadedFiles / Math.max(1, totalFiles));
      },
      onLoad: () => {
        this.notifyProgress(1.0);
      },
      onError: (url: string) => {
        console.error(`Failed to load: ${url}`);
      },
    };
  }

  async loadManifest(manifestUrl: string): Promise<AssetManifest> {
    const response = await fetch(manifestUrl);
    return response.json();
  }

  async loadVehicle(asset: VehicleAsset): Promise<{ scene: any; subMeshes: Map<string, any> }> {
    const cacheKey = `vehicle_${asset.id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const url = `${this.basePath}${asset.url}`;
    const scene = await this.loadGLTF(url);
    const subMeshes = new Map<string, any>();

    for (const subMeshConfig of asset.subMeshes) {
      const node = this.findNode(scene, subMeshConfig.nodeName);
      if (node) {
        subMeshes.set(subMeshConfig.name, node);
      }
    }

    const result = { scene, subMeshes };
    this.cache.set(cacheKey, result);
    return result;
  }

  async loadEnvironment(asset: EnvironmentAsset): Promise<any> {
    const cacheKey = `env_${asset.id}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    const url = `${this.basePath}${asset.url}`;
    const scene = await this.loadGLTF(url);
    this.cache.set(cacheKey, scene);
    return scene;
  }

  async loadGLTF(url: string): Promise<any> {
    const loader = {
      load: (url: string, onLoad: (result: any) => void, onProgress?: (event: any) => void, onError?: (error: any) => void) => {
        const xhr = new XMLHttpRequest();
        xhr.open('GET', url, true);
        xhr.responseType = 'arraybuffer';

        xhr.onprogress = (event) => {
          if (event.lengthComputable && onProgress) {
            onProgress({ loaded: event.loaded, total: event.total });
          }
        };

        xhr.onload = () => {
          if (xhr.status === 200 || xhr.status === 0) {
            const result = this.parseGLTFBinary(new Uint8Array(xhr.response));
            onLoad(result);
          } else if (onError) {
            onError(new Error(`Failed to load GLTF: ${xhr.status}`));
          }
        };

        xhr.onerror = () => {
          if (onError) onError(new Error(`Network error loading: ${url}`));
        };

        xhr.send();
      },
    };

    return new Promise((resolve, reject) => {
      loader.load(url, resolve, undefined, reject);
    });
  }

  parseGLTFBinary(data: Uint8Array): any {
    const magic = new Uint32Array(data.buffer, data.byteOffset, 1)[0];
    if (magic !== 0x46546C67) {
      throw new Error('Invalid GLTF binary magic number');
    }

    const version = new Uint32Array(data.buffer, data.byteOffset + 4, 1)[0];
    if (version !== 2) {
      throw new Error(`Unsupported GLTF version: ${version}`);
    }

    let offset = 12;
    let jsonChunk: any = null;
    let binaryChunk: Uint8Array | null = null;

    while (offset < data.byteLength) {
      const chunkLength = new Uint32Array(data.buffer, data.byteOffset + offset, 1)[0];
      const chunkType = new Uint32Array(data.buffer, data.byteOffset + offset + 4, 1)[0];
      const chunkData = data.slice(offset + 8, offset + 8 + chunkLength);

      if (chunkType === 0x4E4F534A) {
        jsonChunk = JSON.parse(new TextDecoder().decode(chunkData));
      } else if (chunkType === 0x004E4942) {
        binaryChunk = chunkData;
      }

      offset += 8 + chunkLength;
    }

    if (!jsonChunk) throw new Error('No JSON chunk found in GLB');

    return {
      json: jsonChunk,
      binary: binaryChunk,
      scene: this.buildSceneGraph(jsonChunk, binaryChunk),
    };
  }

  private buildSceneGraph(json: any, binary: Uint8Array | null): any {
    const meshes: any[] = [];
    const bufferViews = json.bufferViews || [];

    if (json.meshes) {
      for (const meshDef of json.meshes) {
        const primitives: any[] = [];
        for (const primitive of meshDef.primitives) {
          const attributes: any = {};
          for (const [attr, accessorIdx] of Object.entries(primitive.attributes)) {
            const accessor = json.accessors[accessorIdx as number];
            const bufferView = bufferViews[accessor.bufferView];
            const data = this.extractAccessorData(json, accessor, bufferView, binary);
            attributes[attr] = data;
          }

          let indices: Uint16Array | Uint32Array | null = null;
          if (primitive.indices !== undefined) {
            const idxAccessor = json.accessors[primitive.indices];
            const idxBufferView = bufferViews[idxAccessor.bufferView];
            indices = this.extractAccessorData(json, idxAccessor, idxBufferView, binary);
          }

          const material = primitive.material !== undefined ? json.materials[primitive.material] : null;

          primitives.push({
            attributes,
            indices,
            material,
            mode: primitive.mode || 4,
          });
        }

        meshes.push({
          name: meshDef.name || '',
          primitives,
        });
      }
    }

    const nodes: any[] = json.nodes ? json.nodes.map((nodeDef: any, index: number) => ({
      name: nodeDef.name || `node_${index}`,
      mesh: nodeDef.mesh !== undefined ? meshes[nodeDef.mesh] : null,
      translation: nodeDef.translation || [0, 0, 0],
      rotation: nodeDef.rotation || [0, 0, 0, 1],
      scale: nodeDef.scale || [1, 1, 1],
      children: [],
    })) : [];

    if (json.scenes && json.scenes.length > 0) {
      const scene = json.scenes[json.scene || 0];
      if (scene.nodes) {
        for (const nodeIdx of scene.nodes) {
          this.buildHierarchy(nodes, nodes[nodeIdx], scene.nodes);
        }
      }
    }

    return { nodes, meshes };
  }

  private buildHierarchy(allNodes: any[], node: any, sceneNodes: number[]): void {
    const nodeDef = node;
    if (nodeDef.children) {
      for (const childIdx of nodeDef.children) {
        const child = allNodes[childIdx];
        node.children.push(child);
        this.buildHierarchy(allNodes, child, sceneNodes);
      }
    }
  }

  private extractAccessorData(json: any, accessor: any, bufferView: any, binary: Uint8Array | null): any {
    if (!bufferView || !binary) return null;

    const byteOffset = (bufferView.byteOffset || 0) + (accessor.byteOffset || 0);
    const count = accessor.count;
    const componentType = accessor.componentType;
    const type = accessor.type;

    let componentSize: number;
    switch (componentType) {
      case 5120: componentSize = 1; break;
      case 5121: componentSize = 1; break;
      case 5122: componentSize = 2; break;
      case 5123: componentSize = 2; break;
      case 5125: componentSize = 4; break;
      case 5126: componentSize = 4; break;
      default: throw new Error(`Unknown component type: ${componentType}`);
    }

    let numComponents: number;
    switch (type) {
      case 'SCALAR': numComponents = 1; break;
      case 'VEC2': numComponents = 2; break;
      case 'VEC3': numComponents = 3; break;
      case 'VEC4': numComponents = 4; break;
      case 'MAT2': numComponents = 4; break;
      case 'MAT3': numComponents = 9; break;
      case 'MAT4': numComponents = 16; break;
      default: throw new Error(`Unknown accessor type: ${type}`);
    }

    const totalFloats = count * numComponents;
    const result = new Float32Array(totalFloats);
    const view = new DataView(binary.buffer, binary.byteOffset + byteOffset);

    for (let i = 0; i < totalFloats; i++) {
      if (componentType === 5126) {
        result[i] = view.getFloat32(i * 4, true);
      } else if (componentType === 5123) {
        result[i] = view.getUint16(i * 2, true);
      } else {
        result[i] = view.getFloat32(i * 4, true);
      }
    }

    return result;
  }

  findNode(scene: any, nodeName: string): any {
    const search = (nodes: any[]): any => {
      for (const node of nodes) {
        if (node.name === nodeName) return node;
        if (node.children && node.children.length > 0) {
          const found = search(node.children);
          if (found) return found;
        }
      }
      return null;
    };

    if (scene.scene && scene.scene.nodes) {
      return search(scene.scene.nodes);
    }
    return null;
  }

  registerProgressCallback(callback: (progress: number) => void): void {
    this.progressCallbacks.push(callback);
  }

  private notifyProgress(progress: number): void {
    for (const callback of this.progressCallbacks) {
      callback(progress);
    }
  }

  clearCache(): void {
    this.cache.clear();
  }

  removeFromCache(key: string): void {
    this.cache.delete(key);
  }
}