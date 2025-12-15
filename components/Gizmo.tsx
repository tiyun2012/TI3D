
import React from 'react';
import { Entity, ToolType, Vector3 } from '../types';
import { SceneGraph } from '../services/SceneGraph';
import { GizmoBasis, GizmoMath } from './gizmos/GizmoUtils';
import { TranslationGizmo } from './gizmos/TranslationGizmo';
import { RotationGizmo } from './gizmos/RotationGizmo';
import { ScaleGizmo } from './gizmos/ScaleGizmo';

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
  if (selectedIds.length !== 1 || tool === 'SELECT') return null;
  
  const selectedId = selectedIds[0];
  const entity = entities.find(e => e.id === selectedId);
  if (!entity) return null;

  const worldPos = sceneGraph.getWorldPosition(selectedId);
  const worldMatrix = sceneGraph.getWorldMatrix(selectedId);
  if (!worldMatrix) return null;

  // Calculate Basis Vectors from World Matrix
  const xAxis = GizmoMath.normalize({ x: worldMatrix[0], y: worldMatrix[1], z: worldMatrix[2] });
  const yAxis = GizmoMath.normalize({ x: worldMatrix[4], y: worldMatrix[5], z: worldMatrix[6] });
  const zAxis = GizmoMath.normalize({ x: worldMatrix[8], y: worldMatrix[9], z: worldMatrix[10] });

  // Determine Screen Scale
  const dist = Math.sqrt(
      Math.pow(cameraPosition.x - worldPos.x, 2) + 
      Math.pow(cameraPosition.y - worldPos.y, 2) + 
      Math.pow(cameraPosition.z - worldPos.z, 2)
  );
  const scale = dist * 0.15; 

  // Project Center to check visibility
  const pCenter = GizmoMath.project(worldPos, vpMatrix, viewport.width, viewport.height);
  if (pCenter.w <= 0) return null;

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
                <RotationGizmo entity={entity} basis={basis} vpMatrix={vpMatrix} viewport={viewport} containerRef={containerRef} />
            )}
            {tool === 'SCALE' && (
                <ScaleGizmo entity={entity} basis={basis} vpMatrix={vpMatrix} viewport={viewport} />
            )}
        </g>
      </svg>
  );
};
