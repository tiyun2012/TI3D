
import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Entity, ToolType, PerformanceMetrics } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { Mat4Utils } from '../services/math';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';
import { Gizmo } from './Gizmo';

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

  // Derived Camera Matrices using stable viewport state
  const { vpMatrix } = useMemo(() => {
    const { width, height } = viewport;
    
    const eyeX = camera.target.x + camera.radius * Math.sin(camera.phi) * Math.cos(camera.theta);
    const eyeY = camera.target.y + camera.radius * Math.cos(camera.phi);
    const eyeZ = camera.target.z + camera.radius * Math.sin(camera.phi) * Math.sin(camera.theta);
    const eye = { x: eyeX, y: eyeY, z: eyeZ };

    const viewMatrix = Mat4Utils.create();
    Mat4Utils.lookAt(eye, camera.target, { x: 0, y: 1, z: 0 }, viewMatrix);
    
    const aspect = width / height;
    const projMatrix = Mat4Utils.create();
    Mat4Utils.perspective(Math.PI / 4, aspect, 0.1, 1000, projMatrix);
    
    const vp = Mat4Utils.create();
    Mat4Utils.multiply(projMatrix, viewMatrix, vp);

    return { vpMatrix: vp };
  }, [camera, viewport.width, viewport.height]);

  useEffect(() => {
    if (viewport.width > 1) {
       engineInstance.updateCamera(vpMatrix, viewport.width, viewport.height);
    }
  }, [vpMatrix, viewport.width, viewport.height]);

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

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (!dragState || !dragState.isDragging) return;

      const dx = e.clientX - dragState.startX;
      const dy = e.clientY - dragState.startY;

      if (dragState.mode === 'ORBIT') {
        setCamera(prev => ({
          ...prev,
          theta: dragState.startCamera.theta - dx * 0.01,
          phi: Math.max(0.1, Math.min(Math.PI - 0.1, dragState.startCamera.phi - dy * 0.01))
        }));
      } else if (dragState.mode === 'ZOOM') {
        const zoomDelta = (dx - dy) * 0.05;
        setCamera(prev => ({
          ...prev,
          radius: Math.max(1, dragState.startCamera.radius - zoomDelta)
        }));
      } else if (dragState.mode === 'PAN') {
        const panSpeed = dragState.startCamera.radius * 0.002;
        const sinT = Math.sin(dragState.startCamera.theta);
        const cosT = Math.cos(dragState.startCamera.theta);
        
        setCamera(prev => ({
            ...prev,
            target: {
                x: dragState.startCamera.target.x - (dx * cosT - dy * sinT) * panSpeed,
                y: dragState.startCamera.target.y + dy * panSpeed,
                z: dragState.startCamera.target.z - (dx * sinT + dy * cosT) * panSpeed
            }
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

  return (
    <div 
        ref={containerRef}
        className="w-full h-full bg-[#151515] relative overflow-hidden select-none group"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
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
                 <button className="p-1 hover:text-white rounded hover:bg-white/10"><Icon name="Box" size={14} /></button>
                 <button className="p-1 hover:text-white rounded hover:bg-white/10" onClick={() => engineInstance.toggleGrid()}><Icon name="Grid" size={14} /></button>
            </div>
            <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex items-center px-2 text-[10px] text-text-secondary">
                <span>Perspective</span>
            </div>
        </div>
        <div className="absolute bottom-2 right-2 text-[10px] text-text-secondary bg-black/40 px-2 py-0.5 rounded backdrop-blur border border-white/5 z-20">
            Cam: {camera.target.x.toFixed(1)}, {camera.target.y.toFixed(1)}, {camera.target.z.toFixed(1)}
        </div>
    </div>
  );
};
