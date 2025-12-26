import { Vector3 } from '../../types';
import { Mat4Utils, Vec3Utils, Mat4 } from '../../services/math';
import { engineInstance } from '../../services/engine';

export type Axis = 'X' | 'Y' | 'Z' | 'XY' | 'XZ' | 'YZ' | 'UNIFORM' | 'VIEW';
export type GizmoArrowShape = 'CONE' | 'TETRAHEDRON' | 'RHOMBUS' | 'CUBE';
export type GizmoCenterShape = 'NONE' | 'CUBE' | 'SPHERE' | 'RHOMBUS' | 'QUAD_CIRCLES';
export type GizmoPlaneShape = 'SQUARE' | 'CIRCLE' | 'RHOMBUS';

export interface GizmoConfiguration {
    translationShape: GizmoArrowShape;
    centerHandleShape: GizmoCenterShape;
    planeHandleShape: GizmoPlaneShape;
    arrowSize: number;
    arrowOffset: number;
    planeHandleSize: number;
    planeOffset: number;
    rotationRingSize: number;
    
    rotationRingTubeScale: number;
    rotationScreenRingScale: number;
    rotationShowScreenRing: boolean;
    rotationShowDecorations: boolean;
    rotationShowSector: boolean;
    
    axisHoverColor: string;
    axisPressColor: string;
    axisBaseThickness: number;
    axisHoverThicknessOffset: number;
    axisPressThicknessOffset: number;
    axisFadeWhenAligned: boolean;

    centerHandleColor: string;
    centerHandleSize: number;
}

export const DEFAULT_GIZMO_CONFIG: GizmoConfiguration = {
    translationShape: 'CONE',
    centerHandleShape: 'CUBE',
    planeHandleShape: 'SQUARE',
    arrowSize: 0.33,
    arrowOffset: 1.0,
    planeHandleSize: 1.0,
    planeOffset: 0.3,
    rotationRingSize: 1.2,
    
    rotationRingTubeScale: 1.0,
    rotationScreenRingScale: 1.25,
    rotationShowScreenRing: true,
    rotationShowDecorations: true,
    rotationShowSector: true,

    axisHoverColor: '#1be4e1',
    axisPressColor: '#fbbf24',
    axisBaseThickness: 2,
    axisHoverThicknessOffset: 1.0,
    axisPressThicknessOffset: 1.0,
    axisFadeWhenAligned: true,

    centerHandleColor: '#ffffff',
    centerHandleSize: 1.0
};

export const GIZMO_COLORS = {
    X: '#ef4444', 
    Y: '#22c55e', 
    Z: '#3b82f6', 
    Center: '#ffffff',
    Hover: '#1be4e1',
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

export class GizmoRenderManager {
    private static instance: GizmoRenderManager;
    
    static getInstance(): GizmoRenderManager {
        if (!GizmoRenderManager.instance) {
            GizmoRenderManager.instance = new GizmoRenderManager();
        }
        return GizmoRenderManager.instance;
    }
    
    requestGizmoRender() {
        // FIX: Disabled to prevent fighting with the main SceneView loop.
        // The SceneView loop already renders at 60fps+.
        // Calling tick(0) here causes double-rendering and FPS drops.
        
        // If you absolutely need an immediate update (e.g. while paused),
        // you could uncomment this, but for now, rely on the main loop.
        
        /* if (!this.renderRequested) {
            this.renderRequested = true;
            requestAnimationFrame(() => {
                this.renderRequested = false;
                // engineInstance.tick(0); // <--- THIS WAS THE CULPRIT
            });
        }
        */
    }
    
}

export const GizmoMath = {
    normalize: (v: Vector3): Vector3 => {
        const l = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
        return l > 0 ? {x: v.x/l, y: v.y/l, z: v.z/l} : {x:0, y:0, z:0};
    },
    dot: (a: Vector3, b: Vector3) => a.x*b.x + a.y*b.y + a.z*b.z,
    cross: (a: Vector3, b: Vector3) => ({
        x: a.y*b.z - a.z*b.y,
        y: a.z*b.x - a.x*b.z,
        z: a.x*b.y - a.y*b.x
    }),
    sub: (a: Vector3, b: Vector3) => ({ x: a.x-b.x, y: a.y-b.y, z: a.z-b.z }),
    add: (a: Vector3, b: Vector3) => ({ x: a.x+b.x, y: a.y+b.y, z: a.z+b.z }),
    scale: (a: Vector3, s: number) => ({ x: a.x*s, y: a.y*s, z: a.z*s }),

    project: (v: Vector3, vpMatrix: Float32Array, width: number, height: number) => {
        const pos = [v.x, v.y, v.z, 1.0];
        const out = [0, 0, 0, 0];
        
        for (let i = 0; i < 4; i++) {
            out[i] = 
                vpMatrix[i + 0] * pos[0] +
                vpMatrix[i + 4] * pos[1] +
                vpMatrix[i + 8] * pos[2] +
                vpMatrix[i + 12] * pos[3];
        }

        if (out[3] === 0) return { x: 0, y: 0, z: 0, w: 1 };

        const x = (out[0] / out[3]) * 0.5 + 0.5;
        const y = 1 - ((out[1] / out[3]) * 0.5 + 0.5); 
        
        return { 
            x: x * width, 
            y: y * height, 
            z: out[2] / out[3],
            w: out[3] 
        };
    },

    screenToRay: (
        mx: number, my: number, 
        screenWidth: number, screenHeight: number, 
        invViewProj: Float32Array, 
        cameraPos: Vector3
    ) => {
        const x = (mx / screenWidth) * 2 - 1;
        const y = -(my / screenHeight) * 2 + 1;

        const vec4 = [x, y, 1.0, 1.0];
        const worldPos = [0,0,0,0];
        
        for (let i = 0; i < 4; i++) {
            worldPos[i] = 
                invViewProj[i + 0] * vec4[0] +
                invViewProj[i + 4] * vec4[1] +
                invViewProj[i + 8] * vec4[2] +
                invViewProj[i + 12] * vec4[3];
        }

        if (worldPos[3] !== 0) {
            worldPos[0] /= worldPos[3];
            worldPos[1] /= worldPos[3];
            worldPos[2] /= worldPos[3];
        }

        const target = { x: worldPos[0], y: worldPos[1], z: worldPos[2] };
        const dir = GizmoMath.normalize(GizmoMath.sub(target, cameraPos));
        
        return { origin: cameraPos, direction: dir };
    },

    rayPlaneIntersection: (
        rayOrigin: Vector3, rayDir: Vector3, 
        planeCenter: Vector3, planeNormal: Vector3
    ): Vector3 | null => {
        const denom = GizmoMath.dot(planeNormal, rayDir);
        if (Math.abs(denom) < 1e-6) return null;

        const vector = GizmoMath.sub(planeCenter, rayOrigin);
        const t = GizmoMath.dot(vector, planeNormal) / denom;

        if (t < 0) return null;

        return GizmoMath.add(rayOrigin, GizmoMath.scale(rayDir, t));
    },

    getAxisOpacity: (axisVec: Vector3, cameraPos: Vector3, origin: Vector3): number => {
        const viewDir = GizmoMath.normalize(GizmoMath.sub(cameraPos, origin));
        const dot = Math.abs(GizmoMath.dot(axisVec, viewDir));
        if (dot > 0.99) return 0.2; 
        else if (dot > 0.90) return 1.0 - ((dot - 0.90) / 0.1);
        return 1.0;
    },

    getPlaneOpacity: (normal: Vector3, cameraPos: Vector3, origin: Vector3): number => {
        const viewDir = GizmoMath.normalize(GizmoMath.sub(cameraPos, origin));
        const dot = Math.abs(GizmoMath.dot(normal, viewDir));
        if (dot < 0.1) return 0.1; 
        if (dot < 0.2) return (dot - 0.1) / 0.1; 
        return 1.0;
    }
};

export const ColorUtils = {
    shade: (hex: string, percent: number) => {
        if (!hex) return '#ffffff';
        hex = hex.replace('#', '');
        let R = parseInt(hex.substring(0, 2), 16);
        let G = parseInt(hex.substring(2, 4), 16);
        let B = parseInt(hex.substring(4, 6), 16);
        R = Math.floor(R * (100 + percent) / 100);
        G = Math.floor(G * (100 + percent) / 100);
        B = Math.floor(B * (100 + percent) / 100);
        return "#" + (R<255?R:255).toString(16).padStart(2,'0') + 
                     (G<255?G:255).toString(16).padStart(2,'0') + 
                     (B<255?B:255).toString(16).padStart(2,'0');
    }
};
