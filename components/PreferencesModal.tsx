
import React, { useContext } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { GizmoArrowShape } from './gizmos/GizmoUtils';
import { Icon } from './Icon';

interface Props {
  onClose: () => void;
}

export const PreferencesModal: React.FC<Props> = ({ onClose }) => {
  const { gizmoConfig, setGizmoConfig } = useContext(EditorContext)!;

  const handleChange = (shape: GizmoArrowShape) => {
    setGizmoConfig({ ...gizmoConfig, translationShape: shape });
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-[100] flex items-center justify-center backdrop-blur-sm" onClick={onClose}>
      <div 
        className="bg-panel border border-white/20 rounded-lg shadow-2xl w-96 overflow-hidden" 
        onClick={e => e.stopPropagation()}
      >
        <div className="bg-panel-header px-4 py-2 border-b border-white/10 flex justify-between items-center">
            <span className="font-bold text-sm text-white">Preferences</span>
            <button onClick={onClose} className="hover:text-white text-text-secondary"><Icon name="X" size={16}/></button>
        </div>
        
        <div className="p-4 space-y-4">
            <div>
                <h3 className="text-xs font-bold text-text-secondary uppercase mb-2">Gizmo Settings</h3>
                <div className="flex items-center justify-between text-xs">
                    <span>Translation Arrow Shape</span>
                    <select 
                        className="bg-input-bg border border-transparent focus:border-accent outline-none rounded px-2 py-1 text-white"
                        value={gizmoConfig.translationShape}
                        onChange={(e) => handleChange(e.target.value as GizmoArrowShape)}
                    >
                        <option value="CONE">Cone</option>
                        <option value="TETRAHEDRON">Tetrahedron</option>
                        <option value="RHOMBUS">Rhombus</option>
                        <option value="CUBE">Cube</option>
                    </select>
                </div>
            </div>

            {/* Placeholder for future settings */}
            <div className="opacity-50 pointer-events-none">
                <h3 className="text-xs font-bold text-text-secondary uppercase mb-2">Grid Settings</h3>
                <div className="flex items-center justify-between text-xs">
                    <span>Grid Size</span>
                    <input type="number" value="10" className="bg-input-bg w-16 px-2 py-1 rounded text-right" readOnly />
                </div>
            </div>
        </div>
        
        <div className="bg-panel-header px-4 py-2 border-t border-white/10 flex justify-end">
            <button onClick={onClose} className="bg-accent hover:bg-accent-hover text-white text-xs px-4 py-1.5 rounded">Close</button>
        </div>
      </div>
    </div>
  );
};
