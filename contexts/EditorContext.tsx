
import React from 'react';
import { Entity, ToolType } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { GizmoConfiguration } from '../components/gizmos/GizmoUtils';

export interface EditorContextType {
  entities: Entity[];
  sceneGraph: SceneGraph;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  isPlaying: boolean;
  gizmoConfig: GizmoConfiguration;
  setGizmoConfig: (config: GizmoConfiguration) => void;
}

export const EditorContext = React.createContext<EditorContextType | null>(null);
