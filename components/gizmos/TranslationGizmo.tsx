
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

        // Apply Center Handle Size Config
        const size = scale * 0.15 * gizmoConfig.centerHandleSize;
        
        const isActive = dragState?.axis === 'VIEW';
        const isHover = hoverAxis === 'VIEW';

        // Apply Center Handle Color Config (use Press color if active)
        const baseColor = gizmoConfig.centerHandleColor;
        const color = isActive ? gizmoConfig.axisPressColor : (isHover ? baseColor : baseColor);
        const opacity = isActive || isHover ? 1.0 : 0.9;

        // Handle the unique QUAD_CIRCLES shape (2D Screen Space)
        if (gizmoConfig.centerHandleShape === 'QUAD_CIRCLES') {
             const r = 18 * gizmoConfig.centerHandleSize; // Base pixel radius
             const rSmall = r * 0.25;
             const offset = r * 0.45; // Quadrant offset

             return (
                <g
                    onMouseDown={(e) => startDrag(e, 'VIEW')}
                    onMouseEnter={() => setHoverAxis('VIEW')}
                    onMouseLeave={() => setHoverAxis(null)}
                    className="cursor-move"
                    style={{ transform: `translate(${pCenter.x}px, ${pCenter.y}px)` }} // Position via CSS transform
                >
                   {/* Main Outline Circle */}
                   <circle cx={0} cy={0} r={r} fill={color} fillOpacity={isActive ? 0.3 : 0.1} stroke={color} strokeWidth={2} />
                   
                   {/* 4 Small Circles in Quadrants */}
                   <circle cx={offset} cy={-offset} r={rSmall} fill={color} />
                   <circle cx={-offset} cy={-offset} r={rSmall} fill={color} />
                   <circle cx={offset} cy={offset} r={rSmall} fill={color} />
                   <circle cx={-offset} cy={offset} r={rSmall} fill={color} />
                </g>
             );
        }

        // 3D Geometry fallback for CUBE, SPHERE, RHOMBUS
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
        // Apply Arrow Size Configuration
        const headWidth = scale * 0.15 * gizmoConfig.arrowSize;
        const headLength = scale * 0.35 * gizmoConfig.arrowSize;
        
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

    const renderArrow = (axis: Axis, tipPos: any, baseColor: string, vec: Vector3, up: Vector3, right: Vector3) => {
        const opacity = GizmoMath.getAxisOpacity(vec, basis.cameraPosition, origin);
        if (opacity < 0.1) return null;

        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;
        
        // Apply Interaction Configuration (Thickness with Offsets)
        const baseThickness = gizmoConfig.axisBaseThickness;
        let strokeWidth = baseThickness;
        if (isActive) strokeWidth = baseThickness * gizmoConfig.axisPressThicknessOffset;
        else if (isHover) strokeWidth = baseThickness * gizmoConfig.axisHoverThicknessOffset;

        // Apply Interaction Configuration (Color)
        let finalColor = baseColor;
        if (isActive) finalColor = gizmoConfig.axisPressColor;
        else if (isHover) finalColor = gizmoConfig.axisHoverColor;
        
        // Stem length logic - slightly shorter than full axis length to account for head
        // With scaling, we keep the ratio consistent
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
                <line x1={pCenter.x} y1={pCenter.y} x2={sBase.x} y2={sBase.y} stroke={finalColor} strokeWidth={strokeWidth} />
                {/* Head */}
                {renderArrowHead(axis, pBase, vec, up, right, finalColor)}
            </g>
        );
    };

    const renderPlane = (axis: Axis, col: string, u: Vector3, v: Vector3) => {
        // Base distance from center
        const dist = scale * 0.3;
        // Size of the handle
        const size = scale * 0.2 * gizmoConfig.planeHandleSize;
        
        // Corner start position
        const pos = {
            x: origin.x + (u.x + v.x) * dist,
            y: origin.y + (u.y + v.y) * dist,
            z: origin.z + (u.z + v.z) * dist
        };

        const shape = gizmoConfig.planeHandleShape;
        let p1, p2, p3, p4;

        if (shape === 'CIRCLE') {
            // Approx circle with 8 points
            const center = {
                x: pos.x + (u.x + v.x) * size * 0.5,
                y: pos.y + (u.y + v.y) * size * 0.5,
                z: pos.z + (u.z + v.z) * size * 0.5
            };
            const radius = size * 0.5;
            const points = [];
            for(let i=0; i<8; i++) {
                const ang = (i/8) * Math.PI * 2;
                const cos = Math.cos(ang);
                const sin = Math.sin(ang);
                points.push({
                    x: center.x + (u.x * cos + v.x * sin) * radius,
                    y: center.y + (u.y * cos + v.y * sin) * radius,
                    z: center.z + (u.z * cos + v.z * sin) * radius
                });
            }
            const projPoints = points.map(project).map(p => `${p.x},${p.y}`).join(' ');
            
            const isActive = dragState?.axis === axis;
            const isHover = hoverAxis === axis;

            return (
                <polygon
                    points={projPoints}
                    fill={col}
                    fillOpacity={isActive || isHover ? 0.8 : 0.3}
                    stroke={isActive || isHover ? "white" : "none"}
                    onMouseDown={(e) => startDrag(e, axis)}
                    onMouseEnter={() => setHoverAxis(axis)}
                    onMouseLeave={() => setHoverAxis(null)}
                    className="cursor-pointer"
                />
            );
        }
        else if (shape === 'RHOMBUS') {
            // Rhombus shape
            //       v3
            //      /  \
            //    v4    v2
            //      \  /
            //       v1
            
            // v1
            p1 = { x: pos.x + v.x * (size*0.5), y: pos.y + v.y * (size*0.5), z: pos.z + v.z * (size*0.5) };
            // v2
            p2 = { x: pos.x + u.x * (size*0.5) + v.x * size, y: pos.y + u.y * (size*0.5) + v.y * size, z: pos.z + u.z * (size*0.5) + v.z * size };
            // v3
            p3 = { x: pos.x + u.x * size + v.x * (size*0.5), y: pos.y + u.y * size + v.y * (size*0.5), z: pos.z + u.z * size + v.z * (size*0.5) };
            // v4
            p4 = { x: pos.x + u.x * (size*0.5), y: pos.y + u.y * (size*0.5), z: pos.z + u.z * (size*0.5) };

        } else {
            // SQUARE (Default)
            p1 = pos;
            p2 = { x: pos.x + u.x * size, y: pos.y + u.y * size, z: pos.z + u.z * size };
            p3 = { x: pos.x + u.x * size + v.x * size, y: pos.y + u.y * size + v.y * size, z: pos.z + u.z * size + v.z * size };
            p4 = { x: pos.x + v.x * size, y: pos.y + v.y * size, z: pos.z + v.z * size };
        }

        const pp1 = project(p1);
        const pp2 = project(p2);
        const pp3 = project(p3);
        const pp4 = project(p4);

        const isActive = dragState?.axis === axis;
        const isHover = hoverAxis === axis;

        return (
            <polygon
                points={`${pp1.x},${pp1.y} ${pp2.x},${pp2.y} ${pp3.x},${pp3.y} ${pp4.x},${pp4.y}`}
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
