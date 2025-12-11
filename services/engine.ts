/**
 * High Performance WebGL Engine Core
 */

import { Entity, ComponentType, Vector3 } from '../types';
import { SceneGraph } from './SceneGraph';
import { Mat4, Mat4Utils, Vec3Utils } from './math';

// --- WebGL Shaders ---

const VS_SOURCE = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;

uniform mat4 u_model;
uniform mat4 u_viewProjection;

out vec3 v_normal;
out vec3 v_worldPos;

void main() {
    vec4 worldPos = u_model * vec4(a_position, 1.0);
    gl_Position = u_viewProjection * worldPos;
    v_normal = mat3(u_model) * a_normal; // Simplified normal matrix
    v_worldPos = worldPos.xyz;
}
`;

const FS_SOURCE = `#version 300 es
precision mediump float;

in vec3 v_normal;
in vec3 v_worldPos;

uniform vec3 u_color;
uniform vec3 u_lightDir;
uniform bool u_isSelected;

out vec4 outColor;

void main() {
    vec3 normal = normalize(v_normal);
    vec3 lightDir = normalize(u_lightDir);
    
    // Simple Lambert
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 ambient = u_color * 0.3;
    vec3 diffuse = u_color * diff;
    
    vec3 finalColor = ambient + diffuse;
    
    if (u_isSelected) {
        finalColor += vec3(0.2, 0.2, 0.0); // Yellow tint
    }

    outColor = vec4(finalColor, 1.0);
}
`;

// --- Geometry Generation (Helpers) ---

function createCubeData() {
    // 24 vertices (6 faces * 4 verts) with normals
    // Simplified: positions and normals
    const p = [
        // Front
        -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,  0.5,
        // Back
        -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5, -0.5,
        // Top
        -0.5,  0.5, -0.5, -0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5,  0.5, -0.5,
        // Bottom
        -0.5, -0.5, -0.5,  0.5, -0.5, -0.5,  0.5, -0.5,  0.5, -0.5, -0.5,  0.5,
        // Right
         0.5, -0.5, -0.5,  0.5,  0.5, -0.5,  0.5,  0.5,  0.5,  0.5, -0.5,  0.5,
        // Left
        -0.5, -0.5, -0.5, -0.5, -0.5,  0.5, -0.5,  0.5,  0.5, -0.5,  0.5, -0.5,
    ];
    // Indices
    const i = [
        0, 1, 2, 0, 2, 3,    // Front
        4, 5, 6, 4, 6, 7,    // Back
        8, 9, 10, 8, 10, 11, // Top
        12, 13, 14, 12, 14, 15, // Bottom
        16, 17, 18, 16, 18, 19, // Right
        20, 21, 22, 20, 22, 23  // Left
    ];
    // Normals (simplified, repeating for flat shading look would require 24 unique verts)
    // For this simple engine, we assume flat face normals corresponding to the 24 verts above.
    const n: number[] = [];
    const addN = (x:number,y:number,z:number) => { for(let k=0;k<4;k++) n.push(x,y,z); }
    addN(0,0,1); addN(0,0,-1); addN(0,1,0); addN(0,-1,0); addN(1,0,0); addN(-1,0,0);

    return { vertices: new Float32Array(p), normals: new Float32Array(n), indices: new Uint16Array(i) };
}

// --- Systems ---

class EntityComponentSystem {
  entities: Map<string, Entity> = new Map();
  // Cache array to avoid Map iteration in hot loops
  entityCache: Entity[] = [];
  
  createEntity(name: string): Entity {
    const id = crypto.randomUUID();
    const entity: Entity = {
      id,
      name,
      isActive: true,
      components: {
        [ComponentType.TRANSFORM]: { 
          type: ComponentType.TRANSFORM, 
          position: { x: 0, y: 0, z: 0 }, 
          rotation: { x: 0, y: 0, z: 0 }, 
          scale: { x: 1, y: 1, z: 1 } 
        }
      } as any
    };
    this.entities.set(id, entity);
    this.invalidateCache();
    return entity;
  }

  private invalidateCache() {
      this.entityCache = Array.from(this.entities.values());
  }
}

class WebGLRenderer {
    gl: WebGL2RenderingContext | null = null;
    program: WebGLProgram | null = null;
    
    // Meshes
    meshes: Map<string, { vao: WebGLVertexArrayObject, count: number }> = new Map();

    // Uniform Locations
    uniforms: Record<string, WebGLUniformLocation | null> = {};

    // Camera
    viewProjectionMatrix: Mat4 = Mat4Utils.create();

    // Color Cache (Hex string -> r,g,b float array)
    colorCache: Map<string, {r:number, g:number, b:number}> = new Map();

    init(canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: "high-performance" });
        if (!this.gl) {
            console.error("WebGL2 not supported");
            return;
        }

        const gl = this.gl;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.DEPTH_TEST);
        gl.enable(gl.CULL_FACE); // Optimization: Cull backfaces
        gl.clearColor(0.1, 0.1, 0.1, 1.0); 

        // Compile Shader
        const vs = this.createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
        this.program = this.createProgram(gl, vs, fs);

        // Get Uniforms
        this.uniforms = {
            u_model: gl.getUniformLocation(this.program, 'u_model'),
            u_viewProjection: gl.getUniformLocation(this.program, 'u_viewProjection'),
            u_color: gl.getUniformLocation(this.program, 'u_color'),
            u_lightDir: gl.getUniformLocation(this.program, 'u_lightDir'),
            u_isSelected: gl.getUniformLocation(this.program, 'u_isSelected'),
        };

        // Create Default Meshes
        this.createMesh('Cube', createCubeData());
        this.createMesh('Sphere', createCubeData()); 
        this.createMesh('Plane', createCubeData());
    }

    resize(width: number, height: number) {
        if (this.gl) {
            this.gl.canvas.width = width;
            this.gl.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
        }
    }

    render(entities: Entity[], sceneGraph: SceneGraph, selectedId: string | null) {
        if (!this.gl || !this.program) return;
        const gl = this.gl;

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.program);

        // Set Global Uniforms
        gl.uniformMatrix4fv(this.uniforms.u_viewProjection, false, this.viewProjectionMatrix);
        gl.uniform3f(this.uniforms.u_lightDir, 0.5, 0.8, 0.5);

        // Draw Entities
        // Use standard for loop for max performance
        for (let i = 0; i < entities.length; i++) {
            const entity = entities[i];
            if (!entity.isActive) continue;

            const meshComp = entity.components[ComponentType.MESH];
            if (!meshComp) continue;

            const mesh = this.meshes.get(meshComp.meshType);
            if (!mesh) continue;

            const worldMatrix = sceneGraph.getWorldMatrix(entity.id);
            if (!worldMatrix) continue;

            // Bind VAO
            gl.bindVertexArray(mesh.vao);

            // Set Entity Uniforms
            gl.uniformMatrix4fv(this.uniforms.u_model, false, worldMatrix);
            
            // Cached Color Parse
            const hex = meshComp.color || '#ffffff';
            let c = this.colorCache.get(hex);
            if (!c) {
                c = this.hexToRgb(hex);
                this.colorCache.set(hex, c);
            }
            gl.uniform3f(this.uniforms.u_color, c.r, c.g, c.b);

            gl.uniform1i(this.uniforms.u_isSelected, entity.id === selectedId ? 1 : 0);

            // Draw
            gl.drawElements(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0);
        }
    }

    setCamera(vpMatrix: Mat4) {
        this.viewProjectionMatrix = vpMatrix;
    }

    private createMesh(name: string, data: { vertices: Float32Array, normals: Float32Array, indices: Uint16Array }) {
        if (!this.gl) return;
        const gl = this.gl;

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        // Position VBO
        const posBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.vertices, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        // Normal VBO
        const normBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, normBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, data.normals, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        // EBO
        const ebo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ebo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, data.indices, gl.STATIC_DRAW);

        gl.bindVertexArray(null);

        if (vao) {
            this.meshes.set(name, { vao, count: data.indices.length });
        }
    }

    private createShader(gl: WebGL2RenderingContext, type: number, source: string) {
        const shader = gl.createShader(type)!;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compile error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            throw new Error('Shader compile error');
        }
        return shader;
    }

    private createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader) {
        const program = gl.createProgram()!;
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
             console.error('Program link error:', gl.getProgramInfoLog(program));
             throw new Error('Program link error');
        }
        return program;
    }

    private hexToRgb(hex: string) {
        const bigint = parseInt(hex.slice(1), 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return { r: r/255, g: g/255, b: b/255 };
    }
}

class PhysicsSystem {
  update(deltaTime: number, entities: Entity[]) {
    // Optimization: use for-loop instead of forEach
    for(let i=0; i<entities.length; i++) {
        const entity = entities[i];
        if (entity.components[ComponentType.PHYSICS]) {
            const transform = entity.components[ComponentType.TRANSFORM];
            // Simple mock gravity
            if (transform.position.y > 0) {
            // transform.position.y -= 9.8 * deltaTime * 0.1;
            // if (transform.position.y < 0) transform.position.y = 0;
            }
        }
    }
  }
}

// --- Main Engine Class ---

export class Ti3DEngine {
  ecs: EntityComponentSystem;
  sceneGraph: SceneGraph;
  renderer: WebGLRenderer;
  physics: PhysicsSystem;
  isPlaying: boolean = false;
  selectedId: string | null = null;
  
  private listeners: (() => void)[] = [];

  constructor() {
    this.ecs = new EntityComponentSystem();
    this.sceneGraph = new SceneGraph();
    this.renderer = new WebGLRenderer(); // Now true WebGL
    this.physics = new PhysicsSystem();
    
    this.initDemoScene();
  }

  initGL(canvas: HTMLCanvasElement) {
      this.renderer.init(canvas);
  }

  resize(width: number, height: number) {
      this.renderer.resize(width, height);
  }

  setSelected(id: string | null) {
      this.selectedId = id;
      // Selection changes should notify UI
      this.notifyUI();
  }

  updateCamera(vpMatrix: Mat4) {
      this.renderer.setCamera(vpMatrix);
  }

  private initDemoScene() {
    // 1. Create Player
    const player = this.createEntity('Player Cube');
    player.components[ComponentType.MESH] = { type: ComponentType.MESH, meshType: 'Cube', color: '#3b82f6' };
    player.components[ComponentType.PHYSICS] = { type: ComponentType.PHYSICS, mass: 1, useGravity: true };
    player.components[ComponentType.TRANSFORM].position = { x: 0, y: 0, z: 0 };

    // 2. Create a child object
    const satellite = this.createEntity('Orbiting Satellite');
    satellite.components[ComponentType.MESH] = { type: ComponentType.MESH, meshType: 'Sphere', color: '#ef4444' };
    satellite.components[ComponentType.TRANSFORM].position = { x: 3, y: 0, z: 0 }; // Local offset
    satellite.components[ComponentType.TRANSFORM].scale = { x: 0.5, y: 0.5, z: 0.5 };
    
    this.sceneGraph.attach(satellite.id, player.id);

    // 3. Environment
    const floor = this.createEntity('Floor');
    floor.components[ComponentType.MESH] = { type: ComponentType.MESH, meshType: 'Plane', color: '#4b5563' };
    floor.components[ComponentType.TRANSFORM].position = { x: 0, y: -2, z: 0 };
    floor.components[ComponentType.TRANSFORM].scale = { x: 10, y: 0.1, z: 10 };
    
    const light = this.createEntity('Directional Light');
    light.components[ComponentType.LIGHT] = { type: ComponentType.LIGHT, intensity: 1.0, color: '#ffffff' };
    light.components[ComponentType.TRANSFORM].position = { x: 5, y: 10, z: 5 };
  }

  public createEntity(name: string): Entity {
    const entity = this.ecs.createEntity(name);
    this.sceneGraph.registerEntity(entity.id);
    this.notifyUI(); // Structure changed, notify UI
    return entity;
  }

  public subscribe(callback: () => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter(cb => cb !== callback);
    };
  }

  public notifyUI() {
    this.listeners.forEach(cb => cb());
  }

  public tick(deltaTime: number) {
    // Use Cached Entities Array
    const entities = this.ecs.entityCache;

    if (this.isPlaying) {
      this.physics.update(deltaTime, entities);
      
      const satellite = entities.find(e => e.name === 'Orbiting Satellite');
      if (satellite) {
        // Rotate locally
        satellite.components[ComponentType.TRANSFORM].rotation.y += deltaTime * 2.0;
        satellite.components[ComponentType.TRANSFORM].rotation.x += deltaTime * 1.0;
      }
      
      const player = entities.find(e => e.name === 'Player Cube');
      if (player) {
         player.components[ComponentType.TRANSFORM].rotation.y += deltaTime * 0.5;
      }
    }

    // Update Matrices (Optimized in SceneGraph)
    this.sceneGraph.update(this.ecs.entities);

    // Render Scene (GPU)
    this.renderer.render(entities, this.sceneGraph, this.selectedId);

    // CRITICAL PERFORMANCE FIX: 
    // Do NOT call notifyUI() here. 60 calls per second forces React to re-render the 
    // entire Inspector/Hierarchy tree which destroys CPU performance.
    // UI synchronization should be handled by polling or explicit events.
  }

  public start() { this.isPlaying = true; this.notifyUI(); }
  public pause() { this.isPlaying = false; this.notifyUI(); }
  public stop() { 
    this.isPlaying = false; 
    this.notifyUI();
  }
}

export const engineInstance = new Ti3DEngine();