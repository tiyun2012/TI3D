
import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Entity, ComponentType, ToolType, Vector3 } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { Mat4Utils, Vec3Utils, Mat4 } from '../services/math';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';

interface SceneViewProps {
  entities: Entity[];
  sceneGraph: SceneGraph;
  onSelect: (id: string) => void;
  selectedId: string | null;
  tool: ToolType;
}

type Axis = 'X' | 'Y' | 'Z';

export const SceneView: React.FC<SceneViewProps> = ({ entities, sceneGraph, onSelect, selectedId, tool }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
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

  const [gizmoDrag, setGizmoDrag] = useState<{
    axis: Axis;
    startX: number;
    startY: number;
    startValue: Vector3;
  } | null>(null);

  useLayoutEffect(() => {
    if (canvasRef.current) {
        engineInstance.initGL(canvasRef.current);
        const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current && canvasRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect();
                engineInstance.resize(width, height);
            }
        });
        resizeObserver.observe(containerRef.current!);
        return () => resizeObserver.disconnect();
    }
  }, []);

  useEffect(() => {
      engineInstance.setSelected(selectedId);
  }, [selectedId]);

  // Derived Camera Matrices
  const { vpMatrix, width, height } = useMemo(() => {
    if (!containerRef.current) return { vpMatrix: Mat4Utils.create(), width: 1, height: 1 };
    
    const rect = containerRef.current.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    const eyeX = camera.target.x + camera.radius * Math.sin(camera.phi) * Math.cos(camera.theta);
    const eyeY = camera.target.y + camera.radius * Math.cos(camera.phi);
    const eyeZ = camera.target.z + camera.radius * Math.sin(camera.phi) * Math.sin(camera.theta);
    const eye = { x: eyeX, y: eyeY, z: eyeZ };

    const viewMatrix = Mat4Utils.create();
    Mat4Utils.lookAt(eye, camera.target, { x: 0, y: 1, z: 0 }, viewMatrix);
    
    const aspect = w / h;
    const projMatrix = Mat4Utils.create();
    Mat4Utils.perspective(Math.PI / 4, aspect, 0.1, 1000, projMatrix);
    
    const vp = Mat4Utils.create();
    Mat4Utils.multiply(projMatrix, viewMatrix, vp);

    return { vpMatrix: vp, width: w, height: h };
  }, [camera, containerRef.current?.getBoundingClientRect().width, containerRef.current?.getBoundingClientRect().height]);

  useEffect(() => {
    if (width > 1) {
       engineInstance.updateCamera(vpMatrix);
    }
  }, [vpMatrix, width]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (!e.altKey && tool === 'SELECT') {
        if (e.target === canvasRef.current) onSelect(''); 
    }
    
    if (e.altKey || tool === 'SELECT') {
        e.preventDefault();
        let mode: 'ORBIT' | 'PAN' | 'ZOOM' = 'ORBIT';
        if (e.button === 1) mode = 'PAN';
        if (e.button === 2) mode = 'ZOOM';

        setDragState({
          isDragging: true,
          startX: e.clientX,
          startY: e.clientY,
          mode,
          startCamera: { ...camera }
        });
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    setCamera(prev => ({ ...prev, radius: Math.max(2, prev.radius + e.deltaY * 0.01) }));
  };

  useEffect(() => {
    const handleWindowMouseMove = (e: MouseEvent) => {
      if (gizmoDrag && selectedId) {
          const entity = entities.find(e => e.id === selectedId);
          if (!entity) return;
          const transform = entity.components[ComponentType.TRANSFORM];
          const dx = e.clientX - gizmoDrag.startX;
          const dy = e.clientY - gizmoDrag.startY;
          
          const factor = 0.02 * (camera.radius / 10); 

          if (tool === 'MOVE') {
              if (gizmoDrag.axis === 'X') transform.position.x = gizmoDrag.startValue.x + dx * factor;
              if (gizmoDrag.axis === 'Y') transform.position.y = gizmoDrag.startValue.y - dy * factor;
              if (gizmoDrag.axis === 'Z') transform.position.z = gizmoDrag.startValue.z - dx * factor;
          } 
          else if (tool === 'ROTATE') {
              const angle = dx * 0.01;
              if (gizmoDrag.axis === 'X') transform.rotation.x = gizmoDrag.startValue.x + angle;
              if (gizmoDrag.axis === 'Y') transform.rotation.y = gizmoDrag.startValue.y + angle;
              if (gizmoDrag.axis === 'Z') transform.rotation.z = gizmoDrag.startValue.z + angle;
          }
          else if (tool === 'SCALE') {
              const scaleDelta = dx * 0.05;
              if (gizmoDrag.axis === 'X') transform.scale.x = gizmoDrag.startValue.x + scaleDelta;
              if (gizmoDrag.axis === 'Y') transform.scale.y = gizmoDrag.startValue.y - dy * 0.05;
              if (gizmoDrag.axis === 'Z') transform.scale.z = gizmoDrag.startValue.z + scaleDelta;
          }

          engineInstance.notifyUI();
          return;
      }

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
        setCamera(prev => ({
            ...prev,
            target: {
                x: dragState.startCamera.target.x - dx * panSpeed,
                y: dragState.startCamera.target.y + dy * panSpeed,
                z: dragState.startCamera.target.z 
            }
        }));
      }
    };

    const handleWindowMouseUp = () => {
        setDragState(null);
        setGizmoDrag(null);
    };

    if (dragState || gizmoDrag) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [dragState, gizmoDrag, camera, selectedId, tool, entities]);

  const renderGizmos = () => {
      if (!selectedId || tool === 'SELECT') return null;
      
      const worldPos = sceneGraph.getWorldPosition(selectedId);
      
      const pCenter = Mat4Utils.transformPoint(worldPos, vpMatrix, width, height);
      if (pCenter.w <= 0) return null;

      const axisLength = 1.5;
      const axesPoints = {
          x: Mat4Utils.transformPoint({x: worldPos.x + axisLength, y: worldPos.y, z: worldPos.z}, vpMatrix, width, height),
          y: Mat4Utils.transformPoint({x: worldPos.x, y: worldPos.y + axisLength, z: worldPos.z}, vpMatrix, width, height),
          z: Mat4Utils.transformPoint({x: worldPos.x, y: worldPos.y, z: worldPos.z + axisLength}, vpMatrix, width, height)
      };

      const startDrag = (e: React.MouseEvent, axis: Axis) => {
          e.stopPropagation();
          e.preventDefault();
          const entity = entities.find(e => e.id === selectedId);
          if (!entity) return;
          const transform = entity.components[ComponentType.TRANSFORM];
          
          let startVal = { x:0, y:0, z:0 };
          if (tool === 'MOVE') startVal = { ...transform.position };
          if (tool === 'ROTATE') startVal = { ...transform.rotation };
          if (tool === 'SCALE') startVal = { ...transform.scale };

          setGizmoDrag({
              axis,
              startX: e.clientX,
              startY: e.clientY,
              startValue: startVal
          });
      };

      const renderAxis = (axis: Axis, color: string, endPoint: {x:number, y:number, z:number, w:number}) => {
          if (endPoint.w <= 0) return null;
          
          const isActive = gizmoDrag?.axis === axis;
          const strokeColor = isActive ? '#fff' : color;
          
          return (
              <g className="cursor-pointer" onMouseDown={(e) => startDrag(e, axis)}>
                  <line 
                      x1={pCenter.x} y1={pCenter.y} 
                      x2={endPoint.x} y2={endPoint.y} 
                      stroke={strokeColor} 
                      strokeWidth={isActive ? 4 : 2} 
                  />
                  {tool === 'MOVE' && (
                       <polygon 
                          points={`${endPoint.x},${endPoint.y-5} ${endPoint.x-5},${endPoint.y+5} ${endPoint.x+5},${endPoint.y+5}`}
                          fill={strokeColor}
                          transform={`rotate(${Math.atan2(endPoint.y - pCenter.y, endPoint.x - pCenter.x) * 180 / Math.PI + 90}, ${endPoint.x}, ${endPoint.y})`}
                       />
                  )}
                  {tool === 'SCALE' && (
                      <rect 
                          x={endPoint.x - 4} y={endPoint.y - 4} 
                          width={8} height={8} 
                          fill={strokeColor} 
                      />
                  )}
                  {tool === 'ROTATE' && (
                      <circle 
                          cx={endPoint.x} cy={endPoint.y} 
                          r={6} 
                          fill={strokeColor} 
                      />
                  )}
              </g>
          );
      };

      return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10">
              <g className="pointer-events-auto">
                {renderAxis('Z', '#3b82f6', axesPoints.z)}
                {renderAxis('Y', '#22c55e', axesPoints.y)}
                {renderAxis('X', '#ef4444', axesPoints.x)}
                <circle cx={pCenter.x} cy={pCenter.y} r={4} fill="white" className="pointer-events-none opacity-50"/>
              </g>
          </svg>
      );
  };

  return (
    <div 
        ref={containerRef}
        className="w-full h-full bg-[#151515] relative overflow-hidden select-none group"
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
    >
        <div className="absolute inset-0 bg-gradient-to-b from-[#202020] to-[#101010] -z-10 pointer-events-none" />
        <canvas ref={canvasRef} className="block w-full h-full outline-none" />
        {renderGizmos()}
        
        {/* Helper UI Overlays */}
        <div className="absolute top-3 left-3 flex gap-2 z-20">
            <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex p-1 text-text-secondary">
                 <button className="p-1 hover:text-white rounded hover:bg-white/10"><Icon name="Box" size={14} /></button>
                 <button className="p-1 hover:text-white rounded hover:bg-white/10"><Icon name="Grid" size={14} /></button>
            </div>
            <div className="bg-black/40 backdrop-blur border border-white/5 rounded-md flex items-center px-2 text-[10px] text-text-secondary">
                <span>Perspective</span>
            </div>
        </div>
        <div className="absolute top-3 right-3 opacity-80 hover:opacity-100 transition-opacity cursor-pointer z-20">
             <div className="relative w-8 h-8">
                 <div className="absolute right-0 top-0 w-1 h-6 bg-green-500 rounded-full"></div>
                 <div className="absolute right-0 top-6 w-6 h-1 bg-red-500 rounded-full"></div>
                 <div className="absolute right-1 top-1 w-4 h-4 bg-blue-500 rounded-full z-10 border-2 border-[#151515]"></div>
             </div>
        </div>
        <div className="absolute bottom-2 right-2 text-[10px] text-text-secondary bg-black/40 px-2 py-0.5 rounded backdrop-blur border border-white/5 z-20">
            Cam: {camera.target.x.toFixed(1)}, {camera.target.y.toFixed(1)}, {camera.target.z.toFixed(1)}
        </div>
    </div>
  );
};
