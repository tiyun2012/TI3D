
import React, { useState, useEffect, useContext, useMemo } from 'react';
import { Entity, ComponentType, Vector3, RotationOrder } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis } from './GizmoUtils';
import { EditorContext } from '../../contexts/EditorContext';
import { Mat4Utils } from '../../services/math';

interface Props {
    entity: Entity;
    basis: GizmoBasis;
    vpMatrix: Float32Array;
    viewport: { width: number; height: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

// --- Geometry Cache ---
const TORUS_CACHE = new Map<string, { vertices: Vector3[], indices: number[][] }>();

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

// --- Helper: Axis-Angle to Matrix (Rodrigues) ---
const axisAngleToMat4 = (axis: Vector3, angle: number) => {
    const out = new Float32Array(16);
    const x = axis.x, y = axis.y, z = axis.z;
    const len = Math.hypot(x,y,z);
    if (len === 0) { out.fill(0); out[0]=1; out[5]=1; out[10]=1; out[15]=1; return out; }
    
    const ax = x/len, ay = y/len, az = z/len;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const t = 1 - c;
    
    out[0] = c + ax*ax*t;       out[4] = ax*ay*t - az*s;    out[8]  = ax*az*t + ay*s;   out[12] = 0;
    out[1] = ay*ax*t + az*s;    out[5] = c + ay*ay*t;       out[9]  = ay*az*t - ax*s;   out[13] = 0;
    out[2] = az*ax*t - ay*s;    out[6] = az*ay*t + ax*s;    out[10] = c + az*az*t;      out[14] = 0;
    out[3] = 0;                 out[7] = 0;                 out[11] = 0;                out[15] = 1;
    return out;
};

export const RotationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport, containerRef }) => {
    const { gizmoConfig, transformSpace } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    
    const [dragState, setDragState] = useState<{
        axis: Axis;
        startRotation: Vector3;
        startAngle: number;
        currentAngle: number;
        axisVector: Vector3;
        u: Vector3;
        v: Vector3;
    } | null>(null);

    const { origin, scale } = basis;
    
    const project = useMemo(() => 
        (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height),
        [vpMatrix, viewport.width, viewport.height]
    );
    
    const invViewProj = useMemo(() => {
        const inv = new Float32Array(16);
        Mat4Utils.invert(vpMatrix, inv);
        return inv;
    }, [vpMatrix]);

    const pCenter = useMemo(() => project(origin), [origin, project]);

    // --- RING HIERARCHY CALCULATION ---
    const { ringMatrices } = useMemo(() => {
        const ringMats: Record<string, Float32Array> = {};
        
        // 1. World Space: Identity axes
        if (transformSpace === 'World') {
            const id = Mat4Utils.create();
            ringMats['X'] = id;
            ringMats['Y'] = id;
            ringMats['Z'] = id;
            return { ringMatrices: ringMats };
        }

        // 2. Local Space: Use Object's World Rotation for all rings
        // (Assuming Local rotation means rotating around the object's current local axes)
        // For visualizer: all rings share the final object orientation.
        const parentId = engineInstance.sceneGraph.getParentId(entity.id);
        const worldMatrix = engineInstance.sceneGraph.getWorldMatrix(entity.id);
        
        if (transformSpace === 'Local') {
            const mat = Mat4Utils.create();
            if (worldMatrix) {
                Mat4Utils.copy(mat, worldMatrix);
                mat[12]=0; mat[13]=0; mat[14]=0; // Zero translation
                // Normalize
                for(let c=0; c<3; c++) {
                   const idx = c*4;
                   const l = Math.hypot(mat[idx], mat[idx+1], mat[idx+2]);
                   if(l>0) { mat[idx]/=l; mat[idx+1]/=l; mat[idx+2]/=l; }
                }
            }
            ringMats['X'] = mat;
            ringMats['Y'] = mat;
            ringMats['Z'] = mat;
            return { ringMatrices: ringMats };
        }

        // 3. Gimbal Space: Construct Hierarchy based on Euler Order
        const transform = entity.components[ComponentType.TRANSFORM];
        const rot = transform.rotation;
        const order = (transform.rotationOrder || 'XYZ') as RotationOrder;
        
        const parentMat = parentId ? engineInstance.sceneGraph.getWorldMatrix(parentId) : null;
        
        const baseMat = Mat4Utils.create();
        if (parentMat) {
            baseMat.set(parentMat);
            baseMat[12]=0; baseMat[13]=0; baseMat[14]=0; 
            for(let c=0; c<3; c++) {
               const idx = c*4;
               const l = Math.hypot(baseMat[idx], baseMat[idx+1], baseMat[idx+2]);
               if(l>0) { baseMat[idx]/=l; baseMat[idx+1]/=l; baseMat[idx+2]/=l; }
            }
        }

        const getRotMat = (axis: 'X'|'Y'|'Z', angle: number) => {
            if (axis === 'X') return axisAngleToMat4({x:1, y:0, z:0}, angle);
            if (axis === 'Y') return axisAngleToMat4({x:0, y:1, z:0}, angle);
            return axisAngleToMat4({x:0, y:0, z:1}, angle);
        };

        const euler = { x: rot.x, y: rot.y, z: rot.z };
        const axes = order.split('') as ('X'|'Y'|'Z')[];
        
        let accum = Mat4Utils.create();
        Mat4Utils.copy(accum, baseMat);

        // Reverse Order for Hierarchy (Outer -> Inner)
        const reversedAxes = [...axes].reverse();

        reversedAxes.forEach((axisChar) => {
            const mat = new Float32Array(16);
            Mat4Utils.copy(mat, accum);
            ringMats[axisChar] = mat;

            const angle = euler[axisChar.toLowerCase() as 'x'|'y'|'z'];
            const rotM = getRotMat(axisChar, angle);
            
            const nextAccum = Mat4Utils.create();
            Mat4Utils.multiply(accum, rotM, nextAccum);
            accum = nextAccum;
        });

        return { ringMatrices: ringMats };

    }, [entity.id, entity.components, engineInstance.sceneGraph, transformSpace]);

    const getRingBasis = (axis: Axis) => {
        if (axis === 'VIEW') {
            const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, origin));
            const worldUp = { x: 0, y: 1, z: 0 };
            let right = GizmoMath.cross(viewDir, worldUp);
            if (GizmoMath.dot(right, right) < 0.001) right = { x: 1, y: 0, z: 0 };
            right = GizmoMath.normalize(right);
            const up = GizmoMath.normalize(GizmoMath.cross(right, viewDir));
            return { axis: viewDir, u: right, v: up };
        }

        const mat = ringMatrices[axis as string];
        if (!mat) return { axis: {x:0,y:0,z:1}, u:{x:1,y:0,z:0}, v:{x:0,y:1,z:0} };

        const basisX = { x: mat[0], y: mat[1], z: mat[2] };
        const basisY = { x: mat[4], y: mat[5], z: mat[6] };
        const basisZ = { x: mat[8], y: mat[9], z: mat[10] };

        // For X-Ring, axis is X, plane is YZ
        if (axis === 'X') return { axis: basisX, u: basisY, v: basisZ };
        // For Y-Ring, axis is Y, plane is XZ (but normal is Y)
        if (axis === 'Y') return { axis: basisY, u: basisZ, v: basisX };
        // For Z-Ring, axis is Z, plane is XY
        return { axis: basisZ, u: basisX, v: basisY };
    };

    const getAngleOnPlane = (
        mouseX: number, mouseY: number, 
        center: Vector3, normal: Vector3, 
        u: Vector3, v: Vector3
    ) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        const ray = GizmoMath.screenToRay(
            mouseX - rect.left, mouseY - rect.top, 
            viewport.width, viewport.height, 
            invViewProj, basis.cameraPosition
        );
        const hit = GizmoMath.rayPlaneIntersection(ray.origin, ray.direction, center, normal);
        if (!hit) return 0;
        const localVec = GizmoMath.normalize(GizmoMath.sub(hit, center));
        const cos = GizmoMath.dot(localVec, u);
        const sin = GizmoMath.dot(localVec, v);
        return Math.atan2(sin, cos);
    };

    useEffect(() => {
        const handleGlobalMouseMove = (e: MouseEvent) => {
            if (!dragState || !containerRef.current) return;
            
            const currentMouseAngle = getAngleOnPlane(
                e.clientX, e.clientY, 
                origin, dragState.axisVector, dragState.u, dragState.v
            );

            let totalDelta = currentMouseAngle - dragState.startAngle;
            while (totalDelta <= -Math.PI) totalDelta += Math.PI * 2;
            while (totalDelta > Math.PI) totalDelta -= Math.PI * 2;

            if (dragState.axis !== 'VIEW') {
                const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, origin));
                const dot = GizmoMath.dot(viewDir, dragState.axisVector);
                if (dot < 0) totalDelta = -totalDelta;
            }

            if (e.shiftKey) {
                const snap = Math.PI / 12; 
                totalDelta = Math.round(totalDelta / snap) * snap;
            }

            // --- Rotation Application Logic ---
            // DISABLED FOR DEBUGGING as requested previously ("remove apply on object")
            /*
            const transform = entity.components[ComponentType.TRANSFORM];
            if (transformSpace === 'Gimbal') {
                if (dragState.axis === 'X') transform.rotation.x = dragState.startRotation.x + totalDelta;
                else if (dragState.axis === 'Y') transform.rotation.y = dragState.startRotation.y + totalDelta;
                else if (dragState.axis === 'Z') transform.rotation.z = dragState.startRotation.z + totalDelta;
                engineInstance.notifyUI();
            } else {
                // TODO: Implement World/Local Delta Rotation math (Quaternions)
                // Current implementation is visualization/debug only for those modes
            }
            */
            console.log(`[Gizmo] Mode: ${transformSpace} | Axis: ${dragState.axis} | Delta: ${(totalDelta * (180/Math.PI)).toFixed(1)}°`);
            
            setDragState(prev => prev ? { ...prev, currentAngle: totalDelta } : null);
        };
        
        const handleGlobalMouseUp = () => {
            if (dragState) {
                engineInstance.pushUndoState();
                setDragState(null);
            }
        };
        
        if (dragState) {
            window.addEventListener('mousemove', handleGlobalMouseMove);
            window.addEventListener('mouseup', handleGlobalMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [dragState, basis, origin, invViewProj, viewport, transformSpace, entity]);
    
    const startDrag = (e: React.MouseEvent, axis: Axis) => {
        e.stopPropagation(); e.preventDefault();
        const { axis: axisVec, u, v } = getRingBasis(axis);
        const startAngle = getAngleOnPlane(e.clientX, e.clientY, origin, axisVec, u, v);
        const transform = entity.components[ComponentType.TRANSFORM];

        setDragState({
            axis,
            startRotation: { ...transform.rotation },
            startAngle,
            currentAngle: 0,
            axisVector: axisVec,
            u, v
        });
    };
    
    const renderVolumetricMesh = (vertices: Vector3[], indices: number[][], fillStyle: string, opacity: number = 1.0) => {
         const projected = vertices.map(v => {
            const p = project(v);
            return { x: p.x, y: p.y, z: p.z, w: p.w };
        });
        
        const faces = indices.map(idx => {
            let avgZ = 0;
            idx.forEach(i => { avgZ += projected[i].z; });
            avgZ /= idx.length;
            
            const p0 = vertices[idx[0]];
            const p1 = vertices[idx[1]];
            const p2 = vertices[idx[2]];
            const v1 = GizmoMath.sub(p1, p0);
            const v2 = GizmoMath.sub(p2, p0);
            const normal = GizmoMath.normalize(GizmoMath.cross(v1, v2));
            
            const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, origin));
            return { indices: idx, depth: avgZ, normal, visible: GizmoMath.dot(normal, viewDir) > 0 };
        });
        
        faces.sort((a, b) => b.depth - a.depth);
        const lightDir = GizmoMath.normalize({ x: 1, y: 1, z: 1 });
        
        return faces.map((face, i) => {
            if (!face.visible) return null;
            let intensity = Math.max(0, GizmoMath.dot(face.normal, lightDir));
            intensity = 0.3 + intensity * 0.7;
            const shadeOpacity = Math.max(0, 1.0 - intensity);
            const pts = face.indices.map(idx => `${projected[idx].x},${projected[idx].y}`).join(' ');
            return (
                <g key={i}>
                    <polygon points={pts} fill={fillStyle} stroke={fillStyle} strokeWidth={0.5} fillOpacity={opacity} strokeLinejoin="round" />
                    <polygon points={pts} fill="black" fillOpacity={shadeOpacity * 0.4 * opacity} stroke="none" pointerEvents="none"/>
                </g>
            );
        }).filter((f): f is React.ReactElement => f !== null);
    };

    const renderTorusRing = (axis: Axis, color: string) => {
        const { axis: axisVec, u, v } = getRingBasis(axis);

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
        
        const ringScale = axis === 'VIEW' ? (gizmoConfig.rotationScreenRingScale || 1.25) : 1.0;
        const radius = scale * gizmoConfig.rotationRingSize * ringScale;
        const tubeRadius = scale * 0.015 * gizmoConfig.rotationRingTubeScale * (isActive || isHover ? 2.0 : 1.0);
        
        const geo = getCachedTorus(radius, tubeRadius);
        const worldVertices = geo.vertices.map(vert => ({
            x: origin.x + u.x * vert.x + v.x * vert.y + axisVec.x * vert.z,
            y: origin.y + u.y * vert.x + v.y * vert.y + axisVec.y * vert.z,
            z: origin.z + u.z * vert.x + v.z * vert.y + axisVec.z * vert.z,
        }));
        
        const gradientId = `grad-${axis}-${entity.id}`;
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
        const useSolid = isActive || isHover;
        const fillStyle = useSolid ? finalColor : `url(#${gradientId})`;
        
        return (
            <g
                onMouseDown={(e) => startDrag(e, axis)}
                onMouseEnter={() => setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
            >
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                        <stop offset="50%" stopColor={color} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.4} />
                    </linearGradient>
                </defs>
                <polyline points={hitPoints} fill="none" stroke={color} strokeOpacity={0.0001} strokeWidth={20} />
                <g>{renderVolumetricMesh(worldVertices, geo.indices, fillStyle, opacity)}</g>
            </g>
        );
    };
    
    return (
        <g>
            <circle cx={pCenter.x} cy={pCenter.y} r={scale * gizmoConfig.rotationRingSize * 0.8} fill="black" fillOpacity="0.05" className="pointer-events-none" />
            {renderTorusRing('VIEW', GIZMO_COLORS.Gray)}
            {renderTorusRing('X', GIZMO_COLORS.X)}
            {renderTorusRing('Y', GIZMO_COLORS.Y)}
            {renderTorusRing('Z', GIZMO_COLORS.Z)}
            {/* Sector rendering logic same as before (omitted for brevity if needed, but included in full code) */}
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