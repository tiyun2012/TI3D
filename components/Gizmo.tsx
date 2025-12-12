
import React, { useState, useEffect } from 'react';
import { Entity, ComponentType, ToolType, Vector3 } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { Mat4Utils } from '../services/math';
import { engineInstance } from '../services/engine';

interface GizmoProps {
  entities: Entity[];
  sceneGraph: SceneGraph;
  selectedIds: string[];
  tool: ToolType;
  vpMatrix: Float32Array;
  viewport: { width: number; height: number };
  cameraPosition: Vector3;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

type Axis = 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ' | 'UNIFORM';

export const Gizmo: React.FC<GizmoProps> = ({
  entities,
  sceneGraph,
  selectedIds,
  tool,
  vpMatrix,
  viewport,
  cameraPosition,
  containerRef
}) => {
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
          const dist = Math.sqrt(
              Math.pow(cameraPosition.x - worldPos.x, 2) + 
              Math.pow(cameraPosition.y - worldPos.y, 2) + 
              Math.pow(cameraPosition.z - worldPos.z, 2)
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
                     x: cameraPosition.x - worldPos.x, 
                     y: cameraPosition.y - worldPos.y, 
                     z: cameraPosition.z - worldPos.z 
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
    };

    const handleWindowMouseUp = () => {
        if (gizmoDrag) {
            if (gizmoDrag.hasMoved) {
                engineInstance.pushUndoState();
            }
            setGizmoDrag(null);
        }
    };

    if (gizmoDrag) {
      window.addEventListener('mousemove', handleWindowMouseMove);
      window.addEventListener('mouseup', handleWindowMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', handleWindowMouseMove);
      window.removeEventListener('mouseup', handleWindowMouseUp);
    };
  }, [gizmoDrag, selectedIds, entities, vpMatrix, viewport, sceneGraph, tool, cameraPosition, containerRef]);

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

  const dist = Math.sqrt(
      Math.pow(cameraPosition.x - worldPos.x, 2) + 
      Math.pow(cameraPosition.y - worldPos.y, 2) + 
      Math.pow(cameraPosition.z - worldPos.z, 2)
  );
  const scale = dist * 0.15; 

  const pCenter = Mat4Utils.transformPoint(worldPos, vpMatrix, viewport.width, viewport.height);
  if (pCenter.w <= 0) return null;

  // Increase axis length by 1.5x (was 1.0 * scale)
  const axisLen = 1.5 * scale; 
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

  const renderPlaneBracket = (type: Axis, axis1: Vector3, axis2: Vector3, color: string) => {
      const dist = 0.25 * scale;
      const size = 0.15 * scale; 
      
      const corner = {
          x: origin.x + (axis1.x + axis2.x) * dist,
          y: origin.y + (axis1.y + axis2.y) * dist,
          z: origin.z + (axis1.z + axis2.z) * dist
      };

      const p1 = {
          x: corner.x - axis2.x * size,
          y: corner.y - axis2.y * size,
          z: corner.z - axis2.z * size
      };
      const p2 = {
          x: corner.x - axis1.x * size,
          y: corner.y - axis1.y * size,
          z: corner.z - axis1.z * size
      };
      
      const hitP1 = Mat4Utils.transformPoint({
            x: origin.x + axis1.x * dist,
            y: origin.y + axis1.y * dist,
            z: origin.z + axis1.z * dist
        }, vpMatrix, viewport.width, viewport.height);

      const hitP2 = Mat4Utils.transformPoint({
            x: origin.x + axis2.x * dist,
            y: origin.y + axis2.y * dist,
            z: origin.z + axis2.z * dist
        }, vpMatrix, viewport.width, viewport.height);

      const sCorner = Mat4Utils.transformPoint(corner, vpMatrix, viewport.width, viewport.height);
      const s1 = Mat4Utils.transformPoint(p1, vpMatrix, viewport.width, viewport.height);
      const s2 = Mat4Utils.transformPoint(p2, vpMatrix, viewport.width, viewport.height);
      const sOrigin = Mat4Utils.transformPoint(origin, vpMatrix, viewport.width, viewport.height);

      if (sCorner.w <= 0 || s1.w <= 0 || s2.w <= 0) return null;

      const isActive = gizmoDrag?.axis === type;
      const isHover = hoverAxis === type;
      const finalColor = isActive || isHover ? '#ffffff' : color;
      const strokeWidth = isActive || isHover ? 2.5 : 1.2;

      return (
          <g 
              onMouseDown={(e) => startDrag(e, type)}
              onMouseEnter={() => setHoverAxis(type)}
              onMouseLeave={() => setHoverAxis(null)}
              className="cursor-pointer"
          >
              <path 
                  d={`M ${sOrigin.x} ${sOrigin.y} L ${hitP1.x} ${hitP1.y} L ${sCorner.x} ${sCorner.y} L ${hitP2.x} ${hitP2.y} Z`} 
                  fill={color} 
                  stroke="none"
                  fillOpacity={isActive || isHover ? 0.4 : 0.01} 
              />
              <polyline 
                  points={`${s1.x},${s1.y} ${sCorner.x},${sCorner.y} ${s2.x},${s2.y}`}
                  fill="none"
                  stroke={finalColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="round"
                  strokeLinejoin="round"
              />
          </g>
      );
  };

  const renderAxisHandle = (axis: Axis, color: string, endPoint: {x:number, y:number, w:number}, type: 'ARROW' | 'CUBE') => {
      if (endPoint.w <= 0) return null;
      const isActive = gizmoDrag?.axis === axis;
      const isHover = hoverAxis === axis;
      const strokeColor = isActive || isHover ? '#ffffff' : color;
      
      const angle = Math.atan2(endPoint.y - pCenter.y, endPoint.x - pCenter.x) * 180 / Math.PI;

      return (
          <g 
              className="cursor-pointer group"
              onMouseDown={(e) => startDrag(e, axis)}
              onMouseEnter={() => setHoverAxis(axis)}
              onMouseLeave={() => setHoverAxis(null)}
          >
              <line x1={pCenter.x} y1={pCenter.y} x2={endPoint.x} y2={endPoint.y} stroke="transparent" strokeWidth={15} />
              <line x1={pCenter.x} y1={pCenter.y} x2={endPoint.x} y2={endPoint.y} stroke={strokeColor} strokeWidth={1} />
              
              <g transform={`translate(${endPoint.x}, ${endPoint.y}) rotate(${angle})`}>
                {type === 'ARROW' && (
                    // Smaller, cone-like 3D arrow shape
                    <polygon points="0,0 -10,-4 -10,4" fill={strokeColor} />
                )}
                {type === 'CUBE' && (
                    <rect x="-8" y="-4" width="8" height="8" fill={strokeColor} stroke="none" />
                )}
              </g>
          </g>
      );
  };

  const renderRing = (axis: Axis, color: string) => {
      const isActive = gizmoDrag?.axis === axis;
      const isHover = hoverAxis === axis;
      const strokeColor = isActive || isHover ? '#fff' : color;
      const thickness = isActive || isHover ? 2.5 : 1.5;

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

  const renderScaleIndicator = () => {
      if (tool !== 'SCALE' || !gizmoDrag) return null;
      const entity = entities.find(e => e.id === selectedId);
      if (!entity) return null;
      const { scale } = entity.components[ComponentType.TRANSFORM];
      
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

  return (
      <>
        <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10">
            <g className="pointer-events-auto">
                {tool === 'MOVE' && (
                    <>
                        {renderPlaneBracket('XY', xAxis, yAxis, '#ffff00')}
                        {renderPlaneBracket('XZ', xAxis, zAxis, '#ff00ff')}
                        {renderPlaneBracket('YZ', yAxis, zAxis, '#00ffff')}
                    </>
                )}

                {tool === 'ROTATE' && (
                    <>
                         {renderRing('X', '#ef4444')}
                         {renderRing('Y', '#0adb50')}
                         {renderRing('Z', '#3b82f6')}
                         <circle cx={pCenter.x} cy={pCenter.y} r={30 * scale} fill="white" fillOpacity="0.05" className="pointer-events-none"/>
                    </>
                )}

                {(tool === 'MOVE' || tool === 'SCALE') && (
                    <>
                        {renderAxisHandle('Z', '#3b82f6', axes.z, tool === 'MOVE' ? 'ARROW' : 'CUBE')}
                        {renderAxisHandle('Y', '#0adb50', axes.y, tool === 'MOVE' ? 'ARROW' : 'CUBE')}
                        {renderAxisHandle('X', '#ef4444', axes.x, tool === 'MOVE' ? 'ARROW' : 'CUBE')}
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
            </g>
        </svg>
        {renderScaleIndicator()}
      </>
  );
};
