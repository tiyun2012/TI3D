
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

export const TranslationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport }) => {
    const { gizmoConfig } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [dragState, setDragState] = useState<{
        axis: Axis;
        startX: number;
        startY: number;
        startPos: Vector3;
        screenAxis: { x: number, y: number };
        cameraBasis?: { right: Vector3, up: Vector3 };
    } | null>(null);

    const { origin, xAxis, yAxis, zAxis, scale } = basis;
    const axisLen = 1.8 * scale;
    const transform = entity.components[ComponentType.TRANSFORM];

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
            
            // Distance Factor
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
            } else if (dragState.axis === 'XZ') {
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
                const proj = dx * dragState.screenAxis.x + dy * dragState.screenAxis.y;
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
        e.stopPropagation(); e.preventDefault();
        
        let screenAxis = { x: 1, y: 0 };
        if (axis === 'X' || axis === 'Y' || axis === 'Z') {
            const target = axis === 'X' ? pX : axis === 'Y' ? pY : pZ;
            const dx = target.x - pCenter.x;
            const dy = target.y - pCenter.y;
            const len = Math.sqrt(dx*dx + dy*dy);
            if (len > 0.001) screenAxis = { x: dx/len, y: dy/len };
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
            cameraBasis
        });
    };

    // --- Volumetric Geometry Helper ---
    const renderVolumetricMesh = (
        vertices: Vector3[],
        indices: number[][],
        color: string,
        opacityMultiplier: number = 1.0,
        enableShading: boolean = true
    ) => {
         // 1. Project Vertices
        const projected = vertices.map(v => {
            const p = project(v);
            return { x: p.x, y: p.y, z: p.z, w: p.w, world: v };
        });

        // 2. Compute Face Depth and Normals
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

        // 3. Sort Faces (Painter's Algorithm)
        faces.sort((a, b) => b.depth - a.depth);

        // 4. Lighting Vector
        const lightDir = GizmoMath.normalize({ 
            x: basis.cameraPosition.x - origin.x + 2, 
            y: basis.cameraPosition.y - origin.y + 5, 
            z: basis.cameraPosition.z - origin.z + 2 
        });

        return faces.map((face, i) => {
            let faceColor = color;
            if (enableShading) {
                let intensity = Math.max(0, GizmoMath.dot(face.normal, lightDir));
                intensity = 0.4 + intensity * 0.6; 
                const brightness = Math.floor((intensity - 0.5) * 50);
                faceColor = ColorUtils.shade(color, brightness);
            }

            const pts = face.indices.map(idx => `${projected[idx].x},${projected[idx].y}`).join(' ');
            return (
                <polygon 
                    key={i} 
                    points={pts} 
                    fill={faceColor} 
                    stroke={faceColor} 
                    strokeWidth={0.5}
                    fillOpacity={opacityMultiplier}
                    strokeLinejoin="round"
                    pointerEvents="none"
                />
            );
        });
    };

    const renderCenterHandle = () => {
        if (gizmoConfig.centerHandleShape === 'NONE') return null;

        const size = scale * 0.15;
        const color = dragState?.axis === 'VIEW' || hoverAxis === 'VIEW' ? GIZMO_COLORS.Center : '#aaaaaa';
        const opacity = dragState?.axis === 'VIEW' || hoverAxis === 'VIEW' ? 1.0 : 0.8;

        let vertices: Vector3[] = [];
        let indices: number[][] = [];
        const toWorld = (x:number, y:number, z:number) => ({
            x: origin.x + x * size, y: origin.y + y * size, z: origin.z + z * size
        });

        if (gizmoConfig.centerHandleShape === 'CUBE') {
            vertices = [
                toWorld(-1,-1,-1), toWorld(1,-1,-1), toWorld(1,1,-1), toWorld(-1,1,-1),
                toWorld(-1,-1,1), toWorld(1,-1,1), toWorld(1,1,1), toWorld(-1,1,1)
            ];
            indices = [
                [0,1,2,3], [4,7,6,5], [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0]
            ];
        } else if (gizmoConfig.centerHandleShape === 'RHOMBUS') {
             // Octahedron
            vertices = [
                toWorld(0,-1.2,0), // Bottom
                toWorld(0,1.2,0),  // Top
                toWorld(-1,0,0), toWorld(0,0,-1), toWorld(1,0,0), toWorld(0,0,1) // Equator
            ];
            indices = [
                [0,3,2], [0,4,3], [0,5,4], [0,2,5], // Bottom
                [1,2,3], [1,3,4], [1,4,5], [1,5,2]  // Top
            ];
        } else if (gizmoConfig.centerHandleShape === 'SPHERE') {
            // Icosahedron (approx sphere)
            const t = 1.618;
            const vs = [
                [-1,  t,  0], [ 1,  t,  0], [-1, -t,  0], [ 1, -t,  0],
                [ 0, -1,  t], [ 0,  1,  t], [ 0, -1, -t], [ 0,  1, -t],
                [ t,  0, -1], [ t,  0,  1], [-t,  0, -1], [-t,  0,  1]
            ];
            vertices = vs.map(v => toWorld(v[0]*0.6, v[1]*0.6, v[2]*0.6));
            indices = [
                 [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
                 [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
                 [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
                 [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
            ];
        }

        return (
            <g
                onMouseDown={(e) => startDrag(e, 'VIEW')}
                onMouseEnter={() => setHoverAxis('VIEW')}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-move"
            >
                {/* Hit Box */}
                <circle cx={pCenter.x} cy={pCenter.y} r={20} fill="transparent" />
                {renderVolumetricMesh(vertices, indices, color, opacity, true)}
            </g>
        );
    };

    const renderArrowHead = (
        axis: Axis, 
        baseCenter: Vector3, 
        direction: Vector3, 
        up: Vector3, 
        right: Vector3, 
        color: string
    ) => {
        const shape = gizmoConfig.translationShape;
        const headWidth = scale * 0.15;
        const headLength = scale * 0.35;
        
        let vertices: Vector3[] = [];
        let indices: number[][] = [];

        const toWorld = (u: number, v: number, w: number) => ({
            x: baseCenter.x + (right.x * u * headWidth) + (up.x * v * headWidth) + (direction.x * w * headLength),
            y: baseCenter.y + (right.y * u * headWidth) + (up.y * v * headWidth) + (direction.y * w * headLength),
            z: baseCenter.z + (right.z * u * headWidth) + (up.z * v * headWidth) + (direction.z * w * headLength),
        });

        if (shape === 'CUBE') {
            const s = 0.8;
            vertices = [
                toWorld(-s, -s, 0), toWorld(s, -s, 0), toWorld(s, s, 0), toWorld(-s, s, 0), 
                toWorld(-s, -s, 1), toWorld(s, -s, 1), toWorld(s, s, 1), toWorld(-s, s, 1)  
            ];
            indices = [[0,1,2,3], [4,7,6,5], [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0]];
        } 
        else if (shape === 'TETRAHEDRON') {
            const rad0 = 0;
            const rad120 = (2 * Math.PI) / 3;
            const rad240 = (4 * Math.PI) / 3;
            vertices = [
                toWorld(Math.cos(rad0), Math.sin(rad0), 0),
                toWorld(Math.cos(rad120), Math.sin(rad120), 0),
                toWorld(Math.cos(rad240), Math.sin(rad240), 0),
                toWorld(0, 0, 1) 
            ];
            indices = [[0, 2, 1], [0, 1, 3], [1, 2, 3], [2, 0, 3]];
        }
        else if (shape === 'RHOMBUS') {
            vertices = [
                toWorld(0, 0, 0), 
                toWorld(1, 0, 0.5), toWorld(0, 1, 0.5), toWorld(-1, 0, 0.5), toWorld(0, -1, 0.5), 
                toWorld(0, 0, 1) 
            ];
            indices = [[0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 1, 4], [1, 2, 5], [2, 3, 5], [3, 4, 5], [4, 1, 5]];
        }
        else { 
            // CONE
            const segs = 8;
            for(let i=0; i<segs; i++) {
                const theta = (i/segs) * Math.PI * 2;
                vertices.push(toWorld(Math.cos(theta), Math.sin(theta), 0));
            }
            vertices.push(toWorld(0, 0, 1)); // Tip is index 8
            indices.push([7,6,5,4,3,2,1,0]);
            for(let i=0; i<segs; i++) indices.push([i, (i+1)%segs, 8]);
        }

        return renderVolumetricMesh(vertices, indices, color);
    };

    const renderArrow = (axis: Axis, tipPos: any, color: string, vec: Vector3, up: Vector3, right: Vector3) => {
        const opacity = GizmoMath.getAxisOpacity(vec, basis.cameraPosition, origin);
        if (opacity < 0.1) return null;

        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;
        const finalColor = isActive || isHover ? GIZMO_COLORS.Hover : color;
        const stemLen = axisLen * 0.82;
        
        const pBase = { x: origin.x + vec.x * stemLen, y: origin.y + vec.y * stemLen, z: origin.z + vec.z * stemLen };
        const sBase = project(pBase);

        return (
            <g
                onMouseDown={(e) => startDrag(e, axis)}
                onMouseEnter={() => setHoverAxis(axis)}
                onMouseLeave={() => setHoverAxis(null)}
                className="cursor-pointer"
                opacity={opacity}
            >
                {/* Hit Box */}
                <line x1={pCenter.x} y1={pCenter.y} x2={tipPos.x} y2={tipPos.y} stroke="transparent" strokeWidth={20} />
                {/* Stem */}
                <line x1={pCenter.x} y1={pCenter.y} x2={sBase.x} y2={sBase.y} stroke={finalColor} strokeWidth={isActive ? 4 : 2} />
                {/* Head */}
                {renderArrowHead(axis, pBase, vec, up, right, finalColor)}
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
            
            {renderCenterHandle()}
        </g>
    );
};
