
import React from 'react';
import { Entity, ToolType, TransformSpace, SelectionType } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { GizmoConfiguration } from '../components/gizmos/GizmoUtils';

export interface UIConfiguration {
    windowBorderRadius: number;
    resizeHandleThickness: number;
    resizeHandleColor: string;
    resizeHandleOpacity: number;
    resizeHandleLength: number;
}

export const DEFAULT_UI_CONFIG: UIConfiguration = {
    windowBorderRadius: 8,
    resizeHandleThickness: 6,
    resizeHandleColor: '#4f80f8',
    resizeHandleOpacity: 0.2,
    resizeHandleLength: 1.0
};

export interface EditorContextType {
  entities: Entity[];
  sceneGraph: SceneGraph;
  
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
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
  
  // Asset Editing
  editingAssetId: string | null;
  setEditingAssetId: (id: string | null) => void;
}

export const EditorContext = React.createContext<EditorContextType | null>(null);