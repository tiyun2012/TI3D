
import React, { useRef, useState, useEffect, useLayoutEffect, useMemo, useContext } from 'react';
import { Entity, ToolType, PerformanceMetrics, MeshComponentMode } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { Mat4Utils, Vec3Utils } from '../services/math';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';
import { Gizmo } from './Gizmo';
import { VIEW_MODES } from '../services/constants';
import { EditorContext } from '../contexts/EditorContext';

interface SceneViewProps {
  entities: Entity[];
  sceneGraph: SceneGraph;
  onSelect: (ids: string[]) => void;
  selectedIds: string[];
  tool: ToolType;
}

const StatsOverlay: React.FC = () => {
    const [metrics, setMetrics] = useState<PerformanceMetrics>(engineInstance.metrics);
    useEffect(() => {
        const interval = setInterval(() => {
            setMetrics({...engineInstance.metrics});
        }, 500);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="absolute top-10 right-2 bg-black/60 backdrop-blur border border-white/10 rounded-md p-2 text-[10px] font-mono text-text-secondary select-none pointer-events-none z-30 shadow-lg">
            <div className="flex justify-between gap-4"><span className="text-white">FPS</span> <span className={metrics.fps < 30 ? "text-red-500" : "text-green-500"}>{metrics.fps.toFixed(0)}</span></div>
            <div className="flex justify-between gap-4"><span>Frame</span> <span>{metrics.frameTime.toFixed(2)}ms</span></div>
            <div className="flex justify-between gap-4"><span>Calls</span> <span>{metrics.drawCalls}</span></div>
            <div className="flex justify-between gap-4"><span>Tris</span> <span>{metrics.triangleCount}</span></div>
            <div className="flex justify-between gap-4"><span>Ents</span> <span>{metrics.entityCount}</span></div>
        </div>
    );
};

export const SceneView: React.FC<SceneViewProps> = ({ entities, sceneGraph, onSelect, selectedIds, tool }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { meshComponentMode, setMeshComponentMode } = useContext(EditorContext)!;
  const [renderMode, setRenderMode] = useState(engineInstance.renderMode);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  
  const [viewport, setViewport] = useState({ width: 1, height: 1 });
  const [camera, setCamera] = useState({
    target: { x: 0, y: 0, z: 0 },
    theta: Math.PI / 4, 
    phi: Math.PI / 3,   
    radius: 10
  });

  const [dragState, setDragState] = useState<{
    isDragging: boolean;
    startX: number;
    startY: number;
    mode: 'ORBIT' | 'PAN' | 'ZOOM';
    startCamera: typeof camera;
  } | null>(null);

  const [selectionBox, setSelectionBox] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
    isSelecting: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    if (canvasRef.current && containerRef.current) {
        engineInstance.initGL(canvasRef.current);
        const observer = new ResizeObserver((entries) => {
            const { width, height } = entries[0].contentRect;
            setViewport({ width, height });
            engineInstance.resize(width, height);
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }
  }, []);

  useEffect(() => {
      let frameId: number;
      let lastTime = performance.now();
      const loop = (time: number) => {
          const dt = (time - lastTime) / 1000;
          lastTime = time;
          engineInstance.tick(dt);
          frameId = requestAnimationFrame(loop);
      };
      frameId = requestAnimationFrame(loop);
      return () => cancelAnimationFrame(frameId);
  }, []);

  useEffect(() => {
      engineInstance.setSelected(selectedIds);
  }, [selectedIds]);

  useEffect(() => {
      engineInstance.meshComponentMode = meshComponentMode;
  }, [meshComponentMode]);

  const { vpMatrix, invVpMatrix, eye } = useMemo(() => {
    const { width, height } = viewport;
    const eyeX = camera.target.x + camera.radius * Math.sin(camera.phi) * Math.cos(camera.theta);
    const eyeY = camera.target.y + camera.radius * Math.cos(camera.phi);
    const eyeZ = camera.target.z + camera.radius * Math.sin(camera.phi) * Math.sin(camera.theta);
    const eyeVec = { x: eyeX, y: eyeY, z: eyeZ };
    const viewMatrix = Mat4Utils.create();
    Mat4Utils.lookAt(eyeVec, camera.target, { x: 0, y: 1, z: 0 }, viewMatrix);
    const projMatrix = Mat4Utils.create();
    Mat4Utils.perspective(Math.PI / 4, width/height, 0.1, 1000, projMatrix);
    const vp = Mat4Utils.create(); Mat4Utils.multiply(projMatrix, viewMatrix, vp);
    const invVp = Mat4Utils.create(); Mat4Utils.invert(vp, invVp);
    return { vpMatrix: vp, invVpMatrix: invVp, eye: eyeVec };
  }, [camera, viewport.width, viewport.height]);

  useEffect(() => {
    if (viewport.width > 1) engineInstance.updateCamera(vpMatrix, eye, viewport.width, viewport.height);
  }, [vpMatrix, eye, viewport.width, viewport.height]);

  // Maya Hotkeys
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA';
        if (isInput) return;

        if (e.key === 'f' || e.key === 'F') {
            if (selectedIds.length > 0) {
                const pos = sceneGraph.getWorldPosition(selectedIds[0]);
                setCamera(prev => ({ ...prev, target: pos, radius: Math.max(5, prev.radius) }));
            }
        }
        
        // F8: Object, F9: Vert, F10: Edge, F11: Face
        if (e.key === 'F8') { e.preventDefault(); setMeshComponentMode('OBJECT'); }
        if (e.key === 'F9') { e.preventDefault(); setMeshComponentMode('VERTEX'); }
        if (e.key === 'F10') { e.preventDefault(); setMeshComponentMode('EDGE'); }
        if (e.key === 'F11') { e.preventDefault(); setMeshComponentMode('FACE'); }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, sceneGraph, setMeshComponentMode]);

  const getCameraPosition = () => {
    const eyeX = camera.target.x + camera.radius * Math.sin(camera.phi) * Math.cos(camera.theta);
    const eyeY = camera.target.y + camera.radius * Math.cos(camera.phi);
    const eyeZ = camera.target.z + camera.radius * Math.sin(camera.phi) * Math.sin(camera.theta);
    return { x: eyeX, y: eyeY, z: eyeZ };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mx = e.clientX - rect.left; const my = e.clientY - rect.top;

    if (!e.altKey && e.button === 0) {
        if (meshComponentMode !== 'OBJECT' && selectedIds.length > 0) {
            const result = engineInstance.pickMeshComponent(selectedIds[0], mx, my, rect.width, rect.height);
            if (result) {
                if (!e.shiftKey) {
                    engineInstance.subSelection.vertexIds.clear();
                    engineInstance.subSelection.edgeIds.clear();
                    engineInstance.subSelection.faceIds.clear();
                }
                
                if (meshComponentMode === 'VERTEX' && result.vertexId !== -1) {
                    engineInstance.subSelection.vertexIds.add(result.vertexId);
                } else if (meshComponentMode === 'EDGE') {
                    const key = result.edgeId.sort().join('-');
                    engineInstance.subSelection.edgeIds.add(key);
                } else if (meshComponentMode === 'FACE') {
                    engineInstance.subSelection.faceIds.add(result.faceId);
                }
                engineInstance.notifyUI();
            } else if (!e.shiftKey) {
                engineInstance.subSelection.vertexIds.clear();
                engineInstance.subSelection.edgeIds.clear();
                engineInstance.subSelection.faceIds.clear();
                engineInstance.notifyUI();
            }
            return;
        }

        if (tool === 'SELECT') {
            setSelectionBox({ startX: mx, startY: my, currentX: mx, currentY: my, isSelecting: true });
        } else {
             const hitId = engineInstance.selectEntityAt(mx, my, rect.width, rect.height);
             if (hitId) onSelect(e.shiftKey ? [...selectedIds, hitId] : [hitId]);
             else if(!e.shiftKey) onSelect([]);
        }
    }
    
    if (e.altKey || e.button === 1 || e.button === 2) {
        e.preventDefault();
        let mode: 'ORBIT' | 'PAN' | 'ZOOM' = 'ORBIT';
        if (e.button === 1 || (e.altKey && e.button === 1)) mode = 'PAN';
        if (e.button === 2 || (e.altKey && e.button === 2)) mode = 'ZOOM';
        setDragState({ isDragging: true, startX: e.clientX, startY: e.clientY, mode, startCamera: { ...camera } });
    }
  };

  const handleMouseUp = () => {
    if (selectionBox?.isSelecting) {
      setSelectionBox(null);
    }
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!dragState || !dragState.isDragging) return;
      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;

      if (dragState.mode === 'ORBIT') {
        setCamera(prev => ({
          ...prev,
          theta: dragState.startCamera.theta + dx * 0.01,
          phi: Math.max(0.1, Math.min(Math.PI - 0.1, dragState.startCamera.phi - dy * 0.01))
        }));
      } else if (dragState.mode === 'ZOOM') {
        setCamera(prev => ({ ...prev, radius: Math.max(1, dragState.startCamera.radius - (dx - dy) * 0.05) }));
      } else if (dragState.mode === 'PAN') {
        const panSpeed = dragState.startCamera.radius * 0.002;
        const eyeX = dragState.startCamera.radius * Math.sin(dragState.startCamera.phi) * Math.cos(dragState.startCamera.theta);
        const eyeY = dragState.startCamera.radius * Math.cos(dragState.startCamera.phi);
        const eyeZ = dragState.startCamera.radius * Math.sin(dragState.startCamera.phi) * Math.sin(dragState.startCamera.theta);
        const forward = Vec3Utils.normalize(Vec3Utils.scale({x:eyeX,y:eyeY,z:eyeZ}, -1, {x:0,y:0,z:0}), {x:0,y:0,z:0});
        const worldUp = { x: 0, y: 1, z: 0 };
        const right = Vec3Utils.normalize(Vec3Utils.cross(forward, worldUp, {x:0,y:0,z:0}), {x:0,y:0,z:0});
        const camUp = Vec3Utils.normalize(Vec3Utils.cross(right, forward, {x:0,y:0,z:0}), {x:0,y:0,z:0});
        const moveX = Vec3Utils.scale(right, -dx * panSpeed, {x:0,y:0,z:0});
        const moveY = Vec3Utils.scale(camUp, dy * panSpeed, {x:0,y:0,z:0});
        setCamera(prev => ({ ...prev, target: Vec3Utils.add(dragState.startCamera.target, Vec3Utils.add(moveX, moveY, {x:0,y:0,z:0}), {x:0,y:0,z:0}) }));
      }
    };
    const handleWindowMouseUp = () => setDragState(null);
    if (dragState) { window.addEventListener('mousemove', handleWindowMouseMove); window.addEventListener('mouseup', handleWindowMouseUp); }
    return () => { window.removeEventListener('mousemove', handleWindowMouseMove); window.removeEventListener('mouseup', handleWindowMouseUp); };
  }, [dragState, camera]);

  const handleModeSelect = (modeId: number) => { engineInstance.setRenderMode(modeId); setRenderMode(modeId); setIsViewMenuOpen(false); };

  return (
    <div ref={containerRef} className={`w-full h-full bg-[#151515] relative overflow-hidden select-none group ${dragState ? (dragState.mode === 'PAN' ? 'cursor-move' : 'cursor-grabbing') : 'cursor-default'}`} onMouseDown={handleMouseDown} onMouseMove={(e) => selectionBox?.isSelecting && setSelectionBox({...selectionBox, currentX: e.clientX-containerRef.current!.getBoundingClientRect().left, currentY: e.clientY-containerRef.current!.getBoundingClientRect().top})} onMouseUp={handleMouseUp} onWheel={(e) => setCamera(p => ({ ...p, radius: Math.max(2, p.radius + e.deltaY * 0.01) }))} onContextMenu={e => e.preventDefault()}>
        <canvas ref={canvasRef} className="block w-full h-full outline-none" />
        <Gizmo entities={entities} sceneGraph={sceneGraph} selectedIds={selectedIds} tool={tool} vpMatrix={vpMatrix} viewport={viewport} cameraPosition={getCameraPosition()} containerRef={containerRef} />
        <StatsOverlay />
        
        {selectionBox && selectionBox.isSelecting && (
            <div className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-30" style={{ left: Math.min(selectionBox.startX, selectionBox.currentX), top: Math.min(selectionBox.startY, selectionBox.currentY), width: Math.abs(selectionBox.currentX - selectionBox.startX), height: Math.abs(selectionBox.currentY - selectionBox.startY) }} />
        )}
        
        <div className="absolute top-3 left-3 flex gap-2 z-20">
            <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex p-1 text-text-secondary">
                 <button className="p-1 hover:text-white rounded hover:bg-white/10" onClick={() => engineInstance.toggleGrid()} title="Toggle Grid" aria-label="Toggle Grid"><Icon name="Grid" size={14} /></button>
            </div>
            
            <div className="relative" ref={viewMenuRef}>
                <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex items-center px-2 py-1 text-[10px] text-text-secondary min-w-[100px] justify-between cursor-pointer hover:bg-white/5 group" onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}>
                    <div className="flex items-center gap-2"><Icon name={(VIEW_MODES.find(m => m.id === renderMode) || VIEW_MODES[0]).icon as any} size={12} className="text-accent" /><span className="font-semibold text-white/90">{(VIEW_MODES.find(m => m.id === renderMode) || VIEW_MODES[0]).label}</span></div>
                    <Icon name="ChevronDown" size={10} className={`opacity-50 group-hover:opacity-100 transition-transform ${isViewMenuOpen ? 'rotate-180' : ''}`} />
                </div>
                {isViewMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 w-32 bg-[#252525] border border-white/10 rounded-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 z-50">
                        {VIEW_MODES.map((mode) => (
                            <button key={mode.id} onClick={() => handleModeSelect(mode.id)} className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-accent hover:text-white transition-colors text-left ${mode.id === renderMode ? 'bg-white/5 text-white font-bold' : 'text-text-secondary'}`}><Icon name={mode.icon as any} size={12} /><span>{mode.label}</span>{mode.id === renderMode && <Icon name="Check" size={10} className="ml-auto" />}</button>
                        ))}
                    </div>
                )}
            </div>

            {/* Selection Mode HUD */}
            {meshComponentMode !== 'OBJECT' && (
                <div className="bg-accent/20 backdrop-blur border border-accent/40 rounded-md flex items-center px-3 py-1 text-[10px] text-accent font-bold uppercase tracking-widest animate-pulse">
                    Selection Mode: {meshComponentMode}
                </div>
            )}
        </div>
        <div className="absolute bottom-2 right-2 text-[10px] text-text-secondary bg-black/40 px-2 py-0.5 rounded backdrop-blur border border-white/5 z-20">Cam: {camera.target.x.toFixed(1)}, {camera.target.y.toFixed(1)}, {camera.target.z.toFixed(1)}</div>
    </div>
  );
};
