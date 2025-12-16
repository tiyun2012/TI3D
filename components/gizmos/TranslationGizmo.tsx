import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { Entity, ComponentType, Vector3 } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis, ColorUtils } from './GizmoUtils';
import { EditorContext } from '../../contexts/EditorContext';
import { Mat4Utils, Vec3Utils } from '../../services/math';

interface Props {
    entity: Entity;
    basis: GizmoBasis;
    vpMatrix: Float32Array;
    viewport: { width: number; height: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

// Data needed during the drag operation (Mutable, does not trigger renders)
interface DragData {
    axis: Axis;
    startWorldPos: Vector3;    // Object position at start
    startHit: Vector3;         // Exact point on the ray/plane where we clicked
    invParentMatrix: Float32Array;
    
    // Intersection Geometry
    planeNormal: Vector3;
    planeOrigin: Vector3;
    axisVector?: Vector3;      // Defined if dragging X, Y, or Z
}

export const TranslationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport, containerRef }) => {
    const { gizmoConfig, transformSpace } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    
    // --- State: Controls the Lifecycle ---
    const [isDragging, setIsDragging] = useState(false);
    
    // --- State: Visual Feedback ---
    // We use this local state to render the gizmo at the mouse position immediately, 
    // bypassing the laggy prop-update loop from the engine.
    const [visualPos, setVisualPos] = useState<Vector3 | null>(null);

    // --- Refs: Stable Data Storage ---
    // Stores the static data for the current drag (calculated once at mousedown)
    const dragRef = useRef<DragData | null>(null);

    // Stores the LATEST external props (Camera, Viewport) so the event listener can read them 
    // without needing to be re-bound.
    const stateRef = useRef({ 
        invViewProj: new Float32Array(16), 
        cameraPosition: basis.cameraPosition, 
        viewport 
    });

    // --- Memoized Calculations ---
    const invViewProj = useMemo(() => {
        const m = new Float32Array(16);
        return Mat4Utils.invert(vpMatrix, m) || m;
    }, [vpMatrix]);

    // Update the State Ref every render
    stateRef.current = { invViewProj, cameraPosition: basis.cameraPosition, viewport };

    const effectiveBasis = useMemo(() => {
        if (transformSpace === 'World') {
            return {
                ...basis,
                xAxis: { x: 1, y: 0, z: 0 },
                yAxis: { x: 0, y: 1, z: 0 },
                zAxis: { x: 0, y: 0, z: 1 }
            };
        }
        return basis;
    }, [basis, transformSpace]);

    // Use Visual Position if dragging, otherwise use the Entity's actual position
    const origin = (isDragging && visualPos) ? visualPos : effectiveBasis.origin;
    const { xAxis, yAxis, zAxis, scale } = effectiveBasis;
    const axisLen = 1.8 * scale * gizmoConfig.arrowOffset;
    
    // Projectors
    const project = (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height);
    const pCenter = project(origin);
    const pX = project({ x: origin.x + xAxis.x * axisLen, y: origin.y + xAxis.y * axisLen, z: origin.z + xAxis.z * axisLen });
    const pY = project({ x: origin.x + yAxis.x * axisLen, y: origin.y + yAxis.y * axisLen, z: origin.z + yAxis.z * axisLen });
    const pZ = project({ x: origin.x + zAxis.x * axisLen, y: origin.y + zAxis.y * axisLen, z: origin.z + zAxis.z * axisLen });

    // --- Event Logic ---
    useEffect(() => {
        if (!isDragging) return;

        const handleMove = (e: MouseEvent) => {
            const dragData = dragRef.current;
            if (!dragData || !containerRef?.current) return;

            // 1. Access latest camera state from Ref (Fast, no re-bind)
            const { invViewProj, cameraPosition, viewport } = stateRef.current;

            const rect = containerRef.current.getBoundingClientRect();
            const ray = GizmoMath.screenToRay(
                e.clientX - rect.left, 
                e.clientY - rect.top, 
                viewport.width, viewport.height, 
                invViewProj, cameraPosition
            );

            // 2. Intersect with the Static Drag Plane
            const hit = GizmoMath.rayPlaneIntersection(ray.origin, ray.direction, dragData.planeOrigin, dragData.planeNormal);

            if (hit) {
                // 3. Calculate Delta (Hit - StartHit)
                let delta = GizmoMath.sub(hit, dragData.startHit);

                // 4. Apply Axis Constraints
                if (dragData.axisVector) {
                    const proj = GizmoMath.dot(delta, dragData.axisVector);
                    delta = GizmoMath.scale(dragData.axisVector, proj);
                }

                // 5. Calculate New World Position
                const targetWorldPos = GizmoMath.add(dragData.startWorldPos, delta);

                // 6. Update ECS (The Source of Truth)
                const transform = entity.components[ComponentType.TRANSFORM];
                const targetLocal = Vec3Utils.create();
                Vec3Utils.transformMat4(targetWorldPos, dragData.invParentMatrix, targetLocal);
                
                transform.position.x = targetLocal.x;
                transform.position.y = targetLocal.y;
                transform.position.z = targetLocal.z;

                // 7. CRITICAL: Force Engine Render Immediately
                // This prevents the "Object Trail" by syncing the 3D view in the same frame as the mouse event.
                engineInstance.syncTransforms();
                engineInstance.tick(0); 

                // 8. Update Local Visuals (Fixes Gizmo Trail)
                setVisualPos(targetWorldPos);
            }
        };

        const handleUp = () => {
            setIsDragging(false);
            setVisualPos(null);
            dragRef.current = null;
            engineInstance.pushUndoState();
            engineInstance.notifyUI(); // Final sync
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isDragging, entity, containerRef]); // Dependencies are stable!

    const startDrag = (e: React.MouseEvent, axis: Axis) => {
        if (e.altKey) return; 
        e.stopPropagation(); e.preventDefault();
        
        const startWorldPos = { ...effectiveBasis.origin }; 
        
        // Parent Matrix Calculation
        const parentId = engineInstance.sceneGraph.getParentId(entity.id);
        const parentMat = Mat4Utils.create();
        if (parentId) {
            const pm = engineInstance.sceneGraph.getWorldMatrix(parentId);
            if (pm) Mat4Utils.copy(parentMat, pm);
        }
        const invParentMatrix = Mat4Utils.create();
        Mat4Utils.invert(parentMat, invParentMatrix);

        // Plane Setup
        let axisVector: Vector3 | undefined;
        let planeNormal: Vector3 = { x: 0, y: 1, z: 0 };
        
        if (containerRef?.current) {
             const rect = containerRef.current.getBoundingClientRect();
             const ray = GizmoMath.screenToRay(
                e.clientX - rect.left, 
                e.clientY - rect.top, 
                viewport.width, viewport.height, 
                invViewProj, basis.cameraPosition
            );

            // Determine best plane for dragging
            if (axis === 'X' || axis === 'Y' || axis === 'Z') {
                axisVector = axis === 'X' ? xAxis : (axis === 'Y' ? yAxis : zAxis);
                const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, startWorldPos));
                
                // Choose the axis-plane most perpendicular to the camera
                const n1 = axis === 'X' ? yAxis : (axis === 'Y' ? zAxis : xAxis);
                const n2 = axis === 'X' ? zAxis : (axis === 'Y' ? xAxis : yAxis);
                const dot1 = Math.abs(GizmoMath.dot(viewDir, n1));
                const dot2 = Math.abs(GizmoMath.dot(viewDir, n2));
                planeNormal = dot1 > dot2 ? n1 : n2;
            } 
            else if (['XY', 'XZ', 'YZ'].includes(axis)) {
                planeNormal = axis === 'XY' ? zAxis : (axis === 'XZ' ? yAxis : xAxis);
            } 
            else if (axis === 'VIEW') {
                planeNormal = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, startWorldPos));
            }

            const startHit = GizmoMath.rayPlaneIntersection(ray.origin, ray.direction, startWorldPos, planeNormal);

            if (startHit) {
                dragRef.current = {
                    axis,
                    startWorldPos,
                    startHit,
                    invParentMatrix,
                    planeNormal,
                    planeOrigin: startWorldPos,
                    axisVector
                };
                setVisualPos(startWorldPos);
                setIsDragging(true);
            }
        }
    };

    // --- Render Helpers (Identical Visuals) ---
    const renderVolumetricMesh = (vertices: Vector3[], indices: number[][], color: string, opacityMultiplier: number = 1.0) => {
        const projected = vertices.map(v => {
            const p = project(v);
            return { x: p.x, y: p.y, z: p.z, w: p.w };
        });
        const faces = indices.map(idx => {
            let avgW = 0;
            idx.forEach(i => { avgW += projected[i].w; });
            return { indices: idx, depth: avgW / idx.length };
        }).sort((a, b) => b.depth - a.depth);

        return faces.map((face, i) => {
            const pts = face.indices.map(idx => `${projected[idx].x},${projected[idx].y}`).join(' ');
            return <polygon key={i} points={pts} fill={color} stroke={color} strokeWidth={0.5} fillOpacity={opacityMultiplier} strokeLinejoin="round" pointerEvents="none" />;
        });
    };

    const renderCenterHandle = () => {
        if (gizmoConfig.centerHandleShape === 'NONE') return null;
        const size = scale * 0.15 * gizmoConfig.centerHandleSize;
        const isActive = dragRef.current?.axis === 'VIEW'; // Check ref for active state
        const isHover = hoverAxis === 'VIEW';
        const color = isActive ? gizmoConfig.axisPressColor : (isHover ? gizmoConfig.centerHandleColor : gizmoConfig.centerHandleColor);
        
        if (gizmoConfig.centerHandleShape === 'QUAD_CIRCLES') {
             return (
                <g onMouseDown={(e) => startDrag(e, 'VIEW')} onMouseEnter={() => setHoverAxis('VIEW')} onMouseLeave={() => setHoverAxis(null)} className="cursor-move" style={{ transform: `translate(${pCenter.x}px, ${pCenter.y}px)` }}>
                   <circle cx={0} cy={0} r={18 * gizmoConfig.centerHandleSize} fill={color} fillOpacity={isActive ? 0.3 : 0.1} stroke={color} strokeWidth={2} />
                </g>
             );
        }

        const toWorld = (u: number, v: number, w: number) => ({
            x: origin.x + (xAxis.x * u + yAxis.x * v + zAxis.x * w) * size,
            y: origin.y + (xAxis.y * u + yAxis.y * v + zAxis.y * w) * size,
            z: origin.z + (xAxis.z * u + yAxis.z * v + zAxis.z * w) * size,
        });
        const vertices = [ toWorld(-1,-1,-1), toWorld(1,-1,-1), toWorld(1,1,-1), toWorld(-1,1,-1), toWorld(-1,-1,1), toWorld(1,-1,1), toWorld(1,1,1), toWorld(-1,1,1) ];
        const indices = [ [0,1,2,3], [4,7,6,5], [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0] ];

        return (
            <g onMouseDown={(e) => startDrag(e, 'VIEW')} onMouseEnter={() => setHoverAxis('VIEW')} onMouseLeave={() => setHoverAxis(null)} className="cursor-move">
                <circle cx={pCenter.x} cy={pCenter.y} r={20} fill="transparent" />
                {renderVolumetricMesh(vertices, indices, color, isActive || isHover ? 1.0 : 0.9)}
            </g>
        );
    };

    const renderArrow = (axis: Axis, tipPos: any, baseColor: string, vec: Vector3, up: Vector3, right: Vector3) => {
        const opacity = gizmoConfig.axisFadeWhenAligned ? GizmoMath.getAxisOpacity(vec, basis.cameraPosition, origin) : 1.0;
        if (opacity < 0.1) return null;
        
        const isActive = dragRef.current?.axis === axis;
        const isHover = hoverAxis === axis;
        const finalColor = isActive ? gizmoConfig.axisPressColor : (isHover ? gizmoConfig.axisHoverColor : baseColor);
        const stemLen = axisLen * 0.82;
        const pBase = project({ x: origin.x + vec.x * stemLen, y: origin.y + vec.y * stemLen, z: origin.z + vec.z * stemLen });

        // Arrow Head
        const headWidth = scale * 0.15 * gizmoConfig.arrowSize;
        const headLength = scale * 0.35 * gizmoConfig.arrowSize;
        const toWorld = (u: number, v: number, w: number) => ({
            x: (origin.x + vec.x * stemLen) + (right.x * u * headWidth) + (up.x * v * headWidth) + (vec.x * w * headLength),
            y: (origin.y + vec.y * stemLen) + (right.y * u * headWidth) + (up.y * v * headWidth) + (vec.y * w * headLength),
            z: (origin.z + vec.z * stemLen) + (right.z * u * headWidth) + (up.z * v * headWidth) + (vec.z * w * headLength),
        });
        const vertices: Vector3[] = [];
        const segs = 8;
        for(let i=0; i<segs; i++) {
            const theta = (i/segs) * Math.PI * 2;
            vertices.push(toWorld(Math.cos(theta), Math.sin(theta), 0));
        }
        vertices.push(toWorld(0, 0, 1));
        const indices = [[7,6,5,4,3,2,1,0]];
        for(let i=0; i<segs; i++) indices.push([i, (i+1)%segs, 8]);

        return (
            <g onMouseDown={(e) => startDrag(e, axis)} onMouseEnter={() => setHoverAxis(axis)} onMouseLeave={() => setHoverAxis(null)} className="cursor-pointer" opacity={opacity}>
                <line x1={pCenter.x} y1={pCenter.y} x2={tipPos.x} y2={tipPos.y} stroke="transparent" strokeWidth={20} />
                <line x1={pCenter.x} y1={pCenter.y} x2={pBase.x} y2={pBase.y} stroke={finalColor} strokeWidth={isActive || isHover ? 6 : 4} />
                {renderVolumetricMesh(vertices, indices, finalColor)}
            </g>
        );
    };

    const renderPlane = (axis: Axis, col: string, u: Vector3, v: Vector3, normal: Vector3) => {
        const opacityFactor = gizmoConfig.axisFadeWhenAligned ? GizmoMath.getPlaneOpacity(normal, basis.cameraPosition, origin) : 1.0;
        if (opacityFactor < 0.1) return null;

        const dist = scale * gizmoConfig.planeOffset; 
        const size = scale * 0.2 * gizmoConfig.planeHandleSize;
        const p1 = { x: origin.x + (u.x + v.x) * dist, y: origin.y + (u.y + v.y) * dist, z: origin.z + (u.z + v.z) * dist };
        const p2 = { x: p1.x + u.x * size, y: p1.y + u.y * size, z: p1.z + u.z * size };
        const p3 = { x: p1.x + u.x * size + v.x * size, y: p1.y + u.y * size + v.y * size, z: p1.z + u.z * size + v.z * size };
        const p4 = { x: p1.x + v.x * size, y: p1.y + v.y * size, z: p1.z + v.z * size };
        const [pp1, pp2, pp3, pp4] = [p1, p2, p3, p4].map(project);
        const isActive = dragRef.current?.axis === axis;
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