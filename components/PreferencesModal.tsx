
import React, { useContext } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { GizmoArrowShape, GizmoCenterShape } from './gizmos/GizmoUtils';
import { Icon } from './Icon';

interface Props {
  onClose: () => void;
}

const SelectionCard: React.FC<{ 
    label: string; 
    selected: boolean; 
    onClick: () => void; 
    iconName?: any;
    shapePreview?: React.ReactNode;
}> = ({ label, selected, onClick, iconName, shapePreview }) => {
    return (
        <button 
            onClick={onClick}
            className={`flex flex-col items-center justify-center p-2 rounded border transition-all h-20
                ${selected 
                    ? 'bg-accent text-white border-accent shadow-md' 
                    : 'bg-input-bg text-text-secondary border-transparent hover:bg-white/10 hover:border-white/20'
                }`}
        >
            <div className="mb-2">
                {shapePreview ? shapePreview : (iconName && <Icon name={iconName} size={20} />)}
            </div>
            <span className="text-[10px] font-bold uppercase tracking-wider">{label}</span>
        </button>
    );
};

export const PreferencesModal: React.FC<Props> = ({ onClose }) => {
  const { gizmoConfig, setGizmoConfig } = useContext(EditorContext)!;

  const setArrowShape = (shape: GizmoArrowShape) => setGizmoConfig({ ...gizmoConfig, translationShape: shape });
  const setCenterShape = (shape: GizmoCenterShape) => setGizmoConfig({ ...gizmoConfig, centerHandleShape: shape });

  // Minimal SVG Previews for UI
  const PreviewCone = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4 22h16L12 2z"/></svg>;
  const PreviewCube = <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>;
  const PreviewRhombus = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>;
  const PreviewTetra = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 18l9 4 9-4L12 2z"/></svg>;
  const PreviewCircle = <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>;
  const PreviewX = <Icon name="X" size={20} />;

  return (
    <div className="fixed inset-0 bg-black/60 z-[100] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-panel border border-white/20 rounded-lg shadow-2xl w-[500px] overflow-hidden flex flex-col max-h-[80vh]" 
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-panel-header px-4 py-3 border-b border-white/10 flex justify-between items-center shrink-0">
            <span className="font-bold text-sm text-white flex items-center gap-2">
                <Icon name="Settings2" size={16} className="text-accent" />
                Preferences
            </span>
            <button onClick={onClose} className="hover:text-white text-text-secondary"><Icon name="X" size={16}/></button>
        </div>
        
        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar">
            
            {/* Section: Gizmo Arrows */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                    <Icon name="Move" size={12} /> Axis Arrow Style
                </h3>
                <div className="grid grid-cols-4 gap-2">
                    <SelectionCard 
                        label="Cone" 
                        selected={gizmoConfig.translationShape === 'CONE'} 
                        onClick={() => setArrowShape('CONE')} 
                        shapePreview={PreviewCone}
                    />
                    <SelectionCard 
                        label="Pyramid" 
                        selected={gizmoConfig.translationShape === 'TETRAHEDRON'} 
                        onClick={() => setArrowShape('TETRAHEDRON')} 
                        shapePreview={PreviewTetra}
                    />
                    <SelectionCard 
                        label="Rhombus" 
                        selected={gizmoConfig.translationShape === 'RHOMBUS'} 
                        onClick={() => setArrowShape('RHOMBUS')} 
                        shapePreview={PreviewRhombus}
                    />
                    <SelectionCard 
                        label="Cube" 
                        selected={gizmoConfig.translationShape === 'CUBE'} 
                        onClick={() => setArrowShape('CUBE')} 
                        shapePreview={PreviewCube}
                    />
                </div>
            </div>

            {/* Section: Center Handle */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                    <Icon name="Move3d" size={12} /> Free Move Handle
                </h3>
                <div className="grid grid-cols-4 gap-2">
                    <SelectionCard 
                        label="None" 
                        selected={gizmoConfig.centerHandleShape === 'NONE'} 
                        onClick={() => setCenterShape('NONE')} 
                        shapePreview={PreviewX}
                    />
                    <SelectionCard 
                        label="Cube" 
                        selected={gizmoConfig.centerHandleShape === 'CUBE'} 
                        onClick={() => setCenterShape('CUBE')} 
                        shapePreview={PreviewCube}
                    />
                    <SelectionCard 
                        label="Sphere" 
                        selected={gizmoConfig.centerHandleShape === 'SPHERE'} 
                        onClick={() => setCenterShape('SPHERE')} 
                        shapePreview={PreviewCircle}
                    />
                    <SelectionCard 
                        label="Rhombus" 
                        selected={gizmoConfig.centerHandleShape === 'RHOMBUS'} 
                        onClick={() => setCenterShape('RHOMBUS')} 
                        shapePreview={PreviewRhombus}
                    />
                </div>
            </div>

            {/* Placeholder: Grid */}
            <div className="space-y-3 opacity-50 pointer-events-none grayscale">
                <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                    <Icon name="Grid" size={12} /> Grid Options
                </h3>
                <div className="grid grid-cols-2 gap-4 text-xs">
                     <div className="flex justify-between items-center bg-input-bg p-2 rounded">
                         <span>Grid Size</span>
                         <span className="font-mono">10.0</span>
                     </div>
                     <div className="flex justify-between items-center bg-input-bg p-2 rounded">
                         <span>Snap Step</span>
                         <span className="font-mono">1.0</span>
                     </div>
                </div>
            </div>
        </div>
        
        <div className="bg-panel-header px-4 py-3 border-t border-white/10 flex justify-end shrink-0">
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white text-xs px-6 py-2 rounded font-medium transition-colors">Close</button>
        </div>
      </div>
    </div>
  );
};
