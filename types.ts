// ECS Types
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

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
  type: string; // Changed from union to string to allow extensibility
  category?: string; // 'Math', 'Input', 'Master', etc.
  title: string;
  position: { x: number; y: number };
  inputs: { 
    id: string; 
    name: string; 
    type: string; 
    defaultValue?: any; // Value used if nothing is connected
  }[];
  outputs: { id: string; name: string; type: string }[];
  data?: any; // Internal node state (e.g. constant values, preview images)
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