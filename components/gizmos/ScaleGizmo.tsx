import React, { useState, useEffect, useContext, useRef, useMemo } from 'react';
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

interface DragData {
    axis: Axis;
    startScale: Vector3;
    startClientX: number;
    startClientY: number;
    
    // For Axis Scaling: The normalized 2D direction of the axis on screen
    screenAxisVector?: { x: number, y: number };
}

export const ScaleGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport }) => {
    const { gizmoConfig } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [isDragging, setIsDragging] = useState(false);

    // --- Refs for Stable Event Handling ---
    const dragRef = useRef<DragData | null>(null);
    
    // Store latest props to access them in event handlers without re-binding
    const stateRef = useRef({
        vpMatrix,
        viewport,
        basis
    });
    stateRef.current = { vpMatrix, viewport, basis };

    const { origin, xAxis, yAxis, zAxis, scale } = basis;
    const axisLen = 1.8 * scale;
    
    const project = (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height);
    const pCenter = project(origin);

    // --- Interaction Logic ---
    useEffect(() => {
        if (!isDragging) return;

        const handleMove = (e: MouseEvent) => {
            const dragData = dragRef.current;
            if (!dragData) return;

            const transform = entity.components[ComponentType.TRANSFORM];
            
            // Calculate Mouse Delta
            const dx = e.clientX - dragData.startClientX;
            const dy = e.clientY - dragData.startClientY;

            let scaleFactor = 0;

            // Strategy 1: Axis Projection (Best for 3D)
            if (dragData.screenAxisVector) {
                // Dot product to project mouse movement onto the screen axis line
                // Dividing by 100 provides a reasonable sensitivity
                scaleFactor = (dx * dragData.screenAxisVector.x + dy * dragData.screenAxisVector.y) * 0.01;
            } 
            // Strategy 2: Uniform / Fallback (Drag Right/Up to scale up)
            else {
                 scaleFactor = (dx - dy) * 0.01; 
            }

            const s = dragData.startScale;

            if (dragData.axis === 'UNIFORM') {
                const uni = Math.max(0.01, s.x + scaleFactor); 
                transform.scale.x = uni;
                transform.scale.y = uni;
                transform.scale.z = uni;
            } else if (dragData.axis === 'X') {
                transform.scale.x = Math.max(0.01, s.x + scaleFactor);
            } else if (dragData.axis === 'Y') {
                transform.scale.y = Math.max(0.01, s.y + scaleFactor);
            } else if (dragData.axis === 'Z') {
                transform.scale.z = Math.max(0.01, s.z + scaleFactor);
            }

            // Critical Fixes:
            // 1. Notify UI to update React state (Property Inspector, etc.)
            engineInstance.notifyUI();
            
            // 2. Force Engine Tick to update WebGL IMMEDIATELY (Fixes Trail)
            engineInstance.tick(0);
        };

        const handleUp = () => {
            setIsDragging(false);
            dragRef.current = null;
            engineInstance.pushUndoState();
            engineInstance.notifyUI();
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isDragging, entity]);

    const startDrag = (e: React.MouseEvent, axis: Axis) => {
        if (e.altKey) return;

        e.stopPropagation(); e.preventDefault();
        
        const transform = entity.components[ComponentType.TRANSFORM];
        const { vpMatrix, viewport, basis } = stateRef.current;

        // Calculate Screen-Space Axis Vector for intuitive dragging
        let screenAxisVector: { x: number, y: number } | undefined;
        
        if (axis !== 'UNIFORM') {
            const axisVec3 = axis === 'X' ? basis.xAxis : (axis === 'Y' ? basis.yAxis : basis.zAxis);
            
            // Project Origin and Tip to Screen
            const pOrigin = GizmoMath.project(basis.origin, vpMatrix, viewport.width, viewport.height);
            const pTip = GizmoMath.project(
                { x: basis.origin.x + axisVec3.x, y: basis.origin.y + axisVec3.y, z: basis.origin.z + axisVec3.z }, 
                vpMatrix, viewport.width, viewport.height
            );

            // Normalize vector pOrigin -> pTip
            const sx = pTip.x - pOrigin.x;
            const sy = pTip.y - pOrigin.y;
            const len = Math.sqrt(sx * sx + sy * sy);
            
            if (len > 0.001) {
                screenAxisVector = { x: sx / len, y: sy / len };
            }
        }

        dragRef.current = {
            axis,
            startClientX: e.clientX,
            startClientY: e.clientY,
            startScale: { ...transform.scale },
            screenAxisVector
        };
        
        setIsDragging(true);
    };

    // --- Volumetric Render Logic (Unchanged) ---
    const renderVolumetricMesh = (vertices: Vector3[], indices: number[][], color: string) => {
        const projected = vertices.map(v => {
            const p = project(v);
            return { x: p.x, y: p.y, z: p.z, w: p.w };
        });

        const faces = indices.map(idx => {
            let avgW = 0;
            idx.forEach(i => { avgW += projected[i].w; });
            avgW /= idx.length;
            const p0 = vertices[idx[0]]; const p1 = vertices[idx[1]]; const p2 = vertices[idx[2]];
            const v1 = GizmoMath.sub(p1, p0);
            const v2 = GizmoMath.sub(p2, p0);
            const normal = GizmoMath.normalize(GizmoMath.cross(v1, v2));
            return { indices: idx, depth: avgW, normal };
        });

        faces.sort((a, b) => b.depth - a.depth);

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
            return <polygon key={i} points={pts} fill={faceColor} stroke={faceColor} strokeWidth={0.5} strokeLinejoin="round" pointerEvents="none" />;
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
        const indices = [ [0, 1, 2, 3], [4, 7, 6, 5], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0] ];
        return renderVolumetricMesh(vertices, indices, color);
    };

    const renderHandle = (axis: Axis, vec: Vector3, color: string) => {
        const opacity = gizmoConfig.axisFadeWhenAligned 
            ? GizmoMath.getAxisOpacity(vec, basis.cameraPosition, origin)
            : 1.0;
        if (opacity < 0.1) return null;
        
        const isActive = dragRef.current?.axis === axis;
        const isHover = hoverAxis === axis;
        const finalColor = isActive || isHover ? GIZMO_COLORS.Hover : color;
        const handleSize = scale * 0.25; 

        const pTip = project({ x: origin.x + vec.x * axisLen, y: origin.y + vec.y * axisLen, z: origin.z + vec.z * axisLen });
        const stemEnd = { x: origin.x + vec.x * (axisLen - handleSize*0.5), y: origin.y + vec.y * (axisLen - handleSize*0.5), z: origin.z + vec.z * (axisLen - handleSize*0.5) };
        const sStemEnd = project(stemEnd);
        
        const baseThickness = gizmoConfig.axisBaseThickness;
        let strokeWidth = baseThickness;
        if (isActive) strokeWidth *= gizmoConfig.axisPressThicknessOffset;
        else if (isHover) strokeWidth *= gizmoConfig.axisHoverThicknessOffset;

        return (
            <g
                onMouseDown={(e) => startDrag(e, axis)}
                onMouseEnter={() => !isDragging && setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
                opacity={opacity}
            >
                <line x1={pCenter.x} y1={pCenter.y} x2={pTip.x} y2={pTip.y} stroke="transparent" strokeWidth={20} />
                <line x1={pCenter.x} y1={pCenter.y} x2={sStemEnd.x} y2={sStemEnd.y} stroke={finalColor} strokeWidth={strokeWidth} />
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
            
            <g
                onMouseDown={(e) => startDrag(e, 'UNIFORM')}
                onMouseEnter={() => !isDragging && setHoverAxis('UNIFORM')}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
            >
                 <circle cx={pCenter.x} cy={pCenter.y} r={15} fill="transparent" />
                 {renderCubeHandle(origin, scale * 0.25, (hoverAxis === 'UNIFORM' || dragRef.current?.axis === 'UNIFORM') ? GIZMO_COLORS.Hover : GIZMO_COLORS.Gray)}
            </g>
        </g>
    );
};