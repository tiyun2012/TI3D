
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
            
            const proj = dx * dragState.screenAxis.x + dy * dragState.screenAxis.y;
            
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

        setDragState({
            axis,
            startX: e.clientX,
            startY: e.clientY,
            startPos: { ...transform.position },
            screenAxis
        });
    };

    // --- Volumetric Rendering Logic ---
    const renderVolumetricHead = (
        axis: Axis, 
        baseCenter: Vector3, 
        direction: Vector3, 
        up: Vector3, 
        right: Vector3, 
        color: string
    ) => {
        const shape = gizmoConfig.translationShape;
        const headWidth = scale * 0.15;
        const headLength = scale * 0.35; // Length of the head
        
        // Vertices for the shape
        let vertices: Vector3[] = [];
        let indices: number[][] = [];

        // Helper to transform local (u,v,w) to world relative to baseCenter
        // u=right, v=up, w=direction (forward)
        const toWorld = (u: number, v: number, w: number) => ({
            x: baseCenter.x + (right.x * u * headWidth) + (up.x * v * headWidth) + (direction.x * w * headLength),
            y: baseCenter.y + (right.y * u * headWidth) + (up.y * v * headWidth) + (direction.y * w * headLength),
            z: baseCenter.z + (right.z * u * headWidth) + (up.z * v * headWidth) + (direction.z * w * headLength),
        });

        if (shape === 'CUBE') {
            // Cube centered at base + half length
            // 8 Vertices
            // Base Face (w=0): 0,1,2,3
            // Far Face (w=1): 4,5,6,7
            const s = 0.8;
            vertices = [
                toWorld(-s, -s, 0), toWorld(s, -s, 0), toWorld(s, s, 0), toWorld(-s, s, 0), // Base
                toWorld(-s, -s, 1), toWorld(s, -s, 1), toWorld(s, s, 1), toWorld(-s, s, 1)  // Top
            ];
            indices = [
                [0,1,2,3], [4,7,6,5], // Bottom, Top (Tip side)
                [0,4,5,1], [1,5,6,2], [2,6,7,3], [3,7,4,0] // Sides
            ];
        } 
        else if (shape === 'TETRAHEDRON') {
            // Base Triangle (0,1,2) at w=0 -> Tip (3) at w=1
            const rad0 = 0;
            const rad120 = (2 * Math.PI) / 3;
            const rad240 = (4 * Math.PI) / 3;
            
            vertices = [
                toWorld(Math.cos(rad0), Math.sin(rad0), 0),
                toWorld(Math.cos(rad120), Math.sin(rad120), 0),
                toWorld(Math.cos(rad240), Math.sin(rad240), 0),
                toWorld(0, 0, 1) // Tip
            ];
            indices = [
                [0, 2, 1], // Base
                [0, 1, 3], // Side 1
                [1, 2, 3], // Side 2
                [2, 0, 3]  // Side 3
            ];
        }
        else if (shape === 'RHOMBUS') {
            // Octahedron: Base Square at w=0.5, Tip at w=1, Bottom Tip at w=0
            // Actually, typical Rhombus arrow head:
            // Base at w=0, Wide part at w=0.5, Tip at w=1
            vertices = [
                toWorld(0, 0, 0), // Bottom Tip (Base connection)
                toWorld(1, 0, 0.5), toWorld(0, 1, 0.5), toWorld(-1, 0, 0.5), toWorld(0, -1, 0.5), // Mid Ring
                toWorld(0, 0, 1)  // Top Tip
            ];
            indices = [
                // Bottom Pyramid
                [0, 2, 1], [0, 3, 2], [0, 4, 3], [0, 1, 4],
                // Top Pyramid
                [1, 2, 5], [2, 3, 5], [3, 4, 5], [4, 1, 5]
            ];
        }
        else { 
            // CONE (Approximated as Octagonal Pyramid)
            // Base 8 vertices at w=0, Tip at w=1
            const segs = 8;
            for(let i=0; i<segs; i++) {
                const theta = (i/segs) * Math.PI * 2;
                vertices.push(toWorld(Math.cos(theta), Math.sin(theta), 0));
            }
            vertices.push(toWorld(0, 0, 1)); // Tip is index 8
            
            // Base Face
            indices.push([7,6,5,4,3,2,1,0]);
            
            // Side Faces
            for(let i=0; i<segs; i++) {
                const next = (i+1)%segs;
                indices.push([i, next, 8]);
            }
        }

        // --- Render Pipeline ---
        // 1. Project Vertices
        const projected = vertices.map(v => {
            const p = project(v);
            return { x: p.x, y: p.y, z: p.z, w: p.w, world: v };
        });

        // 2. Compute Face Depth and Normals
        const faces = indices.map(idx => {
            // Depth (Average W or Z) - using W for perspective correctness in sorting
            let avgW = 0;
            let avgZ = 0;
            idx.forEach(i => { avgW += projected[i].w; avgZ += projected[i].z; });
            avgW /= idx.length;
            avgZ /= idx.length; // Use Z for GL-style depth if W is normalized, but here w is camera space z usually.
            
            // Calculate Normal (World Space) for Lighting
            const p0 = vertices[idx[0]];
            const p1 = vertices[idx[1]];
            const p2 = vertices[idx[2]];
            const v1 = GizmoMath.sub(p1, p0);
            const v2 = GizmoMath.sub(p2, p0);
            const normal = GizmoMath.normalize(GizmoMath.cross(v1, v2));
            
            return { indices: idx, depth: avgW, normal };
        });

        // 3. Sort Faces (Painter's Algorithm: Furthest first -> Descending Depth)
        faces.sort((a, b) => b.depth - a.depth);

        // 4. Lighting Vector (Static Direction from camera/top-left)
        // Simple directional light from Camera + Up
        const lightDir = GizmoMath.normalize({ 
            x: basis.cameraPosition.x - origin.x + 2, 
            y: basis.cameraPosition.y - origin.y + 5, 
            z: basis.cameraPosition.z - origin.z + 2 
        });

        // 5. Render
        return faces.map((face, i) => {
            // Lighting calculation
            let intensity = Math.max(0, GizmoMath.dot(face.normal, lightDir));
            // Ambient + Diffuse
            intensity = 0.4 + intensity * 0.6; 
            
            // Adjust Color
            // Map intensity 0..1 to Dark..Base..Light
            // Simple approach: Base color +/- brightness
            const brightness = Math.floor((intensity - 0.5) * 50); // -25% to +25%
            const faceColor = ColorUtils.shade(color, brightness);

            const pts = face.indices.map(idx => `${projected[idx].x},${projected[idx].y}`).join(' ');
            
            return (
                <polygon 
                    key={i} 
                    points={pts} 
                    fill={faceColor} 
                    stroke={faceColor} 
                    strokeWidth={0.5}
                    strokeLinejoin="round"
                />
            );
        });
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
                {/* Hit Box (Invisible thick line) */}
                <line x1={pCenter.x} y1={pCenter.y} x2={tipPos.x} y2={tipPos.y} stroke="transparent" strokeWidth={20} />
                
                {/* Stem */}
                <line x1={pCenter.x} y1={pCenter.y} x2={sBase.x} y2={sBase.y} stroke={finalColor} strokeWidth={isActive ? 4 : 2} />
                
                {/* Volumetric Head */}
                {renderVolumetricHead(axis, pBase, vec, up, right, finalColor)}
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
