import React, { useContext } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { GizmoArrowShape, GizmoCenterShape, GizmoPlaneShape } from './gizmos/GizmoUtils';
import { Icon } from './Icon';
import { DraggableWindow } from './DraggableWindow';

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
  const setPlaneShape = (shape: GizmoPlaneShape) => setGizmoConfig({ ...gizmoConfig, planeHandleShape: shape });
  
  const setArrowSize = (size: number) => setGizmoConfig({ ...gizmoConfig, arrowSize: size });
  const setArrowOffset = (offset: number) => setGizmoConfig({ ...gizmoConfig, arrowOffset: offset });
  const setPlaneSize = (size: number) => setGizmoConfig({ ...gizmoConfig, planeHandleSize: size });
  const setRingSize = (size: number) => setGizmoConfig({ ...gizmoConfig, rotationRingSize: size });

  // New Setters
  const updateConfig = (key: keyof typeof gizmoConfig, value: any) => setGizmoConfig({ ...gizmoConfig, [key]: value });

  // Minimal SVG Previews for UI
  const PreviewCone = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4 22h16L12 2z"/></svg>;
  const PreviewCube = <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>;
  const PreviewRhombus = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>;
  const PreviewTetra = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 18l9 4 9-4L12 2z"/></svg>;
  const PreviewCircle = <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg>;
  const PreviewSquare = <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>;
  const PreviewX = <Icon name="X" size={20} />;
  const PreviewQuadCircles = (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"/>
          <circle cx="16" cy="8" r="2" />
          <circle cx="8" cy="8" r="2" />
          <circle cx="16" cy="16" r="2" />
          <circle cx="8" cy="16" r="2" />
      </svg>
  );

  return (
    <DraggableWindow title="Preferences" onClose={onClose} width={500} icon="Settings2">
        <div className="p-6 space-y-6">
            
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
                
                {/* Sliders for Size and Offset */}
                <div className="grid grid-cols-2 gap-4 mt-2">
                    <div className="bg-input-bg p-3 rounded border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Arrow Size</span>
                            <span className="text-[10px] font-mono text-white">{gizmoConfig.arrowSize.toFixed(2)}</span>
                        </div>
                        <input 
                            type="range" min="0.1" max="5.0" step="0.1" 
                            className="w-full cursor-pointer"
                            value={gizmoConfig.arrowSize} 
                            onChange={(e) => setArrowSize(parseFloat(e.target.value))} 
                        />
                    </div>
                    <div className="bg-input-bg p-3 rounded border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                             <span className="text-[10px] font-bold text-text-secondary uppercase">Arrow Offset</span>
                             <span className="text-[10px] font-mono text-white">{gizmoConfig.arrowOffset.toFixed(2)}</span>
                        </div>
                        <input 
                            type="range" min="0.5" max="2.5" step="0.1" 
                            className="w-full cursor-pointer"
                            value={gizmoConfig.arrowOffset} 
                            onChange={(e) => setArrowOffset(parseFloat(e.target.value))} 
                        />
                    </div>
                </div>
            </div>

            {/* Section: Rotation Ring */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                    <Icon name="RotateCw" size={12} /> Rotation Ring Style
                </h3>
                
                <div className="grid grid-cols-2 gap-4">
                    {/* Ring Radius */}
                    <div className="bg-input-bg p-3 rounded border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Ring Size</span>
                            <span className="text-[10px] font-mono text-white">{gizmoConfig.rotationRingSize.toFixed(2)}</span>
                        </div>
                        <input 
                            type="range" min="0.5" max="3.0" step="0.1" 
                            className="w-full cursor-pointer"
                            value={gizmoConfig.rotationRingSize} 
                            onChange={(e) => setRingSize(parseFloat(e.target.value))} 
                        />
                    </div>

                    {/* Tube Thickness */}
                    <div className="bg-input-bg p-3 rounded border border-white/5">
                         <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Tube Thickness</span>
                            <span className="text-[10px] font-mono text-white">{gizmoConfig.rotationRingTubeScale.toFixed(2)}</span>
                        </div>
                        <input 
                            type="range" min="0.1" max="2.0" step="0.1" 
                            className="w-full cursor-pointer"
                            value={gizmoConfig.rotationRingTubeScale} 
                            onChange={(e) => updateConfig('rotationRingTubeScale', parseFloat(e.target.value))} 
                        />
                    </div>
                </div>

                {/* NEW: Screen Ring Scale */}
                <div className="bg-input-bg p-3 rounded border border-white/5">
                     <div className="flex justify-between items-center mb-2">
                        <span className="text-[10px] font-bold text-text-secondary uppercase">Screen Ring Scale</span>
                        <span className="text-[10px] font-mono text-white">{gizmoConfig.rotationScreenRingScale.toFixed(2)}x</span>
                    </div>
                    <input 
                        type="range" min="1.0" max="2.0" step="0.05" 
                        className="w-full cursor-pointer"
                        value={gizmoConfig.rotationScreenRingScale} 
                        onChange={(e) => updateConfig('rotationScreenRingScale', parseFloat(e.target.value))} 
                    />
                </div>

                {/* Toggles */}
                 <div className="flex items-center gap-4 text-xs pt-1 px-1">
                    <label className="flex items-center gap-2 cursor-pointer select-none text-text-secondary hover:text-white transition-colors">
                        <input type="checkbox" checked={gizmoConfig.rotationShowScreenRing} onChange={(e) => updateConfig('rotationShowScreenRing', e.target.checked)} />
                        <span>Outer Ring</span>
                    </label>
                     <label className="flex items-center gap-2 cursor-pointer select-none text-text-secondary hover:text-white transition-colors">
                        <input type="checkbox" checked={gizmoConfig.rotationShowDecorations} onChange={(e) => updateConfig('rotationShowDecorations', e.target.checked)} />
                        <span>Decorations</span>
                    </label>
                     <label className="flex items-center gap-2 cursor-pointer select-none text-text-secondary hover:text-white transition-colors">
                        <input type="checkbox" checked={gizmoConfig.rotationShowSector} onChange={(e) => updateConfig('rotationShowSector', e.target.checked)} />
                        <span>Pie Sector</span>
                    </label>
                </div>
            </div>

            {/* Section: Axis Interaction Colors/Thickness */}
            <div className="space-y-3">
                 <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                    <Icon name="MousePointer2" size={12} /> Axis Interaction
                </h3>

                {/* Base Thickness Slider */}
                <div className="bg-input-bg p-3 rounded border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[10px] font-bold text-text-secondary uppercase">Base Thickness</span>
                        <span className="text-[10px] font-mono text-white">{gizmoConfig.axisBaseThickness}px</span>
                    </div>
                    <input type="range" min="1" max="10" step="1" className="w-full cursor-pointer" value={gizmoConfig.axisBaseThickness} onChange={(e) => updateConfig('axisBaseThickness', parseFloat(e.target.value))} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                     <div className="bg-input-bg p-3 rounded border border-white/5 space-y-3">
                         <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Hover Color</span>
                            <input type="color" className="w-6 h-6 rounded cursor-pointer bg-transparent" value={gizmoConfig.axisHoverColor} onChange={(e) => updateConfig('axisHoverColor', e.target.value)} />
                         </div>
                         <div className="space-y-1">
                             <div className="flex justify-between">
                                <span className="text-[10px] font-bold text-text-secondary uppercase">Hover Scale</span>
                                <span className="text-[10px] font-mono text-white">{gizmoConfig.axisHoverThicknessOffset.toFixed(1)}x</span>
                             </div>
                             <input type="range" min="1.0" max="5.0" step="0.1" className="w-full cursor-pointer" value={gizmoConfig.axisHoverThicknessOffset} onChange={(e) => updateConfig('axisHoverThicknessOffset', parseFloat(e.target.value))} />
                         </div>
                     </div>
                     <div className="bg-input-bg p-3 rounded border border-white/5 space-y-3">
                         <div className="flex justify-between items-center">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Press Color</span>
                            <input type="color" className="w-6 h-6 rounded cursor-pointer bg-transparent" value={gizmoConfig.axisPressColor} onChange={(e) => updateConfig('axisPressColor', e.target.value)} />
                         </div>
                          <div className="space-y-1">
                             <div className="flex justify-between">
                                <span className="text-[10px] font-bold text-text-secondary uppercase">Press Scale</span>
                                <span className="text-[10px] font-mono text-white">{gizmoConfig.axisPressThicknessOffset.toFixed(1)}x</span>
                             </div>
                             <input type="range" min="1.0" max="5.0" step="0.1" className="w-full cursor-pointer" value={gizmoConfig.axisPressThicknessOffset} onChange={(e) => updateConfig('axisPressThicknessOffset', parseFloat(e.target.value))} />
                         </div>
                     </div>
                </div>
            </div>

            {/* Section: Plane Handles */}
             <div className="space-y-3">
                <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                    <Icon name="Square" size={12} /> Plane Handle Style
                </h3>
                <div className="grid grid-cols-4 gap-2">
                    <SelectionCard 
                        label="Square" 
                        selected={gizmoConfig.planeHandleShape === 'SQUARE'} 
                        onClick={() => setPlaneShape('SQUARE')} 
                        shapePreview={PreviewSquare}
                    />
                    <SelectionCard 
                        label="Rhombus" 
                        selected={gizmoConfig.planeHandleShape === 'RHOMBUS'} 
                        onClick={() => setPlaneShape('RHOMBUS')} 
                        shapePreview={PreviewRhombus}
                    />
                     <SelectionCard 
                        label="Circle" 
                        selected={gizmoConfig.planeHandleShape === 'CIRCLE'} 
                        onClick={() => setPlaneShape('CIRCLE')} 
                        shapePreview={PreviewCircle}
                    />
                </div>
                <div className="bg-input-bg p-3 rounded border border-white/5 mt-2">
                    <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Plane Handle Size</span>
                            <span className="text-[10px] font-mono text-white">{gizmoConfig.planeHandleSize.toFixed(2)}</span>
                    </div>
                    <input 
                        type="range" min="0.1" max="2.0" step="0.1" 
                        className="w-full cursor-pointer"
                        value={gizmoConfig.planeHandleSize} 
                        onChange={(e) => setPlaneSize(parseFloat(e.target.value))} 
                    />
                </div>
            </div>

            {/* Section: Center Handle */}
            <div className="space-y-3">
                <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                    <Icon name="Move3d" size={12} /> Free Move Handle
                </h3>
                <div className="grid grid-cols-5 gap-2">
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
                    <SelectionCard 
                        label="Quad" 
                        selected={gizmoConfig.centerHandleShape === 'QUAD_CIRCLES'} 
                        onClick={() => setCenterShape('QUAD_CIRCLES')} 
                        shapePreview={PreviewQuadCircles}
                    />
                </div>
                
                <div className="grid grid-cols-2 gap-4 mt-2">
                     <div className="bg-input-bg p-3 rounded border border-white/5 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Color</span>
                            <input type="color" className="w-6 h-6 rounded cursor-pointer bg-transparent" value={gizmoConfig.centerHandleColor} onChange={(e) => updateConfig('centerHandleColor', e.target.value)} />
                     </div>
                     <div className="bg-input-bg p-3 rounded border border-white/5">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Size</span>
                            <span className="text-[10px] font-mono text-white">{gizmoConfig.centerHandleSize.toFixed(2)}</span>
                        </div>
                        <input type="range" min="0.5" max="2.0" step="0.1" className="w-full cursor-pointer" value={gizmoConfig.centerHandleSize} onChange={(e) => updateConfig('centerHandleSize', parseFloat(e.target.value))} />
                     </div>
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
    </DraggableWindow>
  );
};