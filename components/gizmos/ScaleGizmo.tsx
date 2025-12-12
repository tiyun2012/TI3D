
import React, { useState, useEffect, useContext } from 'react';
import { Entity, ComponentType, Vector3 } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis, ColorUtils } from './GizmoUtils';
import { EditorContext } from '../../contexts/EditorContext';

interface Props {
    entity: Entity;
    basis: GizmoBasis;
    vpMatrix: Float32Array;
    viewport: { width: number; height: number };
}

export const ScaleGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport }) => {
    const { gizmoConfig } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [dragState, setDragState] = useState<{
        axis: Axis;
        startX: number;
        startY: number;
        startScale: Vector3;
    } | null>(null);

    const { origin, xAxis, yAxis, zAxis, scale } = basis;
    const axisLen = 1.8 * scale;
    const transform = entity.components[ComponentType.TRANSFORM];
    const project = (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height);
    const pCenter = project(origin);

    // --- Interaction Logic ---
    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!dragState) return;

            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            // Uniform scaling feel based on screen distance
            const delta = (dx - dy) * 0.01; 
            
            const s = dragState.startScale;

            if (dragState.axis === 'UNIFORM') {
                const uni = Math.max(0.01, s.x + delta); 
                transform.scale.x = uni;
                transform.scale.y = uni;
                transform.scale.z = uni;
            }
            // Axis specific scale
            if (dragState.axis === 'X') transform.scale.x = s.x + delta;
            if (dragState.axis === 'Y') transform.scale.y = s.y + delta;
            if (dragState.axis === 'Z') transform.scale.z = s.z + delta;

            engineInstance.notifyUI();
        };

        const handleUp = () => {
            if (dragState) {
                engineInstance.pushUndoState();
                setDragState(null);
            }
        };

        if (dragState) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragState, transform]);

    const startDrag = (e: React.MouseEvent, axis: Axis) => {
        e.stopPropagation(); e.preventDefault();
        setDragState({
            axis,
            startX: e.clientX,
            startY: e.clientY,
            startScale: { ...transform.scale }
        });
    };

    // --- Volumetric Render Logic ---
    const renderVolumetricMesh = (vertices: Vector3[], indices: number[][], color: string) => {
        const projected = vertices.map(v => {
            const p = project(v);
            return { x: p.x, y: p.y, z: p.z, w: p.w };
        });

        // Compute Face Depth for Sorting
        const faces = indices.map(idx => {
            let avgW = 0;
            idx.forEach(i => { avgW += projected[i].w; });
            avgW /= idx.length;
            
            // Compute Normal for Lighting
            const p0 = vertices[idx[0]];
            const p1 = vertices[idx[1]];
            const p2 = vertices[idx[2]];
            const v1 = GizmoMath.sub(p1, p0);
            const v2 = GizmoMath.sub(p2, p0);
            const normal = GizmoMath.normalize(GizmoMath.cross(v1, v2));
            
            return { indices: idx, depth: avgW, normal };
        });

        faces.sort((a, b) => b.depth - a.depth);

        // Simple Lighting
        const lightDir = GizmoMath.normalize({ 
            x: basis.cameraPosition.x - origin.x + 2, 
            y: basis.cameraPosition.y - origin.y + 5, 
            z: basis.cameraPosition.z - origin.z + 2 
        });

        return faces.map((face, i) => {
            let intensity = Math.max(0, GizmoMath.dot(face.normal, lightDir));
            intensity = 0.5 + intensity * 0.5;
            const brightness = Math.floor((intensity - 0.5) * 40);
            const faceColor = ColorUtils.shade(color, brightness);

            const pts = face.indices.map(idx => `${projected[idx].x},${projected[idx].y}`).join(' ');
            return (
                <polygon 
                    key={i} points={pts} fill={faceColor} stroke={faceColor} strokeWidth={0.5} 
                    strokeLinejoin="round" pointerEvents="none"
                />
            );
        });
    };

    const renderCubeHandle = (center: Vector3, size: number, color: string) => {
        const s = size * 0.5;
        const vertices = [
            { x: center.x - s, y: center.y - s, z: center.z - s },
            { x: center.x + s, y: center.y - s, z: center.z - s },
            { x: center.x + s, y: center.y + s, z: center.z - s },
            { x: center.x - s, y: center.y + s, z: center.z - s },
            { x: center.x - s, y: center.y - s, z: center.z + s },
            { x: center.x + s, y: center.y - s, z: center.z + s },
            { x: center.x + s, y: center.y + s, z: center.z + s },
            { x: center.x - s, y: center.y + s, z: center.z + s },
        ];
        const indices = [
            [0, 1, 2, 3], // Front
            [4, 7, 6, 5], // Back
            [0, 4, 5, 1], // Bottom
            [1, 5, 6, 2], // Right
            [2, 6, 7, 3], // Top
            [3, 7, 4, 0]  // Left
        ];
        return renderVolumetricMesh(vertices, indices, color);
    };

    const renderHandle = (axis: Axis, vec: Vector3, color: string) => {
        const opacity = GizmoMath.getAxisOpacity(vec, basis.cameraPosition, origin);
        if (opacity < 0.1) return null;
        
        // Handle Logic
        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;
        const finalColor = isActive || isHover ? GIZMO_COLORS.Hover : color;
        const handleSize = scale * 0.25; 

        // Stem Logic
        const pTip = project({ x: origin.x + vec.x * axisLen, y: origin.y + vec.y * axisLen, z: origin.z + vec.z * axisLen });
        const stemEnd = { x: origin.x + vec.x * (axisLen - handleSize*0.5), y: origin.y + vec.y * (axisLen - handleSize*0.5), z: origin.z + vec.z * (axisLen - handleSize*0.5) };
        const sStemEnd = project(stemEnd);

        // Configurable thickness
        const baseThickness = gizmoConfig.axisBaseThickness;
        let strokeWidth = baseThickness;
        if (isActive) strokeWidth *= gizmoConfig.axisPressThicknessOffset;
        else if (isHover) strokeWidth *= gizmoConfig.axisHoverThicknessOffset;

        return (
            <g
                onMouseDown={(e) => startDrag(e, axis)}
                onMouseEnter={() => setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
                opacity={opacity}
            >
                {/* Hit Box */}
                <line x1={pCenter.x} y1={pCenter.y} x2={pTip.x} y2={pTip.y} stroke="transparent" strokeWidth={20} />
                
                {/* Visible Stem */}
                <line x1={pCenter.x} y1={pCenter.y} x2={sStemEnd.x} y2={sStemEnd.y} stroke={finalColor} strokeWidth={strokeWidth} />
                
                {/* 3D Cube Tip */}
                {renderCubeHandle({
                    x: origin.x + vec.x * axisLen,
                    y: origin.y + vec.y * axisLen,
                    z: origin.z + vec.z * axisLen
                }, handleSize, finalColor)}
            </g>
        );
    };

    return (
        <g>
            {renderHandle('X', xAxis, GIZMO_COLORS.X)}
            {renderHandle('Y', yAxis, GIZMO_COLORS.Y)}
            {renderHandle('Z', zAxis, GIZMO_COLORS.Z)}
            
            {/* Center Uniform Scale */}
            <g
                onMouseDown={(e) => startDrag(e, 'UNIFORM')}
                onMouseEnter={() => setHoverAxis('UNIFORM')}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
            >
                 <circle cx={pCenter.x} cy={pCenter.y} r={15} fill="transparent" />
                 {renderCubeHandle(origin, scale * 0.25, (hoverAxis === 'UNIFORM' || dragState?.axis === 'UNIFORM') ? GIZMO_COLORS.Hover : GIZMO_COLORS.Gray)}
            </g>
        </g>
    );
};
