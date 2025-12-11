
import React, { useRef, useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { Entity, ComponentType, ToolType, Vector3 } from '../types';
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

export const SceneView: React.FC<SceneViewProps> = ({ entities, sceneGraph, onSelect, selectedIds, tool }) => {
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

  // Marquee Selection State
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
    screenAxis: { x: number, y: number }; // Normalized screen space vector for axis projection
    rotationStartAngle?: number; 
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
      engineInstance.setSelected(selectedIds);
  }, [selectedIds]);

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
       engineInstance.updateCamera(vpMatrix, width, height);
    }
  }, [vpMatrix, width, height]);

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

          // Scale sensitivity based on distance for consistent feel
          const worldPos = sceneGraph.getWorldPosition(selectedId);
          const camPos = getCameraPosition();
          const dist = Math.sqrt(
              Math.pow(camPos.x - worldPos.x, 2) + 
              Math.pow(camPos.y - worldPos.y, 2) + 
              Math.pow(camPos.z - worldPos.z, 2)
          );
          const factor = dist * 0.002; 

          if (tool === 'MOVE') {
              // Vector Projection Logic for Axis Move
              if (['X', 'Y', 'Z'].includes(gizmoDrag.axis)) {
                  // Project mouse delta onto the screen-space axis vector
                  const proj = dx * gizmoDrag.screenAxis.x + dy * gizmoDrag.screenAxis.y;
                  const moveAmount = proj * factor;

                  if (gizmoDrag.axis === 'X') transform.position.x = gizmoDrag.startValue.x + moveAmount;
                  if (gizmoDrag.axis === 'Y') transform.position.y = gizmoDrag.startValue.y + moveAmount;
                  if (gizmoDrag.axis === 'Z') transform.position.z = gizmoDrag.startValue.z + moveAmount;
              }
              // Plane Moves (Simplified 2D mapping)
              else if (gizmoDrag.axis === 'XZ') {
                  transform.position.x = gizmoDrag.startValue.x + dx * factor;
                  transform.position.z = gizmoDrag.startValue.z + dy * factor; // Y on screen maps to Z depth
              }
              else if (gizmoDrag.axis === 'XY') {
                  transform.position.x = gizmoDrag.startValue.x + dx * factor;
                  transform.position.y = gizmoDrag.startValue.y - dy * factor;
              }
              else if (gizmoDrag.axis === 'YZ') {
                  transform.position.z = gizmoDrag.startValue.z + dx * factor; // X on screen maps to Z
                  transform.position.y = gizmoDrag.startValue.y - dy * factor;
              }
          } 
          else if (tool === 'ROTATE' && gizmoDrag.rotationStartAngle !== undefined) {
             const rect = containerRef.current?.getBoundingClientRect();
             if (rect) {
                 // Calculate current angle based on mouse position relative to object center
                 const pCenter = Mat4Utils.transformPoint(worldPos, vpMatrix, width, height);
                 const cx = rect.left + pCenter.x;
                 const cy = rect.top + pCenter.y;
                 
                 const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
                 let delta = currentAngle - gizmoDrag.rotationStartAngle;
                 
                 if (e.shiftKey) {
                     const snap = Math.PI / 12; // 15 degrees
                     delta = Math.round(delta / snap) * snap;
                 }
                 
                 // Subtract delta for intuitive "trackball-like" feel
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
  }, [dragState, gizmoDrag, camera, selectedIds, tool, entities]);

  const handleWheel = (e: React.WheelEvent) => {
    setCamera(prev => ({ ...prev, radius: Math.max(2, prev.radius + e.deltaY * 0.01) }));
  };

  const renderGizmos = () => {
      if (selectedIds.length !== 1 || tool === 'SELECT') return null;
      
      const selectedId = selectedIds[0];
      const worldPos = sceneGraph.getWorldPosition(selectedId);
      
      // --- 1. Calculate View-Dependent Scale ---
      const camPos = getCameraPosition();
      const dist = Math.sqrt(
          Math.pow(camPos.x - worldPos.x, 2) + 
          Math.pow(camPos.y - worldPos.y, 2) + 
          Math.pow(camPos.z - worldPos.z, 2)
      );
      // Constant screen size factor
      const scale = dist * 0.15; 

      const pCenter = Mat4Utils.transformPoint(worldPos, vpMatrix, width, height);
      if (pCenter.w <= 0) return null;

      // Axis length in World Units, scaled by distance
      const axisLen = 1.0 * scale; 
      const handleLen = 0.3 * scale; // For Planar handles
      const origin = { x: worldPos.x, y: worldPos.y, z: worldPos.z };
      
      // Calculate Axis End Points (World Space -> Screen Space)
      const project = (offset: Vector3) => Mat4Utils.transformPoint(
          { x: origin.x + offset.x, y: origin.y + offset.y, z: origin.z + offset.z }, 
          vpMatrix, width, height
      );

      const axes = {
          x: project({ x: axisLen, y: 0, z: 0 }),
          y: project({ x: 0, y: axisLen, z: 0 }),
          z: project({ x: 0, y: 0, z: axisLen })
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

          // Store current mouse projection for improved dragging feel
          let screenAxis = { x: 1, y: 0 };
          if (tool === 'MOVE' && ['X','Y','Z'].includes(axis)) {
              const target = axis === 'X' ? axes.x : axis === 'Y' ? axes.y : axes.z;
              const dx = target.x - pCenter.x;
              const dy = target.y - pCenter.y;
              const len = Math.sqrt(dx*dx+dy*dy);
              if (len > 0.001) screenAxis = { x: dx/len, y: dy/len };
          }
          
          // Calculate initial angle for Rotation Tool
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
              rotationStartAngle
          });
      };

      // --- Helper: Project Circle Ring ---
      const projectRing = (axis: 'X' | 'Y' | 'Z', radius: number, segments = 32) => {
          const points: string[] = [];
          for (let i = 0; i <= segments; i++) {
              const theta = (i / segments) * Math.PI * 2;
              let pt = { x: 0, y: 0, z: 0 };
              if (axis === 'X') pt = { x: 0, y: Math.cos(theta) * radius, z: Math.sin(theta) * radius };
              if (axis === 'Y') pt = { x: Math.cos(theta) * radius, y: 0, z: Math.sin(theta) * radius };
              if (axis === 'Z') pt = { x: Math.cos(theta) * radius, y: Math.sin(theta) * radius, z: 0 };
              
              const world = { x: origin.x + pt.x, y: origin.y + pt.y, z: origin.z + pt.z };
              const screen = Mat4Utils.transformPoint(world, vpMatrix, width, height);
              points.push(`${screen.x},${screen.y}`);
          }
          return points.join(' ');
      };

      // --- Helper: Render Plane Handle ---
      const renderPlaneHandle = (type: Axis, color: string) => {
          // Calculate corners of the plane handle in World Space
          const p1 = { ...origin }; // Origin
          const p2 = { ...origin }; // Axis A endpoint
          const p3 = { ...origin }; // Corner
          const p4 = { ...origin }; // Axis B endpoint

          if (type === 'XY') {
              p2.x += handleLen; p3.x += handleLen; p3.y += handleLen; p4.y += handleLen;
          } else if (type === 'XZ') {
              p2.x += handleLen; p3.x += handleLen; p3.z += handleLen; p4.z += handleLen;
          } else if (type === 'YZ') {
              p2.y += handleLen; p3.y += handleLen; p3.z += handleLen; p4.z += handleLen;
          }

          const s1 = Mat4Utils.transformPoint(p1, vpMatrix, width, height);
          const s2 = Mat4Utils.transformPoint(p2, vpMatrix, width, height);
          const s3 = Mat4Utils.transformPoint(p3, vpMatrix, width, height);
          const s4 = Mat4Utils.transformPoint(p4, vpMatrix, width, height);

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
                  {/* Invisible fat line for easier clicking */}
                  <line x1={pCenter.x} y1={pCenter.y} x2={endPoint.x} y2={endPoint.y} stroke="transparent" strokeWidth={15} />
                  
                  {/* Visible Line */}
                  <line x1={pCenter.x} y1={pCenter.y} x2={endPoint.x} y2={endPoint.y} stroke={strokeColor} strokeWidth={lineWidth} />
                  
                  {/* Cone Tip for Move Tool */}
                  {tool === 'MOVE' && (
                      <polygon 
                          points={`${endPoint.x},${endPoint.y-5} ${endPoint.x-5},${endPoint.y+10} ${endPoint.x+5},${endPoint.y+10}`}
                          fill={strokeColor}
                          transform={`rotate(${Math.atan2(endPoint.y - pCenter.y, endPoint.x - pCenter.x) * 180 / Math.PI + 90}, ${endPoint.x}, ${endPoint.y})`}
                      />
                  )}
                  {/* Cube Tip for Scale Tool */}
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
                {/* 1. Planes (Draw first so they are behind lines usually) */}
                {tool === 'MOVE' && (
                    <>
                        {renderPlaneHandle('XZ', '#22c55e')}
                        {renderPlaneHandle('XY', '#3b82f6')}
                        {renderPlaneHandle('YZ', '#ef4444')}
                    </>
                )}

                {/* 2. Rotation Rings */}
                {tool === 'ROTATE' && (
                    <>
                         {renderRing('X', '#ef4444')}
                         {renderRing('Y', '#22c55e')}
                         {renderRing('Z', '#3b82f6')}
                         {/* Semi-transparent inner sphere hint */}
                         <circle cx={pCenter.x} cy={pCenter.y} r={30 * scale} fill="white" fillOpacity="0.05" className="pointer-events-none"/>
                    </>
                )}

                {/* 3. Axis Lines */}
                {(tool === 'MOVE' || tool === 'SCALE') && (
                    <>
                        {renderAxisLine('Z', '#3b82f6', axes.z)}
                        {renderAxisLine('Y', '#22c55e', axes.y)}
                        {renderAxisLine('X', '#ef4444', axes.x)}
                    </>
                )}

                {/* 4. Center Handle */}
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
                 <button className="p-1 hover:text-white rounded hover:bg-white/10"><Icon name="Grid" size={14} /></button>
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
