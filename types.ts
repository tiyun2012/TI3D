
// ECS Types
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export type RotationOrder = 'XYZ' | 'XZY' | 'YXZ' | 'YZX' | 'ZXY' | 'ZYX';
export type TransformSpace = 'World' | 'Local' | 'Gimbal';

export enum ComponentType {
  TRANSFORM = 'Transform',
  MESH = 'Mesh',
  LIGHT = 'Light',
  PHYSICS = 'Physics',
  SCRIPT = 'Script'
}

export interface Component {
  type: ComponentType;
  [key: string]: any;
}

export interface Entity {
  id: string;
  name: string;
  components: Record<ComponentType, Component>;
  isActive: boolean;
}

// Node Graph Types
export interface GraphNode {
  id: string;
  type: string; // Must match key in NodeRegistry
  position: { x: number; y: number };
  data?: any; // Internal node state (e.g. constant values)
}

export interface GraphConnection {
  id: string;
  fromNode: string;
  fromPin: string;
  toNode: string;
  toPin: string;
}

// Editor Types
export type EditorMode = 'SCENE' | 'GAME' | 'SCRIPT';
export type ToolType = 'SELECT' | 'MOVE' | 'ROTATE' | 'SCALE';
export type SelectionType = 'ENTITY' | 'ASSET';

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangleCount: number;
  entityCount: number;
}

// Asset Types
export type AssetType = 'MESH' | 'SKELETAL_MESH' | 'MATERIAL' | 'PHYSICS_MATERIAL' | 'TEXTURE' | 'SCRIPT' | 'RIG';

export interface StaticMeshAsset {
    id: string;
    name: string;
    type: 'MESH';
    thumbnail?: string; // Optional Base64 or Icon name
    geometry: {
        vertices: Float32Array | number[];
        normals: Float32Array | number[];
        uvs: Float32Array | number[];
        indices: Uint16Array | number[];
    };
}

export interface SkeletalMeshAsset {
    id: string;
    name: string;
    type: 'SKELETAL_MESH';
    thumbnail?: string;
    geometry: {
        vertices: Float32Array | number[];
        normals: Float32Array | number[];
        uvs: Float32Array | number[];
        indices: Uint16Array | number[];
        jointIndices: Float32Array | number[]; // 4 weights per vertex
        jointWeights: Float32Array | number[]; // 4 weights per vertex
    };
    skeleton: {
        bones: Array<{ name: string; parentIndex: number; bindPose: Float32Array }>;
    };
}

export interface MaterialAsset {
    id: string;
    name: string;
    type: 'MATERIAL';
    data: {
        nodes: GraphNode[];
        connections: GraphConnection[];
        glsl: string; // Compiled Source
    };
}

export interface PhysicsMaterialAsset {
    id: string;
    name: string;
    type: 'PHYSICS_MATERIAL';
    data: {
        staticFriction: number;
        dynamicFriction: number;
        bounciness: number; // Restitution (0-1)
        density: number;
    };
}

export interface ScriptAsset {
    id: string;
    name: string;
    type: 'SCRIPT';
    data: {
        nodes: GraphNode[];
        connections: GraphConnection[];
    };
}

export interface RigAsset {
    id: string;
    name: string;
    type: 'RIG';
    data: {
        nodes: GraphNode[];
        connections: GraphConnection[];
    };
}

export interface TextureAsset {
    id: string;
    name: string;
    type: 'TEXTURE';
    source: string; // Base64 or URL
    layerIndex: number; // Internal GPU Array Layer
}

export type Asset = StaticMeshAsset | SkeletalMeshAsset | MaterialAsset | PhysicsMaterialAsset | ScriptAsset | RigAsset | TextureAsset;
