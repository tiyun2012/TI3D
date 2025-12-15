
import React, { useState, useRef, useEffect, useContext } from 'react';
import { Entity, Component, ComponentType, Vector3, RotationOrder, TransformSpace } from '../types';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';
import { ROTATION_ORDERS } from '../services/constants';
import { EditorContext } from '../contexts/EditorContext';

interface InspectorPanelProps {
  entity: Entity | null;
  selectionCount?: number;
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
}> = ({ label, value, onChange, onStart, onCommit, color, step = 0.1 }) => {
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
    <div className="flex items-center bg-input-bg rounded overflow-hidden border border-transparent focus-within:border-accent group">
      <div 
        className={`w-6 flex items-center justify-center text-[10px] font-bold cursor-ew-resize select-none h-6 transition-colors hover:text-white ${color || 'text-text-secondary'}`}
        onMouseDown={(e) => {
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
        className="flex-1 bg-transparent text-xs p-1 outline-none text-white min-w-0" 
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        onBlur={onCommit}
        step={step}
      />
    </div>
  );
};

const Vector3Input: React.FC<{ 
    label: string; 
    value: Vector3; 
    onChange?: (v: Vector3) => void; 
    onStart?: () => void;
    onCommit?: () => void 
}> = ({ label, value, onChange, onStart, onCommit }) => (
  <div className="flex flex-col gap-1 mb-3">
    <div className="text-[10px] uppercase text-text-secondary font-semibold tracking-wider ml-1">{label}</div>
    <div className="grid grid-cols-3 gap-1">
      <DraggableNumber label="X" value={value.x} onChange={(v) => onChange?.({...value, x: v})} onStart={onStart} onCommit={onCommit} color="text-red-500 hover:bg-red-500/20" />
      <DraggableNumber label="Y" value={value.y} onChange={(v) => onChange?.({...value, y: v})} onStart={onStart} onCommit={onCommit} color="text-green-500 hover:bg-green-500/20" />
      <DraggableNumber label="Z" value={value.z} onChange={(v) => onChange?.({...value, z: v})} onStart={onStart} onCommit={onCommit} color="text-blue-500 hover:bg-blue-500/20" />
    </div>
  </div>
);

const TexturePicker: React.FC<{ value: number, onChange: (v: number) => void }> = ({ value, onChange }) => {
    const textures = [
        { id: 0, name: 'White', color: '#ffffff' },
        { id: 1, name: 'Grid', color: '#888888', pattern: true },
        { id: 2, name: 'Noise', color: '#aaaaaa', noise: true },
        { id: 3, name: 'Brick', color: '#a0522d' }
    ];

    return (
        <div className="flex flex-col gap-1">
            <span className="text-[10px] text-text-secondary">Texture</span>
            <div className="grid grid-cols-4 gap-2">
                {textures.map(tex => (
                    <button 
                        key={tex.id}
                        onClick={() => onChange(tex.id)}
                        className={`aspect-square rounded border-2 transition-all relative overflow-hidden group ${value === tex.id ? 'border-accent ring-1 ring-accent' : 'border-transparent hover:border-white/30'}`}
                        title={tex.name}
                        aria-label={`Select Texture ${tex.name}`}
                    >
                        <div className="absolute inset-0" style={{ backgroundColor: tex.color }}>
                            {tex.pattern && <div className="w-full h-full opacity-30" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '4px 4px' }} />}
                            {tex.noise && <div className="w-full h-full opacity-50" style={{ filter: 'contrast(200%) brightness(150%)', background: 'repeating-radial-gradient(#000 0 0.0001%,#fff 0 0.0002%) 50% 0/2500px 2500px, repeating-conic-gradient(#000 0 0.0001%,#fff 0 0.0002%) 60% 60%/2500px 2500px' }} />}
                        </div>
                        {value === tex.id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                <Icon name="Check" size={12} className="text-white drop-shadow-md" />
                            </div>
                        )}
                    </button>
                ))}
            </div>
        </div>
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
}> = ({ component, title, icon, onUpdate, onStartUpdate, onCommit }) => {
  const [open, setOpen] = useState(true);
  const editorCtx = useContext(EditorContext);

  const handleAtomicChange = (field: string, value: any) => {
      if(onStartUpdate) onStartUpdate();
      onUpdate(field, value);
      onCommit();
  };

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
            <button className="p-1 hover:text-white text-text-secondary" title="Remove Component" aria-label="Remove Component"><Icon name="Trash2" size={12} /></button>
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
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] text-text-secondary">Space</span>
                            <select 
                                className="bg-input-bg text-white text-[10px] rounded border border-transparent focus:border-accent outline-none px-1"
                                value={editorCtx?.transformSpace || 'Gimbal'}
                                onChange={(e) => editorCtx?.setTransformSpace(e.target.value as TransformSpace)}
                            >
                                <option value="Gimbal">Gimbal</option>
                                <option value="Local">Local</option>
                                <option value="World">World</option>
                            </select>
                        </div>
                        {/* Order Selector */}
                        <div className="flex items-center gap-1">
                            <span className="text-[9px] text-text-secondary">Order</span>
                            <select 
                                className="bg-input-bg text-white text-[10px] rounded border border-transparent focus:border-accent outline-none px-1"
                                value={component.rotationOrder}
                                onChange={(e) => handleAtomicChange('rotationOrder', e.target.value)}
                            >
                                {ROTATION_ORDERS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
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

        {component.type === ComponentType.MESH && (
          <>
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary">Mesh Filter</span>
                <div className="flex-1 flex items-center bg-input-bg rounded border border-transparent px-2 py-1">
                   <Icon name="Box" size={12} className="mr-2 text-blue-400"/>
                   <select 
                      className="flex-1 bg-transparent outline-none text-white"
                      value={component.meshType}
                      onChange={(e) => handleAtomicChange('meshType', e.target.value)}
                      aria-label="Mesh Type"
                   >
                      <option value="Cube">Cube</option>
                      <option value="Sphere">Sphere</option>
                      <option value="Plane">Plane</option>
                   </select>
                </div>
             </div>
             
             {/* Texture Picker */}
             <TexturePicker 
                value={component.textureIndex || 0} 
                onChange={(v) => handleAtomicChange('textureIndex', v)}
             />

             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary">Color</span>
                <div className="flex-1 flex gap-2">
                    <input 
                        type="color" 
                        value={component.color} 
                        onChange={(e) => handleAtomicChange('color', e.target.value)}
                        className="w-8 h-6 rounded cursor-pointer bg-transparent"
                        aria-label="Color Picker"
                    />
                    <input 
                        type="text" 
                        value={component.color} 
                        onChange={(e) => handleAtomicChange('color', e.target.value)}
                        className="flex-1 bg-input-bg rounded px-2 text-text-secondary outline-none focus:text-white" 
                        aria-label="Color Hex"
                    />
                </div>
             </div>
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
               <select 
                  className="flex-1 bg-input-bg rounded p-1 outline-none border border-transparent focus:border-accent text-white"
                  aria-label="Light Type"
                >
                   <option>Directional</option>
                   <option>Point</option>
                   <option>Spot</option>
               </select>
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Color</span>
               <input 
                  type="color" 
                  value={component.color} 
                  onChange={(e) => handleAtomicChange('color', e.target.value)}
                  className="w-full h-6 rounded bg-transparent cursor-pointer" 
                  aria-label="Light Color"
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
               <span className="w-24 text-text-secondary">Drag</span>
               <DraggableNumber label="" value={0.5} onChange={()=>{}} step={0.05} />
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
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Is Kinematic</span>
               <input type="checkbox" aria-label="Is Kinematic" />
            </div>
          </>
        )}
      </div>}
    </div>
  );
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ entity, selectionCount = 0 }) => {
  const [name, setName] = useState('');

  useEffect(() => {
    if (entity) setName(entity.name);
  }, [entity]);

  const handleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  };

  const handleNameCommit = () => {
      if (entity && entity.name !== name) {
          engineInstance.pushUndoState();
          entity.name = name;
          engineInstance.notifyUI();
      }
  };

  const startUpdate = () => {
      engineInstance.pushUndoState();
  };

  const updateComponent = (type: ComponentType, field: string, value: any) => {
      if (!entity) return;
      const comp = entity.components[type];
      if (comp) {
          (comp as any)[field] = value;
          engineInstance.notifyUI();
      }
  };

  if (!entity) {
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

  return (
    <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
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
          {entity.components[ComponentType.MESH] && (
              <ComponentCard 
                  title="Mesh Renderer" 
                  icon="Box" 
                  component={entity.components[ComponentType.MESH]}
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
                  onUpdate={(f, v) => updateComponent(ComponentType.PHYSICS, f, v)}
                  onStartUpdate={startUpdate}
                  onCommit={() => engineInstance.notifyUI()}
              />
          )}

           <div className="p-4 flex justify-center pb-8">
            <button className="bg-accent/20 hover:bg-accent/40 text-accent border border-accent/50 text-xs px-6 py-2 rounded-full font-semibold transition-all">
                Add Component
            </button>
         </div>
      </div>
    </div>
  );
};
