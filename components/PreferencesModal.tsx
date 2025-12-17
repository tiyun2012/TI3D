
import React, { useContext, useState, useMemo } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { GizmoArrowShape, GizmoCenterShape, GizmoPlaneShape } from './gizmos/GizmoUtils';
import { Icon } from './Icon';
import { Slider } from './ui/Slider';
import { engineInstance } from '../services/engine';

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
  const { gizmoConfig, setGizmoConfig, uiConfig, setUiConfig, gridConfig, setGridConfig } = useContext(EditorContext)!;
  const [ppConfig, setPpConfig] = useState(engineInstance.getPostProcessConfig());
  const [search, setSearch] = useState('');

  const setArrowShape = (shape: GizmoArrowShape) => setGizmoConfig({ ...gizmoConfig, translationShape: shape });
  const setCenterShape = (shape: GizmoCenterShape) => setGizmoConfig({ ...gizmoConfig, centerHandleShape: shape });
  const setArrowSize = (size: number) => setGizmoConfig({ ...gizmoConfig, arrowSize: size });
  const setArrowOffset = (offset: number) => setGizmoConfig({ ...gizmoConfig, arrowOffset: offset });
  const setRingSize = (size: number) => setGizmoConfig({ ...gizmoConfig, rotationRingSize: size });
  
  const updateConfig = (key: keyof typeof gizmoConfig, value: any) => setGizmoConfig({ ...gizmoConfig, [key]: value });
  
  const updateUiConfig = (key: keyof typeof uiConfig, value: any) => setUiConfig({ ...uiConfig, [key]: value });

  const updatePp = (key: string, val: any) => {
      const newConfig = { ...ppConfig, [key]: val };
      setPpConfig(newConfig);
      engineInstance.setPostProcessConfig(newConfig);
  };

  const updateGrid = (key: keyof typeof gridConfig, val: any) => {
      const newConfig = { ...gridConfig, [key]: val };
      setGridConfig(newConfig);
      engineInstance.setGridConfig(newConfig);
  };

  // Helper to filter sections based on search
  const showSection = (keywords: string[]) => {
      if (!search) return true;
      const term = search.toLowerCase();
      return keywords.some(k => k.toLowerCase().includes(term));
  };

  // Minimal SVG Previews for UI
  const PreviewCone = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L4 22h16L12 2z"/></svg>;
  const PreviewCube = <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16"/></svg>;
  const PreviewRhombus = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 12l10 10 10-10L12 2z"/></svg>;
  const PreviewTetra = <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L3 18l9 4 9-4L12 2z"/></svg>;
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
    <>
        {/* Search Header */}
        <div className="p-3 border-b border-white/10 bg-black/20">
            <div className="relative">
                <Icon name="Search" size={14} className="absolute left-3 top-2.5 text-text-secondary" />
                <input 
                    type="text" 
                    placeholder="Search settings..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full bg-input-bg rounded px-9 py-2 text-xs text-white border border-transparent focus:border-accent outline-none placeholder:text-text-secondary"
                    autoFocus
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3 top-2.5 text-text-secondary hover:text-white">
                        <Icon name="X" size={14} />
                    </button>
                )}
            </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 max-h-[70vh]">
            
            {/* Section: Window Interface */}
            {showSection(['Window', 'Interface', 'Radius', 'Handle', 'Resize', 'Opacity']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Layout" size={12} /> Window Interface
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Slider 
                            label="Corner Radius"
                            value={uiConfig.windowBorderRadius}
                            onChange={(v) => updateUiConfig('windowBorderRadius', v)}
                            min={0} max={20} unit="px"
                        />
                        <Slider 
                            label="Resize Area"
                            value={uiConfig.resizeHandleThickness}
                            onChange={(v) => updateUiConfig('resizeHandleThickness', v)}
                            min={2} max={20} unit="px"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <Slider 
                            label="Handle Length"
                            value={uiConfig.resizeHandleLength}
                            onChange={(v) => updateUiConfig('resizeHandleLength', v)}
                            min={0.1} max={1.0} step={0.05}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <div className="bg-input-bg p-3 rounded border border-white/5 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Highlight</span>
                                <input 
                                    type="color" 
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent" 
                                    value={uiConfig.resizeHandleColor} 
                                    onChange={(e) => updateUiConfig('resizeHandleColor', e.target.value)} 
                                    aria-label="Edge Highlight Color"
                                />
                            </div>
                            <div className="bg-input-bg p-3 rounded border border-white/5 flex flex-col justify-center gap-1">
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Opacity</span>
                                <input 
                                    type="range" 
                                    min="0" max="1" step="0.1"
                                    className="w-full h-1"
                                    value={uiConfig.resizeHandleOpacity}
                                    onChange={(e) => updateUiConfig('resizeHandleOpacity', parseFloat(e.target.value))}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Section: Grid Settings (NEW) */}
            {showSection(['Grid', 'Background', 'Floor', 'Lines']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Grid" size={12} /> Grid & Background
                    </h3>
                    <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5">
                        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Show Grid</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={gridConfig.visible} onChange={(e) => updateGrid('visible', e.target.checked)} />
                            <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                        </label>
                    </div>
                    {gridConfig.visible && (
                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Slider 
                                label="Line Spacing"
                                value={gridConfig.size}
                                onChange={(v) => updateGrid('size', v)}
                                min={1} max={50} step={1}
                            />
                            <div className="bg-input-bg p-3 rounded border border-white/5 flex flex-col justify-between">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Opacity</span>
                                    <span className="text-[10px] font-mono text-white">{gridConfig.opacity.toFixed(2)}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0.0" max="1.0" step="0.05" 
                                    value={gridConfig.opacity} 
                                    onChange={(e) => updateGrid('opacity', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-accent"
                                />
                            </div>
                            <Slider 
                                label="Fade Dist"
                                value={gridConfig.fadeDistance}
                                onChange={(v) => updateGrid('fadeDistance', v)}
                                min={50} max={1000} step={10}
                            />
                            <div className="bg-input-bg p-3 rounded border border-white/5 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Color</span>
                                <input 
                                    type="color" 
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent" 
                                    value={gridConfig.color} 
                                    onChange={(e) => updateGrid('color', e.target.value)} 
                                    aria-label="Grid Color"
                                />
                            </div>
                            
                            <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5 col-span-2">
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Exclude from Post Process</span>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={gridConfig.excludeFromPostProcess} onChange={(e) => updateGrid('excludeFromPostProcess', e.target.checked)} />
                                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Section: Rendering Settings */}
            {showSection(['Render', 'Post Process', 'Vignette', 'Tone Mapping', 'Chromatic']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Aperture" size={12} /> Post Processing
                    </h3>
                    <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5">
                        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Master Switch</span>
                        <label className="relative inline-flex items-center cursor-pointer">
                            <input type="checkbox" className="sr-only peer" checked={ppConfig.enabled} onChange={(e) => updatePp('enabled', e.target.checked)} />
                            <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                        </label>
                    </div>
                    
                    {ppConfig.enabled && (
                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Slider 
                                label="Vignette"
                                value={ppConfig.vignetteStrength}
                                onChange={(v) => updatePp('vignetteStrength', v)}
                                min={0} max={2.0} step={0.1}
                            />
                            <div className="bg-input-bg p-3 rounded border border-white/5 flex flex-col justify-between">
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Chromatic</span>
                                    <span className="text-[10px] font-mono text-white">{ppConfig.aberrationStrength.toFixed(3)}</span>
                                </div>
                                <input 
                                    type="range" 
                                    min="0" max="0.01" step="0.001" 
                                    value={ppConfig.aberrationStrength} 
                                    onChange={(e) => updatePp('aberrationStrength', parseFloat(e.target.value))}
                                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:bg-accent"
                                />
                            </div>
                            
                            <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5 col-span-2">
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">ACES Tone Mapping</span>
                                    <span className="text-[9px] text-text-secondary opacity-60">Filmic color grading curve</span>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" className="sr-only peer" checked={ppConfig.toneMapping} onChange={(e) => updatePp('toneMapping', e.target.checked)} />
                                    <div className="w-9 h-5 bg-gray-600 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-accent"></div>
                                </label>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Section: Gizmo Arrows */}
            {showSection(['Gizmo', 'Arrow', 'Translation', 'Move']) && (
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
                    
                    <div className="grid grid-cols-2 gap-4 mt-2">
                        <Slider 
                            label="Arrow Size"
                            value={gizmoConfig.arrowSize}
                            onChange={setArrowSize}
                            min={0.1} max={5.0} step={0.1}
                        />
                        <Slider 
                            label="Arrow Offset"
                            value={gizmoConfig.arrowOffset}
                            onChange={setArrowOffset}
                            min={0.5} max={2.5} step={0.1}
                        />
                    </div>
                </div>
            )}

            {/* Section: Plane Handles */}
            {showSection(['Plane', 'Square', 'Handle']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Square" size={12} /> Plane Handles
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Slider 
                            label="Size"
                            value={gizmoConfig.planeHandleSize}
                            onChange={(v) => updateConfig('planeHandleSize', v)}
                            min={0.5} max={2.0} step={0.1}
                        />
                        <Slider 
                            label="Offset"
                            value={gizmoConfig.planeOffset}
                            onChange={(v) => updateConfig('planeOffset', v)}
                            min={0.1} max={1.0} step={0.05}
                        />
                    </div>
                </div>
            )}

            {/* Section: Rotation Ring Settings */}
            {showSection(['Rotation', 'Ring', 'Torus', 'Rotate']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="RotateCw" size={12} /> Rotation Ring Style
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <Slider 
                            label="Ring Size"
                            value={gizmoConfig.rotationRingSize}
                            onChange={setRingSize}
                            min={0.5} max={3.0} step={0.1}
                        />
                        <Slider 
                            label="Tube Thickness"
                            value={gizmoConfig.rotationRingTubeScale}
                            onChange={(v) => updateConfig('rotationRingTubeScale', v)}
                            min={0.1} max={2.0} step={0.1}
                        />
                    </div>

                    <div className="bg-input-bg p-3 rounded border border-white/5">
                        <div className="flex justify-between items-center mb-2">
                            <span className="text-[10px] font-bold text-text-secondary uppercase">Screen Ring Scale</span>
                            <span className="text-[10px] font-mono text-white">{gizmoConfig.rotationScreenRingScale?.toFixed(2) ?? '1.25'}x</span>
                        </div>
                        <input 
                            type="range" min="1.0" max="2.0" step="0.05" 
                            className="w-full cursor-pointer"
                            value={gizmoConfig.rotationScreenRingScale ?? 1.25} 
                            onChange={(e) => updateConfig('rotationScreenRingScale', parseFloat(e.target.value))} 
                            aria-label="Screen Ring Scale"
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
            )}

            {/* Section: Axis Interaction Colors */}
            {showSection(['Axis', 'Color', 'Interaction', 'Hover', 'Press']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="MousePointer2" size={12} /> Axis Interaction
                    </h3>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-input-bg p-3 rounded border border-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-text-secondary uppercase">Hover Color</span>
                                <input 
                                    type="color" 
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent" 
                                    value={gizmoConfig.axisHoverColor} 
                                    onChange={(e) => updateConfig('axisHoverColor', e.target.value)} 
                                    aria-label="Axis Hover Color"
                                />
                            </div>
                        </div>
                        <div className="bg-input-bg p-3 rounded border border-white/5 space-y-3">
                            <div className="flex justify-between items-center">
                                <span className="text-[10px] font-bold text-text-secondary uppercase">Press Color</span>
                                <input 
                                    type="color" 
                                    className="w-6 h-6 rounded cursor-pointer bg-transparent" 
                                    value={gizmoConfig.axisPressColor} 
                                    onChange={(e) => updateConfig('axisPressColor', e.target.value)} 
                                    aria-label="Axis Press Color"
                                />
                            </div>
                        </div>
                    </div>
                    
                    {/* Axis Visibility Toggle */}
                    <div className="flex items-center gap-4 text-xs pt-1 px-1">
                        <label className="flex items-center gap-2 cursor-pointer select-none text-text-secondary hover:text-white transition-colors">
                            <input type="checkbox" checked={gizmoConfig.axisFadeWhenAligned} onChange={(e) => updateConfig('axisFadeWhenAligned', e.target.checked)} />
                            <span>Fade Axis When Aligned</span>
                        </label>
                    </div>
                </div>
            )}

            {/* Section: Center Handle */}
            {showSection(['Center', 'Handle', 'Free']) && (
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
                            label="Quad" 
                            selected={gizmoConfig.centerHandleShape === 'QUAD_CIRCLES'} 
                            onClick={() => setCenterShape('QUAD_CIRCLES')} 
                            shapePreview={PreviewQuadCircles}
                        />
                    </div>
                    
                    <div className="grid grid-cols-2 gap-4 mt-2">
                        <Slider 
                            label="Size"
                            value={gizmoConfig.centerHandleSize}
                            onChange={(v) => updateConfig('centerHandleSize', v)}
                            min={0.5} max={3.0} step={0.1}
                        />
                        
                        <div className="bg-input-bg p-3 rounded border border-white/5">
                            <div className="flex justify-between items-center h-full">
                                <span className="text-[10px] font-bold text-text-secondary uppercase">Color</span>
                                <input 
                                    type="color" 
                                    className="w-8 h-8 rounded cursor-pointer bg-transparent" 
                                    value={gizmoConfig.centerHandleColor} 
                                    onChange={(e) => updateConfig('centerHandleColor', e.target.value)} 
                                    aria-label="Center Handle Color"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
        
        <div className="bg-panel-header px-4 py-3 border-t border-white/10 flex justify-end shrink-0">
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white text-xs px-6 py-2 rounded font-medium transition-colors">Close</button>
        </div>
    </>
  );
};
