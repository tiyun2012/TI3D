import React from 'react';
import { Entity, ToolType } from '../types';
import { SceneGraph } from '../services/SceneGraph';

export interface EditorContextType {
  entities: Entity[];
  sceneGraph: SceneGraph;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  isPlaying: boolean;
}

export const EditorContext = React.createContext<EditorContextType | null>(null);