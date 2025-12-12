
import React, { useState, useEffect } from 'react';
import { Entity, ComponentType, Vector3 } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis } from './GizmoUtils';

interface Props {
    entity: Entity;
    basis: GizmoBasis;
    vpMatrix: Float32Array;
    viewport: { width: number; height: number };
}

export const TranslationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport }) => {
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [dragState, setDragState] = useState<{
        axis: Axis;
        startX: number;
        startY: number;
        startPos: Vector3;
        screenAxis: { x: number, y: number };
    } | null>(null);

    const { origin, xAxis, yAxis, zAxis, scale } = basis;
    const axisLen = 1.8 * scale;
    const transform = entity.components[ComponentType.TRANSFORM];

    // Project origin and axis tips for screen-space calculations
    const project = (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height);
    
    const pCenter = project(origin);
    const pX = project({ x: origin.x + xAxis.x * axisLen, y: origin.y + xAxis.y * axisLen, z: origin.z + xAxis.z * axisLen });
    const pY = project({ x: origin.x + yAxis.x * axisLen, y: origin.y + yAxis.y * axisLen, z: origin.z + yAxis.z * axisLen });
    const pZ = project({ x: origin.x + zAxis.x * axisLen, y: origin.y + zAxis.y * axisLen, z: origin.z + zAxis.z * axisLen });

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!dragState) return;

            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            
            // Screen space projection logic
            const proj = dx * dragState.screenAxis.x + dy * dragState.screenAxis.y;
            
            // Distance Factor: How much world movement per screen pixel?
            // Heuristic based on distance to camera
            const dist = Math.sqrt(
                Math.pow(basis.cameraPosition.x - origin.x, 2) + 
                Math.pow(basis.cameraPosition.y - origin.y, 2) + 
                Math.pow(basis.cameraPosition.z - origin.z, 2)
            );
            const factor = dist * 0.002;

            if (dragState.axis === 'XZ') {
                transform.position.x = dragState.startPos.x + dx * factor;
                transform.position.z = dragState.startPos.z + dy * factor;
            } else if (dragState.axis === 'XY') {
                transform.position.x = dragState.startPos.x + dx * factor;
                transform.position.y = dragState.startPos.y - dy * factor;
            } else if (dragState.axis === 'YZ') {
                transform.position.z = dragState.startPos.z + dx * factor;
                transform.position.y = dragState.startPos.y - dy * factor;
            } else {
                // Single Axis
                const moveAmount = proj * factor;
                if (dragState.axis === 'X') transform.position.x = dragState.startPos.x + moveAmount;
                if (dragState.axis === 'Y') transform.position.y = dragState.startPos.y + moveAmount;
                if (dragState.axis === 'Z') transform.position.z = dragState.startPos.z + moveAmount;
            }
            
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
    }, [dragState, transform, basis, origin]);

    const startDrag = (e: React.MouseEvent, axis: Axis) => {
        e.stopPropagation();
        e.preventDefault();

        // Calculate screen-space axis vector for 1D dragging
        let screenAxis = { x: 1, y: 0 };
        if (axis === 'X' || axis === 'Y' || axis === 'Z') {
            const target = axis === 'X' ? pX : axis === 'Y' ? pY : pZ;
            const dx = target.x - pCenter.x;
            const dy = target.y - pCenter.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len > 0.001) screenAxis = { x: dx/len, y: dy/len };
        }

        setDragState({
            axis,
            startX: e.clientX,
            startY: e.clientY,
            startPos: { ...transform.position },
            screenAxis
        });
    };

    const renderArrow = (axis: Axis, tipPos: any, color: string, vec: Vector3, up: Vector3, right: Vector3) => {
        const opacity = GizmoMath.getAxisOpacity(vec, basis.cameraPosition, origin);
        if (opacity < 0.1) return null;

        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;
        const finalColor = isActive || isHover ? GIZMO_COLORS.Hover : color;

        // 3D Arrow Construction
        const stemLen = axisLen * 0.82;
        const headWidth = scale * 0.15;
        
        const pBase = { x: origin.x + vec.x * stemLen, y: origin.y + vec.y * stemLen, z: origin.z + vec.z * stemLen };
        const sBase = project(pBase);
        const sTip = tipPos;

        // "Fins" for volumetric head
        const mkFin = (vOffset: Vector3) => project({
            x: pBase.x + vOffset.x * headWidth,
            y: pBase.y + vOffset.y * headWidth,
            z: pBase.z + vOffset.z * headWidth
        });
        
        const f1 = mkFin(up);
        const f2 = mkFin({x: -up.x, y: -up.y, z: -up.z});
        const f3 = mkFin(right);
        const f4 = mkFin({x: -right.x, y: -right.y, z: -right.z});

        return (
            <g
                onMouseDown={(e) => startDrag(e, axis)}
                onMouseEnter={() => setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
                opacity={opacity}
            >
                {/* Hit Box */}
                <line x1={pCenter.x} y1={pCenter.y} x2={sTip.x} y2={sTip.y} stroke="transparent" strokeWidth={20} />
                
                {/* Visuals */}
                <line x1={pCenter.x} y1={pCenter.y} x2={sBase.x} y2={sBase.y} stroke={finalColor} strokeWidth={isActive ? 4 : 2} />
                <polygon points={`${f1.x},${f1.y} ${f2.x},${f2.y} ${sTip.x},${sTip.y}`} fill={finalColor} />
                <polygon points={`${f3.x},${f3.y} ${f4.x},${f4.y} ${sTip.x},${sTip.y}`} fill={finalColor} />
            </g>
        );
    };

    const renderPlane = (axis: Axis, col: string, u: Vector3, v: Vector3) => {
        const offset = scale * 0.5;
        const start = { 
            x: origin.x + (u.x + v.x) * offset * 0.5, 
            y: origin.y + (u.y + v.y) * offset * 0.5, 
            z: origin.z + (u.z + v.z) * offset * 0.5 
        };
        const uVec = { x: u.x * offset, y: u.y * offset, z: u.z * offset };
        const vVec = { x: v.x * offset, y: v.y * offset, z: v.z * offset };

        const p1 = project(start);
        const p2 = project({ x: start.x + uVec.x, y: start.y + uVec.y, z: start.z + uVec.z });
        const p3 = project({ x: start.x + uVec.x + vVec.x, y: start.y + uVec.y + vVec.y, z: start.z + uVec.z + vVec.z });
        const p4 = project({ x: start.x + vVec.x, y: start.y + vVec.y, z: start.z + vVec.z });

        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;

        return (
            <polygon
                points={`${p1.x},${p1.y} ${p2.x},${p2.y} ${p3.x},${p3.y} ${p4.x},${p4.y}`}
                fill={col}
                fillOpacity={isActive || isHover ? 0.8 : 0.3}
                stroke={isActive || isHover ? "white" : "none"}
                onMouseDown={(e) => startDrag(e, axis)}
                onMouseEnter={() => setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
            />
        );
    };

    return (
        <g>
            {renderPlane('XY', GIZMO_COLORS.Z, xAxis, yAxis)}
            {renderPlane('XZ', GIZMO_COLORS.Y, xAxis, zAxis)}
            {renderPlane('YZ', GIZMO_COLORS.X, yAxis, zAxis)}

            {renderArrow('Z', pZ, GIZMO_COLORS.Z, zAxis, xAxis, yAxis)}
            {renderArrow('Y', pY, GIZMO_COLORS.Y, yAxis, zAxis, xAxis)}
            {renderArrow('X', pX, GIZMO_COLORS.X, xAxis, yAxis, zAxis)}
        </g>
    );
};
