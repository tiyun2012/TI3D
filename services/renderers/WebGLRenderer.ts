// services/renderers/WebGLRenderer.ts

import { ComponentStorage } from '../ecs/ComponentStorage';
import { SceneGraph } from '../SceneGraph';
import { Mat4, Mat4Utils } from '../math';
import { INITIAL_CAPACITY, MESH_TYPES } from '../constants';

const VS_SOURCE = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=8) in vec2 a_uv;
layout(location=2) in mat4 a_model;
layout(location=6) in vec3 a_color;
layout(location=7) in float a_isSelected;
layout(location=9) in float a_texIndex;

uniform mat4 u_viewProjection;

out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_color;
out float v_isSelected;
out vec2 v_uv;
out float v_texIndex;

void main() {
    mat4 model = a_model;
    vec4 worldPos = model * vec4(a_position, 1.0);
    gl_Position = u_viewProjection * worldPos;
    
    v_normal = mat3(model) * a_normal;
    v_worldPos = worldPos.xyz;
    v_color = a_color;
    v_isSelected = a_isSelected;
    v_uv = a_uv;
    v_texIndex = a_texIndex;
}`;

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

out vec4 outColor;

void main() {
    vec3 normal = normalize(v_normal);
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.5));
    
    // Default fallback color
    vec4 texColor = vec4(1.0, 1.0, 1.0, 1.0);
    
    // v_texIndex: 0=White, 1=Grid, 2=Noise, 3=Brick
    // Explicit wrap modes in initTextureArray ensure this samples correctly
    texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 ambient = vec3(0.3);
    
    vec3 finalAlbedo = v_color * texColor.rgb;
    vec3 result = finalAlbedo * ambient + finalAlbedo * diff;
    
    if (v_isSelected > 0.5) {
        result = mix(result, vec3(1.0, 1.0, 0.0), 0.3);
    }
    
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
        this.gl = canvas.getContext('webgl2', { 
            alpha: false, 
            antialias: true, 
            powerPreference: "high-performance" 
        });
        
        if (!this.gl) {
            console.error("WebGL2 not supported");
            return;
        }

        const gl = this.gl;
        gl.enable(gl.DEPTH_TEST);
        
        // 🔴 FIX: Disable CULL_FACE initially to prevent invisible geometry due to winding order
        gl.disable(gl.CULL_FACE); 
        
        gl.clearColor(0.1, 0.1, 0.1, 1.0);

        const vs = this.createShader(gl, gl.VERTEX_SHADER, VS_SOURCE);
        const fs = this.createShader(gl, gl.FRAGMENT_SHADER, FS_SOURCE);
        if (!vs || !fs) return;

        this.program = this.createProgram(gl, vs, fs);
        if (!this.program) return;

        // 🟡 DEBUG: Verify attribute locations exist (not optimized out)
        console.log("Attrib Locations:", 
            gl.getAttribLocation(this.program, "a_position"),
            gl.getAttribLocation(this.program, "a_normal"),
            gl.getAttribLocation(this.program, "a_model"),
            gl.getAttribLocation(this.program, "a_color")
        );

        this.uniforms = {
            u_viewProjection: gl.getUniformLocation(this.program, 'u_viewProjection'),
            u_textures: gl.getUniformLocation(this.program, 'u_textures'),
        };

        this.initTextureArray(gl);
        this.createMesh(MESH_TYPES['Cube'], this.createCubeData());
        this.createMesh(MESH_TYPES['Sphere'], this.createSphereData(24, 16));
        this.createMesh(MESH_TYPES['Plane'], this.createPlaneData());
    }

    ensureCapacity(count: number) {
        const required = count * 21;
        if (this.instanceData.length < required) {
            const newBuffer = new Float32Array(required * 1.5);
            newBuffer.set(this.instanceData);
            this.instanceData = newBuffer;
            
            const gl = this.gl;
            if(!gl) return;
            this.meshes.forEach(mesh => {
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                // Buffer Orphaning: Reallocate storage
                gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
            });
        }
    }

    initTextureArray(gl: WebGL2RenderingContext) {
        const width = 64, height = 64, depth = 4;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, depth);

        // 🔴 FIX: Explicit Wrap Parameters are mandatory for 2D Arrays on some drivers
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);

        // 0: White
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(width*height*4).fill(255));

        // 1: Grid
        const gridData = new Uint8Array(width * height * 4);
        for(let i=0; i<width*height; i++) {
            const x = i % width, y = Math.floor(i / width);
            const isLine = (x % 8 === 0) || (y % 8 === 0);
            const c = isLine ? 180 : 255;
            gridData.set([c,c,c,255], i*4);
        }
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 1, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, gridData);

        // 2: Noise
        const noiseData = new Uint8Array(width * height * 4);
        for(let i=0; i<width*height*4; i++) noiseData[i] = Math.random() * 255;
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 2, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, noiseData);

        // 3: Brick
        const brickData = new Uint8Array(width * height * 4);
        for(let i=0; i<width*height; i++) {
             const x = i % width, y = Math.floor(i / width);
             const row = Math.floor(y / 16), offset = (row % 2) * 16;
             const isMortar = (y % 16 < 2) || ((x + offset) % 32 < 2);
             brickData.set(isMortar ? [200,200,200,255] : [180,80,60,255], i*4);
        }
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 3, width, height, 1, gl.RGBA, gl.UNSIGNED_BYTE, brickData);

        this.textureArray = texture;
    }

    createMesh(typeId: number, data: { vertices: Float32Array, normals: Float32Array, uvs: Float32Array, indices: Uint16Array }) {
        const gl = this.gl;
        if (!gl) return;

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const createBuffer = (type: number, src: ArrayBuffer) => {
            const buf = gl.createBuffer();
            gl.bindBuffer(type, buf);
            gl.bufferData(type, src, gl.STATIC_DRAW);
            return buf;
        };

        // Static attributes
        createBuffer(gl.ARRAY_BUFFER, data.vertices);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        createBuffer(gl.ARRAY_BUFFER, data.normals);
        gl.enableVertexAttribArray(1);
        gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

        createBuffer(gl.ARRAY_BUFFER, data.uvs);
        gl.enableVertexAttribArray(8);
        gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0);

        createBuffer(gl.ELEMENT_ARRAY_BUFFER, data.indices);

        // Instanced attributes
        const instBuf = gl.createBuffer();
        
        // 🔴 FIX: Explicitly bind instance buffer so pointers are correctly linked
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
        
        const stride = 21 * 4; // 21 floats * 4 bytes
        
        // Mat4 (Model) - locations 2,3,4,5
        for (let i = 0; i < 4; i++) {
            const loc = 2 + i;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16);
            gl.vertexAttribDivisor(loc, 1);
        }
        
        // Color - location 6
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16 * 4);
        gl.vertexAttribDivisor(6, 1);
        
        // Selection - location 7
        gl.enableVertexAttribArray(7);
        gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19 * 4);
        gl.vertexAttribDivisor(7, 1);
        
        // Texture Index - location 9
        gl.enableVertexAttribArray(9);
        gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, 20 * 4);
        gl.vertexAttribDivisor(9, 1);

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null); // Clean up

        this.meshes.set(typeId, { vao: vao!, count: data.indices.length, instanceBuffer: instBuf! });
    }

    createCubeData() {
        const v = [ -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5,  0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5,0.5,-0.5, 0.5,0.5,-0.5,  -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5,  -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5,  0.5,-0.5,0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, 0.5,0.5,0.5,  -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5 ];
        const n = [ 0,0,1, 0,0,1, 0,0,1, 0,0,1,  0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1,  0,1,0, 0,1,0, 0,1,0, 0,1,0,  0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0,  1,0,0, 1,0,0, 1,0,0, 1,0,0,  -1,0,0, -1,0,0, -1,0,0, -1,0,0 ];
        const uv = [ 0,0, 1,0, 1,1, 0,1,  0,0, 1,0, 1,1, 0,1,  0,0, 1,0, 1,1, 0,1,  0,0, 1,0, 1,1, 0,1,  0,0, 1,0, 1,1, 0,1,  0,0, 1,0, 1,1, 0,1 ];
        const i = [ 0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11, 12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23 ];
        return { vertices: new Float32Array(v), normals: new Float32Array(n), uvs: new Float32Array(uv), indices: new Uint16Array(i) };
    }

    createPlaneData() {
        const v = [ -0.5,0,0.5, 0.5,0,0.5, 0.5,0,-0.5, -0.5,0,-0.5 ];
        const n = [ 0,1,0, 0,1,0, 0,1,0, 0,1,0 ];
        const uv = [ 0,0, 10,0, 10,10, 0,10 ];
        const i = [ 0,1,2, 0,2,3 ];
        return { vertices: new Float32Array(v), normals: new Float32Array(n), uvs: new Float32Array(uv), indices: new Uint16Array(i) };
    }

    createSphereData(latBands: number, longBands: number) {
        const v = [], n = [], u = [], idx = [];
        for (let lat = 0; lat <= latBands; lat++) {
            const theta = lat * Math.PI / latBands;
            const sinTheta = Math.sin(theta), cosTheta = Math.cos(theta);
            for (let lon = 0; lon <= longBands; lon++) {
                const phi = lon * 2 * Math.PI / longBands;
                const sinPhi = Math.sin(phi), cosPhi = Math.cos(phi);
                const x = cosPhi * sinTheta, y = cosTheta, z = sinPhi * sinTheta;
                n.push(x, y, z);
                u.push(1 - (lon / longBands), 1 - (lat / latBands));
                v.push(x * 0.5, y * 0.5, z * 0.5);
            }
        }
        for (let lat = 0; lat < latBands; lat++) {
            for (let lon = 0; lon < longBands; lon++) {
                const first = (lat * (longBands + 1)) + lon;
                const second = first + longBands + 1;
                idx.push(first, second, first + 1, second, second + 1, first + 1);
            }
        }
        return { vertices: new Float32Array(v), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(idx) };
    }

    createShader(gl: WebGL2RenderingContext, type: number, source: string) {
        const shader = gl.createShader(type);
        if (!shader) return null;
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(shader)); return null; }
        return shader;
    }

    createProgram(gl: WebGL2RenderingContext, vs: WebGLShader, fs: WebGLShader) {
        const p = gl.createProgram();
        if (!p) return null;
        gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
        return p;
    }

    render(store: ComponentStorage, count: number, selectedIndices: Set<number>, viewProjection: Mat4, width: number, height: number) {
        if (!this.gl || !this.program) return;
        const gl = this.gl;
        
        // 🔴 FIX: CRITICAL VIEWPORT SYNC
        if (gl.canvas.width !== width || gl.canvas.height !== height) {
            gl.canvas.width = width;
            gl.canvas.height = height;
            gl.viewport(0, 0, width, height);
        }

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(this.program);
        gl.uniformMatrix4fv(this.uniforms.u_viewProjection, false, viewProjection);
        
        if (this.textureArray) {
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
            gl.uniform1i(this.uniforms.u_textures, 0);
        }

        this.ensureCapacity(store.capacity);
        this.drawCalls = 0; this.triangleCount = 0;

        [1, 2, 3].forEach(typeId => { 
            const mesh = this.meshes.get(typeId);
            if (!mesh) return;
            
            let instanceCount = 0, ptr = 0;
            
            // Dense Iteration (Fast)
            for (let index = 0; index < count; index++) {
                if (!store.isActive[index]) continue;
                if (store.meshType[index] !== typeId) continue;
                if (!this.showGrid && store.textureIndex[index] === 1) continue;
                
                const start = index * 16;
                // Culling disabled for robustness
                
                this.instanceData.set(store.worldMatrix.subarray(start, start + 16), ptr); ptr += 16;
                this.instanceData[ptr++] = store.colorR[index];
                this.instanceData[ptr++] = store.colorG[index];
                this.instanceData[ptr++] = store.colorB[index];
                this.instanceData[ptr++] = selectedIndices.has(index) ? 1.0 : 0.0;
                this.instanceData[ptr++] = store.textureIndex[index];
                instanceCount++;
            }

            if (instanceCount > 0) {
                gl.bindVertexArray(mesh.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                
                // Buffer Orphaning: Allocate fresh memory to prevent pipeline stalls
                gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData.subarray(0, instanceCount * 21));
                
                gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, instanceCount);
                this.drawCalls++;
                this.triangleCount += (mesh.count / 3) * instanceCount;
            }
        });
        gl.bindVertexArray(null);
    }
    
    resize(w: number, h: number) { 
        if(this.gl) {
            this.gl.canvas.width = w;
            this.gl.canvas.height = h;
            this.gl.viewport(0, 0, w, h); 
        }
    }
}
