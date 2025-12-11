
/**
 * High Performance WebGL Engine Core
 * Features: Data-Oriented ECS (SoA), Geometry Instancing, Dirty Flags
 */

import { Entity, ComponentType, Component } from '../types';
import { SceneGraph } from './SceneGraph';
import { Mat4, Mat4Utils, RayUtils, Vec3Utils, TMP_MAT4_1, TMP_MAT4_2 } from './math';

// --- WebGL Shaders with Instancing Support ---

const VS_SOURCE = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
// Instance Attributes (Divisor 1)
layout(location=2) in mat4 a_model;      // Occupies locations 2, 3, 4, 5
layout(location=6) in vec3 a_color;
layout(location=7) in float a_isSelected;

uniform mat4 u_viewProjection;
uniform vec3 u_lightDir;

out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_color;
out float v_isSelected;

void main() {
    // a_model is per-instance
    vec4 worldPos = a_model * vec4(a_position, 1.0);
    gl_Position = u_viewProjection * worldPos;
    
    // Normal matrix approx (assuming uniform scale)
    v_normal = mat3(a_model) * a_normal; 
    v_worldPos = worldPos.xyz;
    v_color = a_color;
    v_isSelected = a_isSelected;
}
`;

const FS_SOURCE = `#version 300 es
precision mediump float;

in vec3 v_normal;
in vec3 v_worldPos;
in vec3 v_color;
in float v_isSelected;

out vec4 outColor;

void main() {
    vec3 normal = normalize(v_normal);
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.5)); // Hardcoded light for performance demo
    
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 ambient = v_color * 0.3;
    vec3 diffuse = v_color * diff;
    
    vec3 finalColor = ambient + diffuse;
    
    if (v_isSelected > 0.5) {
        finalColor += vec3(0.3, 0.3, 0.0); // Selection highlight
    }

    outColor = vec4(finalColor, 1.0);
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
    colorR = new Float32Array(MAX_ENTITIES);
    colorG = new Float32Array(MAX_ENTITIES);
    colorB = new Float32Array(MAX_ENTITIES);

    // Physics
    mass = new Float32Array(MAX_ENTITIES);
    useGravity = new Uint8Array(MAX_ENTITIES);

    // Metadata
    isActive = new Uint8Array(MAX_ENTITIES);
    generation = new Uint32Array(MAX_ENTITIES); // For ID safety
    
    // Auxiliary
    names: string[] = new Array(MAX_ENTITIES);
    ids: string[] = new Array(MAX_ENTITIES);
    
    // Transform Scratchpad for SceneGraph
    // Helper to return all transform data in one call
    getTransformData(index: number) {
        if (!this.isActive[index]) return null;
        // Returns a small temporary view or copies. 
        // For SceneGraph.update, we pass a closure that reads directly.
        // See implementation in Engine class.
        return null; 
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
        // Init default scales
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
        this.store.colorR[index] = 1; this.store.colorG[index] = 1; this.store.colorB[index] = 1;
        
        this.idToIndex.set(id, index);
        return id;
    }

    getEntityIndex(id: string): number | undefined {
        return this.idToIndex.get(id);
    }

    // Creates a Proxy object that mimics the Entity interface for UI compatibility
    createProxy(id: string, sceneGraph: SceneGraph): Entity | null {
        const index = this.idToIndex.get(id);
        if (index === undefined || this.store.isActive[index] === 0) return null;
        
        const store = this.store;
        const system = this;

        // Helper to mark dirty when transform changes
        const setDirty = () => sceneGraph.setDirty(id);

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
                    get color() { 
                        // Convert float back to hex for UI
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

                [ComponentType.LIGHT]: { type: ComponentType.LIGHT, intensity: 1, color: '#ffffff' }, // Placeholder for simplicity
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
}


class WebGLRenderer {
    gl: WebGL2RenderingContext | null = null;
    program: WebGLProgram | null = null;
    
    // Meshes: VAO and Index Count
    meshes: Map<number, { vao: WebGLVertexArrayObject, count: number, instanceBuffer: WebGLBuffer }> = new Map();
    
    // Instance Data Buffers (CPU side)
    // Size = MAX_ENTITIES * stride
    // Stride: Mat4 (16 floats) + Color (3 floats) + Selected (1 float) = 20 floats
    instanceData = new Float32Array(MAX_ENTITIES * 20); 

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
        };

        // Create Default Meshes with Instancing support
        this.createMesh(MESH_TYPES['Cube'], this.createCubeData());
        this.createMesh(MESH_TYPES['Sphere'], this.createCubeData()); // Reusing cube for demo simplicity
        this.createMesh(MESH_TYPES['Plane'], this.createCubeData());
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
        const i = [0,1,2,0,2,3, 4,5,6,4,6,7, 8,9,10,8,10,11, 12,13,14,12,14,15, 16,17,18,16,18,19, 20,21,22,20,22,23];
        const n: number[] = [];
        const addN = (x:number,y:number,z:number) => { for(let k=0;k<4;k++) n.push(x,y,z); }
        addN(0,0,1); addN(0,0,-1); addN(0,1,0); addN(0,-1,0); addN(1,0,0); addN(-1,0,0);
        return { vertices: new Float32Array(p), normals: new Float32Array(n), indices: new Uint16Array(i) };
    }

    createMesh(typeId: number, data: { vertices: Float32Array, normals: Float32Array, indices: Uint16Array }) {
        if (!this.gl || !this.program) return;
        const gl = this.gl;

        const vao = gl.createVertexArray()!;
        gl.bindVertexArray(vao);

        // Standard Attributes
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

        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

        // Instanced Attributes Setup
        // We create a buffer that will hold [Mat4 (16), Color (3), Selected (1)] per instance
        const instanceBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        // Allocate simplified dynamic buffer
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);

        const stride = 20 * 4; // 20 floats * 4 bytes

        // Mat4 is 4 vec4s
        for (let i = 0; i < 4; i++) {
            gl.enableVertexAttribArray(2 + i);
            gl.vertexAttribPointer(2 + i, 4, gl.FLOAT, false, stride, i * 16);
            gl.vertexAttribDivisor(2 + i, 1);
        }

        // Color
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16 * 4);
        gl.vertexAttribDivisor(6, 1);

        // Selected
        gl.enableVertexAttribArray(7);
        gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19 * 4);
        gl.vertexAttribDivisor(7, 1);

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

        // Group by MeshType and Build Instance Buffers
        const meshTypes = [1, 2, 3]; // Cube, Sphere, Plane
        
        for (const typeId of meshTypes) {
            const mesh = this.meshes.get(typeId);
            if (!mesh) continue;

            let instanceCount = 0;
            
            // Pointer to our CPU instance buffer
            let dataPtr = 0;
            
            for (const index of idToIndex.values()) {
                if (store.isActive[index] && store.meshType[index] === typeId) {
                    const worldMatrix = sceneGraph.getWorldMatrix(store.ids[index]);
                    if (!worldMatrix) continue;

                    // Copy Matrix (16 floats)
                    for(let k=0; k<16; k++) this.instanceData[dataPtr++] = worldMatrix[k];
                    
                    // Copy Color (3 floats)
                    this.instanceData[dataPtr++] = store.colorR[index];
                    this.instanceData[dataPtr++] = store.colorG[index];
                    this.instanceData[dataPtr++] = store.colorB[index];

                    // Copy Selection (1 float)
                    this.instanceData[dataPtr++] = selectedIds.has(store.ids[index]) ? 1.0 : 0.0;

                    instanceCount++;
                }
            }

            if (instanceCount > 0) {
                gl.bindVertexArray(mesh.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                // Upload only the used part
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, instanceCount * 20));
                
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

    // Shader Helpers
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
    for (const index of idToIndex.values()) {
        if (!store.isActive[index]) continue;
        if (store.useGravity[index]) {
            // Check bounds (simple floor check)
            if (store.posY[index] > 0) {
                 // store.posY[index] -= 9.8 * deltaTime * 0.1; 
            }
        }
    }
  }
}

// --- Main Engine Class ---

export class Ti3DEngine {
  ecs: SoAEntitySystem;
  sceneGraph: SceneGraph;
  renderer: WebGLRenderer;
  physics: PhysicsSystem;
  
  isPlaying: boolean = false;
  selectedIds: Set<string> = new Set();
  private listeners: (() => void)[] = [];

  // Scratchpad for transform update callback
  private tempTransformData = new Float32Array(9);

  constructor() {
    this.ecs = new SoAEntitySystem();
    this.sceneGraph = new SceneGraph();
    this.renderer = new WebGLRenderer();
    this.physics = new PhysicsSystem();
    this.initDemoScene();
  }

  initGL(canvas: HTMLCanvasElement) { this.renderer.init(canvas); }
  resize(width: number, height: number) { this.renderer.resize(width, height); }

  setSelected(ids: string[]) {
      this.selectedIds = new Set(ids);
      this.notifyUI();
  }

  viewProjectionMatrix = Mat4Utils.create();
  // Store canvas dims for projection
  private canvasWidth = 1;
  private canvasHeight = 1;

  updateCamera(vpMatrix: Mat4, w: number, h: number) {
      Mat4Utils.copy(this.viewProjectionMatrix, vpMatrix);
      this.canvasWidth = w;
      this.canvasHeight = h;
  }

  // --- High Performance Selection System ---
  selectEntityAt(x: number, y: number, width: number, height: number): string | null {
      // 1. Unproject Screen to World Ray
      if (!Mat4Utils.invert(this.viewProjectionMatrix, TMP_MAT4_1)) return null;
      
      const ray = RayUtils.create();
      RayUtils.fromScreen(x, y, width, height, TMP_MAT4_1, ray);

      let closestId: string | null = null;
      let minDist = Infinity;

      // Temporary Reusable Objects
      const localRay = RayUtils.create();
      const invWorld = TMP_MAT4_2;

      // 2. Iterate Active Entities
      for (const [id, index] of this.ecs.idToIndex) {
          if (!this.ecs.store.isActive[index]) continue;
          
          // Only select entities with a mesh
          const meshType = this.ecs.store.meshType[index];
          if (meshType === 0) continue; 

          const worldMatrix = this.sceneGraph.getWorldMatrix(id);
          if (!worldMatrix) continue;

          // 3. Narrow Phase: Transform Ray to Local Object Space
          if (!Mat4Utils.invert(worldMatrix, invWorld)) continue;

          // Transform Ray Origin
          Vec3Utils.transformMat4(ray.origin, invWorld, localRay.origin);
          
          // Transform Ray Direction (as Vector, w=0)
          Vec3Utils.transformMat4Normal(ray.direction, invWorld, localRay.direction);

          // 4. Test against Unit Primitives (Local Space)
          let t: number | null = null;
          
          // Sphere (Radius 0.5) vs Cube/Plane (Box -0.5 to 0.5)
          if (meshType === 2) { // Sphere
              t = RayUtils.intersectSphere(localRay, {x:0, y:0, z:0}, 0.5);
          } else {
              // Cube(1) or Plane(3) -> Treat as AABB (-0.5 to 0.5)
              t = RayUtils.intersectBox(localRay, {x:-0.5, y:-0.5, z:-0.5}, {x:0.5, y:0.5, z:0.5});
          }

          // 5. Smart Sort (Depth Test)
          if (t !== null && t > 0) {
              if (t < minDist) {
                  minDist = t;
                  closestId = id;
              }
          }
      }
      return closestId;
  }

  // --- Marquee / Rect Selection ---
  selectEntitiesInRect(x: number, y: number, w: number, h: number): string[] {
      const results: string[] = [];
      const minX = Math.min(x, x + w);
      const maxX = Math.max(x, x + w);
      const minY = Math.min(y, y + h);
      const maxY = Math.max(y, y + h);

      for (const [id, index] of this.ecs.idToIndex) {
          if (!this.ecs.store.isActive[index]) continue;
          if (this.ecs.store.meshType[index] === 0) continue;

          // Get World Position (Center)
          const worldPos = this.sceneGraph.getWorldPosition(id);
          
          // Project to Screen Space
          // Mat4Utils.transformPoint returns {x,y,z,w} where x,y are in screen coords [0..width, 0..height]
          // but Y is often inverted in screen coords compared to CSS.
          // Our math util transformPoint outputs Top-Left origin screen coords if width/height passed
          const screenPos = Mat4Utils.transformPoint(worldPos, this.viewProjectionMatrix, this.canvasWidth, this.canvasHeight);
          
          if (screenPos.w <= 0) continue; // Behind camera

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
      this.notifyUI();
      // Return proxy
      return this.ecs.createProxy(id, this.sceneGraph)!;
  }

  // Helper to init scene with new API
  private initDemoScene() {
      const p = this.createEntity('Player Cube');
      // Use Proxy setters which handle SoA + Dirty
      p.components[ComponentType.MESH].meshType = 'Cube';
      p.components[ComponentType.MESH].color = '#3b82f6';
      p.components[ComponentType.PHYSICS].useGravity = true;

      const s = this.createEntity('Orbiting Satellite');
      s.components[ComponentType.MESH].meshType = 'Sphere';
      s.components[ComponentType.MESH].color = '#ef4444';
      s.components[ComponentType.TRANSFORM].position = {x: 3, y: 0, z: 0};
      s.components[ComponentType.TRANSFORM].scale = {x: 0.5, y: 0.5, z: 0.5};
      this.sceneGraph.attach(s.id, p.id);

      const f = this.createEntity('Floor');
      f.components[ComponentType.MESH].meshType = 'Plane';
      f.components[ComponentType.MESH].color = '#4b5563';
      f.components[ComponentType.TRANSFORM].position = {x: 0, y: -2, z: 0};
      f.components[ComponentType.TRANSFORM].scale = {x: 10, y: 0.1, z: 10};

      const l = this.createEntity('Directional Light');
      l.components[ComponentType.LIGHT]!.intensity = 1.0;
  }

  tick(deltaTime: number) {
      if (this.isPlaying) {
          // Physics Update
          // this.physics.update(deltaTime, this.ecs.store, this.ecs.idToIndex);
          
          // Simple Animation (Direct SoA access)
          const sId = Array.from(this.ecs.idToIndex.entries()).find(x => this.ecs.store.names[x[1]] === 'Orbiting Satellite')?.[0];
          if (sId) {
              const idx = this.ecs.idToIndex.get(sId)!;
              this.ecs.store.rotY[idx] += deltaTime * 2.0;
              this.ecs.store.rotX[idx] += deltaTime * 1.0;
              this.sceneGraph.setDirty(sId); // Explicit dirty
          }
          
          const pId = Array.from(this.ecs.idToIndex.entries()).find(x => this.ecs.store.names[x[1]] === 'Player Cube')?.[0];
          if (pId) {
              const idx = this.ecs.idToIndex.get(pId)!;
              this.ecs.store.rotY[idx] += deltaTime * 0.5;
              this.sceneGraph.setDirty(pId);
          }
      }

      // Update Scene Graph
      // Pass a callback that retrieves transform data from SoA
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

      // Render
      this.renderer.render(
          this.ecs.store, 
          this.ecs.idToIndex, 
          this.sceneGraph, 
          this.viewProjectionMatrix, 
          this.selectedIds
      );
  }
  
  start() { this.isPlaying = true; this.notifyUI(); }
  pause() { this.isPlaying = false; this.notifyUI(); }
  stop() { this.isPlaying = false; this.notifyUI(); }
  
  subscribe(cb: () => void) { this.listeners.push(cb); return () => this.listeners = this.listeners.filter(c => c !== cb); }
  notifyUI() { this.listeners.forEach(cb => cb()); }
}

export const engineInstance = new Ti3DEngine();
