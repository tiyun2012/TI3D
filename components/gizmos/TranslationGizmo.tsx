import React, { useState, useEffect, useContext, useMemo, useRef } from 'react';
import { Entity, ComponentType, Vector3 } from '../../types';
import { engineInstance } from '../../services/engine';
import { GizmoBasis, GizmoMath, GIZMO_COLORS, Axis } from './GizmoUtils';
import { EditorContext } from '../../contexts/EditorContext';
import { Mat4Utils, Vec3Utils } from '../../services/math';

interface Props {
    entity: Entity;
    basis: GizmoBasis;
    vpMatrix: Float32Array;
    viewport: { width: number; height: number };
    containerRef: React.RefObject<HTMLDivElement | null>;
}

// Fixed Interface: Added 'axis' property
interface DragState {
    axis: Axis; 
    startWorldPos: Vector3;
    clickOffset: Vector3;
    planeNormal: Vector3;
    planeOrigin: Vector3;
    axisVector?: Vector3;
    invParentMatrix: Float32Array;
    pointerId: number;
}

interface GizmoRefs {
    xAxisLine: SVGLineElement | null;
    yAxisLine: SVGLineElement | null;
    zAxisLine: SVGLineElement | null;
    center: SVGCircleElement | null;
    xHead: SVGPolygonElement | null;
    yHead: SVGPolygonElement | null;
    zHead: SVGPolygonElement | null;
}

export const TranslationGizmo: React.FC<Props> = ({ entity, basis, vpMatrix, viewport, containerRef }) => {
    const { gizmoConfig, transformSpace, snapSettings } = useContext(EditorContext)!;
    const [hoverAxis, setHoverAxis] = useState<Axis | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [, setTick] = useState(0); 

    const positionRef = useRef<Vector3>(basis.origin);
    const lastPosRef = useRef<Vector3>(basis.origin);
    
    // Use the fixed interface
    const dragRef = useRef<DragState | null>(null);
    
    const svgRefs = useRef<GizmoRefs>({
        xAxisLine: null, yAxisLine: null, zAxisLine: null,
        center: null, xHead: null, yHead: null, zHead: null
    });

    const updateGizmoVisuals = (origin: Vector3) => {
        const refs = svgRefs.current;
        const scale = basis.scale;
        
        let xAxis = basis.xAxis, yAxis = basis.yAxis, zAxis = basis.zAxis;
        if (transformSpace === 'World') {
            xAxis = { x: 1, y: 0, z: 0 }; yAxis = { x: 0, y: 1, z: 0 }; zAxis = { x: 0, y: 0, z: 1 };
        }

        const axisLen = 1.8 * scale * gizmoConfig.arrowOffset;
        const stemLen = axisLen * 0.82;
        const width = viewport.width;
        const height = viewport.height;
        const vp = vpMatrix;

        const pCenter = GizmoMath.project(origin, vp, width, height);

        const updateAxis = (vec: Vector3, line: SVGLineElement | null, head: SVGPolygonElement | null) => {
            if (!line && !head) return;
            const pBase = GizmoMath.project({ 
                x: origin.x + vec.x * stemLen, 
                y: origin.y + vec.y * stemLen, 
                z: origin.z + vec.z * stemLen 
            }, vp, width, height);

            if (line) {
                line.setAttribute('x1', pCenter.x.toString());
                line.setAttribute('y1', pCenter.y.toString());
                line.setAttribute('x2', pBase.x.toString());
                line.setAttribute('y2', pBase.y.toString());
            }
            if (head) {
                const tip = GizmoMath.project({
                    x: origin.x + vec.x * axisLen,
                    y: origin.y + vec.y * axisLen,
                    z: origin.z + vec.z * axisLen
                }, vp, width, height);
                // Simple diamond head for fast updates
                const pts = `${tip.x},${tip.y} ${pBase.x-3},${pBase.y-3} ${pBase.x+3},${pBase.y+3}`; 
                head.setAttribute('points', pts);
            }
        };

        updateAxis(xAxis, refs.xAxisLine, refs.xHead);
        updateAxis(yAxis, refs.yAxisLine, refs.yHead);
        updateAxis(zAxis, refs.zAxisLine, refs.zHead);
        
        if (refs.center) {
            refs.center.setAttribute('cx', pCenter.x.toString());
            refs.center.setAttribute('cy', pCenter.y.toString());
        }
    };

    useEffect(() => {
        let rAF = 0;
        const syncLoop = () => {
            if (!isDragging) {
                const currentPos = engineInstance.sceneGraph.getWorldPosition(entity.id);
                if (Math.abs(currentPos.x - lastPosRef.current.x) > 0.0001 || 
                    Math.abs(currentPos.y - lastPosRef.current.y) > 0.0001 || 
                    Math.abs(currentPos.z - lastPosRef.current.z) > 0.0001) {
                    positionRef.current = currentPos;
                    lastPosRef.current = currentPos;
                    setTick(t => t + 1);
                }
            }
            rAF = requestAnimationFrame(syncLoop);
        };
        rAF = requestAnimationFrame(syncLoop);
        return () => cancelAnimationFrame(rAF);
    }, [entity.id, isDragging]);

    const onPointerDown = (e: React.PointerEvent, axis: Axis) => {
        e.preventDefault();
        e.stopPropagation();
        
        const target = e.currentTarget as Element;
        target.setPointerCapture(e.pointerId);

        const startWorldPos = { ...positionRef.current };
        
        // FIX: Access public engine properties directly
        const currentVP = engineInstance.currentViewProj || vpMatrix;
        
        const invVP = new Float32Array(16);
        if (!Mat4Utils.invert(currentVP, invVP)) return;

        // FIX: Use containerRef for rect
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const ray = GizmoMath.screenToRay(
            e.clientX - rect.left, 
            e.clientY - rect.top, 
            rect.width, rect.height, 
            invVP, 
            basis.cameraPosition
        );

        let axisVector: Vector3 | undefined;
        let planeNormal: Vector3 = { x: 0, y: 1, z: 0 };
        
        const effBasis = transformSpace === 'World' ? {
            xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 }, zAxis: { x: 0, y: 0, z: 1 }
        } : basis;

        if (axis === 'X' || axis === 'Y' || axis === 'Z') {
            axisVector = axis === 'X' ? effBasis.xAxis : (axis === 'Y' ? effBasis.yAxis : effBasis.zAxis);
            const viewDir = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, startWorldPos));
            const n1 = axis === 'X' ? effBasis.yAxis : (axis === 'Y' ? effBasis.zAxis : effBasis.xAxis);
            const n2 = axis === 'X' ? effBasis.zAxis : (axis === 'Y' ? effBasis.xAxis : effBasis.yAxis);
            planeNormal = Math.abs(GizmoMath.dot(viewDir, n1)) > Math.abs(GizmoMath.dot(viewDir, n2)) ? n1 : n2;
        } 
        else if (axis === 'VIEW') {
            planeNormal = GizmoMath.normalize(GizmoMath.sub(basis.cameraPosition, startWorldPos));
        }
        else {
            planeNormal = axis === 'XY' ? effBasis.zAxis : (axis === 'XZ' ? effBasis.yAxis : effBasis.xAxis);
        }

        const hit = GizmoMath.rayPlaneIntersection(ray.origin, ray.direction, startWorldPos, planeNormal);
        if (hit) {
            const clickOffset = GizmoMath.sub(hit, startWorldPos);
            
            const parentId = engineInstance.sceneGraph.getParentId(entity.id);
            const parentMat = Mat4Utils.create();
            if (parentId) {
                const pm = engineInstance.sceneGraph.getWorldMatrix(parentId);
                if (pm) Mat4Utils.copy(parentMat, pm);
            }
            const invParentMatrix = Mat4Utils.create();
            Mat4Utils.invert(parentMat, invParentMatrix);

            dragRef.current = {
                axis,
                startWorldPos,
                clickOffset,
                planeNormal,
                planeOrigin: startWorldPos,
                axisVector,
                invParentMatrix,
                pointerId: e.pointerId
            };
            setIsDragging(true);
        }
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !dragRef.current) return;
        const data = dragRef.current;

        const currentVP = engineInstance.currentViewProj || vpMatrix;
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        
        const invVP = new Float32Array(16);
        Mat4Utils.invert(currentVP, invVP);

        const ray = GizmoMath.screenToRay(
            e.clientX - rect.left, 
            e.clientY - rect.top, 
            rect.width, rect.height, 
            invVP, 
            basis.cameraPosition
        );

        const hit = GizmoMath.rayPlaneIntersection(ray.origin, ray.direction, data.planeOrigin, data.planeNormal);

        if (hit) {
            let target = GizmoMath.sub(hit, data.clickOffset);

            if (data.axisVector) {
                const v = GizmoMath.sub(target, data.startWorldPos);
                const d = GizmoMath.dot(v, data.axisVector);
                const move = GizmoMath.scale(data.axisVector, d);
                target = GizmoMath.add(data.startWorldPos, move);
            }

            if (snapSettings.active) {
                const snap = snapSettings.move;
                const raw = GizmoMath.sub(target, data.startWorldPos);
                if (transformSpace === 'World') {
                    raw.x = Math.round(raw.x/snap)*snap; raw.y = Math.round(raw.y/snap)*snap; raw.z = Math.round(raw.z/snap)*snap;
                } else {
                    if (data.axisVector) {
                        const mag = Math.round(GizmoMath.dot(raw, data.axisVector)/snap)*snap;
                        const v = GizmoMath.scale(data.axisVector, mag);
                        raw.x=v.x; raw.y=v.y; raw.z=v.z;
                    } else {
                        raw.x = Math.round(raw.x/snap)*snap; raw.y = Math.round(raw.y/snap)*snap; raw.z = Math.round(raw.z/snap)*snap;
                    }
                }
                target = GizmoMath.add(data.startWorldPos, raw);
            }

            const transform = entity.components[ComponentType.TRANSFORM];
            const localPos = Vec3Utils.create();
            Vec3Utils.transformMat4(target, data.invParentMatrix, localPos);
            transform.position.x = localPos.x; transform.position.y = localPos.y; transform.position.z = localPos.z;

            engineInstance.syncTransforms();
            positionRef.current = target;
            updateGizmoVisuals(target);
        }
    };

    const onPointerUp = (e: React.PointerEvent) => {
        if (isDragging) {
            const target = e.currentTarget as Element;
            target.releasePointerCapture(e.pointerId);
            setIsDragging(false);
            dragRef.current = null;
            engineInstance.pushUndoState();
            setTick(t => t + 1);
        }
    };

    const effectiveBasis = useMemo(() => {
        const origin = positionRef.current;
        if (transformSpace === 'World') {
            return { ...basis, origin, xAxis: { x: 1, y: 0, z: 0 }, yAxis: { x: 0, y: 1, z: 0 }, zAxis: { x: 0, y: 0, z: 1 } };
        }
        return { ...basis, origin };
    }, [basis, transformSpace, positionRef.current]);

    const { origin, xAxis, yAxis, zAxis, scale } = effectiveBasis;
    const axisLen = 1.8 * scale * gizmoConfig.arrowOffset;
    const projectLocal = (v: Vector3) => GizmoMath.project(v, vpMatrix, viewport.width, viewport.height);
    const pCenter = projectLocal(origin);
    const pX = projectLocal({ x: origin.x + xAxis.x * axisLen, y: origin.y + xAxis.y * axisLen, z: origin.z + xAxis.z * axisLen });
    const pY = projectLocal({ x: origin.x + yAxis.x * axisLen, y: origin.y + yAxis.y * axisLen, z: origin.z + yAxis.z * axisLen });
    const pZ = projectLocal({ x: origin.x + zAxis.x * axisLen, y: origin.y + zAxis.y * axisLen, z: origin.z + zAxis.z * axisLen });

    const renderArrow = (axisKey: Axis, pTip: any, color: string, vec: Vector3) => {
        const stemLen = axisLen * 0.82;
        const pBase = projectLocal({ x: origin.x + vec.x * stemLen, y: origin.y + vec.y * stemLen, z: origin.z + vec.z * stemLen });
        
        return (
            <g onPointerDown={(e) => onPointerDown(e, axisKey)} onPointerMove={onPointerMove} onPointerUp={onPointerUp} className="cursor-pointer">
                <line x1={pCenter.x} y1={pCenter.y} x2={pTip.x} y2={pTip.y} stroke="transparent" strokeWidth={20} />
                <line 
                    ref={(el) => { if(axisKey==='X') svgRefs.current.xAxisLine=el; if(axisKey==='Y') svgRefs.current.yAxisLine=el; if(axisKey==='Z') svgRefs.current.zAxisLine=el; }}
                    x1={pCenter.x} y1={pCenter.y} x2={pBase.x} y2={pBase.y} stroke={color} strokeWidth={4} 
                />
                <polygon 
                    ref={(el) => { if(axisKey==='X') svgRefs.current.xHead=el; if(axisKey==='Y') svgRefs.current.yHead=el; if(axisKey==='Z') svgRefs.current.zHead=el; }}
                    points="" fill={color} stroke={color} strokeWidth={0.5} strokeLinejoin="round" pointerEvents="none" 
                />
            </g>
        );
    };

    const renderPlane = (axisKey: Axis, col: string, u: Vector3, v: Vector3) => {
        const dist = scale * gizmoConfig.planeOffset; const size = scale * 0.2 * gizmoConfig.planeHandleSize;
        const p1 = { x: origin.x + (u.x+v.x)*dist, y: origin.y + (u.y+v.y)*dist, z: origin.z + (u.z+v.z)*dist };
        const p2 = { x: p1.x+u.x*size, y: p1.y+u.y*size, z: p1.z+u.z*size };
        const p3 = { x: p1.x+u.x*size+v.x*size, y: p1.y+u.y*size+v.y*size, z: p1.z+u.z*size+v.z*size };
        const p4 = { x: p1.x+v.x*size, y: p1.y+v.y*size, z: p1.z+v.z*size };
        const [pp1, pp2, pp3, pp4] = [p1, p2, p3, p4].map(projectLocal);
        return (
            <polygon 
                onPointerDown={(e) => onPointerDown(e, axisKey)} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
                points={`${pp1.x},${pp1.y} ${pp2.x},${pp2.y} ${pp3.x},${pp3.y} ${pp4.x},${pp4.y}`} 
                fill={col} fillOpacity={0.3} className="cursor-pointer" 
            />
        );
    };

    return (
        <g>
            {renderPlane('XY', GIZMO_COLORS.Z, xAxis, yAxis)}
            {renderPlane('XZ', GIZMO_COLORS.Y, xAxis, zAxis)}
            {renderPlane('YZ', GIZMO_COLORS.X, yAxis, zAxis)}
            {renderArrow('Z', pZ, GIZMO_COLORS.Z, zAxis)}
            {renderArrow('Y', pY, GIZMO_COLORS.Y, yAxis)}
            {renderArrow('X', pX, GIZMO_COLORS.X, xAxis)}
            <circle 
                ref={(el) => { svgRefs.current.center = el; }}
                cx={pCenter.x} cy={pCenter.y} r={6} fill="white" className="cursor-move"
                onPointerDown={(e) => onPointerDown(e, 'VIEW')} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
            />
        </g>
    );
};