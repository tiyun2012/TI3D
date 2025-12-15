
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

export interface PerformanceMetrics {
  fps: number;
  frameTime: number;
  drawCalls: number;
  triangleCount: number;
  entityCount: number;
}

// Asset Types
export type AssetType = 'MESH' | 'MATERIAL' | 'TEXTURE' | 'SCRIPT';

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
