
import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
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

// --- Geometry Cache (Unchanged) ---
const TORUS_CACHE = new Map<string, { vertices: Vector3[], indices: number[][] }>();
const getCachedTorus = (radius: number, tubeRadius: number) => {
    const key = `${radius.toFixed(3)}-${tubeRadius.toFixed(3)}`;
    if (TORUS_CACHE.has(key)) return TORUS_CACHE.get(key)!;
    
    const segments = 64; 
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

interface DragContext {
    axis: Axis;
    startRotation: Vector3;
    startAngle: number;
    axisVector: Vector3;
    u: Vector3;
    v: Vector3;
}

interface VisualState {
    axis: Axis;
    currentAngle: number;
    startAngle: number;
    u: Vector3;
    v: Vector3;
}

export const RotationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport, containerRef }) => {
    const { gizmoConfig, transformSpace, snapSettings } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [visualState, setVisualState] = useState<VisualState | null>(null);

    const dragRef = useRef<DragContext | null>(null);
    const stateRef = useRef({ 
        vpMatrix, 
        invViewProj: new Float32Array(16), 
        viewport,
        basis,
        snapSettings
    });

    const { origin, scale } = basis;

    const invViewProj = useMemo(() => {
        const inv = new Float32Array(16);
        Mat4Utils.invert(vpMatrix, inv);
        return inv;
    }, [vpMatrix]);

    stateRef.current = { vpMatrix, invViewProj, viewport, basis, snapSettings };
    
    const project = (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height);
    const pCenter = project(origin);

    const { ringMatrices } = useMemo(() => {
        const ringMats: Record<string, Float32Array> = {};
        
        if (transformSpace === 'World') {
            const id = Mat4Utils.create();
            ringMats['X'] = id; ringMats['Y'] = id; ringMats['Z'] = id;
            return { ringMatrices: ringMats };
        }

        const parentId = engineInstance.sceneGraph.getParentId(entity.id);
        const worldMatrix = engineInstance.sceneGraph.getWorldMatrix(entity.id);
        
        if (transformSpace === 'Local') {
            const mat = Mat4Utils.create();
            if (worldMatrix) {
                Mat4Utils.copy(mat, worldMatrix);
                mat[12]=0; mat[13]=0; mat[14]=0; 
                for(let c=0; c<3; c++) {
                   const idx = c*4;
                   const l = Math.hypot(mat[idx], mat[idx+1], mat[idx+2]);
                   if(l>0) { mat[idx]/=l; mat[idx+1]/=l; mat[idx+2]/=l; }
                }
            }
            ringMats['X'] = mat; ringMats['Y'] = mat; ringMats['Z'] = mat;
            return { ringMatrices: ringMats };
        }

        // Gimbal Logic
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

        if (axis === 'X') return { axis: basisX, u: basisY, v: basisZ };
        if (axis === 'Y') return { axis: basisY, u: basisZ, v: basisX };
        return { axis: basisZ, u: basisX, v: basisY };
    };

    const calculateAngle = (
        mouseX: number, mouseY: number, 
        center: Vector3, 
        currentInvViewProj: Float32Array,
        currentCamPos: Vector3,
        currentViewport: {width:number, height:number},
        u: Vector3, v: Vector3
    ) => {
        if (!containerRef.current) return 0;
        const rect = containerRef.current.getBoundingClientRect();
        const ray = GizmoMath.screenToRay(
            mouseX - rect.left, mouseY - rect.top, 
            currentViewport.width, currentViewport.height, 
            currentInvViewProj, currentCamPos
        );
        const normal = GizmoMath.normalize(GizmoMath.cross(u, v));
        const hit = GizmoMath.rayPlaneIntersection(ray.origin, ray.direction, center, normal);
        if (!hit) return 0;
        const localVec = GizmoMath.normalize(GizmoMath.sub(hit, center));
        const cos = GizmoMath.dot(localVec, u);
        const sin = GizmoMath.dot(localVec, v);
        return Math.atan2(sin, cos);
    };

    useEffect(() => {
        if (!isDragging) return;

        const handleGlobalMouseMove = (e: MouseEvent) => {
            const dragData = dragRef.current;
            if (!dragData || !containerRef.current) return;
            
            const { invViewProj: currInvVp, basis: currBasis, viewport: currVp, snapSettings } = stateRef.current;

            const currentMouseAngle = calculateAngle(
                e.clientX, e.clientY, 
                currBasis.origin, 
                currInvVp, currBasis.cameraPosition, currVp,
                dragData.u, dragData.v
            );

            let totalDelta = currentMouseAngle - dragData.startAngle;
            while (totalDelta <= -Math.PI) totalDelta += Math.PI * 2;
            while (totalDelta > Math.PI) totalDelta -= Math.PI * 2;

            if (snapSettings.active || e.shiftKey) {
                const snapDeg = snapSettings.rotate;
                const snapRad = snapDeg * (Math.PI / 180);
                totalDelta = Math.round(totalDelta / snapRad) * snapRad;
            }

            const transform = entity.components[ComponentType.TRANSFORM];
            
            if (dragData.axis === 'X') transform.rotation.x = dragData.startRotation.x + totalDelta;
            else if (dragData.axis === 'Y') transform.rotation.y = dragData.startRotation.y + totalDelta;
            else if (dragData.axis === 'Z') transform.rotation.z = dragData.startRotation.z + totalDelta;
            
            engineInstance.notifyUI();
            engineInstance.tick(0); 
            
            setVisualState({
                axis: dragData.axis,
                currentAngle: totalDelta,
                startAngle: dragData.startAngle,
                u: dragData.u,
                v: dragData.v
            });
        };
        
        const handleGlobalMouseUp = () => {
            setIsDragging(false);
            setVisualState(null);
            dragRef.current = null;
            engineInstance.pushUndoState();
            engineInstance.notifyUI();
        };
        
        window.addEventListener('mousemove', handleGlobalMouseMove);
        window.addEventListener('mouseup', handleGlobalMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleGlobalMouseMove);
            window.removeEventListener('mouseup', handleGlobalMouseUp);
        };
    }, [isDragging, entity, containerRef]);

    const startDrag = (e: React.MouseEvent, axis: Axis) => {
        if (e.altKey) return;

        e.stopPropagation(); e.preventDefault();
        
        const { u, v } = getRingBasis(axis);
        const { invViewProj: currInvVp, basis: currBasis, viewport: currVp } = stateRef.current;
        
        const startAngle = calculateAngle(
            e.clientX, e.clientY, 
            origin, 
            currInvVp, currBasis.cameraPosition, currVp,
            u, v
        );
        
        const transform = entity.components[ComponentType.TRANSFORM];

        dragRef.current = {
            axis,
            startRotation: { ...transform.rotation },
            startAngle,
            axisVector: getRingBasis(axis).axis,
            u, v
        };

        setVisualState({
            axis,
            currentAngle: 0,
            startAngle,
            u, v
        });

        setIsDragging(true);
    };

    const renderVolumetricMesh = (vertices: Vector3[], indices: number[][], fillStyle: string, opacity: number = 1.0) => {
         const projected: { x: number; y: number; z: number; w: number }[] = vertices.map(v => {
            const p = project(v) as { x: number, y: number, z: number, w: number };
            return { x: p.x, y: p.y, z: p.z, w: p.w };
        });
        
        const faces = indices.map(idx => {
            let avgZ = 0;
            idx.forEach(i => { if(projected[i]) avgZ += projected[i].z; });
            avgZ /= idx.length;
            const p0 = vertices[idx[0]]; const p1 = vertices[idx[1]]; const p2 = vertices[idx[2]];
            if (!p0 || !p1 || !p2) return { indices: idx, depth: avgZ, normal: {x:0,y:0,z:1}, visible: false };
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
            const pts = face.indices.map(idx => {
                const p = projected[idx]; return p ? `${p.x},${p.y}` : "0,0";
            }).join(' ');
            return (
                <g key={i} className="pointer-events-none">
                    <polygon points={pts} fill={fillStyle} stroke={fillStyle} strokeWidth={0.5} fillOpacity={opacity} strokeLinejoin="round" />
                    <polygon points={pts} fill="black" fillOpacity={shadeOpacity * 0.4 * opacity} stroke="none" />
                </g>
            );
        }).filter((f): f is React.ReactElement => f !== null);
    };

    const renderDecorations = (radius: number, u: Vector3, v: Vector3, color: string, opacity: number) => {
        if (!gizmoConfig.rotationShowDecorations) return null;
        const tickCount = 12;
        const tickSize = scale * 0.08; 
        const ticks = [];
        for (let i = 0; i < tickCount; i++) {
            const theta = (i / tickCount) * Math.PI * 2;
            const cos = Math.cos(theta); const sin = Math.sin(theta);
            const px = origin.x + (u.x * cos + v.x * sin) * radius;
            const py = origin.y + (u.y * cos + v.y * sin) * radius;
            const pz = origin.z + (u.z * cos + v.z * sin) * radius;
            const localVerts = [{ u: 0, v: tickSize }, { u: tickSize*0.6, v: 0 }, { u: 0, v: -tickSize }, { u: -tickSize*0.6, v: 0 }];
            const worldVerts = localVerts.map(lv => {
                const rU = lv.u * cos - lv.v * sin; const rV = lv.u * sin + lv.v * cos; 
                return { x: px + u.x * rU + v.x * rV, y: py + u.y * rU + v.y * rV, z: pz + u.z * rU + v.z * rV };
            });
            const pNormal = GizmoMath.normalize({ x: px-origin.x, y: py-origin.y, z: pz-origin.z });
            const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, {x:px,y:py,z:pz}));
            if (GizmoMath.dot(pNormal, viewDir) < -0.2) continue;
            const projected = worldVerts.map(project);
            const pts = projected.map(p => `${p.x},${p.y}`).join(' ');
            ticks.push(<polygon key={i} points={pts} fill={color} fillOpacity={1.0} stroke="black" strokeWidth={0.5} className="pointer-events-none" />);
        }
        return <g>{ticks}</g>;
    };

    const renderTorusRing = (axis: Axis, color: string) => {
        const { axis: axisVec, u, v } = getRingBasis(axis);
        let visibility = 1.0;
        
        const isActive = visualState?.axis === axis;
        const isHover = hoverAxis === axis;
        const isOtherDragging = visualState && visualState.axis !== axis;
        
        if (isOtherDragging) visibility *= 0.3;

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
                onMouseDown={(e) => !isOtherDragging && startDrag(e, axis)}
                onMouseEnter={() => !visualState && setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className={isOtherDragging ? "pointer-events-none" : "cursor-pointer"}
            >
                <defs>
                    <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor={color} stopOpacity={0.4} />
                        <stop offset="50%" stopColor={color} stopOpacity={0.9} />
                        <stop offset="100%" stopColor={color} stopOpacity={0.4} />
                    </linearGradient>
                </defs>
                <polyline points={hitPoints} fill="none" stroke={color} strokeOpacity={0.0001} strokeWidth={20} strokeLinecap="round" />
                <g>{renderVolumetricMesh(worldVertices, geo.indices, fillStyle, opacity)}</g>
                {renderDecorations(radius, u, v, finalColor, opacity)}
            </g>
        );
    };
    
    const renderOrder = useMemo(() => {
        const transform = entity.components[ComponentType.TRANSFORM];
        const order = (transform.rotationOrder || 'XYZ') as RotationOrder;
        const axes = order.split('') as ('X'|'Y'|'Z')[];
        return [...axes].reverse();
    }, [entity.components[ComponentType.TRANSFORM].rotationOrder]);

    const getColor = (axis: string) => (axis === 'X' ? GIZMO_COLORS.X : axis === 'Y' ? GIZMO_COLORS.Y : GIZMO_COLORS.Z);

    return (
        <g>
            <circle cx={pCenter.x} cy={pCenter.y} r={scale * gizmoConfig.rotationRingSize * 0.8} fill="black" fillOpacity="0.05" className="pointer-events-none" />
            
            {renderTorusRing('VIEW', GIZMO_COLORS.Gray)}
            {renderOrder.map(axis => <React.Fragment key={axis}>{renderTorusRing(axis as Axis, getColor(axis))}</React.Fragment>)}
            
            {visualState && visualState.axis !== 'VIEW' && (
                <g pointerEvents="none" opacity={0.4}>
                    {(() => {
                        const radius = scale * gizmoConfig.rotationRingSize;
                        const color = getColor(visualState.axis as string);
                        const segments = Math.max(8, Math.floor(Math.abs(visualState.currentAngle) * 16 / (2 * Math.PI)));
                        let pts = `${pCenter.x},${pCenter.y} `;
                        for (let i = 0; i <= segments; i++) {
                            const t = i / segments;
                            const angle = visualState.currentAngle * t;
                            const theta = visualState.startAngle + angle;
                            const worldPt = {
                                x: origin.x + (visualState.u.x * Math.cos(theta) + visualState.v.x * Math.sin(theta)) * radius,
                                y: origin.y + (visualState.u.y * Math.cos(theta) + visualState.v.y * Math.sin(theta)) * radius,
                                z: origin.z + (visualState.u.z * Math.cos(theta) + visualState.v.z * Math.sin(theta)) * radius
                            };
                            const p = project(worldPt);
                            pts += `${p.x},${p.y} `;
                        }
                        return <polygon points={pts} fill={color} stroke="none" />;
                    })()}
                </g>
            )}
            
            {visualState && (
                <g pointerEvents="none">
                    <rect x={pCenter.x - 30} y={pCenter.y - scale * gizmoConfig.rotationRingSize - 35} width={60} height={20} fill="rgba(0,0,0,0.8)" rx={4} />
                    <text x={pCenter.x} y={pCenter.y - scale * gizmoConfig.rotationRingSize - 21} fill="white" textAnchor="middle" fontSize="11" fontWeight="bold">
                        {(visualState.currentAngle * (180/Math.PI)).toFixed(0)}°
                    </text>
                </g>
            )}
        </g>
    );
};
