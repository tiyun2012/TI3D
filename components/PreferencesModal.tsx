
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
      
      // Sync to engine
      if (key === 'opacity') engineInstance.renderer.gridOpacity = val;
      if (key === 'size') engineInstance.renderer.gridSize = val;
      if (key === 'subdivisions') engineInstance.renderer.gridSubdivisions = val;
      if (key === 'fadeDistance') engineInstance.renderer.gridFadeDistance = val;
      if (key === 'excludeFromPostProcess') engineInstance.renderer.gridExcludePP = val;
      if (key === 'color') {
          const hex = val.replace('#','');
          const r = parseInt(hex.substring(0,2), 16)/255;
          const g = parseInt(hex.substring(2,4), 16)/255;
          const b = parseInt(hex.substring(4,6), 16)/255;
          engineInstance.renderer.gridColor = [r, g, b];
      }
  };

  const showSection = (keywords: string[]) => {
      if (!search) return true;
      const term = search.toLowerCase();
      return keywords.some(k => k.toLowerCase().includes(term));
  };

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
            </div>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1 max-h-[70vh]">
            {showSection(['Window', 'Interface', 'Radius', 'Handle', 'Resize', 'Opacity']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Layout" size={12} /> Window Interface
                    </h3>
                    <div className="grid grid-cols-2 gap-4">
                        <Slider label="Corner Radius" value={uiConfig.windowBorderRadius} onChange={(v) => updateUiConfig('windowBorderRadius', v)} min={0} max={20} unit="px" />
                        <Slider label="Resize Area" value={uiConfig.resizeHandleThickness} onChange={(v) => updateUiConfig('resizeHandleThickness', v)} min={2} max={20} unit="px" />
                    </div>
                </div>
            )}

            {showSection(['Grid', 'Background', 'Floor', 'Lines', 'Maya']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Grid" size={12} /> Grid & Background
                    </h3>
                    <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5">
                        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Show Grid</span>
                        <input type="checkbox" checked={gridConfig.visible} onChange={(e) => updateGrid('visible', e.target.checked)} aria-label="Show Grid" />
                    </div>
                    {gridConfig.visible && (
                        <div className="grid grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-200">
                            <Slider label="Main Line (m)" value={gridConfig.size} onChange={(v) => updateGrid('size', v)} min={0.5} max={10} step={0.5} />
                            <Slider label="Subdivisions" value={gridConfig.subdivisions} onChange={(v) => updateGrid('subdivisions', v)} min={1} max={20} step={1} />
                            <Slider label="Opacity" value={gridConfig.opacity} onChange={(v) => updateGrid('opacity', v)} min={0.05} max={1.0} step={0.05} />
                            <div className="bg-input-bg p-3 rounded border border-white/5 flex items-center justify-between">
                                <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Color</span>
                                <input type="color" className="w-6 h-6 rounded cursor-pointer bg-transparent" value={gridConfig.color} onChange={(e) => updateGrid('color', e.target.value)} aria-label="Grid Color" />
                            </div>
                        </div>
                    )}
                </div>
            )}
            
            {showSection(['Render', 'Post Process', 'Vignette', 'Tone Mapping', 'Chromatic']) && (
                <div className="space-y-3">
                    <h3 className="text-xs font-bold text-text-secondary uppercase flex items-center gap-2 border-b border-white/5 pb-1">
                        <Icon name="Aperture" size={12} /> Post Processing
                    </h3>
                    <div className="flex items-center justify-between bg-input-bg p-3 rounded border border-white/5">
                        <span className="text-[10px] font-bold text-text-secondary uppercase tracking-wider">Master Switch</span>
                        <input type="checkbox" checked={ppConfig.enabled} onChange={(e) => updatePp('enabled', e.target.checked)} aria-label="Enable Post Processing" />
                    </div>
                    {ppConfig.enabled && (
                        <div className="grid grid-cols-2 gap-4">
                            <Slider label="Vignette" value={ppConfig.vignetteStrength} onChange={(v) => updatePp('vignetteStrength', v)} min={0} max={2.0} step={0.1} />
                            <Slider label="Chromatic" value={ppConfig.aberrationStrength} onChange={(v) => updatePp('aberrationStrength', v)} min={0} max={0.01} step={0.001} />
                        </div>
                    )}
                </div>
            )}
        </div>
        <div className="bg-panel-header px-4 py-3 border-t border-white/10 flex justify-end shrink-0">
            <button onClick={onClose} className="bg-white/10 hover:bg-white/20 text-white text-xs px-6 py-2 rounded font-medium transition-colors">Close</button>
        </div>
    </>
  );
};
