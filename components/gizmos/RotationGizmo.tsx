
import React, { useState, useEffect } from 'react';
import { Entity, ComponentType, Vector3 } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis } from './GizmoUtils';

interface Props {
    entity: Entity;
    basis: GizmoBasis;
    vpMatrix: Float32Array;
    viewport: { width: number; height: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export const RotationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport, containerRef }) => {
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [dragState, setDragState] = useState<{
        axis: Axis;
        startRotation: Vector3;
        startAngle: number;
        axisVector: Vector3;
    } | null>(null);

    const { origin, xAxis, yAxis, zAxis, scale } = basis;
    const transform = entity.components[ComponentType.TRANSFORM];
    const project = (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height);
    const pCenter = project(origin);

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!dragState || !containerRef.current) return;

            const rect = containerRef.current.getBoundingClientRect();
            const cx = rect.left + pCenter.x;
            const cy = rect.top + pCenter.y;
            
            const currentAngle = Math.atan2(e.clientY - cy, e.clientX - cx);
            let delta = currentAngle - dragState.startAngle;

            // Correct rotation direction based on camera view
            const viewDir = {
                x: basis.cameraPosition.x - origin.x,
                y: basis.cameraPosition.y - origin.y,
                z: basis.cameraPosition.z - origin.z
            };
            const dot = viewDir.x * dragState.axisVector.x + viewDir.y * dragState.axisVector.y + viewDir.z * dragState.axisVector.z;
            if (dot < 0) delta = -delta;

            // Shift to snap
            if (e.shiftKey) {
                const snap = Math.PI / 12; // 15 degrees
                delta = Math.round(delta / snap) * snap;
            }

            const v = dragState.startRotation;
            if (dragState.axis === 'X') transform.rotation.x = v.x - delta;
            if (dragState.axis === 'Y') transform.rotation.y = v.y - delta;
            if (dragState.axis === 'Z') transform.rotation.z = v.z - delta;

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
    }, [dragState, transform, basis, origin, pCenter, containerRef]);

    const startDrag = (e: React.MouseEvent, axis: Axis, axisVector: Vector3) => {
        e.stopPropagation(); e.preventDefault();
        
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const cx = rect.left + pCenter.x;
        const cy = rect.top + pCenter.y;
        const startAngle = Math.atan2(e.clientY - cy, e.clientX - cx);

        setDragState({
            axis,
            startRotation: { ...transform.rotation },
            startAngle,
            axisVector
        });
    };

    const renderRing = (axis: Axis, axisVec: Vector3, u: Vector3, v: Vector3, color: string) => {
        const opacity = Math.abs(GizmoMath.getAxisOpacity(axisVec, basis.cameraPosition, origin));
        // Fade in when looking parallel to axis (inverse of translation arrows)
        // Actually rings are best seen when looking DOWN the axis? No, rings are best seen when looking perpendicular.
        // Current logic: dot product with view. If 1 (parallel view), we see circle. If 0 (perp), we see line.
        // Let's use simple logic: always visible but handle z-ordering?
        // Let's stick to simple implementation:
        
        const radius = 1.2 * scale;
        const segments = 48;
        let points = "";

        for (let i = 0; i <= segments; i++) {
            const theta = (i / segments) * Math.PI * 2;
            const c = Math.cos(theta) * radius;
            const s = Math.sin(theta) * radius;
            const pt = {
                x: origin.x + u.x * c + v.x * s,
                y: origin.y + u.y * c + v.y * s,
                z: origin.z + u.z * c + v.z * s
            };
            const sc = project(pt);
            points += `${sc.x},${sc.y} `;
        }

        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;

        return (
            <g
                onMouseDown={(e) => startDrag(e, axis, axisVec)}
                onMouseEnter={() => setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                opacity={isActive || isHover ? 1 : 0.8}
            >
                {/* Thick invisible hit line */}
                <polyline points={points} fill="none" stroke="transparent" strokeWidth={12} className="cursor-pointer" />
                {/* Visible Ring */}
                <polyline 
                    points={points} 
                    fill="none" 
                    stroke={isActive || isHover ? "white" : color} 
                    strokeWidth={isActive || isHover ? 3 : 2} 
                    className="cursor-pointer"
                />
            </g>
        );
    };

    return (
        <g>
            {/* Background sphere hint */}
            <circle cx={pCenter.x} cy={pCenter.y} r={1.2 * scale} fill="white" fillOpacity="0.05" className="pointer-events-none"/>
            
            {renderRing('X', xAxis, yAxis, zAxis, GIZMO_COLORS.X)}
            {renderRing('Y', yAxis, xAxis, zAxis, GIZMO_COLORS.Y)}
            {renderRing('Z', zAxis, xAxis, yAxis, GIZMO_COLORS.Z)}
        </g>
    );
};
