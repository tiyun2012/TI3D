import React, { useEffect, useRef, useState } from 'react';
import { Entity, ToolType, Vector3 } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { GizmoBasis, GizmoMath } from './gizmos/GizmoUtils';
import { TranslationGizmo } from './gizmos/TranslationGizmo';
import { RotationGizmo } from './gizmos/RotationGizmo';
import { ScaleGizmo } from './gizmos/ScaleGizmo';
import { engineInstance } from '../services/engine'; // Import engine to access latest matrices directly if needed

import './Gizmo.css';

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
  // We use a local state to force re-renders when the engine updates,
  // independent of the parent React component's render cycle.
  const [, setTick] = useState(0);
  const lastMatrixRef = useRef<Float32Array | null>(null);
  const rAFRef = useRef<number>(0);

  // --- Synchronization Loop ---
  useEffect(() => {
    if (selectedIds.length !== 1) return;
    const selectedId = selectedIds[0];

    const checkUpdate = () => {
      // 1. Get the authoritative World Matrix from SceneGraph
      // This calculates the fresh matrix even if dirty flags are set
      const currentMat = sceneGraph.getWorldMatrix(selectedId);
      
      if (currentMat) {
        // 2. Check if it differs from what we last rendered
        // We compare the translation elements (12, 13, 14) and scale/rot diagonals roughly
        // or just reference comparison if the Float32Array instance changes (SceneGraph usually returns a view)
        // Since SceneGraph returns a subarray, we should compare values.
        let hasChanged = false;
        if (!lastMatrixRef.current) {
            hasChanged = true;
            lastMatrixRef.current = new Float32Array(16);
        }
        
        // Fast comparison
        const last = lastMatrixRef.current!;
        for(let i=0; i<16; i++) {
            if (Math.abs(last[i] - currentMat[i]) > 0.0001) {
                hasChanged = true;
                break;
            }
        }

        // 3. If changed, force React to update the SVG this very frame
        if (hasChanged) {
           lastMatrixRef.current!.set(currentMat);
           setTick(t => t + 1);
        }
      }
      
      rAFRef.current = requestAnimationFrame(checkUpdate);
    };

    rAFRef.current = requestAnimationFrame(checkUpdate);

    return () => {
        if (rAFRef.current) cancelAnimationFrame(rAFRef.current);
    };
  }, [selectedIds, sceneGraph]); // Re-bind only if selection changes

  // --- Render Logic ---

  if (selectedIds.length !== 1 || tool === 'SELECT') return null;
  
  const selectedId = selectedIds[0];
  const entity = entities.find(e => e.id === selectedId);
  if (!entity) return null;

  // Always fetch fresh position during render
  const worldPos = sceneGraph.getWorldPosition(selectedId);
  const worldMatrix = sceneGraph.getWorldMatrix(selectedId);
  if (!worldMatrix) return null;

  // Calculate Basis Vectors from World Matrix
  // We use the fresh worldMatrix we just fetched
  const xAxis = GizmoMath.normalize({ x: worldMatrix[0], y: worldMatrix[1], z: worldMatrix[2] });
  const yAxis = GizmoMath.normalize({ x: worldMatrix[4], y: worldMatrix[5], z: worldMatrix[6] });
  const zAxis = GizmoMath.normalize({ x: worldMatrix[8], y: worldMatrix[9], z: worldMatrix[10] });

  // Determine Screen Scale
  const dist = Math.sqrt(
      Math.pow(cameraPosition.x - worldPos.x, 2) + 
      Math.pow(cameraPosition.y - worldPos.y, 2) + 
      Math.pow(cameraPosition.z - worldPos.z, 2)
  );
  
  // Safety check to prevent NaN/Infinity scale
  const safeDist = dist > 0 ? dist : 0.01;
  const scale = safeDist * 0.15; 

  // Project Center to check visibility
  const pCenter = GizmoMath.project(worldPos, vpMatrix, viewport.width, viewport.height);
  
  // Clip if behind camera
  if (pCenter.w <= 0.1) return null;

  const basis: GizmoBasis = {
      origin: worldPos,
      xAxis, yAxis, zAxis,
      scale,
      cameraPosition
  };

  return (
      <svg className="absolute inset-0 w-full h-full pointer-events-none overflow-visible z-10">
        <g className="pointer-events-auto">
            {tool === 'MOVE' && (
                <TranslationGizmo 
                    entity={entity} 
                    basis={basis} 
                    vpMatrix={vpMatrix} 
                    viewport={viewport} 
                    containerRef={containerRef} 
                />
            )}
            {tool === 'ROTATE' && (
                <RotationGizmo 
                    entity={entity} 
                    basis={basis} 
                    vpMatrix={vpMatrix} 
                    viewport={viewport} 
                    containerRef={containerRef} 
                />
            )}
            {tool === 'SCALE' && (
                <ScaleGizmo 
                    entity={entity} 
                    basis={basis} 
                    vpMatrix={vpMatrix} 
                    viewport={viewport} 
                />
            )}
        </g>
      </svg>
  );
};