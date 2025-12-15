import React, { useState } from 'react';
import { Entity, ComponentType } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { Icon } from './Icon';

interface HierarchyPanelProps {
  entities: Entity[];
  sceneGraph: SceneGraph;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
}

const getEntityIcon = (entity: Entity) => {
    if (entity.components[ComponentType.LIGHT]) return 'Sun';
    if (entity.components[ComponentType.TRANSFORM] && Object.keys(entity.components).length === 1) return 'Circle'; // Empty
    if (entity.name.includes('Camera')) return 'Video';
    return 'Box';
};

const HierarchyItem: React.FC<{
  entityId: string;
  entities: Entity[];
  sceneGraph: SceneGraph;
  selectedIds: string[];
  onSelect: (ids: string[]) => void;
  depth: number;
}> = ({ entityId, entities, sceneGraph, selectedIds, onSelect, depth }) => {
  const [expanded, setExpanded] = useState(true);
  const entity = entities.find(e => e.id === entityId);
  if (!entity) return null;

  const childrenIds = sceneGraph.getChildren(entityId);
  const hasChildren = childrenIds.length > 0;
  const isSelected = selectedIds.includes(entity.id);

  const handleClick = (e: React.MouseEvent) => {
      if (e.ctrlKey || e.metaKey) {
          // Toggle selection
          if (isSelected) {
              onSelect(selectedIds.filter(id => id !== entity.id));
          } else {
              onSelect([...selectedIds, entity.id]);
          }
      } else if (e.shiftKey && selectedIds.length > 0) {
          // Simplistic Shift Select: just add to current for now (range select requires flattened list logic)
           onSelect([...new Set([...selectedIds, entity.id])]);
      } else {
          onSelect([entity.id]);
      }
  };

  return (
    <div>
      <div 
        onClick={handleClick}
        className={`group flex items-center gap-1.5 py-1 pr-2 cursor-pointer text-xs select-none transition-colors border-l-2
            ${isSelected 
                ? 'bg-accent/20 border-accent text-white' 
                : 'border-transparent hover:bg-white/5 text-text-primary hover:text-white'}
        `}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
      >
        <div 
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
          className={`w-4 h-4 flex items-center justify-center rounded hover:bg-white/10 ${hasChildren ? 'visible' : 'invisible'}`}
        >
           <Icon name={expanded ? 'ChevronDown' : 'ChevronRight'} size={10} className="text-text-secondary" />
        </div>

        <Icon 
            name={getEntityIcon(entity) as any} 
            size={12} 
            className={isSelected ? 'text-accent' : (entity.components[ComponentType.LIGHT] ? 'text-yellow-500' : 'text-blue-400')} 
        />
        <span className="flex-1 truncate">{entity.name}</span>
        
        {/* Hover Actions */}
        <div className={`flex gap-1 ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <Icon name="Eye" size={12} className="text-text-secondary hover:text-white" />
        </div>
      </div>

      {hasChildren && expanded && (
        <div>
          {childrenIds.map(childId => (
            <HierarchyItem 
              key={childId}
              entityId={childId}
              entities={entities}
              sceneGraph={sceneGraph}
              selectedIds={selectedIds}
              onSelect={onSelect}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export const HierarchyPanel: React.FC<HierarchyPanelProps> = ({ entities, sceneGraph, selectedIds, onSelect }) => {
  const rootIds = sceneGraph.getRootIds();
  const [searchTerm, setSearchTerm] = useState('');

  return (
    <div className="h-full bg-panel flex flex-col font-sans border-r border-black/20">
      {/* Header */}
      <div className="p-2 border-b border-black/20 bg-panel-header flex flex-col gap-2">
        <div className="flex items-center justify-between text-xs font-bold text-text-secondary px-1">
            <span>HIERARCHY</span>
            <div className="flex gap-1">
                <button 
                    className="p-1 hover:text-white"
                    title="Create Entity"
                    aria-label="Create Entity"
                >
                    <Icon name="Plus" size={12} />
                </button>
                <button 
                    className="p-1 hover:text-white"
                    title="Options"
                    aria-label="Options"
                >
                    <Icon name="MoreHorizontal" size={12} />
                </button>
            </div>
        </div>
        <div className="relative">
            <Icon name="Search" size={12} className="absolute left-2 top-1.5 text-text-secondary" />
            <input 
                type="text" 
                placeholder="Search..." 
                aria-label="Search Hierarchy"
                title="Search Hierarchy"
                className="w-full bg-input-bg text-xs py-1 pl-7 pr-2 rounded outline-none border border-transparent focus:border-accent text-white" 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
            />
        </div>
      </div>

      {/* Tree List */}
      <div className="flex-1 overflow-y-auto py-2">
        <div 
            className="flex items-center gap-2 text-xs text-text-primary px-3 py-1 font-semibold opacity-70 cursor-default"
            onClick={() => onSelect([])}
        >
            {/* Fix: 'Scene' is not a valid Lucide icon name. Used 'Cuboid' instead. */}
            <Icon name="Cuboid" size={12} />
            <span>MainScene</span>
        </div>
        
        <div className="mt-1">
            {rootIds.map(id => (
                <HierarchyItem 
                  key={id}
                  entityId={id}
                  entities={entities}
                  sceneGraph={sceneGraph}
                  selectedIds={selectedIds}
                  onSelect={onSelect}
                  depth={0}
                />
            ))}
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="p-1 text-[10px] text-text-secondary bg-panel-header border-t border-black/20 text-center">
        {entities.length} Objects
      </div>
    </div>
  );
};