
import React, { useState, useEffect, useCallback, useContext, useRef, useMemo } from 'react';
import { engineInstance } from './services/engine';
import { Entity, ToolType, TransformSpace, SelectionType, GraphNode } from './types';
import { EditorContext, EditorContextType, DEFAULT_UI_CONFIG, UIConfiguration, GridConfiguration, DEFAULT_GRID_CONFIG, SnapSettings, DEFAULT_SNAP_CONFIG } from './contexts/EditorContext';
import { assetManager } from './services/AssetManager';
import { consoleService } from './services/Console';

// Components
import { Toolbar } from './components/Toolbar';
import { HierarchyPanel } from './components/HierarchyPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { SceneView } from './components/SceneView';
import { ProjectPanel } from './components/ProjectPanel';
import { Icon } from './components/Icon';
import { PreferencesModal } from './components/PreferencesModal';
import { WindowManager, WindowManagerContext } from './components/WindowManager';
import { DEFAULT_GIZMO_CONFIG, GizmoConfiguration } from './components/gizmos/GizmoUtils';
import { GeometrySpreadsheet } from './components/GeometrySpreadsheet';
import { UVEditor } from './components/UVEditor';

// --- Widget Wrappers ---

const HierarchyWrapper = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;
  return (
    <HierarchyPanel 
      entities={ctx.entities} 
      sceneGraph={ctx.sceneGraph}
      selectedIds={ctx.selectedIds}
      onSelect={(ids) => {
          ctx.setSelectedIds(ids);
          ctx.setSelectionType('ENTITY');
      }}
    />
  );
};

const InspectorWrapper = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;
  
  let target: any = null;
  let count = 0;

  if (ctx.selectionType === 'ENTITY') {
      if (ctx.selectedIds.length > 0) {
          target = ctx.entities.find(e => e.id === ctx.selectedIds[0]) || null;
          count = ctx.selectedIds.length;
      }
  } else if (ctx.selectionType === 'ASSET') {
      if (ctx.selectedAssetIds.length > 0) {
          target = assetManager.getAsset(ctx.selectedAssetIds[0]) || null;
          count = ctx.selectedAssetIds.length;
      }
  }

  return <InspectorPanel object={target} selectionCount={count} type={ctx.selectionType} />;
};

const SceneWrapper = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;
  
  // NOTE: We ALWAYS pass the entity selection to the SceneView, 
  // even if the user is currently inspecting an Asset. 
  // This allows the user to see what they are applying the asset TO.
  
  return (
    <SceneView 
      entities={ctx.entities}
      sceneGraph={ctx.sceneGraph}
      selectedIds={ctx.selectedIds}
      onSelect={(ids) => {
          ctx.setSelectedIds(ids);
          ctx.setSelectionType('ENTITY');
      }}
      tool={ctx.tool}
    />
  );
};

const ProjectWrapper = () => <ProjectPanel />;

const ConsoleWrapper = () => <ProjectPanel initialTab="CONSOLE" />;

const StatsContent = () => {
    const [metrics, setMetrics] = useState(engineInstance.metrics);
    useEffect(() => {
        const i = setInterval(() => setMetrics({ ...engineInstance.metrics }), 500);
        return () => clearInterval(i);
    }, []);

    return (
        <div className="p-4 space-y-3 bg-transparent">
            <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2 bg-black/30 rounded border border-white/5">
                    <div className="text-text-secondary">FPS</div>
                    <div className="text-lg font-mono text-emerald-400">{metrics.fps.toFixed(0)}</div>
                </div>
                <div className="p-2 bg-black/30 rounded border border-white/5">
                    <div className="text-text-secondary">Frame Time</div>
                    <div className="text-lg font-mono text-blue-400">{metrics.frameTime.toFixed(2)}ms</div>
                </div>
                <div className="p-2 bg-black/30 rounded border border-white/5">
                    <div className="text-text-secondary">Draw Calls</div>
                    <div className="text-lg font-mono text-orange-400">{metrics.drawCalls}</div>
                </div>
                <div className="p-2 bg-black/30 rounded border border-white/5">
                    <div className="text-text-secondary">Entities</div>
                    <div className="text-lg font-mono text-white">{metrics.entityCount}</div>
                </div>
            </div>
        </div>
    );
};

// --- Main Editor UI ---
const EditorInterface: React.FC = () => {
    const wm = useContext(WindowManagerContext);
    const editor = useContext(EditorContext);
    const [activeMenu, setActiveMenu] = useState<string | null>(null);
    const initialized = useRef(false);

    // Initial Registration of Windows
    useEffect(() => {
        if (!wm) return;

        // Register all available tool windows with shifted positions to avoid left dock overlap
        wm.registerWindow({
            id: 'hierarchy', title: 'Hierarchy', icon: 'ListTree', content: <HierarchyWrapper />, 
            width: 280, height: 500, initialPosition: { x: 80, y: 100 }
        });
        wm.registerWindow({
            id: 'inspector', title: 'Inspector', icon: 'Settings2', content: <InspectorWrapper />, 
            width: 320, height: 600, initialPosition: { x: window.innerWidth - 340, y: 100 }
        });
        wm.registerWindow({
            id: 'project', title: 'Project Browser', icon: 'FolderOpen', content: <ProjectWrapper />, 
            width: 600, height: 350, initialPosition: { x: 380, y: window.innerHeight - 370 }
        });
        wm.registerWindow({
            id: 'console', title: 'Console', icon: 'Terminal', content: <ConsoleWrapper />, 
            width: 500, height: 250, initialPosition: { x: 80, y: window.innerHeight - 270 }
        });
        wm.registerWindow({
            id: 'spreadsheet', title: 'Geometry Spreadsheet', icon: 'Table', content: <GeometrySpreadsheet />, 
            width: 550, height: 400, initialPosition: { x: 450, y: window.innerHeight - 450 }
        });
        wm.registerWindow({
            id: 'preferences', title: 'Preferences', icon: 'Settings', content: <PreferencesModal onClose={() => wm.closeWindow('preferences')} />, 
            width: 500
        });
        wm.registerWindow({
            id: 'stats', title: 'Performance', icon: 'Activity', content: <StatsContent />, 
            width: 280, initialPosition: { x: window.innerWidth - 300, y: 60 }
        });
        wm.registerWindow({
            id: 'uveditor', title: 'UV Editor', icon: 'LayoutGrid', content: <UVEditor />, 
            width: 500, height: 500, initialPosition: { x: 200, y: 200 }
        });

        // Open Default Layout only once
        if (!initialized.current) {
            wm.openWindow('hierarchy');
            wm.openWindow('inspector');
            wm.openWindow('project');
            initialized.current = true;
            
            // Log startup
            consoleService.success('Ti3D Engine Editor Initialized');
            consoleService.info(`Loaded ${assetManager.getAllAssets().length} assets from AssetManager`);
        }
        
    }, [wm]);

    if (!editor) return <div className="flex h-screen items-center justify-center text-white">Initializing...</div>;

    const toggleMenu = (e: React.MouseEvent, menu: string) => {
        e.stopPropagation();
        setActiveMenu(activeMenu === menu ? null : menu);
    };

    const handleLoad = () => {
        const json = localStorage.getItem('ti3d_scene');
        if (json) {
            engineInstance.loadScene(json);
            consoleService.success("Scene Loaded Successfully");
        } else {
            consoleService.warn("No saved scene found in local storage.");
        }
    };

    const handleSave = () => {
        const json = engineInstance.saveScene();
        localStorage.setItem('ti3d_scene', json);
        consoleService.success("Scene Saved");
    };

    return (
        <div className="flex flex-col h-screen bg-[#101010] text-text-primary overflow-hidden font-sans relative" onClick={() => setActiveMenu(null)}>
            
            {/* Top Bar (Header + Toolbar) */}
            <div className="flex flex-col z-50 pointer-events-auto shadow-xl">
                {/* Menu Bar */}
                <div className="h-8 bg-panel-header flex items-center px-3 text-[11px] select-none border-b border-white/5 gap-4">
                    <div className="font-bold text-white tracking-wide flex items-center gap-2 pr-4 border-r border-white/5">
                        <div className="w-4 h-4 bg-accent rounded-sm shadow-[0_0_8px_rgba(79,128,248,0.6)]"></div>
                        Ti3D <span className="font-light text-white/40">PRO</span>
                    </div>
                    <div className="flex gap-2 text-text-primary relative">
                        <span className="hover:bg-white/10 px-2 py-1 rounded cursor-pointer transition-colors" onClick={(e) => toggleMenu(e, 'File')}>File</span>
                        {activeMenu === 'File' && (
                            <div className="absolute top-7 left-0 bg-[#252525] border border-white/10 shadow-2xl rounded-md py-1 min-w-[160px] text-text-primary z-[100]">
                                <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex justify-between" onClick={handleSave}><span>Save Scene</span><span className="text-white/30 text-[9px]">Ctrl+S</span></div>
                                <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={handleLoad}>Load Scene</div>
                            </div>
                        )}
                        
                        <span className="hover:bg-white/10 px-2 py-1 rounded cursor-pointer transition-colors" onClick={(e) => toggleMenu(e, 'Edit')}>Edit</span>
                        
                        <div className="relative">
                            <span className={`hover:bg-white/10 px-2 py-1 rounded cursor-pointer transition-colors ${activeMenu === 'Window' ? 'bg-white/10' : ''}`} onClick={(e) => toggleMenu(e, 'Window')}>Window</span>
                            {activeMenu === 'Window' && (
                                <div className="absolute top-7 left-0 bg-[#252525] border border-white/10 shadow-2xl rounded-md py-1 min-w-[180px] text-text-primary z-[100]">
                                    <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { wm?.toggleWindow('hierarchy'); setActiveMenu(null); }}>
                                        <Icon name="ListTree" size={12} /> Hierarchy
                                    </div>
                                    <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { wm?.toggleWindow('inspector'); setActiveMenu(null); }}>
                                        <Icon name="Settings2" size={12} /> Inspector
                                    </div>
                                    <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { wm?.toggleWindow('project'); setActiveMenu(null); }}>
                                        <Icon name="FolderOpen" size={12} /> Project
                                    </div>
                                    <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { wm?.toggleWindow('console'); setActiveMenu(null); }}>
                                        <Icon name="Terminal" size={12} /> Console
                                    </div>
                                    <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { wm?.toggleWindow('uveditor'); setActiveMenu(null); }}>
                                        <Icon name="LayoutGrid" size={12} /> UV Editor
                                    </div>
                                    <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" onClick={() => { wm?.toggleWindow('spreadsheet'); setActiveMenu(null); }}>
                                        <Icon name="Table" size={12} /> Spreadsheet
                                    </div>
                                    <div className="border-t border-white/5 my-1"></div>
                                    <div className="px-4 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => { wm?.toggleWindow('preferences'); setActiveMenu(null); }}>Preferences...</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Toolbar */}
                <Toolbar 
                    isPlaying={editor.isPlaying}
                    onPlay={() => { engineInstance.start(); }}
                    onPause={() => { engineInstance.pause(); }}
                    onStop={() => { engineInstance.stop(); }}
                    currentTool={editor.tool}
                    setTool={editor.setTool}
                    transformSpace={editor.transformSpace}
                    setTransformSpace={editor.setTransformSpace}
                />
            </div>

            {/* FULL SCREEN VIEWPORT BACKGROUND */}
            <div className="absolute inset-0 top-[64px] bottom-[24px] z-0">
                <SceneWrapper />
            </div>

            {/* Status Bar */}
            <div className="absolute bottom-0 w-full h-6 bg-panel-header/90 backdrop-blur flex items-center px-4 justify-between text-[10px] text-text-secondary shrink-0 select-none z-50 border-t border-white/5">
                <div className="flex items-center gap-4">
                    {editor.isPlaying ? <span className="text-emerald-500 animate-pulse font-bold">● PLAYING</span> : <span>Ready</span>}
                </div>
                <div className="flex items-center gap-4 font-mono opacity-60">
                    <span>{engineInstance.metrics.entityCount} Objects</span>
                    <span>{engineInstance.metrics.fps.toFixed(0)} FPS</span>
                </div>
            </div>
        </div>
    );
};

// --- Root Application with Providers ---
const App: React.FC = () => {
    // Editor State
    const [entities, setEntities] = useState<Entity[]>([]);
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [selectedAssetIds, setSelectedAssetIds] = useState<string[]>([]);
    const [inspectedNode, setInspectedNode] = useState<GraphNode | null>(null);
    const [selectionType, setSelectionType] = useState<SelectionType>('ENTITY');
    const [tool, setTool] = useState<ToolType>('SELECT');
    const [transformSpace, setTransformSpace] = useState<TransformSpace>('World');
    const [isPlaying, setIsPlaying] = useState(false);
    
    // Config State
    const [gizmoConfig, setGizmoConfig] = useState<GizmoConfiguration>(DEFAULT_GIZMO_CONFIG);
    const [uiConfig, setUiConfig] = useState<UIConfiguration>(DEFAULT_UI_CONFIG);
    const [gridConfig, setGridConfig] = useState<GridConfiguration>(DEFAULT_GRID_CONFIG);
    const [snapSettings, setSnapSettings] = useState<SnapSettings>(DEFAULT_SNAP_CONFIG);

    // Sync with Engine
    useEffect(() => {
        const updateState = () => {
            setEntities(engineInstance.ecs.getAllProxies(engineInstance.sceneGraph));
            setIsPlaying(engineInstance.isPlaying);
        };
        const unsubscribe = engineInstance.subscribe(updateState);
        
        // Initial Fetch
        updateState();
        
        return unsubscribe;
    }, []);

    const contextValue = useMemo<EditorContextType>(() => ({
        entities,
        sceneGraph: engineInstance.sceneGraph,
        selectedIds, setSelectedIds,
        selectedAssetIds, setSelectedAssetIds,
        inspectedNode, setInspectedNode,
        selectionType, setSelectionType,
        tool, setTool,
        transformSpace, setTransformSpace,
        isPlaying,
        gizmoConfig, setGizmoConfig,
        uiConfig, setUiConfig,
        gridConfig, setGridConfig,
        snapSettings, setSnapSettings
    }), [entities, selectedIds, selectedAssetIds, inspectedNode, selectionType, tool, transformSpace, isPlaying, gizmoConfig, uiConfig, gridConfig, snapSettings]);

    return (
        <EditorContext.Provider value={contextValue}>
            <WindowManager>
                <EditorInterface />
            </WindowManager>
        </EditorContext.Provider>
    );
};

export default App;
