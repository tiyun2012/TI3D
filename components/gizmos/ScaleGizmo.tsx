
import React, { useState, useEffect, useContext } from 'react';
import { Entity, ComponentType, Vector3 } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis } from './GizmoUtils';
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

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!dragState) return;

            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            const delta = (dx - dy) * 0.01; // Simplified scaling logic
            
            const s = dragState.startScale;

            if (dragState.axis === 'UNIFORM') {
                transform.scale.x = s.x + delta;
                transform.scale.y = s.y + delta;
                transform.scale.z = s.z + delta;
            }
            if (dragState.axis === 'X') transform.scale.x = s.x + delta;
            if (dragState.axis === 'Y') transform.scale.y = s.y + delta; // Y screen is inverted relative to up usually
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

    const renderHandle = (axis: Axis, vec: Vector3, color: string) => {
        const opacity = GizmoMath.getAxisOpacity(vec, basis.cameraPosition, origin);
        if (opacity < 0.1) return null;
        
        const pTip = project({ 
            x: origin.x + vec.x * axisLen, 
            y: origin.y + vec.y * axisLen, 
            z: origin.z + vec.z * axisLen 
        });

        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;
        const finalColor = isActive || isHover ? GIZMO_COLORS.Hover : color;

        // Apply Interaction Configuration (Thickness with Offsets)
        const baseThickness = gizmoConfig.axisBaseThickness;
        let strokeWidth = baseThickness;
        if (isActive) strokeWidth = baseThickness * gizmoConfig.axisPressThicknessOffset;
        else if (isHover) strokeWidth = baseThickness * gizmoConfig.axisHoverThicknessOffset;

        return (
            <g
                onMouseDown={(e) => startDrag(e, axis)}
                onMouseEnter={() => setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
                opacity={opacity}
            >
                <line x1={pCenter.x} y1={pCenter.y} x2={pTip.x} y2={pTip.y} stroke="transparent" strokeWidth={20} />
                <line x1={pCenter.x} y1={pCenter.y} x2={pTip.x} y2={pTip.y} stroke={finalColor} strokeWidth={strokeWidth} />
                <rect 
                    x={pTip.x - 6} y={pTip.y - 6} 
                    width={12} height={12} 
                    fill={finalColor} stroke="black" strokeWidth={1} 
                />
            </g>
        );
    };

    return (
        <g>
            {renderHandle('X', xAxis, GIZMO_COLORS.X)}
            {renderHandle('Y', yAxis, GIZMO_COLORS.Y)}
            {renderHandle('Z', zAxis, GIZMO_COLORS.Z)}
            
            {/* Center Uniform Scale Handle */}
            <rect 
                x={pCenter.x - 6} y={pCenter.y - 6} width={12} height={12} 
                fill={GIZMO_COLORS.Gray}
                stroke="black"
                className="cursor-pointer hover:fill-white"
                onMouseDown={(e) => startDrag(e, 'UNIFORM')}
            />
        </g>
    );
};
