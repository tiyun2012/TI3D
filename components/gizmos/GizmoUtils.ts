
import { Mat4Utils } from '../../services/math';
import { Vector3 } from '../../types';

export type Axis = 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ' | 'UNIFORM';
export type GizmoArrowShape = 'CONE' | 'TETRAHEDRON' | 'RHOMBUS' | 'CUBE';

export interface GizmoConfiguration {
    translationShape: GizmoArrowShape;
}

export const GIZMO_CONFIG: GizmoConfiguration = {
    translationShape: 'CONE' // Change this to 'TETRAHEDRON', 'RHOMBUS', or 'CUBE'
};

export const GIZMO_COLORS = {
    X: '#ef4444', // Red
    Y: '#22c55e', // Green
    Z: '#3b82f6', // Blue
    Hover: '#ffffff',
    Gray: '#cccccc'
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
