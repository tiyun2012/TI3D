import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Entity, ComponentType, ToolType, Vector3, PerformanceMetrics } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { Mat4Utils, Vec3Utils, Mat4 } from '../services/math';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';

interface SceneViewProps {
  entities: Entity[];
  sceneGraph: SceneGraph;
  onSelect: (ids: string[]) => void;
  selectedIds: string[];
  tool: ToolType;
}

type Axis = 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ' | 'UNIFORM';

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

  const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);

  const [gizmoDrag, setGizmoDrag] = useState<{
    axis: Axis;
    startX: number;
    startY: number;
    startValue: Vector3;
    hasMoved: boolean;
    screenAxis: { x: number, y: number };
    rotationStartAngle?: number; 
    axisVector?: Vector3;
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
      if (gizmoDrag && selectedIds.length > 0) {
          const selectedId = selectedIds[0];
          const entity = entities.find(e => e.id === selectedId);
          if (!entity) return;
          const transform = entity.components[ComponentType.TRANSFORM];
          const dx = e.clientX - gizmoDrag.startX;
          const dy = e.clientY - gizmoDrag.startY;
          
          gizmoDrag.hasMoved = true;

          const worldPos = sceneGraph.getWorldPosition(selectedId);
          const camPos = getCameraPosition();
          const dist = Math.sqrt(
              Math.pow(camPos.x - worldPos.x, 2) + 
              Math.pow(camPos.y - worldPos.y, 2) + 
              Math.pow(camPos.z - worldPos.z, 2)
          );
          const factor = dist * 0.002; 

          if (tool === 'MOVE') {
              if (['X', 'Y', 'Z'].includes(gizmoDrag.axis)) {
                  const proj = dx * gizmoDrag.screenAxis.x + dy * gizmoDrag.screenAxis.y;
                  const moveAmount = proj * factor;

                  if (gizmoDrag.axis === 'X') transform.position.x = gizmoDrag.startValue.x + moveAmount;
                  if (gizmoDrag.axis === 'Y') transform.position.y = gizmoDrag.startValue.y + moveAmount;
                  if (gizmoDrag.axis === 'Z') transform.position.z = gizmoDrag.startValue.z + moveAmount;
              }
              else if (gizmoDrag.axis === 'XZ') {
                  transform.position.x = gizmoDrag.startValue.x + dx * factor;
                  transform.position.z = gizmoDrag.startValue.z + dy * factor;
              }
              else if (gizmoDrag.axis === 'XY') {
                  transform.position.x = gizmoDrag.startValue.x + dx * factor;
                  transform.position.y = gizmoDrag.startValue.y - dy * factor;
              }
              else if (gizmoDrag.axis === 'YZ') {
                  transform.position.z = gizmoDrag.startValue.z + dx * factor;
                  transform.position.y = gizmoDrag.startValue.y - dy * factor;
              }
          } 
          else if (tool === 'ROTATE' && gizmoDrag.rotationStartAngle !== undefined && gizmoDrag.axisVector) {
             const rect = containerRef.current?.getBoundingClientRect();
             if (rect) {
                 const pCenter = Mat4Utils.transformPoint(worldPos, vpMatrix, viewport.width, viewport.height);
                 const cx = rect.left + pCenter.x;
                 const cy = rect.top + pCenter.y;
                 
                 const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
                 let delta = currentAngle - gizmoDrag.rotationStartAngle;
                 
                 const viewDir = { 
                     x: camPos.x - worldPos.x, 
                     y: camPos.y - worldPos.y, 
                     z: camPos.z - worldPos.z 
                 };
                 const dot = viewDir.x * gizmoDrag.axisVector.x + viewDir.y * gizmoDrag.axisVector.y + viewDir.z * gizmoDrag.axisVector.z;
                 if (dot < 0) {
                     delta = -delta;
                 }

                 if (e.shiftKey) {
                     const snap = Math.PI / 12;
                     delta = Math.round(delta / snap) * snap;
                 }
                 
                 const v = gizmoDrag.startValue;
                 if (gizmoDrag.axis === 'X') transform.rotation.x = v.x - delta;
                 if (gizmoDrag.axis === 'Y') transform.rotation.y = v.y - delta;
                 if (gizmoDrag.axis === 'Z') transform.rotation.z = v.z - delta;
             }
          }
          else if (tool === 'SCALE') {
              const scaleDelta = dx * 0.05;
              if (gizmoDrag.axis === 'UNIFORM') {
                   transform.scale.x = gizmoDrag.startValue.x + scaleDelta;
                   transform.scale.y = gizmoDrag.startValue.y + scaleDelta;
                   transform.scale.z = gizmoDrag.startValue.z + scaleDelta;
              }
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
        if (gizmoDrag) {
            if (gizmoDrag.hasMoved) {
                engineInstance.pushUndoState();
            }
            setGizmoDrag(null);
        }
    };

    if (dragState || gizmoDrag) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [dragState, gizmoDrag, camera, selectedIds, tool, entities, vpMatrix, viewport.width, viewport.height, sceneGraph]);

  const handleWheel = (e: React.WheelEvent) => {
    setCamera(prev => ({ ...prev, radius: Math.max(2, prev.radius + e.deltaY * 0.01) }));
  };

  const renderScaleIndicator = () => {
      if (tool !== 'SCALE' || !gizmoDrag || selectedIds.length === 0) return null;
      const entity = entities.find(e => e.id === selectedIds[0]);
      if (!entity) return null;
      const { scale } = entity.components[ComponentType.TRANSFORM];
      
      const worldPos = sceneGraph.getWorldPosition(selectedIds[0]);
      const screenPos = Mat4Utils.transformPoint(worldPos, vpMatrix, viewport.width, viewport.height);
      
      if (screenPos.w <= 0) return null;

      return (
        <div 
          className="absolute pointer-events-none bg-black/80 text-white text-[10px] px-2 py-1 rounded border border-white/10 font-mono whitespace-nowrap z-50 backdrop-blur-sm"
          style={{ 
            left: screenPos.x, 
            top: screenPos.y + 20,
            transform: 'translate(-50%, 0)'
          }}
        >
          <div className="flex gap-2">
            <span className="text-red-400">X: {scale.x.toFixed(2)}</span>
            <span className="text-green-400">Y: {scale.y.toFixed(2)}</span>
            <span className="text-blue-400">Z: {scale.z.toFixed(2)}</span>
          </div>
        </div>
      );
  };

  const renderGizmos = () => {
      if (selectedIds.length !== 1 || tool === 'SELECT') return null;
      
      const selectedId = selectedIds[0];
      const worldPos = sceneGraph.getWorldPosition(selectedId);
      const worldMatrix = sceneGraph.getWorldMatrix(selectedId);
      if (!worldMatrix) return null;

      const normalize = (v: Vector3) => {
          const l = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
          return l > 0 ? {x: v.x/l, y: v.y/l, z: v.z/l} : v;
      };
      
      const xAxis = normalize({ x: worldMatrix[0], y: worldMatrix[1], z: worldMatrix[2] });
      const yAxis = normalize({ x: worldMatrix[4], y: worldMatrix[5], z: worldMatrix[6] });
      const zAxis = normalize({ x: worldMatrix[8], y: worldMatrix[9], z: worldMatrix[10] });

      const camPos = getCameraPosition();
      const dist = Math.sqrt(
          Math.pow(camPos.x - worldPos.x, 2) + 
          Math.pow(camPos.y - worldPos.y, 2) + 
          Math.pow(camPos.z - worldPos.z, 2)
      );
      const scale = dist * 0.15; 

      const pCenter = Mat4Utils.transformPoint(worldPos, vpMatrix, viewport.width, viewport.height);
      if (pCenter.w <= 0) return null;

      const axisLen = 1.0 * scale; 
      const handleLen = 0.3 * scale; 
      const origin = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
      
      const projectAxis = (axisVec: Vector3, len: number) => Mat4Utils.transformPoint(
          { 
              x: origin.x + axisVec.x * len, 
              y: origin.y + axisVec.y * len, 
              z: origin.z + axisVec.z * len 
          }, 
          vpMatrix, viewport.width, viewport.height
      );

      const axes = {
          x: projectAxis(xAxis, axisLen),
          y: projectAxis(yAxis, axisLen),
          z: projectAxis(zAxis, axisLen)
      };

      const startDrag = (e: React.MouseEvent, axis: Axis) => {
          e.stopPropagation();
          e.preventDefault();
          const entity = entities.find(e => e.id === selectedId);
          if (!entity) return;
          const transform = entity.components[ComponentType.TRANSFORM];
          
          let startValue = { x: 0, y: 0, z: 0 };
          if (tool === 'MOVE') startValue = { ...transform.position };
          else if (tool === 'ROTATE') startValue = { ...transform.rotation };
          else if (tool === 'SCALE') startValue = { ...transform.scale };

          let axisVector = { x: 1, y: 0, z: 0 };
          if (axis === 'X') axisVector = xAxis;
          if (axis === 'Y') axisVector = yAxis;
          if (axis === 'Z') axisVector = zAxis;

          let screenAxis = { x: 1, y: 0 };
          if (tool === 'MOVE' && ['X','Y','Z'].includes(axis)) {
              const target = axis === 'X' ? axes.x : axis === 'Y' ? axes.y : axes.z;
              const dx = target.x - pCenter.x;
              const dy = target.y - pCenter.y;
              const len = Math.sqrt(dx*dx+dy*dy);
              if (len > 0.001) screenAxis = { x: dx/len, y: dy/len };
          }
          
          let rotationStartAngle = 0;
          if (tool === 'ROTATE') {
               const rect = containerRef.current?.getBoundingClientRect();
               if(rect) {
                   const cx = rect.left + pCenter.x;
                   const cy = rect.top + pCenter.y;
                   rotationStartAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
               }
          }

          setGizmoDrag({
              axis,
              startX: e.clientX,
              startY: e.clientY,
              startValue,
              hasMoved: false,
              screenAxis,
              rotationStartAngle,
              axisVector
          });
      };

      const projectRing = (axis: 'X' | 'Y' | 'Z', radius: number, segments = 32) => {
          let u = xAxis, v = yAxis;
          if (axis === 'X') { u = yAxis; v = zAxis; } 
          if (axis === 'Y') { u = xAxis; v = zAxis; }
          if (axis === 'Z') { u = xAxis; v = yAxis; }

          const points: string[] = [];
          for (let i = 0; i <= segments; i++) {
              const theta = (i / segments) * Math.PI * 2;
              const c = Math.cos(theta) * radius;
              const s = Math.sin(theta) * radius;
              
              const pt = {
                  x: origin.x + u.x * c + v.x * s,
                  y: origin.y + u.y * c + v.y * s,
                  z: origin.z + u.z * c + v.z * s
              };
              
              const screen = Mat4Utils.transformPoint(pt, vpMatrix, viewport.width, viewport.height);
              points.push(`${screen.x},${screen.y}`);
          }
          return points.join(' ');
      };

      const renderPlaneHandle = (type: Axis, color: string) => {
          const scaleHandle = handleLen;
          const pOrigin = { ...origin };
          let p2 = { ...origin }, p3 = { ...origin }, p4 = { ...origin };

          if (type === 'XY') {
              p2 = { x: origin.x + xAxis.x * scaleHandle, y: origin.y + xAxis.y * scaleHandle, z: origin.z + xAxis.z * scaleHandle };
              p4 = { x: origin.x + yAxis.x * scaleHandle, y: origin.y + yAxis.y * scaleHandle, z: origin.z + yAxis.z * scaleHandle };
              p3 = { x: p2.x + yAxis.x * scaleHandle, y: p2.y + yAxis.y * scaleHandle, z: p2.z + yAxis.z * scaleHandle };
          } else if (type === 'XZ') {
              p2 = { x: origin.x + xAxis.x * scaleHandle, y: origin.y + xAxis.y * scaleHandle, z: origin.z + xAxis.z * scaleHandle };
              p4 = { x: origin.x + zAxis.x * scaleHandle, y: origin.y + zAxis.y * scaleHandle, z: origin.z + zAxis.z * scaleHandle };
              p3 = { x: p2.x + zAxis.x * scaleHandle, y: p2.y + zAxis.y * scaleHandle, z: p2.z + zAxis.z * scaleHandle };
          } else if (type === 'YZ') {
              p2 = { x: origin.x + yAxis.x * scaleHandle, y: origin.y + yAxis.y * scaleHandle, z: origin.z + yAxis.z * scaleHandle };
              p4 = { x: origin.x + zAxis.x * scaleHandle, y: origin.y + zAxis.y * scaleHandle, z: origin.z + zAxis.z * scaleHandle };
              p3 = { x: p2.x + zAxis.x * scaleHandle, y: p2.y + zAxis.y * scaleHandle, z: p2.z + zAxis.z * scaleHandle };
          }

          const s1 = Mat4Utils.transformPoint(pOrigin, vpMatrix, viewport.width, viewport.height);
          const s2 = Mat4Utils.transformPoint(p2, vpMatrix, viewport.width, viewport.height);
          const s3 = Mat4Utils.transformPoint(p3, vpMatrix, viewport.width, viewport.height);
          const s4 = Mat4Utils.transformPoint(p4, vpMatrix, viewport.width, viewport.height);

          const isActive = gizmoDrag?.axis === type;
          const isHover = hoverAxis === type;

          return (
              <path 
                  d={`M ${s1.x} ${s1.y} L ${s2.x} ${s2.y} L ${s3.x} ${s3.y} L ${s4.x} ${s4.y} Z`}
                  fill={color}
                  fillOpacity={isActive || isHover ? 0.8 : 0.4}
                  stroke={color}
                  strokeWidth={1}
                  className="cursor-pointer transition-opacity"
                  onMouseDown={(e) => startDrag(e, type)}
                  onMouseEnter={() => setHoverAxis(type)}
                  onMouseLeave={() => setHoverAxis(null)}
              />
          );
      };

      const renderAxisLine = (axis: Axis, color: string, endPoint: {x:number, y:number, w:number}) => {
          if (endPoint.w <= 0) return null;
          const isActive = gizmoDrag?.axis === axis;
          const isHover = hoverAxis === axis;
          const strokeColor = isActive || isHover ? '#ffffff' : color;
          const lineWidth = isActive || isHover ? 4 : 2;

          return (
              <g 
                  className="cursor-pointer group"
                  onMouseDown={(e) => startDrag(e, axis)}
                  onMouseEnter={() => setHoverAxis(axis)}
                  onMouseLeave={() => setHoverAxis(null)}
              >
                  <line x1={pCenter.x} y1={pCenter.y} x2={endPoint.x} y2={endPoint.y} stroke="transparent" strokeWidth={15} />
                  <line x1={pCenter.x} y1={pCenter.y} x2={endPoint.x} y2={endPoint.y} stroke={strokeColor} strokeWidth={lineWidth} />
                  
                  {tool === 'MOVE' && (
                      <polygon 
                          points={`${endPoint.x},${endPoint.y-5} ${endPoint.x-5},${endPoint.y+10} ${endPoint.x+5},${endPoint.y+10}`}
                          fill={strokeColor}
                          transform={`rotate(${Math.atan2(endPoint.y - pCenter.y, endPoint.x - pCenter.x) * 180 / Math.PI + 90}, ${endPoint.x}, ${endPoint.y})`}
                      />
                  )}
                  {tool === 'SCALE' && (
                      <rect 
                          x={endPoint.x - 4} y={endPoint.y - 4} width={8} height={8} 
                          fill={strokeColor}
                      />
                  )}
              </g>
          );
      };

      const renderRing = (axis: Axis, color: string) => {
          const isActive = gizmoDrag?.axis === axis;
          const isHover = hoverAxis === axis;
          const strokeColor = isActive || isHover ? '#fff' : color;
          const thickness = isActive || isHover ? 4 : 2;

          return (
              <polyline 
                  points={projectRing(axis as any, 1.0 * scale)} 
                  fill="none" 
                  stroke={strokeColor} 
                  strokeWidth={thickness} 
                  className="cursor-pointer" 
                  onMouseDown={(e) => startDrag(e, axis)}
                  onMouseEnter={() => setHoverAxis(axis)}
                  onMouseLeave={() => setHoverAxis(null)}
              />
          );
      };

      return (
          <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10">
              <g className="pointer-events-auto">
                {tool === 'MOVE' && (
                    <>
                        {renderPlaneHandle('XZ', '#22c55e')}
                        {renderPlaneHandle('XY', '#3b82f6')}
                        {renderPlaneHandle('YZ', '#ef4444')}
                    </>
                )}

                {tool === 'ROTATE' && (
                    <>
                         {renderRing('X', '#ef4444')}
                         {renderRing('Y', '#22c55e')}
                         {renderRing('Z', '#3b82f6')}
                         <circle cx={pCenter.x} cy={pCenter.y} r={30 * scale} fill="white" fillOpacity="0.05" className="pointer-events-none"/>
                    </>
                )}

                {(tool === 'MOVE' || tool === 'SCALE') && (
                    <>
                        {renderAxisLine('Z', '#3b82f6', axes.z)}
                        {renderAxisLine('Y', '#22c55e', axes.y)}
                        {renderAxisLine('X', '#ef4444', axes.x)}
                    </>
                )}

                {tool === 'SCALE' && (
                    <rect 
                        x={pCenter.x - 6} y={pCenter.y - 6} width={12} height={12} fill="white" 
                        className="cursor-pointer hover:fill-yellow-400"
                        onMouseDown={(e) => startDrag(e, 'UNIFORM')}
                        onMouseEnter={() => setHoverAxis('UNIFORM')}
                        onMouseLeave={() => setHoverAxis(null)}
                    />
                )}
                {tool !== 'SCALE' && (
                     <circle cx={pCenter.x} cy={pCenter.y} r={5} fill="white" className="pointer-events-none shadow-sm opacity-80"/>
                )}

              </g>
          </svg>
      );
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
        {renderGizmos()}
        {renderScaleIndicator()}
        
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