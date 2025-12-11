
import { ComponentStorage } from '../ecs/ComponentStorage';
import { SceneGraph } from '../SceneGraph';
import { Mat4 } from '../math';
import { INITIAL_CAPACITY, MESH_TYPES } from '../constants';

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

export class WebGLRenderer {
    gl: WebGL2RenderingContext | null = null;
    program: WebGLProgram | null = null;
    
    meshes: Map<number, { vao: WebGLVertexArrayObject, count: number, instanceBuffer: WebGLBuffer }> = new Map();
    textureArray: WebGLTexture | null = null;
    
    // Instance Data Buffers (CPU side)
    instanceData = new Float32Array(INITIAL_CAPACITY * 21);
    
    // Render Stats
    drawCalls = 0;
    triangleCount = 0;
    
    showGrid = true;

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
    
    ensureCapacity(capacity: number) {
        if (this.instanceData.length < capacity * 21) {
            const newData = new Float32Array(capacity * 21);
            newData.set(this.instanceData);
            this.instanceData = newData;
            
            // Re-allocate GL buffers for instances
            if (this.gl) {
                const gl = this.gl;
                this.meshes.forEach(mesh => {
                    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW);
                });
            }
        }
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

        // Layer 1: Checkerboard (Grid)
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

        this.drawCalls = 0;
        this.triangleCount = 0;
        this.ensureCapacity(store.capacity);

        const meshTypes = [1, 2, 3];
        
        for (const typeId of meshTypes) {
            const mesh = this.meshes.get(typeId);
            if (!mesh) continue;

            let instanceCount = 0;
            let dataPtr = 0;
            
            for (const index of idToIndex.values()) {
                if (store.isActive[index] && store.meshType[index] === typeId) {
                    // Grid Filtering: If grid is off, skip the Floor/Grid texture
                    // HACK: Assuming texture 1 is grid and we want to hide it
                    if (!this.showGrid && store.textureIndex[index] === 1) continue;

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
                
                this.drawCalls++;
                this.triangleCount += (mesh.count / 3) * instanceCount;
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
