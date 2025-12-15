
import React, { useState, useEffect, useCallback, useContext } from 'react';
import DockLayout, { LayoutData, TabData, BoxData, PanelData } from 'rc-dock';
import { engineInstance } from './services/engine';
import { Entity, ToolType, TransformSpace } from './types';
import { EditorContext } from './contexts/EditorContext';

// Components
import { Toolbar } from './components/Toolbar';
import { HierarchyPanel } from './components/HierarchyPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { SceneView } from './components/SceneView';
import { ProjectPanel } from './components/ProjectPanel';
import { NodeGraph } from './components/NodeGraph';
import { Icon } from './components/Icon';
import { PreferencesModal } from './components/PreferencesModal';
import { DEFAULT_GIZMO_CONFIG, GizmoConfiguration } from './components/gizmos/GizmoUtils';

// --- Widget Wrappers ---

const HierarchyWrapper = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;
  return (
    <HierarchyPanel 
      entities={ctx.entities} 
      sceneGraph={ctx.sceneGraph}
      selectedIds={ctx.selectedIds}
      onSelect={ctx.setSelectedIds}
    />
  );
};

const InspectorWrapper = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;
  const entity = ctx.selectedIds.length > 0 ? ctx.entities.find(e => e.id === ctx.selectedIds[0]) || null : null;
  return <InspectorPanel entity={entity} selectionCount={ctx.selectedIds.length} />;
};

const SceneWrapper = () => {
  const ctx = useContext(EditorContext);
  if (!ctx) return null;
  return (
    <SceneView 
      entities={ctx.entities}
      sceneGraph={ctx.sceneGraph}
      selectedIds={ctx.selectedIds}
      onSelect={ctx.setSelectedIds}
      tool={ctx.tool}
    />
  );
};

const ProjectWrapper = () => <ProjectPanel />;

const GameWrapper = () => (
  <div className="flex items-center justify-center h-full text-text-secondary flex-col gap-2 bg-[#101010]">
    <Icon name="Gamepad2" size={48} className="opacity-20" />
    <span className="text-xs">Game View requires an Active Camera</span>
  </div>
);

const GraphWrapper = () => <NodeGraph />;

const ConsoleWrapper = () => (
    <div className="h-full bg-panel border-t border-black/20 flex flex-col font-mono text-xs">
        <div className="bg-panel-header px-2 py-1 text-text-secondary border-b border-black/20 flex items-center gap-2">
            <Icon name="Terminal" size={12} />
            Output
        </div>
        <div className="p-2 text-gray-400 space-y-1">
            <div className="text-emerald-500">[System] Ti3D Engine initialized v1.0.0</div>
            <div>[System] WebGL2 Texture Array created (4 layers).</div>
            <div>[System] Undo/Redo System Ready.</div>
        </div>
    </div>
);

// --- Default Layout ---

const DEFAULT_LAYOUT: LayoutData = {
  dockbox: {
    mode: 'horizontal',
    children: [
      {
        mode: 'vertical',
        size: 280,
        children: [
          { tabs: [{ id: 'hierarchy', title: 'Hierarchy', content: <HierarchyWrapper /> }], size: 400 },
          { tabs: [{ id: 'project', title: 'Project', content: <ProjectWrapper /> }] }
        ]
      },
      {
        mode: 'vertical',
        children: [
          {
            tabs: [
              { id: 'scene', title: 'Scene', content: <SceneWrapper /> },
              { id: 'game', title: 'Game', content: <GameWrapper /> },
              { id: 'graph', title: 'Visual Script', content: <GraphWrapper /> }
            ]
          },
          {
            tabs: [{ id: 'console', title: 'Console', content: <ConsoleWrapper /> }],
            size: 160
          }
        ]
      },
      {
        size: 320,
        tabs: [{ id: 'inspector', title: 'Inspector', content: <InspectorWrapper /> }]
      }
    ]
  }
};

const App: React.FC = () => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<ToolType>('SELECT');
  const [transformSpace, setTransformSpace] = useState<TransformSpace>('Gimbal'); // Default to Gimbal
  const [isPlaying, setIsPlaying] = useState(false);
  
  // Config State
  const [gizmoConfig, setGizmoConfig] = useState<GizmoConfiguration>(DEFAULT_GIZMO_CONFIG);
  const [showPreferences, setShowPreferences] = useState(false);
  
  // Menu State
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  // Engine Sync
  const refreshState = useCallback(() => {
    setEntities(engineInstance.ecs.getAllProxies(engineInstance.sceneGraph));
  }, []);

  // Keyboard Shortcuts
  useEffect(() => {
      const handleKeyDown = (e: KeyboardEvent) => {
          // Play/Pause
          if (e.code === 'Space' && (document.activeElement === document.body || document.activeElement?.tagName === 'BUTTON')) {
              e.preventDefault();
              if (engineInstance.isPlaying) {
                  engineInstance.pause();
                  setIsPlaying(false);
              } else {
                  engineInstance.start();
                  setIsPlaying(true);
              }
          }
          // Grid Toggle
          else if (e.code === 'KeyG' && !e.ctrlKey && !e.shiftKey) {
               engineInstance.toggleGrid();
          }
          // Undo/Redo
          else if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
              if (e.shiftKey) {
                  engineInstance.redo();
              } else {
                  engineInstance.undo();
              }
              e.preventDefault();
          }
          else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
              engineInstance.redo();
              e.preventDefault();
          }
          // Save
          else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
              e.preventDefault();
              const json = engineInstance.saveScene();
              localStorage.setItem('ti3d_scene', json);
              console.log("Scene Saved to LocalStorage");
              alert("Scene Saved!");
          }
      };

      window.addEventListener('keydown', handleKeyDown);
      // Close menu on click outside
      window.addEventListener('click', () => setActiveMenu(null));
      return () => {
          window.removeEventListener('keydown', handleKeyDown);
          window.removeEventListener('click', () => setActiveMenu(null));
      };
  }, []);

  useEffect(() => {
    refreshState();
    const unsubscribe = engineInstance.subscribe(refreshState);
    
    let animationFrameId: number;
    let lastTime = performance.now();
    const loop = (time: number) => {
      const delta = (time - lastTime) / 1000;
      lastTime = time;
      engineInstance.tick(delta);
      animationFrameId = requestAnimationFrame(loop);
    };
    
    animationFrameId = requestAnimationFrame(loop);
    return () => {
      unsubscribe();
      cancelAnimationFrame(animationFrameId);
    };
  }, [refreshState]);

  const handlePlay = () => { engineInstance.start(); setIsPlaying(true); };
  const handlePause = () => { engineInstance.pause(); setIsPlaying(false); };
  const handleStop = () => { engineInstance.stop(); setIsPlaying(false); };

  const handleLoad = () => {
      const json = localStorage.getItem('ti3d_scene');
      if (json) {
          engineInstance.loadScene(json);
          alert("Scene Loaded!");
      } else {
          alert("No saved scene found.");
      }
  };

  const getTab = useCallback((data: TabData): TabData => {
    let content;
    let icon = 'Box';
    switch (data.id) {
        case 'hierarchy': content = <HierarchyWrapper />; icon = 'ListTree'; break;
        case 'project': content = <ProjectWrapper />; icon = 'FolderOpen'; break;
        case 'scene': content = <SceneWrapper />; icon = 'Cuboid'; break;
        case 'game': content = <GameWrapper />; icon = 'Gamepad2'; break;
        case 'graph': content = <GraphWrapper />; icon = 'Workflow'; break;
        case 'inspector': content = <InspectorWrapper />; icon = 'Settings2'; break;
        case 'console': content = <ConsoleWrapper />; icon = 'Terminal'; break;
        default: content = <div>Missing Panel</div>;
    }
    
    const title = (
        <div className="flex items-center gap-2">
            <Icon 
                name={icon as any} 
                size={14} 
                className={data.id === 'scene' ? 'text-accent' : 'text-text-secondary'}
            />
            <span>{data.title as string}</span>
        </div>
    );

    return {
      id: data.id,
      title: title, 
      content: content,
      closable: true,
      minWidth: 150,
      minHeight: 100,
      group: data.group, 
    };
  }, []);

  const toggleMenu = (e: React.MouseEvent, menu: string) => {
      e.stopPropagation();
      setActiveMenu(activeMenu === menu ? null : menu);
  };

  return (
    <EditorContext.Provider value={{
      entities,
      sceneGraph: engineInstance.sceneGraph,
      selectedIds,
      setSelectedIds,
      tool,
      setTool,
      transformSpace,
      setTransformSpace,
      isPlaying,
      gizmoConfig,
      setGizmoConfig
    }}>
      <div className="flex flex-col h-screen bg-panel text-text-primary overflow-hidden font-sans relative">
        {/* Main Menu Bar */}
        <div className="h-9 bg-panel-header flex items-center px-4 text-xs select-none border-b border-black/50 gap-6 shrink-0 shadow-sm z-50">
          <div className="font-bold text-white tracking-wider flex items-center gap-2">
            <div className="w-4 h-4 bg-accent rounded-sm shadow-[0_0_10px_rgba(0,122,204,0.5)]"></div>
            Ti3D ENGINE
          </div>
          <div className="flex gap-4 text-text-secondary font-medium relative">
              <span className="hover:text-white cursor-pointer transition-colors" onClick={(e) => toggleMenu(e, 'File')}>File</span>
              {activeMenu === 'File' && (
                  <div className="absolute top-6 left-0 bg-panel border border-black/50 shadow-xl rounded py-1 min-w-[120px] text-text-primary">
                      <div className="px-4 py-1 hover:bg-accent hover:text-white cursor-pointer" onClick={() => {
                          const json = engineInstance.saveScene();
                          localStorage.setItem('ti3d_scene', json);
                          alert("Saved to LocalStorage");
                      }}>Save Scene</div>
                      <div className="px-4 py-1 hover:bg-accent hover:text-white cursor-pointer" onClick={handleLoad}>Load Scene</div>
                  </div>
              )}
              
              <span className="hover:text-white cursor-pointer transition-colors" onClick={(e) => toggleMenu(e, 'Edit')}>Edit</span>
              {activeMenu === 'Edit' && (
                  <div className="absolute top-6 left-10 bg-panel border border-black/50 shadow-xl rounded py-1 min-w-[120px] text-text-primary">
                      <div className="px-4 py-1 hover:bg-accent hover:text-white cursor-pointer" onClick={() => engineInstance.undo()}>Undo</div>
                      <div className="px-4 py-1 hover:bg-accent hover:text-white cursor-pointer" onClick={() => engineInstance.redo()}>Redo</div>
                  </div>
              )}

              <span className="hover:text-white cursor-pointer transition-colors">Assets</span>
              <span className="hover:text-white cursor-pointer transition-colors">GameObject</span>

              {/* Window Menu - Containing Reference (Preferences) */}
              <div className="relative">
                <span className={`hover:text-white cursor-pointer transition-colors ${activeMenu === 'Window' ? 'text-white' : ''}`} onClick={(e) => toggleMenu(e, 'Window')}>Window</span>
                {activeMenu === 'Window' && (
                    <div className="absolute top-6 left-0 bg-panel border border-black/50 shadow-xl rounded py-1 min-w-[120px] text-text-primary">
                        <div className="px-4 py-1 hover:bg-accent hover:text-white cursor-pointer" onClick={() => { setShowPreferences(true); setActiveMenu(null); }}>Reference</div>
                        <div className="border-t border-white/10 my-1"></div>
                        <div className="px-4 py-1 hover:bg-accent hover:text-white cursor-pointer">Layouts</div>
                    </div>
                )}
              </div>

              <span className="hover:text-white cursor-pointer transition-colors">Help</span>
          </div>
        </div>

        {/* Toolbar */}
        <Toolbar 
          isPlaying={isPlaying} 
          onPlay={handlePlay} 
          onPause={handlePause} 
          onStop={handleStop}
          currentTool={tool}
          setTool={setTool}
          transformSpace={transformSpace}
          setTransformSpace={setTransformSpace}
        />

        {/* Docking Area */}
        <div className="flex-1 relative">
            <DockLayout 
              defaultLayout={DEFAULT_LAYOUT}
              loadTab={getTab}
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
              dropMode="edge"
            />
        </div>

        {/* Status Bar */}
        <div className="h-6 bg-accent/90 flex items-center px-4 justify-between text-[10px] text-white shrink-0 select-none z-40 shadow-[0_-1px_0_rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-4">
              <span className="font-bold flex items-center gap-1"><Icon name="CheckCircle2" size={10} /> Ready</span>
          </div>
          <div className="flex items-center gap-4 font-mono opacity-80">
              <span>MEM: {engineInstance.metrics.entityCount} Entities</span>
              <span>GPU: {engineInstance.metrics.frameTime.toFixed(2)}ms</span>
              <span>FPS: {engineInstance.metrics.fps.toFixed(0)}</span>
          </div>
        </div>

        {/* Preferences Modal */}
        {showPreferences && <PreferencesModal onClose={() => setShowPreferences(false)} />}
      </div>
    </EditorContext.Provider>
  );
};

export default App;
