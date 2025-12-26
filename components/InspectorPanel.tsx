
import React, { useState, useRef, useEffect, useContext } from 'react';
import { Entity, Component, ComponentType, Vector3, RotationOrder, TransformSpace, Asset, PhysicsMaterialAsset, GraphNode, GraphConnection } from '../types';
import { engineInstance } from '../services/engine';
import { assetManager } from '../services/AssetManager';
import { Icon } from './Icon';
import { ROTATION_ORDERS, LIGHT_TYPES } from '../services/constants';
import { EditorContext } from '../contexts/EditorContext';
import { Select } from './ui/Select';
import { NodeRegistry } from '../services/NodeRegistry';
import { WindowManagerContext } from './WindowManager';

interface InspectorPanelProps {
  object: Entity | Asset | GraphNode | null; // Can inspect Entity, Asset, or GraphNode
  selectionCount?: number;
  type?: 'ENTITY' | 'ASSET' | 'NODE';
  isClone?: boolean; // If true, this panel is a dedicated instance
}

// --- Reusable UI Controls ---

const DraggableNumber: React.FC<{ 
  label: string; 
  value: number;
  onChange: (val: number) => void; 
  onStart?: () => void;
  onCommit?: () => void;
  color?: string;
  step?: number;
  disabled?: boolean;
}> = ({ label, value, onChange, onStart, onCommit, color, step = 0.1, disabled = false }) => {
  const [isDragging, setIsDragging] = useState(false);
  const startX = useRef(0);
  const startVal = useRef(0);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const delta = e.clientX - startX.current;
      const newVal = startVal.current + delta * step;
      onChange(parseFloat(newVal.toFixed(3)));
    };
    const handleUp = () => {
      if(isDragging) {
          setIsDragging(false);
          document.body.style.cursor = 'default';
          onCommit?.();
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
      document.body.style.cursor = 'ew-resize';
    }
    return () => {
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
    };
  }, [isDragging, onChange, onCommit, step]);

  return (
    <div className={`flex items-center bg-input-bg rounded overflow-hidden border border-transparent focus-within:border-accent group ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div 
        className={`w-6 flex items-center justify-center text-[10px] font-bold select-none h-6 transition-colors ${disabled ? '' : 'cursor-ew-resize hover:text-white'} ${color || 'text-text-secondary'}`}
        onMouseDown={(e) => {
          if (disabled) return;
          if (onStart) onStart();
          startX.current = e.clientX;
          startVal.current = value;
          setIsDragging(true);
        }}
      >
        {label}
      </div>
      <input 
        type="number" 
        aria-label={label || "Numeric Input"}
        className="flex-1 bg-transparent text-xs p-1 outline-none text-white min-w-0 disabled:text-text-secondary" 
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onBlur={onCommit}
        step={step}
        disabled={disabled}
      />
    </div>
  );
};

const Vector3Input: React.FC<{ 
    label: string; 
    value: Vector3; 
    onChange?: (v: Vector3) => void; 
    onStart?: () => void;
    onCommit?: () => void;
    disabled?: boolean;
}> = ({ label, value, onChange, onStart, onCommit, disabled = false }) => (
  <div className={`flex flex-col gap-1 mb-3 ${disabled ? 'opacity-60' : ''}`}>
    <div className="text-[10px] uppercase text-text-secondary font-semibold tracking-wider ml-1">{label}</div>
    <div className="grid grid-cols-3 gap-1">
      <DraggableNumber label="X" value={value.x} onChange={(v) => onChange?.({...value, x: v})} onStart={onStart} onCommit={onCommit} color="text-red-500 hover:bg-red-500/20" disabled={disabled} />
      <DraggableNumber label="Y" value={value.y} onChange={(v) => onChange?.({...value, y: v})} onStart={onStart} onCommit={onCommit} color="text-green-500 hover:bg-green-500/20" disabled={disabled} />
      <DraggableNumber label="Z" value={value.z} onChange={(v) => onChange?.({...value, z: v})} onStart={onStart} onCommit={onCommit} color="text-blue-500 hover:bg-blue-500/20" disabled={disabled} />
    </div>
  </div>
);

/**
 * Optimized Color Picker that avoids triggering heavy graph recompilations on every move.
 */
const DebouncedColorPicker: React.FC<{ 
    value: string; 
    onChange: (val: string) => void; 
    label?: string;
    disabled?: boolean;
}> = ({ value, onChange, label, disabled }) => {
    const [localValue, setLocalValue] = useState(value);
    const timeoutRef = useRef<number | null>(null);

    useEffect(() => {
        setLocalValue(value);
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newVal = e.target.value;
        setLocalValue(newVal);
        
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        
        // Debounce the heavy context update
        timeoutRef.current = window.setTimeout(() => {
            onChange(newVal);
        }, 100);
    };

    const handleBlur = () => {
        if (timeoutRef.current) clearTimeout(timeoutRef.current);
        onChange(localValue);
    };

    return (
        <input 
            type="color" 
            value={localValue} 
            onChange={handleChange}
            onBlur={handleBlur}
            disabled={disabled}
            className={`w-full h-8 rounded bg-transparent cursor-pointer border border-white/10 transition-opacity ${disabled ? 'opacity-30 pointer-events-none' : ''}`} 
            aria-label={label || 'Color Picker'}
        />
    );
};

const ComponentCard: React.FC<{ 
  component: Component; 
  title: string; 
  icon: string; 
  onRemove?: () => void;
  onUpdate: (field: string, value: any) => void;
  onStartUpdate?: () => void;
  onCommit: () => void;
}> = ({ component, title, icon, onRemove, onUpdate, onStartUpdate, onCommit }) => {
  const [open, setOpen] = useState(true);
  const editorCtx = useContext(EditorContext);
  const physicsMaterials = assetManager.getAssetsByType('PHYSICS_MATERIAL');
  const materials = assetManager.getAssetsByType('MATERIAL'); // Get Shader Materials
  const rigs = assetManager.getAssetsByType('RIG'); // Get Rig Graphs

  const handleAtomicChange = (field: string, value: any) => {
      if(onStartUpdate) onStartUpdate();
      onUpdate(field, value);
      onCommit();
    };
    
    const effects = [
        { label: 'None', value: 0 },
        { label: 'Pixelate', value: 1 },
        { label: 'Glitch', value: 2 },
        { label: 'Invert', value: 3 },
        { label: 'Grayscale', value: 4 },
      { label: 'Halftone (Comic)', value: 5 },
      { label: 'Cross-Hatch', value: 6 },
      { label: 'Posterize (Cel)', value: 7 },
      { label: 'Dither (Retro)', value: 8 }
    ];
    
    return (
        <div className="bg-panel-header border-b border-black/20">
      {/* Header */}
      <div 
        className="flex items-center p-2 cursor-pointer hover:bg-white/5 select-none group"
        onClick={() => setOpen(!open)}
        >
        <div className="mr-2 text-text-secondary group-hover:text-white transition-colors">
            <Icon name={open ? 'ChevronDown' : 'ChevronRight'} size={12} />
        </div>
        
        <Icon name={icon as any} size={14} className="mr-2 text-accent" />
        <span className="font-semibold text-xs text-gray-200 flex-1">{title}</span>
        <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
            <button className="p-1 hover:text-white text-text-secondary" title="Settings" aria-label="Settings"><Icon name="Settings2" size={12} /></button>
            {onRemove && (
                <button 
                className="p-1 hover:text-white text-text-secondary" 
                    title="Remove Component" 
                    aria-label="Remove Component"
                    onClick={(e) => { e.stopPropagation(); onRemove(); }}
                    >
                    <Icon name="Trash2" size={12} />
                </button>
            )}
        </div>
      </div>

      {/* Body */}
      {open && <div className="p-3 bg-panel border-t border-black/10 text-xs space-y-3">
        {component.type === ComponentType.TRANSFORM && (
            <>
            <Vector3Input label="Position" value={component.position} onChange={(v) => onUpdate('position', v)} onStart={onStartUpdate} onCommit={onCommit} />
            <div className="flex flex-col gap-1 mb-3">
                 <div className="flex justify-between items-center">
                    <div className="text-[10px] uppercase text-text-secondary font-semibold tracking-wider ml-1">Rotation</div>
                    <div className="flex gap-2">
                        {/* Space Selector */}
                        <div className="flex items-center gap-1 min-w-[70px]">
                            <Select
                                value={editorCtx?.transformSpace || 'Gimbal'}
                                options={['Gimbal', 'Local', 'World'].map(v => ({ label: v, value: v }))}
                                onChange={(v) => editorCtx?.setTransformSpace(v as TransformSpace)}
                                />
                        </div>
                        {/* Order Selector */}
                        <div className="flex items-center gap-1 min-w-[50px]">
                            <Select
                                value={component.rotationOrder}
                                options={ROTATION_ORDERS.map(o => ({ label: o, value: o }))}
                                onChange={(v) => handleAtomicChange('rotationOrder', v)}
                                />
                        </div>
                    </div>
                 </div>
                <div className="grid grid-cols-3 gap-1">
                  <DraggableNumber label="X" value={component.rotation.x} onChange={(v) => onUpdate('rotation', {...component.rotation, x: v})} onStart={onStartUpdate} onCommit={onCommit} color="text-red-500 hover:bg-red-500/20" />
                  <DraggableNumber label="Y" value={component.rotation.y} onChange={(v) => onUpdate('rotation', {...component.rotation, y: v})} onStart={onStartUpdate} onCommit={onCommit} color="text-green-500 hover:bg-green-500/20" />
                  <DraggableNumber label="Z" value={component.rotation.z} onChange={(v) => onUpdate('rotation', {...component.rotation, z: v})} onStart={onStartUpdate} onCommit={onCommit} color="text-blue-500 hover:bg-blue-500/20" />
                </div>
            </div>
            <Vector3Input label="Scale" value={component.scale} onChange={(v) => onUpdate('scale', v)} onStart={onStartUpdate} onCommit={onCommit} />
          </>
        )}
        {component.type === ComponentType.VIRTUAL_PIVOT && (
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Axis Length</span>
               <DraggableNumber 
                  label="L" 
                  value={(component as any).length} 
                  onChange={(v) => onUpdate('length', v)} 
                  onStart={onStartUpdate} 
                  onCommit={onCommit} 
                  step={0.1} 
               />
            </div>
        )}

        {component.type === ComponentType.MESH && (
          <>
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary">Mesh Filter</span>
                <div className="flex-1">
                   <Select
                      icon="Box"
                      value={component.meshType}
                      options={['Cube', 'Sphere', 'Plane', 'Custom'].map(v => ({ label: v, value: v }))}
                      onChange={(v) => handleAtomicChange('meshType', v)}
                   />
                </div>
             </div>
             
             {/* Material Picker */}
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary">Material</span>
                <div className="flex-1">
                   <Select 
                      icon="Palette"
                      value={component.materialId || ""}
                      options={[
                          { label: 'Default (Standard)', value: "" },
                          ...materials.map(m => ({ label: m.name, value: m.id }))
                      ]}
                      onChange={(v) => handleAtomicChange('materialId', v)}
                   />
                </div>
             </div>

             {/* Rig Picker (New) */}
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary">Rig Graph</span>
                <div className="flex-1">
                   <Select 
                      icon="GitBranch"
                      value={component.rigId || ""}
                      options={[
                          { label: 'None', value: "" },
                          ...rigs.map(r => ({ label: r.name, value: r.id }))
                      ]}
                      onChange={(v) => handleAtomicChange('rigId', v)}
                   />
                </div>
             </div>
             
             {/* Post Process Effect Selection */}
             <div className="border-t border-white/5 my-1"></div>
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary">Post FX</span>
                <div className="flex-1">
                   <Select 
                      icon="Wand2"
                      value={(component.effectIndex || 0) % 100}
                      options={effects}
                      onChange={(v) => {
                          const currentExcluded = (component.effectIndex || 0) >= 100;
                          handleAtomicChange('effectIndex', Number(v) + (currentExcluded ? 100 : 0));
                      }}
                   />
                </div>
             </div>
             
             <div className="flex items-center gap-2 mt-1">
                 <span className="w-24"></span>
                 <label className="flex items-center gap-2 cursor-pointer group">
                     <input 
                        type="checkbox" 
                        checked={(component.effectIndex || 0) >= 100}
                        onChange={(e) => {
                            const currentBase = (component.effectIndex || 0) % 100;
                            handleAtomicChange('effectIndex', currentBase + (e.target.checked ? 100 : 0));
                        }}
                        className="rounded bg-white/10 border-transparent focus:ring-0 checked:bg-accent text-accent"
                        aria-label="Exclude from Global Post FX"
                     />
                     <span className="text-[10px] text-text-secondary group-hover:text-white transition-colors">Exclude Global FX</span>
                 </label>
             </div>

             <div className="border-t border-white/5 my-1"></div>
             <div className="flex items-center gap-2">
                 <span className="w-24 text-text-secondary">Cast Shadows</span>
                 <input type="checkbox" defaultChecked aria-label="Cast Shadows" />
             </div>
             <div className="flex items-center gap-2">
                 <span className="w-24 text-text-secondary">Receive Shadows</span>
                 <input type="checkbox" defaultChecked aria-label="Receive Shadows" />
             </div>
          </>
        )}

        {component.type === ComponentType.LIGHT && (
           <>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Type</span>
               <div className="flex-1">
                   <Select
                      value={component.lightType}
                      options={LIGHT_TYPES.map(v => ({ label: v, value: v }))}
                      onChange={(v) => handleAtomicChange('lightType', v)}
                   />
               </div>
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Color</span>
               <DebouncedColorPicker 
                  value={component.color} 
                  onChange={(v) => handleAtomicChange('color', v)}
                  label="Light Color"
               />
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Intensity</span>
               <div className="flex-1 flex items-center gap-2">
                  <input 
                    type="range" min="0" max="5" step="0.1" 
                    value={component.intensity} 
                    onChange={(e) => handleAtomicChange('intensity', parseFloat(e.target.value))}
                    className="flex-1" 
                    aria-label="Light Intensity"
                  />
                  <span className="w-8 text-right font-mono">{component.intensity}</span>
               </div>
            </div>
           </>
        )}

         {component.type === ComponentType.PHYSICS && (
           <>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Mass (kg)</span>
               <DraggableNumber label="" value={component.mass} onChange={(v) => onUpdate('mass', v)} onStart={onStartUpdate} onCommit={onCommit} step={0.1} />
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Use Gravity</span>
               <input 
                  type="checkbox" 
                  checked={component.useGravity} 
                  onChange={(e) => handleAtomicChange('useGravity', e.target.checked)}
                  aria-label="Use Gravity"
                />
            </div>
            
            {/* Physics Material Selection */}
            <div className="flex items-center gap-2 mt-2">
               <span className="w-24 text-text-secondary">Material</span>
               <div className="flex-1">
                   <Select 
                      value={component.physicsMaterialId || 0}
                      options={[
                          { label: 'None', value: 0 },
                          ...physicsMaterials.map(mat => ({ label: mat.name, value: assetManager.getPhysicsMaterialID(mat.id) }))
                      ]}
                      onChange={(v) => handleAtomicChange('physicsMaterialId', v)}
                   />
               </div>
            </div>
          </>
        )}
      </div>}
    </div>
  );
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ object: initialObject, selectionCount = 0, type: initialType = 'ENTITY', isClone = false }) => {
  const [isLocked, setIsLocked] = useState(isClone); // Clones start locked
  const [snapshot, setSnapshot] = useState<{ object: any, type: any } | null>(null);
  const [name, setName] = useState('');
  const [refresh, setRefresh] = useState(0);
  const [showAddComponent, setShowAddComponent] = useState(false);
  
  const editorCtx = useContext(EditorContext)!;
  const wm = useContext(WindowManagerContext);

  // Determine current active target
  const activeObject = isLocked ? (snapshot?.object ?? initialObject) : initialObject;
  const activeType = isLocked ? (snapshot?.type ?? initialType) : initialType;

  useEffect(() => {
    if (!isLocked) {
        // FIX: Only update snapshot if reference actually changed to minimize render cascades
        setSnapshot(prev => {
            if (prev?.object === initialObject && prev?.type === initialType) return prev;
            return { object: initialObject, type: initialType };
        });
    }
  }, [initialObject, initialType, isLocked]);

  useEffect(() => {
    if (activeObject) setName(activeObject.name);
  }, [activeObject]);

  const toggleLock = (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsLocked(!isLocked);
    if (!isLocked) {
        setSnapshot({ object: initialObject, type: initialType });
    }
  };

  const duplicateInspector = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!wm || !activeObject) return;
    
    const cloneId = `inspector_clone_${crypto.randomUUID().slice(0, 8)}`;
    wm.registerWindow({
        id: cloneId,
        title: `Inspector: ${activeObject.name}`,
        icon: 'Settings2',
        content: <InspectorPanel object={activeObject} type={activeType} isClone={true} />,
        width: 320,
        height: 600,
        initialPosition: { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    });
    wm.openWindow(cloneId);
  };

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleNameCommit = () => {
      if (activeObject && activeObject.name !== name) {
          if(activeType === 'ENTITY') engineInstance.pushUndoState();
          activeObject.name = name;
          engineInstance.notifyUI();
      }
  };

  const startUpdate = () => {
      if(activeType === 'ENTITY') engineInstance.pushUndoState();
  };

  const updateComponent = (compType: ComponentType, field: string, value: any) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      const entity = activeObject as Entity;
      const comp = entity.components[compType];
      if (comp) {
          (comp as any)[field] = value;
          engineInstance.notifyUI();
      }
  };
  
  const addComponent = (compType: ComponentType) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      engineInstance.pushUndoState();
      engineInstance.ecs.addComponent((activeObject as Entity).id, compType);
      engineInstance.notifyUI();
      setShowAddComponent(false);
  };

  const removeComponent = (compType: ComponentType) => {
      if (activeType !== 'ENTITY' || !activeObject) return;
      engineInstance.pushUndoState();
      engineInstance.ecs.removeComponent((activeObject as Entity).id, compType);
      engineInstance.notifyUI();
  };
  
  const updateAssetData = (field: string, value: any) => {
      if (activeType !== 'ASSET' || !activeObject) return;
      const asset = activeObject as PhysicsMaterialAsset; 
      if (asset.type === 'PHYSICS_MATERIAL') {
          assetManager.updatePhysicsMaterial(asset.id, { [field]: value });
          setRefresh(r => r + 1); 
      }
  };

  if (!activeObject) {
    return (
        <div className="h-full bg-panel flex flex-col items-center justify-center text-text-secondary select-none">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                 <Icon name="BoxSelect" size={32} className="opacity-50" />
            </div>
            <span className="text-xs font-semibold">
                {selectionCount > 1 ? `${selectionCount} Objects Selected` : 'No Selection'}
            </span>
        </div>
    );
  }

  const renderHeaderControls = () => (
    <div className="flex items-center gap-1.5 ml-auto">
        <button 
            onClick={toggleLock}
            className={`p-1 rounded transition-colors ${isLocked ? 'text-accent bg-accent/10' : 'text-text-secondary hover:text-white'}`}
            title={isLocked ? "Unlock (Follow Selection)" : "Lock (Pin Current Object)"}
        >
            <Icon name={isLocked ? "Lock" : "Unlock"} size={13} />
        </button>
        <button 
            onClick={duplicateInspector}
            className="p-1 rounded text-text-secondary hover:text-white hover:bg-white/5 transition-colors"
            title="Duplicate Inspector Window"
        >
            <Icon name="Copy" size={13} />
        </button>
    </div>
  );

  // --- NODE INSPECTOR ---
  if (activeType === 'NODE') {
      const node = activeObject as GraphNode;
      const nodeDef = NodeRegistry[node.type];
      if (!nodeDef) return null;

      const isOwned = (pinId: string) => {
          return editorCtx.activeGraphConnections.some(c => c.toNode === node.id && c.toPin === pinId);
      };

      // Get combined list of properties (Inputs + Data Keys)
      const dataKeys = node.data ? Object.keys(node.data) : [];
      const properties = [...new Set([...nodeDef.inputs.map(i => i.id), ...dataKeys])];

      return (
        <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
            <div className="p-4 border-b border-black/20 bg-panel-header flex items-center gap-3">
                 <div className="w-8 h-8 bg-accent rounded flex items-center justify-center text-white shadow-sm shrink-0">
                     <Icon name="Cpu" size={16} />
                 </div>
                 <div className="flex-1 min-w-0">
                     <div className="text-sm font-bold text-white truncate">{nodeDef.title}</div>
                     <div className="text-[9px] text-text-secondary font-mono mt-0.5 uppercase tracking-wider opacity-50">
                         {node.type} Node
                     </div>
                 </div>
                 {renderHeaderControls()}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-6">
                <div className="space-y-4">
                    <div className="text-[10px] font-bold text-text-secondary uppercase border-b border-white/5 pb-1 flex justify-between">
                        <span>Inputs & Properties</span>
                        <Icon name="Link2" size={10} className="opacity-40" />
                    </div>
                    
                    {properties.map(key => {
                        const inputDef = nodeDef.inputs.find(i => i.id === key);
                        const owned = isOwned(key);
                        const dataVal = node.data?.[key] || (inputDef?.type === 'vec3' ? '#ffffff' : '0.0');
                        const isVec3 = inputDef?.type === 'vec3' || key === 'albedo' || key === 'emission';
                        const label = inputDef?.name || key.charAt(0).toUpperCase() + key.slice(1);

                        // Skip internal layout keys like 'title' or 'color' if it's a comment
                        if (node.type === 'Comment' && (key === 'title' || key === 'color')) {
                             return (
                                <div key={key} className="space-y-1.5">
                                    <span className="text-[11px] text-text-secondary">{label}</span>
                                    <input 
                                        type="text" 
                                        value={dataVal} 
                                        onChange={(e) => editorCtx.updateInspectedNodeData(key, e.target.value)}
                                        className="w-full bg-black/40 text-[11px] p-2 rounded border border-white/5 outline-none focus:border-accent text-white"
                                        aria-label={label}
                                    />
                                </div>
                             );
                        }

                        return (
                            <div key={key} className="space-y-1.5 group relative">
                                <div className="flex justify-between items-center px-1">
                                    <span className={`text-[11px] ${owned ? 'text-accent font-bold' : 'text-text-secondary'}`}>{label}</span>
                                    {owned && (
                                        <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20">
                                            <Icon name="Link" size={8} className="text-accent" />
                                            <span className="text-[8px] text-accent uppercase font-bold tracking-tighter">Connected</span>
                                        </div>
                                    )}
                                </div>
                                
                                {isVec3 ? (
                                    <div className={`relative ${owned ? 'pointer-events-none grayscale opacity-30' : ''}`}>
                                        <DebouncedColorPicker 
                                            value={String(dataVal).startsWith('#') ? dataVal : '#ffffff'} 
                                            onChange={(v) => editorCtx.updateInspectedNodeData(key, v)}
                                            label={`${label} Color`}
                                            disabled={owned}
                                        />
                                    </div>
                                ) : (
                                    <DraggableNumber 
                                        label="" 
                                        value={typeof dataVal === 'string' ? parseFloat(dataVal) : dataVal} 
                                        onChange={(v) => editorCtx.updateInspectedNodeData(key, v.toString())} 
                                        disabled={owned}
                                    />
                                )}
                            </div>
                        );
                    })}

                    {/* Node Specific Controls */}
                    {node.type === 'StaticMesh' && (
                        <div className="space-y-1.5 pt-2 border-t border-white/5">
                            <span className="text-[10px] text-text-secondary uppercase font-bold">Mesh Asset</span>
                            <Select
                                value={node.data?.assetId || ''}
                                options={[
                                    { label: 'None', value: '' },
                                    ...assetManager.getAssetsByType('MESH').map(m => ({ label: m.name, value: m.id }))
                                ]}
                                onChange={(v) => editorCtx.updateInspectedNodeData('assetId', v)}
                            />
                        </div>
                    )}
                    
                    {node.type === 'TextureSample' && (
                        <div className="space-y-1.5 pt-2 border-t border-white/5">
                            <span className="text-[10px] text-text-secondary uppercase font-bold">Texture Map</span>
                            <Select
                                value={node.data?.textureId || '0'}
                                options={[
                                    { label: 'White (Default)', value: '0' },
                                    { label: 'Grid Pattern', value: '1' },
                                    { label: 'Noise Texture', value: '2' },
                                    { label: 'Brick Texture', value: '3' }
                                ]}
                                onChange={(v) => editorCtx.updateInspectedNodeData('textureId', v)}
                            />
                        </div>
                    )}
                </div>
            </div>
            
            <div className="p-2 bg-black/20 text-[9px] text-text-secondary flex justify-between items-center opacity-60">
                <span>Buffer Size: Valid</span>
                <span className="font-mono">{node.id.split('-')[0]}</span>
            </div>
        </div>
      );
  }

  // --- ASSET INSPECTOR ---
  if (activeType === 'ASSET') {
      const asset = activeObject as Asset;
      let icon = 'File';
      if(asset.type === 'PHYSICS_MATERIAL') icon = 'Activity';
      if(asset.type === 'RIG') icon = 'GitBranch';
      if(asset.type === 'SCRIPT') icon = 'FileCode';
      if(asset.type === 'MATERIAL') icon = 'Palette';

      return (
        <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
            <div className="p-4 border-b border-black/20 bg-panel-header flex items-center gap-3">
                 <div className="w-8 h-8 bg-green-600 rounded flex items-center justify-center text-white shadow-sm shrink-0">
                     <Icon name={icon as any} size={16} />
                 </div>
                 <div className="flex-1 min-w-0">
                     <input 
                         type="text" 
                         value={name}
                         onChange={handleNameChange}
                         onBlur={handleNameCommit}
                         className="w-full bg-transparent text-sm font-bold text-white outline-none border-b border-transparent focus:border-accent transition-colors truncate"
                         aria-label="Asset Name"
                     />
                     <div className="text-[10px] text-text-secondary font-mono mt-0.5 truncate select-all opacity-50">
                         {asset.type}
                     </div>
                 </div>
                 {renderHeaderControls()}
            </div>
            
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 space-y-4">
                {asset.type === 'PHYSICS_MATERIAL' && (
                    <div className="space-y-4">
                        <div className="text-xs font-bold text-text-secondary uppercase border-b border-white/5 pb-1">Properties</div>
                        <DraggableNumber 
                            label="Static Friction" 
                            value={(asset as PhysicsMaterialAsset).data.staticFriction} 
                            onChange={(v) => updateAssetData('staticFriction', v)} 
                            step={0.05}
                        />
                        <DraggableNumber 
                            label="Dynamic Friction" 
                            value={(asset as PhysicsMaterialAsset).data.dynamicFriction} 
                            onChange={(v) => updateAssetData('dynamicFriction', v)} 
                            step={0.05}
                        />
                        <DraggableNumber 
                            label="Bounciness" 
                            value={(asset as PhysicsMaterialAsset).data.bounciness} 
                            onChange={(v) => updateAssetData('bounciness', v)} 
                            step={0.05}
                        />
                        <DraggableNumber 
                            label="Density" 
                            value={(asset as PhysicsMaterialAsset).data.density} 
                            onChange={(v) => updateAssetData('density', v)} 
                            step={10}
                        />
                    </div>
                )}
                
                {(asset.type === 'MATERIAL' || asset.type === 'SCRIPT' || asset.type === 'RIG') && (
                    <div className="text-center text-text-secondary text-xs mt-10">
                        Double-click asset to open Graph for {asset.type === 'RIG' ? 'Rig Graphs' : (asset.type === 'SCRIPT' ? 'Visual Scripts' : 'Shader Materials')}.
                    </div>
                )}
            </div>
        </div>
      );
  }

  // --- ENTITY INSPECTOR ---
  const entity = activeObject as Entity;
  
  // Available components to add
  const availableComponents = [
      { type: ComponentType.MESH, label: 'Mesh Renderer', icon: 'Box' },
      { type: ComponentType.LIGHT, label: 'Light', icon: 'Sun' },
      { type: ComponentType.PHYSICS, label: 'Physics Body', icon: 'Activity' },
      { type: ComponentType.SCRIPT, label: 'Script', icon: 'FileCode' },
      { type: ComponentType.VIRTUAL_PIVOT, label: 'Virtual Pivot', icon: 'Maximize' }
  ].filter(c => !entity.components[c.type]);

  return (
    <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20" onClick={() => setShowAddComponent(false)}>
      {/* Header */}
      <div className="p-4 border-b border-black/20 bg-panel-header">
         <div className="flex items-center gap-3 mb-3">
             <div className="w-8 h-8 bg-blue-500 rounded flex items-center justify-center text-white shadow-sm shrink-0">
                 <Icon name="Box" size={16} />
             </div>
             <div className="flex-1 min-w-0">
                 <input 
                     type="text" 
                     value={name}
                     onChange={handleNameChange}
                     onBlur={handleNameCommit}
                     className="w-full bg-transparent text-sm font-bold text-white outline-none border-b border-transparent focus:border-accent transition-colors truncate"
                     aria-label="Entity Name"
                 />
                 <div className="text-[10px] text-text-secondary font-mono mt-0.5 truncate select-all opacity-50">
                     {entity.id}
                 </div>
             </div>
             <input 
                 type="checkbox" 
                 checked={entity.isActive}
                 onChange={(e) => { 
                     engineInstance.pushUndoState();
                     entity.isActive = e.target.checked; 
                     engineInstance.notifyUI(); 
                 }} 
                 className="cursor-pointer"
                 title="Active"
             />
             {renderHeaderControls()}
         </div>
         <div className="flex gap-1">
             <button className="flex-1 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white text-[10px] py-1 rounded border border-white/5 transition-colors">Untagged</button>
             <button className="flex-1 bg-white/5 hover:bg-white/10 text-text-secondary hover:text-white text-[10px] py-1 rounded border border-white/5 transition-colors">Default</button>
         </div>
      </div>

      {/* Components */}
      <div className="flex-1 overflow-y-auto custom-scrollbar">
          {entity.components[ComponentType.TRANSFORM] && (
              <ComponentCard 
                  title="Transform" 
                  icon="Move" 
                  component={entity.components[ComponentType.TRANSFORM]}
                  onUpdate={(f, v) => updateComponent(ComponentType.TRANSFORM, f, v)}
                  onStartUpdate={startUpdate}
                  onCommit={() => engineInstance.notifyUI()}
              />
          )}
        {entity.components[ComponentType.VIRTUAL_PIVOT] && (
              <ComponentCard 
                  title="Virtual Pivot" 
                  icon="Maximize" 
                  component={entity.components[ComponentType.VIRTUAL_PIVOT]}
                  onRemove={() => removeComponent(ComponentType.VIRTUAL_PIVOT)}
                  onUpdate={(f, v) => updateComponent(ComponentType.VIRTUAL_PIVOT, f, v)}
                  onStartUpdate={startUpdate}
                  onCommit={() => engineInstance.notifyUI()}
              />
          )}

          {entity.components[ComponentType.MESH] && (
              <ComponentCard 
                  title="Mesh Renderer" 
                  icon="Box" 
                  component={entity.components[ComponentType.MESH]}
                  onRemove={() => removeComponent(ComponentType.MESH)}
                  onUpdate={(f, v) => updateComponent(ComponentType.MESH, f, v)}
                  onStartUpdate={startUpdate}
                  onCommit={() => engineInstance.notifyUI()}
              />
          )}
          {entity.components[ComponentType.LIGHT] && (
              <ComponentCard 
                  title="Light Source" 
                  icon="Sun" 
                  component={entity.components[ComponentType.LIGHT]}
                  onRemove={() => removeComponent(ComponentType.LIGHT)}
                  onUpdate={(f, v) => updateComponent(ComponentType.LIGHT, f, v)}
                  onStartUpdate={startUpdate}
                  onCommit={() => engineInstance.notifyUI()}
              />
          )}
          {entity.components[ComponentType.PHYSICS] && (
              <ComponentCard 
                  title="Physics Body" 
                  icon="Activity" 
                  component={entity.components[ComponentType.PHYSICS]}
                  onRemove={() => removeComponent(ComponentType.PHYSICS)}
                  onUpdate={(f, v) => updateComponent(ComponentType.PHYSICS, f, v)}
                  onStartUpdate={startUpdate}
                  onCommit={() => engineInstance.notifyUI()}
              />
          )}

           <div className="p-4 flex justify-center pb-8 relative">
            <button 
                className="bg-accent/20 hover:bg-accent/40 text-accent border border-accent/50 text-xs px-6 py-2 rounded-full font-semibold transition-all"
                onClick={(e) => { e.stopPropagation(); setShowAddComponent(!showAddComponent); }}
            >
                Add Component
            </button>
            
            {/* Add Component Menu */}
            {showAddComponent && (
                <div className="absolute top-12 w-48 bg-[#252525] border border-white/10 shadow-xl rounded-md z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <div className="bg-black/20 p-2 border-b border-white/5 text-[10px] font-bold text-text-secondary uppercase">
                        Add Component
                    </div>
                    {availableComponents.length > 0 ? (
                        availableComponents.map(c => (
                            <button
                                key={c.type}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-accent hover:text-white flex items-center gap-2 text-gray-300"
                                onClick={() => addComponent(c.type)}
                            >
                                <Icon name={c.icon as any} size={12} />
                                {c.label}
                            </button>
                        ))
                    ) : (
                        <div className="px-3 py-2 text-xs text-text-secondary italic">No components available</div>
                    )}
                </div>
            )}
         </div>
      </div>
    </div>
  );
};
