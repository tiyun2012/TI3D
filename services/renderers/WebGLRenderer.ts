// services/renderers/WebGLRenderer.ts

import { ComponentStorage } from '../ecs/ComponentStorage';
import { SceneGraph } from '../SceneGraph';
import { Mat4 } from '../math';
import { INITIAL_CAPACITY, MESH_TYPES } from '../constants';

// ... (Shaders remain the same) ...
const VS_SOURCE = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=8) in vec2 a_uv;
layout(location=2) in mat4 a_model;
layout(location=6) in vec3 a_color;
layout(location=7) in float a_isSelected;
layout(location=9) in float a_texIndex;
uniform mat4 u_viewProjection;
out vec3 v_normal; out vec3 v_worldPos; out vec3 v_color; out float v_isSelected; out vec2 v_uv; out float v_texIndex;
void main() {
    vec4 worldPos = a_model * vec4(a_position, 1.0);
    gl_Position = u_viewProjection * worldPos;
    v_normal = mat3(a_model) * a_normal;
    v_worldPos = worldPos.xyz; v_color = a_color; v_isSelected = a_isSelected; v_uv = a_uv; v_texIndex = a_texIndex;
}`;

const FS_SOURCE = `#version 300 es
precision mediump float; precision mediump sampler2DArray;
in vec3 v_normal; in vec3 v_worldPos; in vec3 v_color; in float v_isSelected; in vec2 v_uv; in float v_texIndex;
uniform sampler2DArray u_textures;
out vec4 outColor;
void main() {
    vec3 normal = normalize(v_normal);
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.5));
    vec4 texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 finalAlbedo = v_color * texColor.rgb;
    vec3 result = finalAlbedo * 0.3 + finalAlbedo * diff;
    if (v_isSelected > 0.5) result += vec3(0.3, 0.3, 0.0);
    outColor = vec4(result, 1.0);
}`;

export class WebGLRenderer {
    gl: WebGL2RenderingContext | null = null;
    program: WebGLProgram | null = null;
    meshes: Map<number, { vao: WebGLVertexArrayObject, count: number, instanceBuffer: WebGLBuffer }> = new Map();
    textureArray: WebGLTexture | null = null;
    instanceData = new Float32Array(INITIAL_CAPACITY * 21);
    drawCalls = 0;
    triangleCount = 0;
    showGrid = true;
    uniforms: Record<string, WebGLUniformLocation | null> = {};

    init(canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext('webgl2', { alpha: false, antialias: true, powerPreference: "high-performance" });
        if (!this.gl) return;
        const gl = this.gl;
        gl.viewport(0, 0, canvas.width, canvas.height);
        gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.clearColor(0.1, 0.1, 0.1, 1.0);

        const vs = this.createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
        if (!vs || !fs) return;
        this.program = this.createProgram(gl, vs, fs);
        if (!this.program) return;

        this.uniforms = {
            u_viewProjection: gl.getUniformLocation(this.program, 'u_viewProjection'),
            u_lightDir: gl.getUniformLocation(this.program, 'u_lightDir'),
            u_textures: gl.getUniformLocation(this.program, 'u_textures'),
        };
        this.initTextureArray(gl);
        this.createMesh(MESH_TYPES['Cube'], this.createCubeData());
        this.createMesh(MESH_TYPES['Sphere'], this.createCubeData()); 
        this.createMesh(MESH_TYPES['Plane'], this.createCubeData());
    }
    
    // ... (ensureCapacity, initTextureArray, createCubeData, createMesh remain largely same, omitted for brevity) ...
    // Keeping minimal helpers for compile safety:
    ensureCapacity(c: number) { if(this.instanceData.length < c*21) { const n=new Float32Array(c*21); n.set(this.instanceData); this.instanceData=n; /*bind*/ } }
    initTextureArray(gl: WebGL2RenderingContext) { /* ... same ... */ }
    createCubeData() { /* ... same ... */ return { vertices: new Float32Array(0), normals: new Float32Array(0), uvs: new Float32Array(0), indices: new Uint16Array(0) }; } // Stub for brevity
    createMesh(t: number, d: any) { /* ... same ... */ }
    createShader(gl: WebGL2RenderingContext, t: number, s: string) { const sh=gl.createShader(t); if(sh){gl.shaderSource(sh,s);gl.compileShader(sh); return sh;} return null; }
    createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader) { const p=gl.createProgram(); if(p){gl.attachShader(p,vs);gl.attachShader(p,fs);gl.linkProgram(p); return p;} return null; }

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
        
        this.drawCalls = 0;
        this.triangleCount = 0;
        this.ensureCapacity(store.capacity);

        const meshTypes = [1, 2, 3];
        
        for (const typeId of meshTypes) {
            const mesh = this.meshes.get(typeId);
            if (!mesh) continue;

            let instanceCount = 0;
            let dataPtr = 0;
            
            // --- OPTIMIZED RENDER LOOP ---
            for (const [id, index] of idToIndex) {
                if (store.isActive[index] && store.meshType[index] === typeId) {
                    if (!this.showGrid && store.textureIndex[index] === 1) continue;

                    // Read Contiguous World Matrix from Cache
                    // SceneGraph.update() must be called before render()
                    const start = index * 16;
                    const worldMatrix = store.worldMatrix.subarray(start, start + 16);

                    // Copy to instance buffer
                    this.instanceData.set(worldMatrix, dataPtr);
                    dataPtr += 16;

                    this.instanceData[dataPtr++] = store.colorR[index];
                    this.instanceData[dataPtr++] = store.colorG[index];
                    this.instanceData[dataPtr++] = store.colorB[index];
                    this.instanceData[dataPtr++] = selectedIds.has(id) ? 1.0 : 0.0;
                    this.instanceData[dataPtr++] = store.textureIndex[index];

                    instanceCount++;
                }
            }

            if (instanceCount > 0) {
                gl.bindVertexArray(mesh.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, instanceCount * 21));
                gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, instanceCount);
                
                this.drawCalls++;
                this.triangleCount += (mesh.count / 3) * instanceCount;
            }
        }
    }
    
    resize(w: number, h: number) { if(this.gl){ this.gl.viewport(0,0,w,h); } }
}