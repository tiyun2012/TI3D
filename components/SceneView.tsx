
import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Entity, ToolType, PerformanceMetrics } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { Mat4Utils, Vec3Utils } from '../services/math';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';
import { Gizmo } from './Gizmo';
import { VIEW_MODES } from '../services/constants';

interface SceneViewProps {
  entities: Entity[];
  sceneGraph: SceneGraph;
  onSelect: (ids: string[]) => void;
  selectedIds: string[];
  tool: ToolType;
}

// Optimization: Isolated component to prevent SceneView re-renders
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
  const [renderMode, setRenderMode] = useState(engineInstance.renderMode);
  const [isViewMenuOpen, setIsViewMenuOpen] = useState(false);
  const viewMenuRef = useRef<HTMLDivElement>(null);
  
  // Optimization: Stable viewport state
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
        
        // Optimization: Use ResizeObserver instead of getBoundingClientRect in render loop
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
      engineInstance.setSelected(selectedIds);
  }, [selectedIds]);

  // Handle outside click for menu
  useEffect(() => {
      const handleClickOutside = (e: MouseEvent) => {
          if (viewMenuRef.current && !viewMenuRef.current.contains(e.target as Node)) {
              setIsViewMenuOpen(false);
          }
      };
      if (isViewMenuOpen) {
          window.addEventListener('mousedown', handleClickOutside);
      }
      return () => window.removeEventListener('mousedown', handleClickOutside);
  }, [isViewMenuOpen]);

  // Derived Camera Matrices using stable viewport state
  const { vpMatrix, invVpMatrix, eye } = useMemo(() => {
    const { width, height } = viewport;
    
    const eyeX = camera.target.x + camera.radius * Math.sin(camera.phi) * Math.cos(camera.theta);
    const eyeY = camera.target.y + camera.radius * Math.cos(camera.phi);
    const eyeZ = camera.target.z + camera.radius * Math.sin(camera.phi) * Math.sin(camera.theta);
    const eyeVec = { x: eyeX, y: eyeY, z: eyeZ };

    const viewMatrix = Mat4Utils.create();
    Mat4Utils.lookAt(eyeVec, camera.target, { x: 0, y: 1, z: 0 }, viewMatrix);
    
    const aspect = width / height;
    const projMatrix = Mat4Utils.create();
    Mat4Utils.perspective(Math.PI / 4, aspect, 0.1, 1000, projMatrix);
    
    const vp = Mat4Utils.create();
    Mat4Utils.multiply(projMatrix, viewMatrix, vp);
    
    const invVp = Mat4Utils.create();
    Mat4Utils.invert(vp, invVp);

    return { vpMatrix: vp, invVpMatrix: invVp, eye: eyeVec };
  }, [camera, viewport.width, viewport.height]);

  useEffect(() => {
    if (viewport.width > 1) {
       engineInstance.updateCamera(vpMatrix, eye, viewport.width, viewport.height);
    }
  }, [vpMatrix, eye, viewport.width, viewport.height]);

  // Focus on Selection (F)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'f' || e.key === 'F') {
            if (selectedIds.length > 0) {
                const id = selectedIds[0];
                const pos = sceneGraph.getWorldPosition(id);
                setCamera(prev => ({
                    ...prev,
                    target: pos,
                    radius: Math.max(5, prev.radius) // Ensure we don't zoom in too close inside the object
                }));
            }
        }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, sceneGraph]);

  const getCameraPosition = () => {
    const eyeX = camera.target.x + camera.radius * Math.sin(camera.phi) * Math.cos(camera.theta);
    const eyeY = camera.target.y + camera.radius * Math.cos(camera.phi);
    const eyeZ = camera.target.z + camera.radius * Math.sin(camera.phi) * Math.sin(camera.theta);
    return { x: eyeX, y: eyeY, z: eyeZ };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    if (!e.altKey && e.button === 0) {
        if (tool === 'SELECT') {
            setSelectionBox({
                startX: mouseX,
                startY: mouseY,
                currentX: mouseX,
                currentY: mouseY,
                isSelecting: true
            });
        } else {
             const hitId = engineInstance.selectEntityAt(mouseX, mouseY, rect.width, rect.height);
             if (hitId) {
                if (e.shiftKey) {
                    onSelect([...selectedIds, hitId]);
                } else {
                    onSelect([hitId]);
                }
             } else {
                 if(!e.shiftKey) onSelect([]);
             }
        }
    }
    
    if (e.altKey || (e.button === 1) || (e.button === 2)) {
        e.preventDefault();
        let mode: 'ORBIT' | 'PAN' | 'ZOOM' = 'ORBIT';
        if (e.button === 1 || (e.altKey && e.button === 1)) mode = 'PAN';
        if (e.button === 2 || (e.altKey && e.button === 2)) mode = 'ZOOM';
        
        if (e.altKey) {
            if (e.button === 0) mode = 'ORBIT';
            if (e.button === 1) mode = 'PAN';
            if (e.button === 2) mode = 'ZOOM';
        }

        setDragState({
          isDragging: true,
          startX: e.clientX,
          startY: e.clientY,
          mode,
          startCamera: { ...camera }
        });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (selectionBox && selectionBox.isSelecting && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setSelectionBox({
            ...selectionBox,
            currentX: e.clientX - rect.left,
            currentY: e.clientY - rect.top
        });
        return;
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
      if (selectionBox && selectionBox.isSelecting) {
          const w = selectionBox.currentX - selectionBox.startX;
          const h = selectionBox.currentY - selectionBox.startY;
          
          if (Math.abs(w) < 2 && Math.abs(h) < 2) {
               if (containerRef.current) {
                    const rect = containerRef.current.getBoundingClientRect();
                    const hitId = engineInstance.selectEntityAt(selectionBox.startX, selectionBox.startY, rect.width, rect.height);
                    if (hitId) {
                        if (e.shiftKey) onSelect([...new Set([...selectedIds, hitId])]);
                        else onSelect([hitId]);
                    } else {
                        if (!e.shiftKey) onSelect([]);
                    }
               }
          } else {
              const rectIds = engineInstance.selectEntitiesInRect(selectionBox.startX, selectionBox.startY, w, h);
              if (e.shiftKey) {
                  onSelect([...new Set([...selectedIds, ...rectIds])]);
              } else {
                  onSelect(rectIds);
              }
          }
          setSelectionBox(null);
      }
  };

  const handleDrop = (e: React.DragEvent) => {
      e.preventDefault();
      const assetId = e.dataTransfer.getData('application/ti3d-asset');
      if (assetId) {
          const rect = containerRef.current?.getBoundingClientRect();
          if(!rect) return;
          
          // Calculate world position drop
          // Cast ray against XZ plane (y=0)
          const ndcX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
          const ndcY = 1 - ((e.clientY - rect.top) / rect.height) * 2;
          
          const camPos = getCameraPosition();
          const start = { x: ndcX, y: ndcY, z: -1 };
          const end = { x: ndcX, y: ndcY, z: 1 };
          const worldStart = Vec3Utils.create();
          const worldEnd = Vec3Utils.create();
          
          Vec3Utils.transformMat4(start, invVpMatrix, worldStart);
          Vec3Utils.transformMat4(end, invVpMatrix, worldEnd);
          
          const dir = Vec3Utils.normalize(Vec3Utils.subtract(worldEnd, worldStart, {x:0,y:0,z:0}), {x:0,y:0,z:0});
          
          // Plane intersection: P = O + tD
          // P.y = 0 => O.y + t*D.y = 0 => t = -O.y / D.y
          let dropPos = { x: 0, y: 0, z: 0 };
          
          if (Math.abs(dir.y) > 0.001) {
              const t = -worldStart.y / dir.y;
              if (t > 0) {
                  dropPos = Vec3Utils.add(worldStart, Vec3Utils.scale(dir, t, {x:0,y:0,z:0}), {x:0,y:0,z:0});
              } else {
                  // Ray points up, spawn at distance in front
                  dropPos = Vec3Utils.add(camPos, Vec3Utils.scale(dir, 10, {x:0,y:0,z:0}), {x:0,y:0,z:0});
              }
          } else {
               dropPos = Vec3Utils.add(camPos, Vec3Utils.scale(dir, 10, {x:0,y:0,z:0}), {x:0,y:0,z:0});
          }

          engineInstance.createEntityFromAsset(assetId, dropPos);
      }
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault(); // Allow drop
      e.dataTransfer.dropEffect = 'copy';
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!dragState || !dragState.isDragging) return;

      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;

      if (dragState.mode === 'ORBIT') {
        setCamera(prev => ({
          ...prev,
          // Fixed: Changed from subtraction to addition to match standard DCC camera controls
          // (Dragging Right -> Camera orbits Left -> Object appears to rotate Right)
          theta: dragState.startCamera.theta + dx * 0.01,
          phi: Math.max(0.1, Math.min(Math.PI - 0.1, dragState.startCamera.phi - dy * 0.01))
        }));
      } else if (dragState.mode === 'ZOOM') {
        const zoomDelta = (dx - dy) * 0.05;
        setCamera(prev => ({
          ...prev,
          radius: Math.max(1, dragState.startCamera.radius - zoomDelta)
        }));
      } else if (dragState.mode === 'PAN') {
        // Fix: Correct 3D Panning using Basis Vectors
        const panSpeed = dragState.startCamera.radius * 0.002;
        
        // 1. Recompute basis vectors from start camera angles
        // Eye (relative to target 0,0,0 for direction calc)
        const eyeX = dragState.startCamera.radius * Math.sin(dragState.startCamera.phi) * Math.cos(dragState.startCamera.theta);
        const eyeY = dragState.startCamera.radius * Math.cos(dragState.startCamera.phi);
        const eyeZ = dragState.startCamera.radius * Math.sin(dragState.startCamera.phi) * Math.sin(dragState.startCamera.theta);
        
        const eyeRel = { x: eyeX, y: eyeY, z: eyeZ };
        // Forward is roughly -Eye
        const forward = Vec3Utils.normalize(Vec3Utils.scale(eyeRel, -1, {x:0,y:0,z:0}), {x:0,y:0,z:0});
        
        // Right = Cross(Forward, WorldUp)
        const worldUp = { x: 0, y: 1, z: 0 };
        const right = Vec3Utils.normalize(Vec3Utils.cross(forward, worldUp, {x:0,y:0,z:0}), {x:0,y:0,z:0});
        
        // CameraUp = Cross(Right, Forward) (Orthogonal Up)
        const camUp = Vec3Utils.normalize(Vec3Utils.cross(right, forward, {x:0,y:0,z:0}), {x:0,y:0,z:0});
        
        // 2. Calculate movement
        // Mouse Right (+dx) -> World Left (-Right)
        // Mouse Down (+dy) -> World Up (+CamUp) (because +y is down in screen)
        const moveX = Vec3Utils.scale(right, -dx * panSpeed, {x:0,y:0,z:0});
        const moveY = Vec3Utils.scale(camUp, dy * panSpeed, {x:0,y:0,z:0});
        
        const delta = Vec3Utils.add(moveX, moveY, {x:0,y:0,z:0});
        
        setCamera(prev => ({
            ...prev,
            target: Vec3Utils.add(dragState.startCamera.target, delta, {x:0,y:0,z:0})
        }));
      }
    };

    const handleWindowMouseUp = () => {
        setDragState(null);
    };

    if (dragState) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [dragState, camera]);

  const handleWheel = (e: React.WheelEvent) => {
    setCamera(prev => ({ ...prev, radius: Math.max(2, prev.radius + e.deltaY * 0.01) }));
  };

  const handleModeSelect = (modeId: number) => {
      engineInstance.setRenderMode(modeId);
      setRenderMode(modeId);
      setIsViewMenuOpen(false);
  };

  const cursorClass = dragState ? (dragState.mode === 'PAN' ? 'cursor-move' : 'cursor-grabbing') : 'cursor-default';
  const currentModeDef = VIEW_MODES.find(m => m.id === renderMode) || VIEW_MODES[0];

  return (
    <div 
        ref={containerRef}
        className={`w-full h-full bg-[#151515] relative overflow-hidden select-none group ${cursorClass}`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
    >
        <div className="absolute inset-0 bg-gradient-to-b from-[#202020] to-[#101010] -z-10 pointer-events-none" />
        <canvas ref={canvasRef} className="block w-full h-full outline-none" />
        
        <Gizmo 
            entities={entities}
            sceneGraph={sceneGraph}
            selectedIds={selectedIds}
            tool={tool}
            vpMatrix={vpMatrix}
            viewport={viewport}
            cameraPosition={getCameraPosition()}
            containerRef={containerRef}
        />
        
        <StatsOverlay />
        
        {selectionBox && selectionBox.isSelecting && (
            <div 
                className="absolute border border-blue-500 bg-blue-500/20 pointer-events-none z-30"
                style={{
                    left: Math.min(selectionBox.startX, selectionBox.currentX),
                    top: Math.min(selectionBox.startY, selectionBox.currentY),
                    width: Math.abs(selectionBox.currentX - selectionBox.startX),
                    height: Math.abs(selectionBox.currentY - selectionBox.startY),
                }}
            />
        )}
        
        <div className="absolute top-3 left-3 flex gap-2 z-20">
            <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex p-1 text-text-secondary">
                 <button 
                    className="p-1 hover:text-white rounded hover:bg-white/10" 
                    onClick={() => engineInstance.toggleGrid()} 
                    title="Toggle Grid" 
                    aria-label="Toggle Grid"
                 >
                    <Icon name="Grid" size={14} />
                 </button>
            </div>
            
            {/* Expanded View Mode Dropdown */}
            <div className="relative" ref={viewMenuRef}>
                <div 
                    className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex items-center px-2 py-1 text-[10px] text-text-secondary min-w-[100px] justify-between cursor-pointer hover:bg-white/5 transition-colors group"
                    onClick={() => setIsViewMenuOpen(!isViewMenuOpen)}
                >
                    <div className="flex items-center gap-2">
                        <Icon name={currentModeDef.icon as any} size={12} className="text-accent" />
                        <span className="font-semibold text-white/90">{currentModeDef.label}</span>
                    </div>
                    
                    {/* Small option button indicator (Chevron) at bottom right of the box area */}
                    <Icon name="ChevronDown" size={10} className={`opacity-50 group-hover:opacity-100 transition-transform ${isViewMenuOpen ? 'rotate-180' : ''}`} />
                </div>

                {isViewMenuOpen && (
                    <div className="absolute top-full left-0 mt-1 w-32 bg-[#252525] border border-white/10 rounded-md shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100 z-50">
                        {VIEW_MODES.map((mode) => (
                            <button
                                key={mode.id}
                                onClick={() => handleModeSelect(mode.id)}
                                className={`w-full flex items-center gap-2 px-3 py-1.5 text-[10px] hover:bg-accent hover:text-white transition-colors text-left
                                    ${mode.id === renderMode ? 'bg-white/5 text-white font-bold' : 'text-text-secondary'}
                                `}
                            >
                                <Icon name={mode.icon as any} size={12} />
                                <span>{mode.label}</span>
                                {mode.id === renderMode && <Icon name="Check" size={10} className="ml-auto" />}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
        
        <div className="absolute bottom-2 right-2 text-[10px] text-text-secondary bg-black/40 px-2 py-0.5 rounded backdrop-blur border border-white/5 z-20">
            Cam: {camera.target.x.toFixed(1)}, {camera.target.y.toFixed(1)}, {camera.target.z.toFixed(1)}
        </div>
    </div>
  );
};
