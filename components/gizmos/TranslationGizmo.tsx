
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { Entity, ComponentType, Vector3 } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis, ColorUtils } from './GizmoUtils';
import { EditorContext } from '../../contexts/EditorContext';
import { Mat4Utils } from '../../services/math';

interface Props {
    entity: Entity;
    basis: GizmoBasis;
    vpMatrix: Float32Array;
    viewport: { width: number; height: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

export const TranslationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport, containerRef }) => {
    const { gizmoConfig, transformSpace } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [dragState, setDragState] = useState<{
        axis: Axis;
        startX: number;
        startY: number;
        startPos: Vector3;
        screenAxis: { x: number, y: number };
        cameraBasis?: { right: Vector3, up: Vector3 };
        axisVector?: Vector3;
        // Plane specific
        planeNormal?: Vector3;
        planeHitOffset?: Vector3;
    } | null>(null);

    // --- Invert Matrix for Raycasting ---
    const invViewProj = useMemo(() => {
        const m = new Float32Array(16);
        return Mat4Utils.invert(vpMatrix, m) || m;
    }, [vpMatrix]);

    // --- Compute Effective Basis based on Transform Space ---
    const effectiveBasis = useMemo(() => {
        if (transformSpace === 'World') {
            return {
                ...basis,
                xAxis: { x: 1, y: 0, z: 0 },
                yAxis: { x: 0, y: 1, z: 0 },
                zAxis: { x: 0, y: 0, z: 1 }
            };
        }
        return basis; // Default is Local from Gizmo props
    }, [basis, transformSpace]);

    const { origin, xAxis, yAxis, zAxis, scale } = effectiveBasis;
    
    // Apply Arrow Offset Configuration
    const axisLen = 1.8 * scale * gizmoConfig.arrowOffset;
    
    const transform = entity.components[ComponentType.TRANSFORM];

    const project = (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height);
    
    const pCenter = project(origin);
    const pX = project({ x: origin.x + xAxis.x * axisLen, y: origin.y + xAxis.y * axisLen, z: origin.z + xAxis.z * axisLen });
    const pY = project({ x: origin.x + yAxis.x * axisLen, y: origin.y + yAxis.y * axisLen, z: origin.z + yAxis.z * axisLen });
    const pZ = project({ x: origin.x + zAxis.x * axisLen, y: origin.y + zAxis.y * axisLen, z: origin.z + zAxis.z * axisLen });

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!dragState) return;

            // Handle Plane Dragging (XY, XZ, YZ)
            if (['XY', 'XZ', 'YZ'].includes(dragState.axis) && dragState.planeNormal && dragState.planeHitOffset && containerRef?.current) {
                const rect = containerRef.current.getBoundingClientRect();
                const ray = GizmoMath.screenToRay(
                    e.clientX - rect.left, 
                    e.clientY - rect.top, 
                    viewport.width, viewport.height, 
                    invViewProj, basis.cameraPosition
                );
                
                // Intersect with plane at original origin
                const hit = GizmoMath.rayPlaneIntersection(ray.origin, ray.direction, origin, dragState.planeNormal);
                
                if (hit) {
                    // New position is hit point minus the initial offset
                    const newPos = GizmoMath.sub(hit, dragState.planeHitOffset);
                    transform.position.x = newPos.x;
                    transform.position.y = newPos.y;
                    transform.position.z = newPos.z;
                    engineInstance.notifyUI();
                }
                return;
            }

            // Handle View/Screen Dragging
            const dx = e.clientX - dragState.startX;
            const dy = e.clientY - dragState.startY;
            
            // Distance Factor for Screen Space moves
            const dist = Math.sqrt(
                Math.pow(basis.cameraPosition.x - origin.x, 2) + 
                Math.pow(basis.cameraPosition.y - origin.y, 2) + 
                Math.pow(basis.cameraPosition.z - origin.z, 2)
            );
            const factor = dist * 0.002;

            if (dragState.axis === 'VIEW' && dragState.cameraBasis) {
                // Free Move: Move parallel to view plane
                const { right, up } = dragState.cameraBasis;
                transform.position.x = dragState.startPos.x + (right.x * dx - up.x * dy) * factor;
                transform.position.y = dragState.startPos.y + (right.y * dx - up.y * dy) * factor;
                transform.position.z = dragState.startPos.z + (right.z * dx - up.z * dy) * factor;
            } else {
                // Single Axis Projection
                const proj = dx * dragState.screenAxis.x + dy * dragState.screenAxis.y;
                const moveAmount = proj * factor;
                
                if (dragState.axisVector) {
                    transform.position.x = dragState.startPos.x + dragState.axisVector.x * moveAmount;
                    transform.position.y = dragState.startPos.y + dragState.axisVector.y * moveAmount;
                    transform.position.z = dragState.startPos.z + dragState.axisVector.z * moveAmount;
                }
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
    }, [dragState, transform, basis, origin, invViewProj, viewport, containerRef]);

    const startDrag = (e: React.MouseEvent, axis: Axis) => {
        // Priority Fix: Allow Alt+LMB to pass through for Camera Orbit
        if (e.altKey) return;

        e.stopPropagation(); e.preventDefault();
        
        let screenAxis = { x: 1, y: 0 };
        let axisVector: Vector3 | undefined;
        let planeNormal: Vector3 | undefined;
        let planeHitOffset: Vector3 | undefined;

        if (axis === 'X' || axis === 'Y' || axis === 'Z') {
            const target = axis === 'X' ? pX : axis === 'Y' ? pY : pZ;
            const dx = target.x - pCenter.x;
            const dy = target.y - pCenter.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len > 0.001) screenAxis = { x: dx/len, y: dy/len };
            
            axisVector = axis === 'X' ? xAxis : (axis === 'Y' ? yAxis : zAxis);
        } else if (['XY', 'XZ', 'YZ'].includes(axis) && containerRef?.current) {
            // Setup Plane Dragging
            planeNormal = axis === 'XY' ? zAxis : (axis === 'XZ' ? yAxis : xAxis);
            
            const rect = containerRef.current.getBoundingClientRect();
            const ray = GizmoMath.screenToRay(
                e.clientX - rect.left, 
                e.clientY - rect.top, 
                viewport.width, viewport.height, 
                invViewProj, basis.cameraPosition
            );
            
            const hit = GizmoMath.rayPlaneIntersection(ray.origin, ray.direction, origin, planeNormal);
            if (hit) {
                // Calculate offset from current entity position to hit point
                // This ensures we drag relative to where we clicked
                planeHitOffset = GizmoMath.sub(hit, transform.position);
            } else {
                return; // Missed plane (shouldn't happen if clicked on visual)
            }
        }

        // Calculate Camera Basis for Free Move
        let cameraBasis;
        if (axis === 'VIEW') {
            const viewDir = GizmoMath.normalize(GizmoMath.sub(origin, basis.cameraPosition));
            const worldUp = { x: 0, y: 1, z: 0 };
            let right = GizmoMath.cross(viewDir, worldUp);
            if (GizmoMath.dot(right, right) < 0.001) right = { x: 1, y: 0, z: 0 }; // Gimbal lock fallback
            right = GizmoMath.normalize(right);
            const up = GizmoMath.normalize(GizmoMath.cross(right, viewDir));
            cameraBasis = { right, up };
        }

        setDragState({
            axis,
            startX: e.clientX,
            startY: e.clientY,
            startPos: { ...transform.position },
            screenAxis,
            cameraBasis,
            axisVector,
            planeNormal,
            planeHitOffset
        });
    };

    // --- Volumetric Geometry Helper (Same as previous) ---
    const renderVolumetricMesh = (
        vertices: Vector3[],
        indices: number[][],
        color: string,
        opacityMultiplier: number = 1.0,
        enableShading: boolean = true
    ) => {
        const projected = vertices.map(v => {
            const p = project(v);
            return { x: p.x, y: p.y, z: p.z, w: p.w, world: v };
        });

        const faces = indices.map(idx => {
            let avgW = 0;
            idx.forEach(i => { avgW += projected[i].w; });
            avgW /= idx.length;
            const p0 = vertices[idx[0]];
            const p1 = vertices[idx[1]];
            const p2 = vertices[idx[2]];
            const v1 = GizmoMath.sub(p1, p0);
            const v2 = GizmoMath.sub(p2, p0);
            const normal = GizmoMath.normalize(GizmoMath.cross(v1, v2));
            return { indices: idx, depth: avgW, normal };
        });

        faces.sort((a, b) => b.depth - a.depth);
        const lightDir = GizmoMath.normalize({ x: 1, y: 1, z: 1 }); // Simplified lighting

        return faces.map((face, i) => {
            let faceColor = color;
            if (enableShading) {
                let intensity = Math.max(0, GizmoMath.dot(face.normal, lightDir));
                intensity = 0.4 + intensity * 0.6; 
                const brightness = Math.floor((intensity - 0.5) * 50);
                faceColor = ColorUtils.shade(color, brightness);
            }
            const pts = face.indices.map(idx => `${projected[idx].x},${projected[idx].y}`).join(' ');
            return <polygon key={i} points={pts} fill={faceColor} stroke={faceColor} strokeWidth={0.5} fillOpacity={opacityMultiplier} strokeLinejoin="round" pointerEvents="none" />;
        });
    };

    // Render Helpers (Arrow, Plane, Center) - Reuse logic but use `effectiveBasis`
    const renderCenterHandle = () => {
        if (gizmoConfig.centerHandleShape === 'NONE') return null;
        const size = scale * 0.15 * gizmoConfig.centerHandleSize;
        const isActive = dragState?.axis === 'VIEW';
        const isHover = hoverAxis === 'VIEW';
        const baseColor = gizmoConfig.centerHandleColor;
        const color = isActive ? gizmoConfig.axisPressColor : (isHover ? baseColor : baseColor);
        const opacity = isActive || isHover ? 1.0 : 0.9;

        if (gizmoConfig.centerHandleShape === 'QUAD_CIRCLES') {
             const r = 18 * gizmoConfig.centerHandleSize;
             return (
                <g onMouseDown={(e) => startDrag(e, 'VIEW')} onMouseEnter={() => setHoverAxis('VIEW')} onMouseLeave={() => setHoverAxis(null)} className="cursor-move" style={{ transform: `translate(${pCenter.x}px, ${pCenter.y}px)` }}>
                   <circle cx={0} cy={0} r={r} fill={color} fillOpacity={isActive ? 0.3 : 0.1} stroke={color} strokeWidth={2} />
                </g>
             );
        }
        
        let vertices: Vector3[] = [];
        let indices: number[][] = [];
        
        // IMPORTANT: Align vertices to the effective basis (Local or World)
        const toWorld = (u: number, v: number, w: number) => ({
            x: origin.x + (xAxis.x * u + yAxis.x * v + zAxis.x * w) * size,
            y: origin.y + (xAxis.y * u + yAxis.y * v + zAxis.y * w) * size,
            z: origin.z + (xAxis.z * u + yAxis.z * v + zAxis.z * w) * size,
        });

        // CUBE Default
        vertices = [ toWorld(-1,-1,-1), toWorld(1,-1,-1), toWorld(1,1,-1), toWorld(-1,1,-1), toWorld(-1,-1,1), toWorld(1,-1,1), toWorld(1,1,1), toWorld(-1,1,1) ];
        indices = [ [0,1,2,3], [4,7,6,5], [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0] ];

        return (
            <g onMouseDown={(e) => startDrag(e, 'VIEW')} onMouseEnter={() => setHoverAxis('VIEW')} onMouseLeave={() => setHoverAxis(null)} className="cursor-move">
                <circle cx={pCenter.x} cy={pCenter.y} r={20} fill="transparent" />
                {renderVolumetricMesh(vertices, indices, color, opacity, true)}
            </g>
        );
    };

    const renderArrowHead = (axis: Axis, baseCenter: Vector3, direction: Vector3, up: Vector3, right: Vector3, color: string) => {
        const headWidth = scale * 0.15 * gizmoConfig.arrowSize;
        const headLength = scale * 0.35 * gizmoConfig.arrowSize;
        let vertices: Vector3[] = [];
        let indices: number[][] = [];
        const toWorld = (u: number, v: number, w: number) => ({
            x: baseCenter.x + (right.x * u * headWidth) + (up.x * v * headWidth) + (direction.x * w * headLength),
            y: baseCenter.y + (right.y * u * headWidth) + (up.y * v * headWidth) + (direction.y * w * headLength),
            z: baseCenter.z + (right.z * u * headWidth) + (up.z * v * headWidth) + (direction.z * w * headLength),
        });

        // CONE Default
        const segs = 8;
        for(let i=0; i<segs; i++) {
            const theta = (i/segs) * Math.PI * 2;
            vertices.push(toWorld(Math.cos(theta), Math.sin(theta), 0));
        }
        vertices.push(toWorld(0, 0, 1));
        indices.push([7,6,5,4,3,2,1,0]);
        for(let i=0; i<segs; i++) indices.push([i, (i+1)%segs, 8]);

        return renderVolumetricMesh(vertices, indices, color);
    };

    const renderArrow = (axis: Axis, tipPos: any, baseColor: string, vec: Vector3, up: Vector3, right: Vector3) => {
        const opacity = gizmoConfig.axisFadeWhenAligned 
            ? GizmoMath.getAxisOpacity(vec, basis.cameraPosition, origin)
            : 1.0;
            
        if (opacity < 0.1) return null;
        
        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;
        const strokeWidth = gizmoConfig.axisBaseThickness * (isActive ? gizmoConfig.axisPressThicknessOffset : (isHover ? gizmoConfig.axisHoverThicknessOffset : 1));
        const finalColor = isActive ? gizmoConfig.axisPressColor : (isHover ? gizmoConfig.axisHoverColor : baseColor);
        const stemLen = axisLen * 0.82;
        const pBase = { x: origin.x + vec.x * stemLen, y: origin.y + vec.y * stemLen, z: origin.z + vec.z * stemLen };
        const sBase = project(pBase);

        return (
            <g onMouseDown={(e) => startDrag(e, axis)} onMouseEnter={() => setHoverAxis(axis)} onMouseLeave={() => setHoverAxis(null)} className="cursor-pointer" opacity={opacity}>
                <line x1={pCenter.x} y1={pCenter.y} x2={tipPos.x} y2={tipPos.y} stroke="transparent" strokeWidth={20} />
                <line x1={pCenter.x} y1={pCenter.y} x2={sBase.x} y2={sBase.y} stroke={finalColor} strokeWidth={strokeWidth} />
                {renderArrowHead(axis, pBase, vec, up, right, finalColor)}
            </g>
        );
    };

    const renderPlane = (axis: Axis, col: string, u: Vector3, v: Vector3, normal: Vector3) => {
        // Calculate opacity based on viewing angle
        const opacityFactor = gizmoConfig.axisFadeWhenAligned 
            ? GizmoMath.getPlaneOpacity(normal, basis.cameraPosition, origin)
            : 1.0;

        if (opacityFactor < 0.1) return null;

        const dist = scale * gizmoConfig.planeOffset; // Use Configured Offset
        const size = scale * 0.2 * gizmoConfig.planeHandleSize;
        const pos = { x: origin.x + (u.x + v.x) * dist, y: origin.y + (u.y + v.y) * dist, z: origin.z + (u.z + v.z) * dist };
        const p1 = pos;
        const p2 = { x: pos.x + u.x * size, y: pos.y + u.y * size, z: pos.z + u.z * size };
        const p3 = { x: pos.x + u.x * size + v.x * size, y: pos.y + u.y * size + v.y * size, z: pos.z + u.z * size + v.z * size };
        const p4 = { x: pos.x + v.x * size, y: pos.y + v.y * size, z: pos.z + v.z * size };
        const [pp1, pp2, pp3, pp4] = [p1, p2, p3, p4].map(project);
        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;

        return (
            <polygon 
                points={`${pp1.x},${pp1.y} ${pp2.x},${pp2.y} ${pp3.x},${pp3.y} ${pp4.x},${pp4.y}`} 
                fill={col} 
                fillOpacity={(isActive || isHover ? 0.8 : 0.3) * opacityFactor} 
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
            {renderPlane('XY', GIZMO_COLORS.Z, xAxis, yAxis, zAxis)}
            {renderPlane('XZ', GIZMO_COLORS.Y, xAxis, zAxis, yAxis)}
            {renderPlane('YZ', GIZMO_COLORS.X, yAxis, zAxis, xAxis)}
            {renderArrow('Z', pZ, GIZMO_COLORS.Z, zAxis, xAxis, yAxis)}
            {renderArrow('Y', pY, GIZMO_COLORS.Y, yAxis, zAxis, xAxis)}
            {renderArrow('X', pX, GIZMO_COLORS.X, xAxis, yAxis, zAxis)}
            {renderCenterHandle()}
        </g>
    );
};
