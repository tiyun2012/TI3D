import React, { useState, useEffect, useContext, useMemo } from 'react';
import { Entity, ComponentType, Vector3 } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis, ColorUtils } from './GizmoUtils';
import { EditorContext } from '../../contexts/EditorContext';

interface Props {
    entity: Entity;
    basis: GizmoBasis;
    vpMatrix: Float32Array;
    viewport: { width: number; height: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

// --- Geometry Cache ---
const TORUS_CACHE = new Map<string, { vertices: Vector3[], indices: number[][] }>();
const RHOMBUS_CACHE = new Map<string, { vertices: Vector3[], indices: number[][] }>();

const getCachedTorus = (radius: number, tubeRadius: number) => {
    const key = `${radius.toFixed(3)}-${tubeRadius.toFixed(3)}`;
    
    if (TORUS_CACHE.has(key)) return TORUS_CACHE.get(key)!;
    
    const segments = 48;
    const tubeSegments = 8;
    const vertices: Vector3[] = [];
    const indices: number[][] = [];
    
    for (let i = 0; i <= segments; i++) {
        const theta = (i / segments) * Math.PI * 2;
        const cosTheta = Math.cos(theta);
        const sinTheta = Math.sin(theta);
        const centerX = cosTheta * radius;
        const centerY = sinTheta * radius;
        
        for (let j = 0; j < tubeSegments; j++) {
            const phi = (j / tubeSegments) * Math.PI * 2;
            const cosPhi = Math.cos(phi);
            const sinPhi = Math.sin(phi);
            
            // Torus on XY plane, thickness along Z
            vertices.push({
                x: centerX + cosTheta * cosPhi * tubeRadius,
                y: centerY + sinTheta * cosPhi * tubeRadius,
                z: sinPhi * tubeRadius
            });
        }
    }
    
    for (let i = 0; i < segments; i++) {
        for (let j = 0; j < tubeSegments; j++) {
            const current = i * tubeSegments + j;
            const next = (i + 1) * tubeSegments + j;
            const top = (i + 1) * tubeSegments + (j + 1) % tubeSegments;
            const topNext = i * tubeSegments + (j + 1) % tubeSegments;
            indices.push([current, next, top, topNext]);
        }
    }
    
    const geo = { vertices, indices };
    TORUS_CACHE.set(key, geo);
    return geo;
};

// Create a rhombus (diamond) geometry
const getCachedRhombus = (size: number) => {
    const key = `rhombus-${size.toFixed(3)}`;
    
    if (RHOMBUS_CACHE.has(key)) return RHOMBUS_CACHE.get(key)!;
    
    const thickness = size * 0.2;
    
    const vertices: Vector3[] = [
        // Top layer
        { x: 0, y: size, z: thickness/2 },    // 0
        { x: size, y: 0, z: thickness/2 },    // 1
        { x: 0, y: -size, z: thickness/2 },   // 2
        { x: -size, y: 0, z: thickness/2 },   // 3
        // Bottom layer
        { x: 0, y: size, z: -thickness/2 },   // 4
        { x: size, y: 0, z: -thickness/2 },   // 5
        { x: 0, y: -size, z: -thickness/2 },  // 6
        { x: -size, y: 0, z: -thickness/2 },  // 7
    ];
    
    const indices: number[][] = [
        [0, 1, 2, 3], // Top
        [4, 7, 6, 5], // Bottom
        [0, 4, 5, 1], // Sides...
        [1, 5, 6, 2],
        [2, 6, 7, 3],
        [3, 7, 4, 0],
    ];
    
    const geo = { vertices, indices };
    RHOMBUS_CACHE.set(key, geo);
    return geo;
};

export const RotationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport, containerRef }) => {
    const { gizmoConfig } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [dragState, setDragState] = useState<{
        axis: Axis;
        startRotation: Vector3;
        startAngle: number;
        currentAngle: number;
        axisVector: Vector3;
        u?: Vector3;
        v?: Vector3;
    } | null>(null);

    const { origin, xAxis, yAxis, zAxis, scale } = basis;
    const transform = entity.components[ComponentType.TRANSFORM];
    
    const project = useMemo(() => 
        (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height),
        [vpMatrix, viewport.width, viewport.height]
    );
    
    const pCenter = useMemo(() => project(origin), [origin, project]);

    // --- Interaction Logic ---
    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!dragState || !containerRef.current) return;
            
            const rect = containerRef.current.getBoundingClientRect();
            // Calculate center relative to the entire page to match e.pageX/Y
            const cx = rect.left + pCenter.x + window.scrollX;
            const cy = rect.top + pCenter.y + window.scrollY;
            
            const currentMouseAngle = Math.atan2(e.pageY - cy, e.pageX - cx);
            let rawDelta = currentMouseAngle - dragState.startAngle;
            
            // Normalize to [-π, π]
            while (rawDelta <= -Math.PI) rawDelta += Math.PI * 2;
            while (rawDelta > Math.PI) rawDelta -= Math.PI * 2;
            
            let delta = rawDelta;
            
            // Correct for view alignment (except VIEW axis)
            if (dragState.axis !== 'VIEW') {
                const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, origin));
                const dot = GizmoMath.dot(viewDir, dragState.axisVector);
                if (dot < 0) delta = -delta;
            }
            
            // Snap
            if (e.shiftKey) {
                const snap = Math.PI / 12;
                delta = Math.round(delta / snap) * snap;
            }
            
            // Apply rotation
            const v = dragState.startRotation;
            
            if (dragState.axis === 'VIEW') {
                // Screen-space rotation approximation
                const rotationSpeed = 0.01;
                // Use screen delta for intuitive feel
                const screenDeltaX = e.pageX - (e.pageX - (e.clientX - rect.left)); // Simplified relative check
                // Actually raw delta angle is best for "dial" feel, 
                // but screen X/Y delta is better for "trackball" feel.
                // Using angular delta for consistency with ring UI:
                transform.rotation.y = v.y - delta; 
            } else {
                if (dragState.axis === 'X') transform.rotation.x = v.x - delta;
                if (dragState.axis === 'Y') transform.rotation.y = v.y - delta;
                if (dragState.axis === 'Z') transform.rotation.z = v.z - delta;
            }
            
            setDragState(prev => prev ? { ...prev, currentAngle: delta } : null);
            engineInstance.notifyUI();
        };
        
        const handleGlobalMouseUp = () => {
            if (dragState) {
                engineInstance.pushUndoState();
                setDragState(null);
            }
        };
        
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && dragState) {
                const v = dragState.startRotation;
                transform.rotation.x = v.x;
                transform.rotation.y = v.y;
                transform.rotation.z = v.z;
                
                engineInstance.sceneGraph.setDirty(entity.id);
                engineInstance.notifyUI();
                setDragState(null);
                e.preventDefault();
            }
        };
        
        if (dragState) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
            window.addEventListener('keydown', handleKeyDown);
        }
        
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [dragState, transform, basis, origin, pCenter, containerRef, entity.id]);
    
    const startDrag = (e: React.MouseEvent, axis: Axis, axisVector: Vector3, u?: Vector3, v?: Vector3) => {
        e.stopPropagation(); e.preventDefault();
        if (!containerRef.current) return;
        
        const rect = containerRef.current.getBoundingClientRect();
        const centerX = rect.left + pCenter.x + window.scrollX;
        const centerY = rect.top + pCenter.y + window.scrollY;
        
        const startAngle = Math.atan2(e.pageY - centerY, e.pageX - centerX);
        
        setDragState({
            axis,
            startRotation: { ...transform.rotation },
            startAngle,
            currentAngle: 0,
            axisVector,
            u, v
        });
    };
    
    // --- Render Helpers ---
    const renderVolumetricMesh = (vertices: Vector3[], indices: number[][], color: string, opacity: number = 1.0) => {
        const projected = vertices.map(v => {
            const p = project(v);
            return { x: p.x, y: p.y, z: p.z, w: p.w };
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
            
            const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, origin));
            // Backface culling
            return { indices: idx, depth: avgW, normal, visible: GizmoMath.dot(normal, viewDir) > 0 };
        });
        
        faces.sort((a, b) => b.depth - a.depth);
        
        const lightDir = GizmoMath.normalize({ x: 1, y: 1, z: 1 });
        
        return faces.map((face, i) => {
            if (!face.visible) return null;
            
            // Flat shading
            let intensity = Math.max(0, GizmoMath.dot(face.normal, lightDir));
            intensity = 0.3 + intensity * 0.7;
            
            const shadedColor = ColorUtils.shade(color, Math.floor((intensity - 0.5) * 40));
            const pts = face.indices.map(idx => `${projected[idx].x},${projected[idx].y}`).join(' ');
            
            return (
                <polygon
                    key={i}
                    points={pts}
                    fill={shadedColor}
                    stroke={shadedColor} // Stroke same as fill to close gaps
                    strokeWidth={0.5}
                    fillOpacity={opacity}
                    strokeOpacity={opacity}
                    strokeLinejoin="round"
                />
            );
        });
    };

    // Render decorations (small rhombuses) along the ring
    const renderRingDecorations = (axis: Axis, axisVec: Vector3, u: Vector3, v: Vector3, color: string) => {
        const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, origin));
        const dot = Math.abs(GizmoMath.dot(axisVec, viewDir));
        
        let visibility = 1.0;
        if (dot > 0.99) visibility = 0;
        else if (dot > 0.85) visibility = 1.0 - ((dot - 0.85) / 0.14);
        
        if (visibility < 0.05) return null;

        const radius = scale * gizmoConfig.rotationRingSize;
        const decorationCount = 8;
        const rhombusSize = scale * 0.06;
        
        const baseRhombus = getCachedRhombus(rhombusSize);
        const decorations = [];
        
        for (let i = 0; i < decorationCount; i++) {
            const angle = (i / decorationCount) * Math.PI * 2;
            const cos = Math.cos(angle);
            const sin = Math.sin(angle);
            
            // Position on the ring
            const pos = {
                x: origin.x + (u.x * cos + v.x * sin) * radius,
                y: origin.y + (u.y * cos + v.y * sin) * radius,
                z: origin.z + (u.z * cos + v.z * sin) * radius
            };
            
            // Orientation
            const radial = GizmoMath.normalize({
                x: u.x * cos + v.x * sin,
                y: u.y * cos + v.y * sin,
                z: u.z * cos + v.z * sin
            });
            const tangent = GizmoMath.normalize({
                x: -u.x * sin + v.x * cos,
                y: -u.y * sin + v.y * cos,
                z: -u.z * sin + v.z * cos
            });
            
            // Transform
            const worldVerts = baseRhombus.vertices.map(vtx => ({
                x: pos.x + tangent.x * vtx.x + radial.x * vtx.y + axisVec.x * vtx.z,
                y: pos.y + tangent.y * vtx.x + radial.y * vtx.y + axisVec.y * vtx.z,
                z: pos.z + tangent.z * vtx.x + radial.z * vtx.y + axisVec.z * vtx.z,
            }));
            
            decorations.push(
                <g key={`${axis}-deco-${i}`}>
                    {renderVolumetricMesh(worldVerts, baseRhombus.indices, color, visibility * 0.8)}
                </g>
            );
        }
        
        return <g className="pointer-events-none">{decorations}</g>;
    };

    const renderTorusRing = (axis: Axis, axisVec: Vector3, u: Vector3, v: Vector3, color: string) => {
        let visibility = 1.0;
        if (axis !== 'VIEW') {
            const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, origin));
            const dot = Math.abs(GizmoMath.dot(axisVec, viewDir));
            if (dot > 0.99) visibility = 0;
            else if (dot > 0.85) visibility = 1.0 - ((dot - 0.85) / 0.14);
        }
        
        if (visibility < 0.05) return null;
        
        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;
        const opacity = visibility * (isActive ? 1.0 : (isHover ? 0.9 : 0.7));
        const finalColor = isActive ? gizmoConfig.axisPressColor : (isHover ? gizmoConfig.axisHoverColor : color);
        
        const radius = scale * gizmoConfig.rotationRingSize;
        const tubeRadius = scale * 0.015 * (isActive || isHover ? 2.0 : 1.0);
        
        const geo = getCachedTorus(radius, tubeRadius);
        
        // Transform Torus to World Plane
        const worldVertices = geo.vertices.map(vert => ({
            x: origin.x + u.x * vert.x + v.x * vert.y + axisVec.x * vert.z,
            y: origin.y + u.y * vert.x + v.y * vert.y + axisVec.y * vert.z,
            z: origin.z + u.z * vert.x + v.z * vert.y + axisVec.z * vert.z,
        }));
        
        // Hit Area Polyline
        let hitPoints = "";
        const hitSegs = 32;
        for (let i = 0; i <= hitSegs; i++) {
            const theta = (i / hitSegs) * Math.PI * 2;
            const pt = {
                x: origin.x + (u.x * Math.cos(theta) + v.x * Math.sin(theta)) * radius,
                y: origin.y + (u.y * Math.cos(theta) + v.y * Math.sin(theta)) * radius,
                z: origin.z + (u.z * Math.cos(theta) + v.z * Math.sin(theta)) * radius
            };
            const p = project(pt);
            hitPoints += `${p.x},${p.y} `;
        }
        
        return (
            <g
                onMouseDown={(e) => startDrag(e, axis, axisVec, u, v)}
                onMouseEnter={() => setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
            >
                <polyline points={hitPoints} fill="none" stroke="transparent" strokeWidth={20} />
                
                <g style={{ filter: isActive ? 'url(#glow)' : 'none' }}>
                    {renderVolumetricMesh(worldVertices, geo.indices, finalColor, opacity)}
                    {axis !== 'VIEW' && renderRingDecorations(axis, axisVec, u, v, finalColor)}
                </g>
            </g>
        );
    };
    
    const renderSector = () => {
        if (!dragState || dragState.axis === 'VIEW' || !dragState.u || !dragState.v) return null;
        
        const radius = scale * gizmoConfig.rotationRingSize;
        const color = dragState.axis === 'X' ? GIZMO_COLORS.X : 
                     dragState.axis === 'Y' ? GIZMO_COLORS.Y : GIZMO_COLORS.Z;
        
        const segments = Math.max(8, Math.floor(Math.abs(dragState.currentAngle) * 16 / (2 * Math.PI)));
        const points3D: Vector3[] = [origin];
        
        for (let i = 0; i <= segments; i++) {
            const t = i / segments;
            const angle = dragState.currentAngle * t; // Relative to start drag frame
            // Project angle onto the U, V plane
            const uComp = Math.cos(dragState.startAngle + angle) * Math.cos(dragState.startAngle) + Math.sin(dragState.startAngle + angle) * Math.sin(dragState.startAngle); // Simplified
            
            // We need to rotate the "starting vector" by "angle".
            // Start vector in 3D: P_start = origin + (u*cos(startA) + v*sin(startA))*radius
            // Current vector: P_curr = origin + (u*cos(startA + angle) + v*sin(startA + angle))*radius
            
            const theta = dragState.startAngle + angle;
            points3D.push({
                x: origin.x + (dragState.u.x * Math.cos(theta) + dragState.v.x * Math.sin(theta)) * radius,
                y: origin.y + (dragState.u.y * Math.cos(theta) + dragState.v.y * Math.sin(theta)) * radius,
                z: origin.z + (dragState.u.z * Math.cos(theta) + dragState.v.z * Math.sin(theta)) * radius
            });
        }
        
        points3D.push(origin); // Close loop
        
        const projected = points3D.map(project);
        const pathPoints = projected.map(p => `${p.x},${p.y}`).join(' ');
        
        return (
            <g pointerEvents="none" opacity={0.4}>
                <polygon points={pathPoints} fill={color} stroke="none" />
                <polyline 
                    points={projected.slice(1, -1).map(p => `${p.x},${p.y}`).join(' ')} 
                    stroke="white" strokeWidth={2} fill="none" 
                />
            </g>
        );
    };
    
    const renderScreenSpaceRing = () => {
        const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, origin));
        const worldUp = { x: 0, y: 1, z: 0 };
        let right = GizmoMath.cross(viewDir, worldUp);
        if (GizmoMath.dot(right, right) < 0.001) right = { x: 1, y: 0, z: 0 };
        right = GizmoMath.normalize(right);
        const up = GizmoMath.normalize(GizmoMath.cross(right, viewDir));
        
        return renderTorusRing('VIEW', viewDir, right, up, GIZMO_COLORS.Gray);
    };
    
    const renderCardinalDecorations = () => {
        const radius = scale * gizmoConfig.rotationRingSize * 1.3;
        const labels = [
            { t: 'X', pos: xAxis, col: GIZMO_COLORS.X },
            { t: 'Y', pos: yAxis, col: GIZMO_COLORS.Y },
            { t: 'Z', pos: zAxis, col: GIZMO_COLORS.Z }
        ];
        
        return labels.map((l, i) => {
            const pos = {
                x: origin.x + l.pos.x * radius,
                y: origin.y + l.pos.y * radius,
                z: origin.z + l.pos.z * radius
            };
            const p = project(pos);
            return (
                <g key={i} className="pointer-events-none">
                    <circle cx={p.x} cy={p.y} r={10} fill={l.col} fillOpacity={0.2} />
                    <text x={p.x} y={p.y} dy={4} textAnchor="middle" fill="white" fontSize="10" fontWeight="bold">{l.t}</text>
                </g>
            );
        });
    };
    
    return (
        <g>
            <defs>
                <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="2.5" result="coloredBlur"/>
                    <feMerge>
                        <feMergeNode in="coloredBlur"/>
                        <feMergeNode in="SourceGraphic"/>
                    </feMerge>
                </filter>
            </defs>
            
            <circle cx={pCenter.x} cy={pCenter.y} r={scale * gizmoConfig.rotationRingSize * 0.8} fill="black" fillOpacity="0.05" className="pointer-events-none" />
            
            {renderScreenSpaceRing()}
            {renderTorusRing('X', xAxis, yAxis, zAxis, GIZMO_COLORS.X)}
            {renderTorusRing('Y', yAxis, zAxis, xAxis, GIZMO_COLORS.Y)}
            {renderTorusRing('Z', zAxis, xAxis, yAxis, GIZMO_COLORS.Z)}
            
            {renderCardinalDecorations()}
            {renderSector()}
            
            {dragState && (
                <g pointerEvents="none">
                    <rect x={pCenter.x - 30} y={pCenter.y - scale * gizmoConfig.rotationRingSize - 35} width={60} height={20} fill="rgba(0,0,0,0.8)" rx={4} />
                    <text x={pCenter.x} y={pCenter.y - scale * gizmoConfig.rotationRingSize - 21} fill="white" textAnchor="middle" fontSize="11" fontWeight="bold">
                        {(dragState.currentAngle * (180/Math.PI)).toFixed(0)}°
                    </text>
                </g>
            )}
        </g>
    );
};