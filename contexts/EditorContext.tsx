
import React from 'react';
import { Entity, ToolType, TransformSpace, SelectionType, GraphNode } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { GizmoConfiguration } from '../components/gizmos/GizmoUtils';

export interface UIConfiguration {
    windowBorderRadius: number;
    resizeHandleThickness: number;
    resizeHandleColor: string;
    resizeHandleOpacity: number;
    resizeHandleLength: number;
}

export interface GridConfiguration {
    visible: boolean;
    size: number;     // Spacing of lines
    opacity: number;  // Base alpha
    fadeDistance: number;
    color: string;
    excludeFromPostProcess: boolean; // New option
}

export const DEFAULT_UI_CONFIG: UIConfiguration = {
    windowBorderRadius: 8,
    resizeHandleThickness: 6,
    resizeHandleColor: '#4f80f8',
    resizeHandleOpacity: 0.2,
    resizeHandleLength: 1.0
};

export const DEFAULT_GRID_CONFIG: GridConfiguration = {
    visible: true,
    size: 10.0,
    opacity: 0.3,
    fadeDistance: 200.0,
    color: '#808080',
    excludeFromPostProcess: false
};

export interface EditorContextType {
  entities: Entity[];
  sceneGraph: SceneGraph;
  
  // Entity Selection
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;

  // Asset Selection
  selectedAssetIds: string[];
  setSelectedAssetIds: (ids: string[]) => void;

  // Graph Node Selection (For Inspector/Spreadsheet)
  inspectedNode: GraphNode | null;
  setInspectedNode: (node: GraphNode | null) => void;

  selectionType: SelectionType;
  setSelectionType: (type: SelectionType) => void;

  tool: ToolType;
  setTool: (tool: ToolType) => void;
  transformSpace: TransformSpace;
  setTransformSpace: (space: TransformSpace) => void;
  isPlaying: boolean;
  
  gizmoConfig: GizmoConfiguration;
  setGizmoConfig: (config: GizmoConfiguration) => void;
  
  uiConfig: UIConfiguration;
  setUiConfig: (config: UIConfiguration) => void;

  gridConfig: GridConfiguration;
  setGridConfig: (config: GridConfiguration) => void;
}

export const EditorContext = React.createContext<EditorContextType | null>(null);
