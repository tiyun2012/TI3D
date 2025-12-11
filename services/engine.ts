

/**
 * High Performance WebGL Engine Core
 * Features: Data-Oriented ECS (SoA), Geometry Instancing, Dirty Flags, Texture Arrays, Save/Load, Undo/Redo, Debug Graph
 */

import { Entity, ComponentType, Component } from '../types';
import { SceneGraph } from './SceneGraph';
import { Mat4, Mat4Utils, RayUtils, Vec3Utils, TMP_MAT4_1, TMP_MAT4_2 } from './math';

// --- Debug Renderer (Instanced Lines) ---

class DebugRenderer {
    gl: WebGL2RenderingContext | null = null;
    program: WebGLProgram | null = null;
    
    // Buffer for line vertices: [x,y,z, r,g,b] * 2 per line
    maxLines = 20000;
    lineBufferData = new Float32Array(this.maxLines * 12); 
    lineCount = 0;
    
    vao: WebGLVertexArrayObject | null = null;
    vbo: WebGLBuffer | null = null;
    uniforms: { u_vp: WebGLUniformLocation | null } = { u_vp: null };

    init(gl: WebGL2RenderingContext) {
        this.gl = gl;
        
        const vs = `#version 300 es
        layout(location=0) in vec3 a_pos;
        layout(location=1) in vec3 a_color;
        uniform mat4 u_vp;
        out vec3 v_color;
        void main() { gl_Position = u_vp * vec4(a_pos, 1.0); v_color = a_color; }`;
        
        const fs = `#version 300 es
        precision mediump float;
        in vec3 v_color;
        out vec4 color;
        void main() { color = vec4(v_color, 1.0); }`;
        
        const createShader = (type: number, src: string) => {
            const s = gl.createShader(type)!;
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s));
            return s;
        };
        
        const p = gl.createProgram()!;
        gl.attachShader(p, createShader(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, createShader(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        this.program = p;
        
        this.uniforms.u_vp = gl.getUniformLocation(p, 'u_vp');
        
        this.vao = gl.createVertexArray();
        this.vbo = gl.createBuffer();
        
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.lineBufferData.byteLength, gl.DYNAMIC_DRAW);
        
        // Pos
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 24, 0); // 6 floats * 4 bytes = 24 stride
        // Color
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 24, 12);
        
        gl.bindVertexArray(null);
    }

    begin() { this.lineCount = 0; }

    drawLine(p1: {x:number, y:number, z:number}, p2: {x:number, y:number, z:number}, color: {r:number, g:number, b:number}) {
        if (this.lineCount >= this.maxLines) return;
        const i = this.lineCount * 12;
        this.lineBufferData[i] = p1.x; this.lineBufferData[i+1] = p1.y; this.lineBufferData[i+2] = p1.z;
        this.lineBufferData[i+3] = color.r; this.lineBufferData[i+4] = color.g; this.lineBufferData[i+5] = color.b;
        
        this.lineBufferData[i+6] = p2.x; this.lineBufferData[i+7] = p2.y; this.lineBufferData[i+8] = p2.z;
        this.lineBufferData[i+9] = color.r; this.lineBufferData[i+10] = color.g; this.lineBufferData[i+11] = color.b;
        this.lineCount++;
    }

    render(viewProjection: Float32Array) {
        if (this.lineCount === 0 || !this.gl || !this.program) return;
        const gl = this.gl;
        
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.u_vp, false, viewProjection);
        
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.lineBufferData.subarray(0, this.lineCount * 12));
        
        gl.drawArrays(gl.LINES, 0, this.lineCount * 2);
        gl.bindVertexArray(null);
    }
}

// --- Logic Graph Runtime (Data-Oriented) ---

type NodeExecutor = (inputs: any[], engine: Ti3DEngine) => any;

const NODE_EXECUTORS: Record<string, NodeExecutor> = {
    // Producer: Returns stream of all active entity indices
    'AllEntities': (inputs, engine) => {
        const count = engine.ecs.count;
        const { isActive } = engine.ecs.store;
        // In a real engine, we'd cache this query or use a persistent query list
        const indices = new Int32Array(count);
        let c = 0;
        for(let i=0; i<count; i++) {
            if(isActive[i]) indices[c++] = i;
        }
        return { indices: indices.subarray(0, c), count: c };
    },
    
    // Consumer: Draws axes for each entity in the stream
    'DrawAxes': (inputs, engine) => {
        const stream = inputs[0]; // Expecting { indices, count }
        if(!stream || !stream.indices) return;
        
        const { indices, count } = stream;
        const { posX, posY, posZ } = engine.ecs.store;
        const size = 1.0;
        
        for(let k=0; k<count; k++) {
            const i = indices[k];
            const x = posX[i], y = posY[i], z = posZ[i];
            
            // X Axis (Red)
            engine.debugRenderer.drawLine({x,y,z}, {x:x+size,y,z}, {r:1,g:0,b:0});
            // Y Axis (Green)
            engine.debugRenderer.drawLine({x,y,z}, {x,y:y+size,z}, {r:0,g:1,b:0});
            // Z Axis (Blue)
            engine.debugRenderer.drawLine({x,y,z}, {x,y,z:z+size}, {r:0,g:0,b:1});
        }
    }
};

// --- WebGL Shaders with Instancing & Texture Array Support ---

const VS_SOURCE = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=8) in vec2 a_uv;

// Instance Attributes (Divisor 1)
layout(location=2) in mat4 a_model;      // Occupies locations 2, 3, 4, 5
layout(location=6) in vec3 a_color;
layout(location=7) in float a_isSelected;
layout(location=9) in float a_texIndex;  // New: Texture Layer Index

uniform mat4 u_viewProjection;

out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_color;
out float v_isSelected;
out vec2 v_uv;
out float v_texIndex;

void main() {
    vec4 worldPos = a_model * vec4(a_position, 1.0);
    gl_Position = u_viewProjection * worldPos;
    
    v_normal = mat3(a_model) * a_normal; 
    v_worldPos = worldPos.xyz;
    v_color = a_color;
    v_isSelected = a_isSelected;
    v_uv = a_uv;
    v_texIndex = a_texIndex;
}
`;

const FS_SOURCE = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;

in vec3 v_normal;
in vec3 v_worldPos;
in vec3 v_color;
in float v_isSelected;
in vec2 v_uv;
in float v_texIndex;

uniform sampler2DArray u_textures;
uniform vec3 u_lightDir;

out vec4 outColor;

void main() {
    vec3 normal = normalize(v_normal);
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.5));
    
    // Sample Texture Array
    // v_texIndex selects the layer (0, 1, 2, 3...)
    vec4 texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    
    float diff = max(dot(normal, lightDir), 0.0);
    
    // Multiply vertex color (tint) with texture color
    vec3 finalAlbedo = v_color * texColor.rgb;
    
    vec3 ambient = finalAlbedo * 0.3;
    vec3 diffuse = finalAlbedo * diff;
    
    vec3 result = ambient + diffuse;
    
    if (v_isSelected > 0.5) {
        result += vec3(0.3, 0.3, 0.0); // Selection highlight
    }

    outColor = vec4(result, 1.0);
}
`;

// --- Data-Oriented ECS Storage (SoA) ---

const MAX_ENTITIES = 10000;

// Stores Component Data in flat arrays for cache locality
class ComponentStorage {
    // Transform
    posX = new Float32Array(MAX_ENTITIES);
    posY = new Float32Array(MAX_ENTITIES);
    posZ = new Float32Array(MAX_ENTITIES);
    rotX = new Float32Array(MAX_ENTITIES);
    rotY = new Float32Array(MAX_ENTITIES);
    rotZ = new Float32Array(MAX_ENTITIES);
    scaleX = new Float32Array(MAX_ENTITIES);
    scaleY = new Float32Array(MAX_ENTITIES);
    scaleZ = new Float32Array(MAX_ENTITIES);

    // Mesh
    meshType = new Int32Array(MAX_ENTITIES); // 0=None, 1=Cube, 2=Sphere, 3=Plane
    textureIndex = new Float32Array(MAX_ENTITIES); // New: Texture ID
    colorR = new Float32Array(MAX_ENTITIES);
    colorG = new Float32Array(MAX_ENTITIES);
    colorB = new Float32Array(MAX_ENTITIES);

    // Physics
    mass = new Float32Array(MAX_ENTITIES);
    useGravity = new Uint8Array(MAX_ENTITIES);

    // Metadata
    isActive = new Uint8Array(MAX_ENTITIES);
    generation = new Uint32Array(MAX_ENTITIES);
    
    // Auxiliary (Strings are not TypedArrays, handled separately in serialization)
    names: string[] = new Array(MAX_ENTITIES);
    ids: string[] = new Array(MAX_ENTITIES);
    
    // Create a deep copy of the current state
    snapshot() {
        return {
            posX: new Float32Array(this.posX),
            posY: new Float32Array(this.posY),
            posZ: new Float32Array(this.posZ),
            rotX: new Float32Array(this.rotX),
            rotY: new Float32Array(this.rotY),
            rotZ: new Float32Array(this.rotZ),
            scaleX: new Float32Array(this.scaleX),
            scaleY: new Float32Array(this.scaleY),
            scaleZ: new Float32Array(this.scaleZ),
            
            meshType: new Int32Array(this.meshType),
            textureIndex: new Float32Array(this.textureIndex),
            colorR: new Float32Array(this.colorR),
            colorG: new Float32Array(this.colorG),
            colorB: new Float32Array(this.colorB),
            
            mass: new Float32Array(this.mass),
            useGravity: new Uint8Array(this.useGravity),
            isActive: new Uint8Array(this.isActive),
            generation: new Uint32Array(this.generation),
            
            names: [...this.names],
            ids: [...this.ids]
        };
    }
    
    restore(snap: any) {
        this.posX.set(snap.posX);
        this.posY.set(snap.posY);
        this.posZ.set(snap.posZ);
        this.rotX.set(snap.rotX);
        this.rotY.set(snap.rotY);
        this.rotZ.set(snap.rotZ);
        this.scaleX.set(snap.scaleX);
        this.scaleY.set(snap.scaleY);
        this.scaleZ.set(snap.scaleZ);
        
        this.meshType.set(snap.meshType);
        this.textureIndex.set(snap.textureIndex);
        this.colorR.set(snap.colorR);
        this.colorG.set(snap.colorG);
        this.colorB.set(snap.colorB);
        
        this.mass.set(snap.mass);
        this.useGravity.set(snap.useGravity);
        this.isActive.set(snap.isActive);
        this.generation.set(snap.generation);
        
        this.names = [...snap.names];
        this.ids = [...snap.ids];
    }
}

// Map Mesh Name string to Integer ID for SoA
const MESH_TYPES: Record<string, number> = { 'None': 0, 'Cube': 1, 'Sphere': 2, 'Plane': 3 };
const MESH_NAMES: Record<number, string> = { 0: 'None', 1: 'Cube', 2: 'Sphere', 3: 'Plane' };

class SoAEntitySystem {
    store = new ComponentStorage();
    count = 0;
    freeIndices: number[] = [];
    
    // Map string UUID to SoA Index
    idToIndex = new Map<string, number>();

    constructor() {
        this.store.scaleX.fill(1);
        this.store.scaleY.fill(1);
        this.store.scaleZ.fill(1);
    }

    createEntity(name: string): string {
        let index: number;
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.pop()!;
        } else {
            index = this.count++;
        }
        
        const id = crypto.randomUUID();
        this.store.isActive[index] = 1;
        this.store.generation[index]++;
        this.store.names[index] = name;
        this.store.ids[index] = id;
        
        // Defaults
        this.store.posX[index] = 0; this.store.posY[index] = 0; this.store.posZ[index] = 0;
        this.store.rotX[index] = 0; this.store.rotY[index] = 0; this.store.rotZ[index] = 0;
        this.store.scaleX[index] = 1; this.store.scaleY[index] = 1; this.store.scaleZ[index] = 1;
        this.store.meshType[index] = 0;
        this.store.textureIndex[index] = 0;
        this.store.colorR[index] = 1; this.store.colorG[index] = 1; this.store.colorB[index] = 1;
        
        this.idToIndex.set(id, index);
        return id;
    }

    getEntityIndex(id: string): number | undefined {
        return this.idToIndex.get(id);
    }

    createProxy(id: string, sceneGraph: SceneGraph, history?: HistorySystem): Entity | null {
        const index = this.idToIndex.get(id);
        if (index === undefined || this.store.isActive[index] === 0) return null;
        
        const store = this.store;
        const setDirty = () => {
            sceneGraph.setDirty(id);
        };
        
        return {
            id,
            get name() { return store.names[index]; },
            set name(v) { store.names[index] = v; },
            get isActive() { return !!store.isActive[index]; },
            set isActive(v) { store.isActive[index] = v ? 1 : 0; },
            components: {
                [ComponentType.TRANSFORM]: {
                    type: ComponentType.TRANSFORM,
                    get position() { 
                        return { 
                            get x() { return store.posX[index]; }, set x(v) { store.posX[index] = v; setDirty(); },
                            get y() { return store.posY[index]; }, set y(v) { store.posY[index] = v; setDirty(); },
                            get z() { return store.posZ[index]; }, set z(v) { store.posZ[index] = v; setDirty(); }
                        };
                    },
                    set position(v: any) { 
                        store.posX[index] = v.x; store.posY[index] = v.y; store.posZ[index] = v.z; 
                        setDirty();
                    },
                    get rotation() {
                         return { 
                            get x() { return store.rotX[index]; }, set x(v) { store.rotX[index] = v; setDirty(); },
                            get y() { return store.rotY[index]; }, set y(v) { store.rotY[index] = v; setDirty(); },
                            get z() { return store.rotZ[index]; }, set z(v) { store.rotZ[index] = v; setDirty(); }
                        };
                    },
                    set rotation(v: any) {
                        store.rotX[index] = v.x; store.rotY[index] = v.y; store.rotZ[index] = v.z;
                        setDirty();
                    },
                    get scale() {
                        return { 
                            get x() { return store.scaleX[index]; }, set x(v) { store.scaleX[index] = v; setDirty(); },
                            get y() { return store.scaleY[index]; }, set y(v) { store.scaleY[index] = v; setDirty(); },
                            get z() { return store.scaleZ[index]; }, set z(v) { store.scaleZ[index] = v; setDirty(); }
                        };
                    },
                    set scale(v: any) {
                        store.scaleX[index] = v.x; store.scaleY[index] = v.y; store.scaleZ[index] = v.z;
                        setDirty();
                    }
                } as any,
                
                [ComponentType.MESH]: {
                    type: ComponentType.MESH,
                    get meshType() { return MESH_NAMES[store.meshType[index]]; },
                    set meshType(v: string) { store.meshType[index] = MESH_TYPES[v] || 0; },
                    get textureIndex() { return store.textureIndex[index]; },
                    set textureIndex(v: number) { store.textureIndex[index] = v; },
                    get color() { 
                        const r = Math.floor(store.colorR[index] * 255);
                        const g = Math.floor(store.colorG[index] * 255);
                        const b = Math.floor(store.colorB[index] * 255);
                        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                    },
                    set color(v: string) {
                        const bigint = parseInt(v.slice(1), 16);
                        store.colorR[index] = ((bigint >> 16) & 255) / 255;
                        store.colorG[index] = ((bigint >> 8) & 255) / 255;
                        store.colorB[index] = (bigint & 255) / 255;
                    }
                } as any,

                [ComponentType.PHYSICS]: {
                    type: ComponentType.PHYSICS,
                    get mass() { return store.mass[index]; },
                    set mass(v: number) { store.mass[index] = v; },
                    get useGravity() { return !!store.useGravity[index]; },
                    set useGravity(v: boolean) { store.useGravity[index] = v ? 1 : 0; }
                } as any,

                [ComponentType.LIGHT]: { type: ComponentType.LIGHT, intensity: 1, color: '#ffffff' },
                [ComponentType.SCRIPT]: { type: ComponentType.SCRIPT }
            }
        };
    }

    getAllProxies(sceneGraph: SceneGraph): Entity[] {
        const entities: Entity[] = [];
        this.idToIndex.forEach((index, id) => {
            if (this.store.isActive[index]) {
                 const proxy = this.createProxy(id, sceneGraph);
                 if (proxy) entities.push(proxy);
            }
        });
        return entities;
    }

    // --- Save / Load ---

    serialize(): string {
        const data = {
            count: this.count,
            freeIndices: this.freeIndices,
            idMap: Array.from(this.idToIndex.entries()),
            // Convert typed arrays to standard arrays for JSON
            store: {
                posX: Array.from(this.store.posX.subarray(0, this.count + 1)),
                posY: Array.from(this.store.posY.subarray(0, this.count + 1)),
                posZ: Array.from(this.store.posZ.subarray(0, this.count + 1)),
                rotX: Array.from(this.store.rotX.subarray(0, this.count + 1)),
                rotY: Array.from(this.store.rotY.subarray(0, this.count + 1)),
                rotZ: Array.from(this.store.rotZ.subarray(0, this.count + 1)),
                scaleX: Array.from(this.store.scaleX.subarray(0, this.count + 1)),
                scaleY: Array.from(this.store.scaleY.subarray(0, this.count + 1)),
                scaleZ: Array.from(this.store.scaleZ.subarray(0, this.count + 1)),
                meshType: Array.from(this.store.meshType.subarray(0, this.count + 1)),
                textureIndex: Array.from(this.store.textureIndex.subarray(0, this.count + 1)),
                colorR: Array.from(this.store.colorR.subarray(0, this.count + 1)),
                colorG: Array.from(this.store.colorG.subarray(0, this.count + 1)),
                colorB: Array.from(this.store.colorB.subarray(0, this.count + 1)),
                isActive: Array.from(this.store.isActive.subarray(0, this.count + 1)),
                names: this.store.names.slice(0, this.count + 1),
                ids: this.store.ids.slice(0, this.count + 1)
            }
        };
        return JSON.stringify(data);
    }

    deserialize(json: string, sceneGraph: SceneGraph) {
        try {
            const data = JSON.parse(json);
            this.count = data.count;
            this.freeIndices = data.freeIndices;
            this.idToIndex = new Map(data.idMap);
            
            // Helper to fill
            const fill = (arr: any, source: any[]) => {
                for(let i=0; i<source.length; i++) arr[i] = source[i];
            };

            fill(this.store.posX, data.store.posX);
            fill(this.store.posY, data.store.posY);
            fill(this.store.posZ, data.store.posZ);
            fill(this.store.rotX, data.store.rotX);
            fill(this.store.rotY, data.store.rotY);
            fill(this.store.rotZ, data.store.rotZ);
            fill(this.store.scaleX, data.store.scaleX);
            fill(this.store.scaleY, data.store.scaleY);
            fill(this.store.scaleZ, data.store.scaleZ);
            fill(this.store.meshType, data.store.meshType);
            fill(this.store.textureIndex, data.store.textureIndex);
            fill(this.store.colorR, data.store.colorR);
            fill(this.store.colorG, data.store.colorG);
            fill(this.store.colorB, data.store.colorB);
            fill(this.store.isActive, data.store.isActive);
            
            this.store.names = new Array(MAX_ENTITIES);
            fill(this.store.names, data.store.names);
            
            this.store.ids = new Array(MAX_ENTITIES);
            fill(this.store.ids, data.store.ids);

            this.idToIndex.forEach((idx, id) => {
                if (this.store.isActive[idx]) sceneGraph.registerEntity(id);
                sceneGraph.setDirty(id);
            });

        } catch (e) {
            console.error("Failed to load scene", e);
        }
    }
}

// --- Undo / Redo History System ---

interface HistorySnapshot {
    store: any;
    count: number;
    freeIndices: number[];
    idToIndex: Map<string, number>;
}

class HistorySystem {
    undoStack: HistorySnapshot[] = [];
    redoStack: HistorySnapshot[] = [];
    maxHistory = 50;

    pushState(system: SoAEntitySystem) {
        const snapshot: HistorySnapshot = {
            store: system.store.snapshot(),
            count: system.count,
            freeIndices: [...system.freeIndices],
            idToIndex: new Map(system.idToIndex)
        };
        
        this.undoStack.push(snapshot);
        if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
        this.redoStack = []; // Clear redo on new action
    }

    undo(system: SoAEntitySystem, sceneGraph: SceneGraph): boolean {
        if (this.undoStack.length === 0) return false;
        
        // Save current state to redo stack
        const currentSnapshot: HistorySnapshot = {
            store: system.store.snapshot(),
            count: system.count,
            freeIndices: [...system.freeIndices],
            idToIndex: new Map(system.idToIndex)
        };
        this.redoStack.push(currentSnapshot);

        const prev = this.undoStack.pop()!;
        this.restore(system, prev, sceneGraph);
        return true;
    }

    redo(system: SoAEntitySystem, sceneGraph: SceneGraph): boolean {
        if (this.redoStack.length === 0) return false;

        // Save current state to undo stack
        const currentSnapshot: HistorySnapshot = {
            store: system.store.snapshot(),
            count: system.count,
            freeIndices: [...system.freeIndices],
            idToIndex: new Map(system.idToIndex)
        };
        this.undoStack.push(currentSnapshot);

        const next = this.redoStack.pop()!;
        this.restore(system, next, sceneGraph);
        return true;
    }

    private restore(system: SoAEntitySystem, snap: HistorySnapshot, sceneGraph: SceneGraph) {
        system.store.restore(snap.store);
        system.count = snap.count;
        system.freeIndices = snap.freeIndices;
        system.idToIndex = snap.idToIndex;
        
        // Refresh scene graph dirty state
        system.idToIndex.forEach((idx, id) => {
            if (system.store.isActive[idx]) sceneGraph.setDirty(id);
        });
    }
}


class WebGLRenderer {
    gl: WebGL2RenderingContext | null = null;
    program: WebGLProgram | null = null;
    
    meshes: Map<number, { vao: WebGLVertexArrayObject, count: number, instanceBuffer: WebGLBuffer }> = new Map();
    textureArray: WebGLTexture | null = null;
    
    // Instance Data Buffers (CPU side)
    // Stride: Mat4 (16) + Color (3) + Selected (1) + TextureIndex (1) = 21 floats
    instanceData = new Float32Array(MAX_ENTITIES * 21); 

    uniforms: Record<string, WebGLUniformLocation | null> = {};

    init(canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: "high-performance" });
        if (!this.gl) return;
        const gl = this.gl;
        
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE);
        gl.clearColor(0.1, 0.1, 0.1, 1.0); 

        const vs = this.createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
        this.program = this.createProgram(gl, vs, fs);

        this.uniforms = {
            u_viewProjection: gl.getUniformLocation(this.program, 'u_viewProjection'),
            u_lightDir: gl.getUniformLocation(this.program, 'u_lightDir'),
            u_textures: gl.getUniformLocation(this.program, 'u_textures'),
        };

        // Init Texture Array
        this.initTextureArray(gl);

        // Create Meshes
        this.createMesh(MESH_TYPES['Cube'], this.createCubeData());
        this.createMesh(MESH_TYPES['Sphere'], this.createCubeData()); 
        this.createMesh(MESH_TYPES['Plane'], this.createCubeData());
    }

    initTextureArray(gl: WebGL2RenderingContext) {
        // Create 256x256 texture array with 4 layers
        const width = 256;
        const height = 256;
        const depth = 4;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, depth);

        // Helper to draw to canvas and upload
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d')!;

        // Layer 0: White
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,width,height);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

        // Layer 1: Checkerboard
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0,0,width,height);
        ctx.fillStyle = '#cccccc';
        for(let y=0; y<4; y++) for(let x=0; x<4; x++) {
            if ((x+y)%2===0) ctx.fillRect(x*64, y*64, 64, 64);
        }
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 1, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

        // Layer 2: Noise/Rough
        const imgData = ctx.createImageData(width, height);
        for(let i=0; i<imgData.data.length; i+=4) {
            const val = 100 + Math.random() * 155;
            imgData.data[i] = val; imgData.data[i+1] = val; imgData.data[i+2] = val; imgData.data[i+3] = 255;
        }
        ctx.putImageData(imgData, 0, 0);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 2, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

        // Layer 3: Bricks
        ctx.fillStyle = '#884444';
        ctx.fillRect(0,0,width,height);
        ctx.fillStyle = '#663333';
        ctx.lineWidth = 4;
        for(let y=0; y<8; y++) {
            ctx.beginPath();
            ctx.moveTo(0, y*32); ctx.lineTo(width, y*32);
            ctx.stroke();
            for(let x=0; x<8; x++) {
                const offset = (y%2)*16;
                ctx.beginPath();
                ctx.moveTo(x*32+offset, y*32); ctx.lineTo(x*32+offset, (y+1)*32);
                ctx.stroke();
            }
        }
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 3, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, canvas);

        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        this.textureArray = tex;
    }
    
    createCubeData() {
        const p = [
            -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5, // Front
            -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5, // Back
            -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5, // Top
            -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5, // Bottom
             0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5, // Right
            -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, // Left
        ];
        const u = [
            0,0, 1,0, 1,1, 0,1,
            1,0, 1,1, 0,1, 0,0,
            0,1, 0,0, 1,0, 1,1,
            0,0, 1,0, 1,1, 0,1,
            1,0, 1,1, 0,1, 0,0,
            0,0, 1,0, 1,1, 0,1,
        ];
        const i = [0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11, 12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23];
        const n: number[] = [];
        const addN = (x:number,y:number,z:number) => { for(let k=0;k<4;k++) n.push(x,y,z); }
        addN(0,0,1); addN(0,0,-1); addN(0,1,0); addN(0,-1,0); addN(1,0,0); addN(-1,0,0);
        return { vertices: new Float32Array(p), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(i) };
    }

    createMesh(typeId: number, data: { vertices: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array }) {
        if (!this.gl || !this.program) return;
        const gl = this.gl;

        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const normBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        const uvBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.uvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(8); // Location 8 for UV
        gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0);

        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

        // Instanced Attributes
        const instanceBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

        // Stride = 21 floats * 4 bytes
        const stride = 21 * 4; 

        // Mat4 (Locations 2,3,4,5)
        for (let i = 0; i < 4; i++) {
            gl.enableVertexAttribArray(2 + i);
            gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, stride, i * 16);
            gl.vertexAttribDivisor(2 + i, 1);
        }

        // Color (Location 6)
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16 * 4);
        gl.vertexAttribDivisor(6, 1);

        // Selected (Location 7)
        gl.enableVertexAttribArray(7);
        gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19 * 4);
        gl.vertexAttribDivisor(7, 1);

        // Texture Index (Location 9)
        gl.enableVertexAttribArray(9);
        gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, 20 * 4);
        gl.vertexAttribDivisor(9, 1);

        gl.bindVertexArray(null);
        this.meshes.set(typeId, { vao, count: data.indices.length, instanceBuffer });
    }

    render(
        store: ComponentStorage, 
        idToIndex: Map<string, number>, 
        sceneGraph: SceneGraph, 
        viewProjection: Mat4, 
        selectedIds: Set<string>
    ) {
        if (!this.gl || !this.program) return;
        const gl = this.gl;
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.u_viewProjection, false, viewProjection);
        
        // Bind Texture Array
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
        gl.uniform1i(this.uniforms.u_textures, 0);

        const meshTypes = [1, 2, 3];
        
        for (const typeId of meshTypes) {
            const mesh = this.meshes.get(typeId);
            if (!mesh) continue;

            let instanceCount = 0;
            let dataPtr = 0;
            
            for (const index of idToIndex.values()) {
                if (store.isActive[index] && store.meshType[index] === typeId) {
                    const worldMatrix = sceneGraph.getWorldMatrix(store.ids[index]);
                    if (!worldMatrix) continue;

                    for(let k=0; k<16; k++) this.instanceData[dataPtr++] = worldMatrix[k];
                    this.instanceData[dataPtr++] = store.colorR[index];
                    this.instanceData[dataPtr++] = store.colorG[index];
                    this.instanceData[dataPtr++] = store.colorB[index];
                    this.instanceData[dataPtr++] = selectedIds.has(store.ids[index]) ? 1.0 : 0.0;
                    this.instanceData[dataPtr++] = store.textureIndex[index]; // Texture Index

                    instanceCount++;
                }
            }

            if (instanceCount > 0) {
                gl.bindVertexArray(mesh.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, instanceCount * 21)); // 21 floats stride
                gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, instanceCount);
            }
        }
    }

    resize(width: number, height: number) {
        if(this.gl) {
            this.gl.canvas.width = width;
            this.gl.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
        }
    }

    private createShader(gl: WebGL2RenderingContext, type: number, src: string) {
        const s = gl.createShader(type)!;
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if(!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
        return s;
    }
    private createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader) {
        const p = gl.createProgram()!;
        gl.attachShader(p, vs!); gl.attachShader(p, fs!);
        gl.linkProgram(p);
        return p;
    }
}

class PhysicsSystem {
  update(deltaTime: number, store: ComponentStorage, idToIndex: Map<string, number>) {
    // ...
  }
}

// --- Main Engine Class ---

export class Ti3DEngine {
  ecs: SoAEntitySystem;
  sceneGraph: SceneGraph;
  renderer: WebGLRenderer;
  debugRenderer: DebugRenderer; // New Debug Renderer
  physics: PhysicsSystem;
  history: HistorySystem;
  
  isPlaying: boolean = false;
  selectedIds: Set<string> = new Set();
  private listeners: (() => void)[] = [];

  // Logic Graph State
  private executionList: Array<{ id: string, type: string, inputNodeIds: string[] }> = [];
  private nodeResults = new Map<string, any>(); 

  private tempTransformData = new Float32Array(9);

  constructor() {
    this.ecs = new SoAEntitySystem();
    this.sceneGraph = new SceneGraph();
    this.renderer = new WebGLRenderer();
    this.debugRenderer = new DebugRenderer();
    this.physics = new PhysicsSystem();
    this.history = new HistorySystem();
    this.initDemoScene();
    
    // Initial Snapshot
    this.pushUndoState();
  }
  
  // Undo/Redo Public API
  pushUndoState() {
      this.history.pushState(this.ecs);
  }
  
  undo() {
      if(this.history.undo(this.ecs, this.sceneGraph)) this.notifyUI();
  }
  
  redo() {
      if(this.history.redo(this.ecs, this.sceneGraph)) this.notifyUI();
  }

  // Save/Load Public API
  saveScene(): string {
      return this.ecs.serialize();
  }
  
  loadScene(json: string) {
      this.ecs.deserialize(json, this.sceneGraph);
      this.notifyUI();
  }

  initGL(canvas: HTMLCanvasElement) { 
      this.renderer.init(canvas); 
      this.debugRenderer.init(this.renderer.gl!);
  }
  resize(width: number, height: number) { this.renderer.resize(width, height); }

  setSelected(ids: string[]) {
      this.selectedIds = new Set(ids);
      this.notifyUI();
  }

  // Logic Graph "Compiler"
  updateGraph(nodes: any[], connections: any[]) {
      this.executionList = [];
      const logicNodes = nodes.filter((n: any) => NODE_EXECUTORS[n.type]);
      
      // Simple Topological Sort for demo: Producers -> Consumers
      const producers = logicNodes.filter((n: any) => n.type === 'AllEntities');
      const consumers = logicNodes.filter((n: any) => n.type === 'DrawAxes');
      
      producers.forEach((n: any) => {
           this.executionList.push({ id: n.id, type: n.type, inputNodeIds: [] });
      });
      
      consumers.forEach((n: any) => {
          const inputConns = connections.filter((c: any) => c.toNode === n.id);
          const inputs = inputConns.map((c: any) => c.fromNode);
          this.executionList.push({ id: n.id, type: n.type, inputNodeIds: inputs });
      });
  }

  viewProjectionMatrix = Mat4Utils.create();
  private canvasWidth = 1;
  private canvasHeight = 1;

  updateCamera(vpMatrix: Mat4, w: number, h: number) {
      Mat4Utils.copy(this.viewProjectionMatrix, vpMatrix);
      this.canvasWidth = w;
      this.canvasHeight = h;
  }

  selectEntityAt(x: number, y: number, width: number, height: number): string | null {
      if (!Mat4Utils.invert(this.viewProjectionMatrix, TMP_MAT4_1)) return null;
      const ray = RayUtils.create();
      RayUtils.fromScreen(x, y, width, height, TMP_MAT4_1, ray);

      let closestId: string | null = null;
      let minDist = Infinity;
      const localRay = RayUtils.create();
      const invWorld = TMP_MAT4_2;

      for (const [id, index] of this.ecs.idToIndex) {
          if (!this.ecs.store.isActive[index]) continue;
          const meshType = this.ecs.store.meshType[index];
          if (meshType === 0) continue; 

          const worldMatrix = this.sceneGraph.getWorldMatrix(id);
          if (!worldMatrix) continue;

          if (!Mat4Utils.invert(worldMatrix, invWorld)) continue;

          Vec3Utils.transformMat4(ray.origin, invWorld, localRay.origin);
          Vec3Utils.transformMat4Normal(ray.direction, invWorld, localRay.direction);

          let t: number | null = null;
          if (meshType === 2) { 
              t = RayUtils.intersectSphere(localRay, {x:0, y:0, z:0}, 0.5);
          } else {
              t = RayUtils.intersectBox(localRay, {x:-0.5, y:-0.5, z:-0.5}, {x:0.5, y:0.5, z:0.5});
          }

          if (t !== null && t > 0) {
              if (t < minDist) {
                  minDist = t;
                  closestId = id;
              }
          }
      }
      return closestId;
  }

  selectEntitiesInRect(x: number, y: number, w: number, h: number): string[] {
      const results: string[] = [];
      const minX = Math.min(x, x + w);
      const maxX = Math.max(x, x + w);
      const minY = Math.min(y, y + h);
      const maxY = Math.max(y, y + h);

      for (const [id, index] of this.ecs.idToIndex) {
          if (!this.ecs.store.isActive[index]) continue;
          if (this.ecs.store.meshType[index] === 0) continue;
          const worldPos = this.sceneGraph.getWorldPosition(id);
          const screenPos = Mat4Utils.transformPoint(worldPos, this.viewProjectionMatrix, this.canvasWidth, this.canvasHeight);
          
          if (screenPos.w <= 0) continue;
          if (screenPos.x >= minX && screenPos.x <= maxX &&
              screenPos.y >= minY && screenPos.y <= maxY) {
              results.push(id);
          }
      }
      return results;
  }

  createEntity(name: string): Entity {
      const id = this.ecs.createEntity(name);
      this.sceneGraph.registerEntity(id);
      this.pushUndoState(); // Capture creation
      this.notifyUI();
      return this.ecs.createProxy(id, this.sceneGraph)!;
  }

  private initDemoScene() {
      const p = this.createEntity('Player Cube');
      p.components[ComponentType.MESH].meshType = 'Cube';
      p.components[ComponentType.MESH].color = '#3b82f6';
      p.components[ComponentType.MESH].textureIndex = 1; // Grid

      const s = this.createEntity('Orbiting Satellite');
      s.components[ComponentType.MESH].meshType = 'Sphere';
      s.components[ComponentType.MESH].color = '#ef4444';
      s.components[ComponentType.MESH].textureIndex = 2; // Noise
      s.components[ComponentType.TRANSFORM].position = {x: 3, y: 0, z: 0};
      s.components[ComponentType.TRANSFORM].scale = {x: 0.5, y: 0.5, z: 0.5};
      this.sceneGraph.attach(s.id, p.id);

      const f = this.createEntity('Floor');
      f.components[ComponentType.MESH].meshType = 'Plane';
      f.components[ComponentType.MESH].color = '#ffffff';
      f.components[ComponentType.MESH].textureIndex = 3; // Bricks
      f.components[ComponentType.TRANSFORM].position = {x: 0, y: -2, z: 0};
      f.components[ComponentType.TRANSFORM].scale = {x: 10, y: 0.1, z: 10};

      const l = this.createEntity('Directional Light');
      l.components[ComponentType.LIGHT]!.intensity = 1.0;
  }

  tick(deltaTime: number) {
      if (this.isPlaying) {
          // simple animation
          const sId = Array.from(this.ecs.idToIndex.entries()).find(x => this.ecs.store.names[x[1]] === 'Orbiting Satellite')?.[0];
          if (sId) {
              const idx = this.ecs.idToIndex.get(sId)!;
              this.ecs.store.rotY[idx] += deltaTime * 2.0;
              this.sceneGraph.setDirty(sId);
          }
      }

      this.sceneGraph.update((id) => {
          const idx = this.ecs.getEntityIndex(id);
          if (idx === undefined || !this.ecs.store.isActive[idx]) return null;
          const s = this.ecs.store;
          const t = this.tempTransformData;
          t[0] = s.posX[idx]; t[1] = s.posY[idx]; t[2] = s.posZ[idx];
          t[3] = s.rotX[idx]; t[4] = s.rotY[idx]; t[5] = s.rotZ[idx];
          t[6] = s.scaleX[idx]; t[7] = s.scaleY[idx]; t[8] = s.scaleZ[idx];
          return t;
      });
      
      // --- Logic Graph Execution ---
      this.debugRenderer.begin();
      this.nodeResults.clear();
      for(const step of this.executionList) {
          const exec = NODE_EXECUTORS[step.type];
          if(exec) {
              const inputs = step.inputNodeIds.map(id => this.nodeResults.get(id));
              const result = exec(inputs, this);
              this.nodeResults.set(step.id, result);
          }
      }

      this.renderer.render(
          this.ecs.store, 
          this.ecs.idToIndex, 
          this.sceneGraph, 
          this.viewProjectionMatrix, 
          this.selectedIds
      );
      
      // Render Debug Layer
      this.debugRenderer.render(this.viewProjectionMatrix);
  }
  
  start() { this.isPlaying = true; this.notifyUI(); }
  pause() { this.isPlaying = false; this.notifyUI(); }
  stop() { this.isPlaying = false; this.notifyUI(); }
  
  subscribe(cb: () => void) { this.listeners.push(cb); return () => this.listeners = this.listeners.filter(c => c !== cb); }
  notifyUI() { this.listeners.forEach(cb => cb()); }
}

export const engineInstance = new Ti3DEngine();