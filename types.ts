
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

// Mesh Topology Types
export interface LogicalMesh {
    // Defines the original Faces (Quads/Polygons)
    // e.g. [0, 1, 2, 3] is one face
    faces: number[][]; 
    
    // Map: Which Render Triangle belongs to which Logical Face?
    // index 0 (Triangle A) -> Face 0
    // index 1 (Triangle B) -> Face 0
    triangleToFaceIndex: Int32Array;

    // Connectivity maps for fast lookups
    vertexToFaces: Map<number, number[]>;
}

// Asset Types
export type AssetType = 'MESH' | 'SKELETAL_MESH' | 'MATERIAL' | 'PHYSICS_MATERIAL' | 'TEXTURE' | 'SCRIPT' | 'RIG';

export interface StaticMeshAsset {
    id: string;
    name: string;
    type: 'MESH';
    thumbnail?: string; 
    geometry: {
        vertices: Float32Array;
        normals: Float32Array;
        uvs: Float32Array;
        indices: Uint16Array;
    };
    topology?: LogicalMesh; // Optional CPU-side topology data
}

export interface SkeletalMeshAsset {
    id: string;
    name: string;
    type: 'SKELETAL_MESH';
    thumbnail?: string;
    geometry: {
        vertices: Float32Array;
        normals: Float32Array;
        uvs: Float32Array;
        indices: Uint16Array;
        jointIndices: Float32Array;
        jointWeights: Float32Array;
    };
    skeleton: {
        bones: Array<{ name: string; parentIndex: number; bindPose: Float32Array }>;
    };
    topology?: LogicalMesh;
}

export interface MaterialAsset {
    id: string;
    name: string;
    type: 'MATERIAL';
    data: {
        nodes: GraphNode[];
        connections: GraphConnection[];
        glsl: string; 
    };
}

export interface PhysicsMaterialAsset {
    id: string;
    name: string;
    type: 'PHYSICS_MATERIAL';
    data: {
        staticFriction: number;
        dynamicFriction: number;
        bounciness: number; 
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
    source: string; 
    layerIndex: number; 
}

export type Asset = StaticMeshAsset | SkeletalMeshAsset | MaterialAsset | PhysicsMaterialAsset | ScriptAsset | RigAsset | TextureAsset;
