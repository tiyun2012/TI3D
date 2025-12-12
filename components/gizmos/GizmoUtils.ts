
import { Mat4Utils } from '../../services/math';
import { Vector3 } from '../../types';

export type Axis = 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ' | 'UNIFORM' | 'VIEW';
export type GizmoArrowShape = 'CONE' | 'TETRAHEDRON' | 'RHOMBUS' | 'CUBE';
export type GizmoCenterShape = 'NONE' | 'CUBE' | 'SPHERE' | 'RHOMBUS';
export type GizmoPlaneShape = 'SQUARE' | 'CIRCLE' | 'RHOMBUS';

export interface GizmoConfiguration {
    translationShape: GizmoArrowShape;
    centerHandleShape: GizmoCenterShape;
    planeHandleShape: GizmoPlaneShape;
    arrowSize: number;
    arrowOffset: number;
    planeHandleSize: number;
}

export const DEFAULT_GIZMO_CONFIG: GizmoConfiguration = {
    translationShape: 'CONE',
    centerHandleShape: 'CUBE',
    planeHandleShape: 'SQUARE',
    arrowSize: 0.33,
    arrowOffset: 1.0,
    planeHandleSize: 1.0
};

export const GIZMO_COLORS = {
    X: '#ef4444', // Red
    Y: '#22c55e', // Green
    Z: '#3b82f6', // Blue
    Center: '#ffffff', // White for free move
    Hover: '#ffffff',
    Gray: '#cccccc'
};

export const ColorUtils = {
    // Basic hex color shading
    shade: (hex: string, percent: number) => {
        let R = parseInt(hex.substring(1, 3), 16);
        let G = parseInt(hex.substring(3, 5), 16);
        let B = parseInt(hex.substring(5, 7), 16);

        R = Math.floor(R * (100 + percent) / 100);
        G = Math.floor(G * (100 + percent) / 100);
        B = Math.floor(B * (100 + percent) / 100);

        R = (R < 255) ? R : 255;
        G = (G < 255) ? G : 255;
        B = (B < 255) ? B : 255;

        const RR = ((R.toString(16).length === 1) ? "0" + R.toString(16) : R.toString(16));
        const GG = ((G.toString(16).length === 1) ? "0" + G.toString(16) : G.toString(16));
        const BB = ((B.toString(16).length === 1) ? "0" + B.toString(16) : B.toString(16));

        return "#" + RR + GG + BB;
    }
};

export interface GizmoBasis {
    origin: Vector3;
    xAxis: Vector3;
    yAxis: Vector3;
    zAxis: Vector3;
    scale: number;
    cameraPosition: Vector3;
}

export const GizmoMath = {
    normalize: (v: Vector3): Vector3 => {
        const l = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
        return l > 0 ? {x: v.x/l, y: v.y/l, z: v.z/l} : v;
    },
    
    dot: (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z,
    
    sub: (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }),
    
    cross: (a: Vector3, b: Vector3): Vector3 => ({
        x: a.y * b.z - a.z * b.y,
        y: a.z * b.x - a.x * b.z,
        z: a.x * b.y - a.y * b.x
    }),

    project: (pos: Vector3, vpMatrix: Float32Array, width: number, height: number) => {
        return Mat4Utils.transformPoint(pos, vpMatrix, width, height);
    },

    getAxisOpacity: (axisVec: Vector3, cameraPos: Vector3, origin: Vector3) => {
        const viewDir = GizmoMath.normalize({
            x: cameraPos.x - origin.x,
            y: cameraPos.y - origin.y,
            z: cameraPos.z - origin.z
        });
        const dot = Math.abs(axisVec.x * viewDir.x + axisVec.y * viewDir.y + axisVec.z * viewDir.z);
        // Fade out if looking directly down the axis
        if (dot > 0.99) return 0;
        if (dot > 0.9) return 1.0 - ((dot - 0.9) / 0.09);
        return 1.0;
    }
};
