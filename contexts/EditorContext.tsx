
import React from 'react';
import { Entity, ToolType } from '../types';
import { SceneGraph } from '../services/SceneGraph';

export interface EditorContextType {
  entities: Entity[];
  sceneGraph: SceneGraph;
  selectedIds: string[];
  setSelectedIds: (ids: string[]) => void;
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  isPlaying: boolean;
}

export const EditorContext = React.createContext<EditorContextType | null>(null);
