
import React, { useState, useEffect, useCallback, useContext } from 'react';
import DockLayout, { LayoutData, TabData, BoxData, PanelData } from 'rc-dock';
import { engineInstance } from './services/engine';
import { Entity, ToolType } from './types';
import { EditorContext } from './contexts/EditorContext';

// Components
import { Toolbar } from './components/Toolbar';
import { HierarchyPanel } from './components/HierarchyPanel';
import { InspectorPanel } from './components/InspectorPanel';
import { SceneView } from './components/SceneView';
import { ProjectPanel } from './components/ProjectPanel';
import { NodeGraph } from './components/NodeGraph';
import { Icon } from './components/Icon';

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
          { tabs: [{ id: 'hierarchy', title: 'Hierarchy', content: <div /> }], size: 400 },
          { tabs: [{ id: 'project', title: 'Project', content: <div /> }] }
        ]
      },
      {
        mode: 'vertical',
        children: [
          {
            tabs: [
              { id: 'scene', title: 'Scene', content: <div /> },
              { id: 'game', title: 'Game', content: <div /> },
              { id: 'graph', title: 'Visual Script', content: <div /> }
            ]
          },
          {
            tabs: [{ id: 'console', title: 'Console', content: <div /> }],
            size: 160
          }
        ]
      },
      {
        size: 320,
        tabs: [{ id: 'inspector', title: 'Inspector', content: <div /> }]
      }
    ]
  }
};

const App: React.FC = () => {
  const [entities, setEntities] = useState<Entity[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tool, setTool] = useState<ToolType>('SELECT');
  const [isPlaying, setIsPlaying] = useState(false);

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
      return () => window.removeEventListener('keydown', handleKeyDown);
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

  const loadTab = (data: TabData): TabData => {
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
    return {
      id: data.id,
      title: data.title, 
      content: content,
      closable: true,
      minWidth: 150,
      minHeight: 100,
      group: data.group, 
    };
  };

  const [layout] = useState(() => {
     const process = (box: BoxData | PanelData): BoxData | PanelData => {
         if ('children' in box && box.children) return { ...box, children: box.children.map(process as any) };
         const panel = box as PanelData;
         if (panel.tabs) return { ...panel, tabs: panel.tabs.map((t: TabData) => {
             const loaded = loadTab(t);
             const iconName = 
                t.id === 'hierarchy' ? 'ListTree' :
                t.id === 'project' ? 'FolderOpen' :
                t.id === 'scene' ? 'Cuboid' :
                t.id === 'game' ? 'Gamepad2' :
                t.id === 'graph' ? 'Workflow' :
                t.id === 'inspector' ? 'Settings2' :
                t.id === 'console' ? 'Terminal' : 'Box';
             return { ...loaded, title: (<div className="flex items-center gap-2"><Icon name={iconName as any} size={14} className={t.id === 'scene' ? 'text-accent' : 'text-text-secondary'}/><span>{t.title as string}</span></div>) };
         })};
         return box;
     };
     if (!DEFAULT_LAYOUT.dockbox) return { dockbox: { mode: 'horizontal', children: [] } };
     return { dockbox: process(DEFAULT_LAYOUT.dockbox) as BoxData };
  });

  return (
    <EditorContext.Provider value={{
      entities,
      sceneGraph: engineInstance.sceneGraph,
      selectedIds,
      setSelectedIds,
      tool,
      setTool,
      isPlaying
    }}>
      <div className="flex flex-col h-screen bg-panel text-text-primary overflow-hidden font-sans">
        {/* Main Menu Bar */}
        <div className="h-9 bg-panel-header flex items-center px-4 text-xs select-none border-b border-black/50 gap-6 shrink-0 shadow-sm z-20">
          <div className="font-bold text-white tracking-wider flex items-center gap-2">
            <div className="w-4 h-4 bg-accent rounded-sm shadow-[0_0_10px_rgba(0,122,204,0.5)]"></div>
            Ti3D ENGINE
          </div>
          <div className="flex gap-4 text-text-secondary font-medium">
              <span className="hover:text-white cursor-pointer transition-colors" onClick={() => {
                  const json = engineInstance.saveScene();
                  localStorage.setItem('ti3d_scene', json);
                  alert("Saved to LocalStorage");
              }}>Save</span>
              <span className="hover:text-white cursor-pointer transition-colors" onClick={handleLoad}>Load</span>
              <span className="hover:text-white cursor-pointer transition-colors" onClick={() => engineInstance.undo()}>Undo</span>
              <span className="hover:text-white cursor-pointer transition-colors" onClick={() => engineInstance.redo()}>Redo</span>
              <div className="w-px h-4 bg-white/10 mx-2"/>
              {['Assets', 'GameObject', 'Window', 'Help'].map(m => (
                  <span key={m} className="hover:text-white cursor-pointer transition-colors">{m}</span>
              ))}
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
        />

        {/* Docking Area */}
        <div className="flex-1 relative">
            <DockLayout 
              defaultLayout={layout}
              style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
              dropMode="edge"
            />
        </div>

        {/* Status Bar */}
        <div className="h-6 bg-accent/90 flex items-center px-4 justify-between text-[10px] text-white shrink-0 select-none z-50 shadow-[0_-1px_0_rgba(255,255,255,0.1)]">
          <div className="flex items-center gap-4">
              <span className="font-bold flex items-center gap-1"><Icon name="CheckCircle2" size={10} /> Ready</span>
          </div>
          <div className="flex items-center gap-4 font-mono opacity-80">
              <span>MEM: {engineInstance.metrics.entityCount} Entities</span>
              <span>GPU: {engineInstance.metrics.frameTime.toFixed(2)}ms</span>
              <span>FPS: {engineInstance.metrics.fps.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </EditorContext.Provider>
  );
};

export default App;
