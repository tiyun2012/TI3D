import React, { useState, useRef, useEffect } from 'react';
import { Entity, Component, ComponentType, Vector3 } from '../types';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';

interface InspectorPanelProps {
  entity: Entity | null;
}

// --- Reusable UI Controls ---

const DraggableNumber: React.FC<{ 
  label: string; 
  value: number; 
  onChange: (val: number) => void; 
  color?: string;
  step?: number;
}> = ({ label, value, onChange, color, step = 0.1 }) => {
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
      setIsDragging(false);
      document.body.style.cursor = 'default';
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
  }, [isDragging, onChange, step]);

  return (
    <div className="flex items-center bg-input-bg rounded overflow-hidden border border-transparent focus-within:border-accent group">
      <div 
        className={`w-6 flex items-center justify-center text-[10px] font-bold cursor-ew-resize select-none h-6 transition-colors hover:text-white ${color || 'text-text-secondary'}`}
        onMouseDown={(e) => {
          startX.current = e.clientX;
          startVal.current = value;
          setIsDragging(true);
        }}
      >
        {label}
      </div>
      <input 
        type="number" 
        className="flex-1 bg-transparent text-xs p-1 outline-none text-white min-w-0" 
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        step={step}
      />
    </div>
  );
};

const Vector3Input: React.FC<{ label: string; value: Vector3; onChange?: (v: Vector3) => void }> = ({ label, value, onChange }) => (
  <div className="flex flex-col gap-1 mb-3">
    <div className="text-[10px] uppercase text-text-secondary font-semibold tracking-wider ml-1">{label}</div>
    <div className="grid grid-cols-3 gap-1">
      <DraggableNumber label="X" value={value.x} onChange={(v) => onChange?.({...value, x: v})} color="text-red-500 hover:bg-red-500/20" />
      <DraggableNumber label="Y" value={value.y} onChange={(v) => onChange?.({...value, y: v})} color="text-green-500 hover:bg-green-500/20" />
      <DraggableNumber label="Z" value={value.z} onChange={(v) => onChange?.({...value, z: v})} color="text-blue-500 hover:bg-blue-500/20" />
    </div>
  </div>
);

const ComponentCard: React.FC<{ 
  component: Component; 
  title: string; 
  icon: string; 
  onRemove?: () => void;
  onUpdate: (field: string, value: any) => void;
}> = ({ component, title, icon, onUpdate }) => {
  const [open, setOpen] = useState(true);

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
            <button className="p-1 hover:text-white text-text-secondary"><Icon name="Settings2" size={12} /></button>
            <button className="p-1 hover:text-white text-text-secondary"><Icon name="Trash2" size={12} /></button>
        </div>
      </div>

      {/* Body */}
      {open && <div className="p-3 bg-panel border-t border-black/10 text-xs space-y-3">
        {component.type === ComponentType.TRANSFORM && (
          <>
            <Vector3Input label="Position" value={component.position} onChange={(v) => onUpdate('position', v)} />
            <Vector3Input label="Rotation" value={component.rotation} onChange={(v) => onUpdate('rotation', v)} />
            <Vector3Input label="Scale" value={component.scale} onChange={(v) => onUpdate('scale', v)} />
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
                      onChange={(e) => onUpdate('meshType', e.target.value)}
                   >
                      <option value="Cube">Cube</option>
                      <option value="Sphere">Sphere</option>
                      <option value="Plane">Plane</option>
                   </select>
                </div>
             </div>
             <div className="flex items-center gap-2">
                <span className="w-24 text-text-secondary">Color</span>
                <div className="flex-1 flex gap-2">
                    <input 
                        type="color" 
                        value={component.color} 
                        onChange={(e) => onUpdate('color', e.target.value)}
                        className="w-8 h-6 rounded cursor-pointer bg-transparent"
                    />
                    <input 
                        type="text" 
                        value={component.color} 
                        onChange={(e) => onUpdate('color', e.target.value)}
                        className="flex-1 bg-input-bg rounded px-2 text-text-secondary outline-none focus:text-white" 
                    />
                </div>
             </div>
             <div className="flex items-center gap-2">
                 <span className="w-24 text-text-secondary">Cast Shadows</span>
                 <input type="checkbox" defaultChecked />
             </div>
             <div className="flex items-center gap-2">
                 <span className="w-24 text-text-secondary">Receive Shadows</span>
                 <input type="checkbox" defaultChecked />
             </div>
          </>
        )}

        {component.type === ComponentType.LIGHT && (
           <>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Type</span>
               <select className="flex-1 bg-input-bg rounded p-1 outline-none border border-transparent focus:border-accent text-white">
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
                  onChange={(e) => onUpdate('color', e.target.value)}
                  className="w-full h-6 rounded bg-transparent cursor-pointer" 
               />
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Intensity</span>
               <div className="flex-1 flex items-center gap-2">
                  <input 
                    type="range" min="0" max="5" step="0.1" 
                    value={component.intensity} 
                    onChange={(e) => onUpdate('intensity', parseFloat(e.target.value))}
                    className="flex-1" 
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
               <DraggableNumber label="" value={component.mass} onChange={(v) => onUpdate('mass', v)} step={0.1} />
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
                  onChange={(e) => onUpdate('useGravity', e.target.checked)}
                />
            </div>
            <div className="flex items-center gap-2">
               <span className="w-24 text-text-secondary">Is Kinematic</span>
               <input type="checkbox" />
            </div>
           </>
        )}
      </div>}
    </div>
  );
};

export const InspectorPanel: React.FC<InspectorPanelProps> = ({ entity }) => {
  if (!entity) {
    return (
      <div className="h-full bg-panel flex flex-col items-center justify-center text-text-secondary">
        <Icon name="BoxSelect" size={48} className="opacity-20 mb-2" />
        <span className="text-xs">No Selection</span>
      </div>
    );
  }

  const handleEntityChange = (field: keyof Entity, value: any) => {
      (entity as any)[field] = value;
      engineInstance.notifyUI();
  };

  const handleComponentChange = (type: ComponentType, field: string, value: any) => {
      const comp = entity.components[type];
      if (comp) {
          comp[field] = value;
          engineInstance.notifyUI();
      }
  };

  return (
    <div className="h-full bg-panel flex flex-col font-sans border-l border-black/20">
      {/* Entity Header */}
      <div className="p-4 border-b border-black/20 bg-panel-header">
        <div className="flex items-center gap-3 mb-3">
          <input 
            type="checkbox" 
            checked={entity.isActive} 
            onChange={(e) => handleEntityChange('isActive', e.target.checked)}
            className="w-4 h-4 rounded-sm" 
            title="Active" 
          />
          <div className="flex-1 bg-input-bg border border-transparent focus-within:border-accent rounded px-2 py-1.5 flex items-center">
             <Icon name="Box" size={14} className="text-blue-400 mr-2" />
             <input 
                className="bg-transparent text-sm w-full outline-none font-medium text-white" 
                value={entity.name} 
                onChange={(e) => handleEntityChange('name', e.target.value)}
             />
          </div>
        </div>
        
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="flex items-center gap-2">
              <span className="text-text-secondary w-10">Tag</span>
              <select className="flex-1 bg-input-bg rounded px-1 py-0.5 outline-none text-white">
                  <option>Untagged</option>
                  <option>Player</option>
                  <option>Enemy</option>
              </select>
          </div>
          <div className="flex items-center gap-2">
              <span className="text-text-secondary w-10">Layer</span>
              <select className="flex-1 bg-input-bg rounded px-1 py-0.5 outline-none text-white">
                  <option>Default</option>
                  <option>UI</option>
                  <option>Water</option>
              </select>
          </div>
        </div>
      </div>

      {/* Components List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar pb-10">
        {entity.components[ComponentType.TRANSFORM] && (
          <ComponentCard 
            title="Transform" 
            component={entity.components[ComponentType.TRANSFORM]} 
            icon="Move3d" 
            onUpdate={(f, v) => handleComponentChange(ComponentType.TRANSFORM, f, v)}
          />
        )}
        {entity.components[ComponentType.MESH] && (
          <ComponentCard 
            title="Mesh Renderer" 
            component={entity.components[ComponentType.MESH]} 
            icon="Box" 
            onUpdate={(f, v) => handleComponentChange(ComponentType.MESH, f, v)}
          />
        )}
        {entity.components[ComponentType.LIGHT] && (
          <ComponentCard 
            title="Light Source" 
            component={entity.components[ComponentType.LIGHT]} 
            icon="Sun" 
            onUpdate={(f, v) => handleComponentChange(ComponentType.LIGHT, f, v)}
          />
        )}
        {entity.components[ComponentType.PHYSICS] && (
          <ComponentCard 
            title="Rigidbody" 
            component={entity.components[ComponentType.PHYSICS]} 
            icon="Weight" 
            onUpdate={(f, v) => handleComponentChange(ComponentType.PHYSICS, f, v)}
          />
        )}
        
        <div className="p-4 flex justify-center mt-2">
            <button className="bg-input-bg hover:bg-accent text-white border border-white/10 text-xs px-6 py-1.5 rounded-md shadow-sm transition-all flex items-center gap-2">
                <Icon name="Plus" size={14} /> Add Component
            </button>
        </div>
      </div>
    </div>
  );
};
