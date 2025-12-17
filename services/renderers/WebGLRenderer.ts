
// services/renderers/WebGLRenderer.ts

import { ComponentStorage } from '../ecs/ComponentStorage';
import { INITIAL_CAPACITY, MESH_TYPES, COMPONENT_MASKS } from '../constants';
import { assetManager } from '../AssetManager';
import { StaticMeshAsset } from '../../types';

// --- CONFIGURATION INTERFACE ---
export interface PostProcessConfig {
    enabled: boolean;
    vignetteStrength: number;   // 0.0 to 2.0
    aberrationStrength: number; // 0.0 to 0.02
    toneMapping: boolean;
}

const VS_TEMPLATE = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=8) in vec2 a_uv;
layout(location=2) in mat4 a_model;
layout(location=6) in vec3 a_color;
layout(location=7) in float a_isSelected;
layout(location=9) in float a_texIndex;
layout(location=10) in float a_effectIndex;

uniform mat4 u_viewProjection;
uniform highp float u_time;
uniform sampler2DArray u_textures;

out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_objectPos; 
out vec3 v_color;
out float v_isSelected;
out vec2 v_uv;
out float v_texIndex;
out float v_effectIndex;

// %VERTEX_LOGIC%

void main() {
    mat4 model = a_model;
    vec4 localPos = vec4(a_position, 1.0);
    
    vec3 v_pos_graph = a_position; 
    v_worldPos = (model * localPos).xyz;
    v_normal = normalize(mat3(model) * a_normal);
    v_objectPos = vec3(model[3][0], model[3][1], model[3][2]);
    v_uv = a_uv;
    v_color = a_color;
    v_isSelected = a_isSelected;
    v_texIndex = a_texIndex;
    v_effectIndex = a_effectIndex;
    
    vec3 vertexOffset = vec3(0.0);
    
    // Injected Body
    // %VERTEX_BODY%
    
    localPos.xyz += vertexOffset;

    vec4 worldPos = model * localPos;
    gl_Position = u_viewProjection * worldPos;
    
    v_normal = normalize(mat3(model) * a_normal); 
    v_worldPos = worldPos.xyz;
}`;

const FS_DEFAULT_SOURCE = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;

in highp vec3 v_normal;
in highp vec3 v_worldPos;
in highp vec3 v_objectPos;
in highp vec3 v_color;
in highp float v_isSelected;
in highp vec2 v_uv;
in highp float v_texIndex;
in highp float v_effectIndex;

uniform sampler2DArray u_textures;
uniform int u_renderMode; // 0=Lit, 1=Normals
uniform vec3 u_cameraPos;

// Lighting Uniforms
uniform vec3 u_lightDir;
uniform vec3 u_lightColor;
uniform float u_lightIntensity;

// MRT Output
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData; // R=EffectID

vec3 getStylizedLighting(vec3 normal, vec3 viewDir, vec3 albedo) {
    float NdotL = dot(normal, -u_lightDir);
    float lightBand = smoothstep(0.0, 0.05, NdotL);
    vec3 shadowColor = vec3(0.05, 0.05, 0.15); 
    float NdotV = 1.0 - max(dot(normal, viewDir), 0.0);
    float rim = pow(NdotV, 4.0);
    float rimIntensity = 0.5;
    
    vec3 litColor = albedo * u_lightColor * u_lightIntensity;
    vec3 finalLight = mix(shadowColor * albedo, litColor, lightBand);
    finalLight += vec3(rim) * rimIntensity * u_lightColor;

    return finalLight;
}

void main() {
    vec3 normal = normalize(v_normal);
    vec3 viewDir = normalize(u_cameraPos - v_worldPos);
    
    vec4 texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    vec3 albedo = v_color * texColor.rgb;
    
    vec3 result = vec3(0.0);

    if (u_renderMode == 0) { // LIT
        result = getStylizedLighting(normal, viewDir, albedo);
    } else if (u_renderMode == 1) { // NORMALS
        result = normal * 0.5 + 0.5;
    } else if (u_renderMode == 2) { // UNLIT
        result = albedo;
    } else if (u_renderMode == 3) { // WIREFRAME 
        result = vec3(0.0, 1.0, 0.0); 
    } else {
        result = albedo;
    }
    
    if (v_isSelected > 0.5) {
        result = mix(result, vec3(1.0, 0.8, 0.2), 0.3);
    }
    
    outColor = vec4(result, 1.0);
    outData = vec4(v_effectIndex / 255.0, 0.0, 0.0, 1.0);
}`;

const PP_VS = `#version 300 es
layout(location=0) in vec2 a_position;
out vec2 v_uv;
void main() {
    v_uv = a_position * 0.5 + 0.5;
    gl_Position = vec4(a_position, 0.0, 1.0);
}`;

const PP_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;    // Included Objects
uniform sampler2D u_data;     // Effect IDs
uniform sampler2D u_excluded; // Excluded Objects (Overlay)
uniform vec2 u_resolution;
uniform float u_time;

uniform float u_enabled;
uniform float u_vignetteStrength;
uniform float u_aberrationStrength;
uniform float u_toneMapping;

out vec4 outColor;

vec3 aces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
    vec3 color = texture(u_scene, v_uv).rgb;
    float rawId = floor(texture(u_data, v_uv).r * 255.0 + 0.5);
    float effectId = rawId; 
    
    // Simplified effect stack for MVP
    if (effectId > 0.5 && effectId < 1.5) { // Pixelate
         float p = 64.0; vec2 puv = floor(v_uv * p) / p; color = texture(u_scene, puv).rgb;
    }

    if (u_enabled > 0.5) {
        if (u_aberrationStrength > 0.0) {
            float r = texture(u_scene, v_uv + vec2(u_aberrationStrength, 0.0)).r;
            float b = texture(u_scene, v_uv - vec2(u_aberrationStrength, 0.0)).b;
            color.r = r; color.b = b;
        }
        if (u_vignetteStrength > 0.0) {
            vec2 uv = v_uv * (1.0 - v_uv.yx); float vig = uv.x * uv.y * 15.0;
            color *= pow(vig, 0.15 * u_vignetteStrength);
        }
        if (u_toneMapping > 0.5) color = aces(color);
        color = pow(color, vec3(1.0 / 2.2));
    } else {
        color = pow(color, vec3(1.0 / 2.2));
    }

    vec4 excluded = texture(u_excluded, v_uv);
    if (excluded.a > 0.0) {
        color = mix(color, pow(excluded.rgb, vec3(1.0 / 2.2)), excluded.a);
    }

    outColor = vec4(color, 1.0);
}`;

interface MeshBatch {
    vao: WebGLVertexArrayObject;
    count: number;
    instanceBuffer: WebGLBuffer;
    cpuBuffer: Float32Array; 
    instanceCount: number; 
}

export class WebGLRenderer {
    gl: WebGL2RenderingContext | null = null;
    
    defaultProgram: WebGLProgram | null = null;
    materialPrograms: Map<number, WebGLProgram> = new Map();
    gridProgram: WebGLProgram | null = null;
    meshes: Map<number, MeshBatch> = new Map();
    textureArray: WebGLTexture | null = null;
    
    depthRenderbuffer: WebGLRenderbuffer | null = null;
    fboIncluded: WebGLFramebuffer | null = null;
    texColorIncluded: WebGLTexture | null = null;
    texData: WebGLTexture | null = null;
    fboExcluded: WebGLFramebuffer | null = null;
    texColorExcluded: WebGLTexture | null = null;
    ppProgram: WebGLProgram | null = null;
    quadVAO: WebGLVertexArrayObject | null = null;
    
    private fboWidth: number = 0;
    private fboHeight: number = 0;
    
    drawCalls = 0;
    triangleCount = 0;
    showGrid = true;
    
    gridOpacity = 0.3;
    gridSize = 1.0;
    gridSubdivisions = 10;
    gridFadeDistance = 300.0;
    gridColor = [0.5, 0.5, 0.5];
    gridExcludePP = false;
    
    renderMode: number = 0;
    
    ppConfig: PostProcessConfig = {
        enabled: true,
        vignetteStrength: 1.0,
        aberrationStrength: 0.002,
        toneMapping: true
    };
    
    private buckets: Map<number, number[]> = new Map();
    private excludedBuckets: Map<number, number[]> = new Map();

    init(canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: "high-performance" });
        if (!this.gl) return;
        const gl = this.gl;
        gl.getExtension("EXT_color_buffer_float");
        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE); 
        gl.clearColor(0.1, 0.1, 0.1, 1.0);
        const defaultVS = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', '').replace('// %VERTEX_BODY%', '');
        this.defaultProgram = this.createProgram(gl, defaultVS, FS_DEFAULT_SOURCE);
        this.initTextureArray(gl);
        this.initPostProcess(gl);
        this.initGridShader(gl);
        const meshes = assetManager.getAssetsByType('MESH') as StaticMeshAsset[];
        meshes.forEach(asset => {
            const id = assetManager.getMeshID(asset.id);
            if (id > 0) this.registerMesh(id, asset.geometry);
        });
    }

    initGridShader(gl: WebGL2RenderingContext) {
        const gridVS = `#version 300 es
        layout(location=0) in vec2 a_position;
        uniform mat4 u_viewProjection;
        out vec3 v_worldPos;
        void main() {
            vec3 pos = vec3(a_position.x, 0.0, a_position.y) * 1000.0;
            v_worldPos = pos;
            gl_Position = u_viewProjection * vec4(pos, 1.0);
        }`;

        const gridFS = `#version 300 es
        precision mediump float;
        in vec3 v_worldPos;
        layout(location=0) out vec4 outColor;
        
        uniform float u_opacity;
        uniform float u_gridSize;
        uniform float u_subdivisions;
        uniform float u_fadeDist;
        uniform vec3 u_gridColor;

        void main() {
            vec2 coord = v_worldPos.xz;
            vec2 derivative = fwidth(coord);
            
            // Major Grid (Meters)
            vec2 grid = abs(fract(coord / u_gridSize - 0.5) - 0.5) / (derivative / u_gridSize);
            float line = min(grid.x, grid.y);
            float alphaMajor = 1.0 - min(line, 1.0);
            
            // Minor Grid (Subdivisions)
            float subStep = u_gridSize / u_subdivisions;
            vec2 gridSub = abs(fract(coord / subStep - 0.5) - 0.5) / (derivative / subStep);
            float lineSub = min(gridSub.x, gridSub.y);
            float alphaSub = 1.0 - min(lineSub, 1.0);

            // Axes
            float xAxis = 1.0 - min(abs(v_worldPos.z) / derivative.y, 1.0);
            float zAxis = 1.0 - min(abs(v_worldPos.x) / derivative.x, 1.0);
            
            float dist = length(v_worldPos.xz);
            float fade = max(0.0, 1.0 - dist / u_fadeDist);

            vec3 color = u_gridColor; 
            float finalAlpha = alphaSub * (u_opacity * 0.4); // Subtle sub-lines
            finalAlpha = max(finalAlpha, alphaMajor * u_opacity); // Bold major lines
            
            if (xAxis > 0.0) { finalAlpha = max(finalAlpha, xAxis); color = vec3(1.0, 0.2, 0.2); }
            if (zAxis > 0.0) { finalAlpha = max(finalAlpha, zAxis); color = vec3(0.2, 0.4, 1.0); }

            if (finalAlpha * fade <= 0.01) discard;
            outColor = vec4(color, finalAlpha * fade);
        }`;
        this.gridProgram = this.createProgram(gl, gridVS, gridFS);
    }

    initPostProcess(gl: WebGL2RenderingContext) {
        this.fboWidth = 1; this.fboHeight = 1;
        this.depthRenderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.fboWidth, this.fboHeight);
        this.fboIncluded = gl.createFramebuffer();
        this.texColorIncluded = this.createTexture(gl, gl.RGBA, gl.UNSIGNED_BYTE);
        this.texData = this.createTexture(gl, gl.RGBA32F, gl.FLOAT);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboIncluded);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColorIncluded, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.texData, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderbuffer);
        this.fboExcluded = gl.createFramebuffer();
        this.texColorExcluded = this.createTexture(gl, gl.RGBA, gl.UNSIGNED_BYTE);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboExcluded);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColorExcluded, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderbuffer);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.quadVAO = gl.createVertexArray();
        const quadVBO = gl.createBuffer();
        gl.bindVertexArray(this.quadVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        this.ppProgram = this.createProgram(gl, PP_VS, PP_FS);
    }

    private createTexture(gl: WebGL2RenderingContext, format: number, type: number) {
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, format, this.fboWidth, this.fboHeight, 0, gl.RGBA, type, null);
        return tex;
    }

    createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
        const vs = gl.createShader(gl.VERTEX_SHADER)!; gl.shaderSource(vs, vsSrc); gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(vs)); return null; }
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(fs)); return null; }
        const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        return prog;
    }

    initTextureArray(gl: WebGL2RenderingContext) {
        this.textureArray = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 256, 256, 16);
        const data = new Uint8Array(256 * 256 * 4 * 16); 
        for (let layer = 0; layer < 4; layer++) {
            for (let y = 0; y < 256; y++) {
                for (let x = 0; x < 256; x++) {
                    const idx = (layer * 256 * 256 + y * 256 + x) * 4;
                    let r = 255, g = 255, b = 255;
                    if (layer === 1) { const s = 32; r = g = b = ((Math.floor(x/s)+Math.floor(y/s))%2===0 ? 220 : 255); }
                    else if (layer === 2) r = g = b = Math.random() * 255;
                    else if (layer === 3) { if ((x%64)<4 || (y%32)<4) { r=g=b=180; } else { r=160; g=60; b=40; } }
                    data[idx] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = 255;
                }
            }
        }
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 256, 256, 16, gl.RGBA, gl.UNSIGNED_BYTE, data);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
    }

    uploadTexture(layerIndex: number, image: HTMLImageElement) {
        if (!this.gl || !this.textureArray) return;
        const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 256;
        const ctx = canvas.getContext('2d'); if (!ctx) return;
        ctx.drawImage(image, 0, 0, 256, 256);
        this.gl.bindTexture(this.gl.TEXTURE_2D_ARRAY, this.textureArray);
        this.gl.texSubImage3D(this.gl.TEXTURE_2D_ARRAY, 0, 0, 0, layerIndex, 256, 256, 1, this.gl.RGBA, this.gl.UNSIGNED_BYTE, canvas);
    }

    resize(width: number, height: number) {
        if (!this.gl) return;
        const gl = this.gl;
        const canvas = gl.canvas as HTMLCanvasElement;
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        gl.viewport(0, 0, width, height);
        if (this.fboWidth !== width || this.fboHeight !== height) {
            this.fboWidth = width; this.fboHeight = height;
            gl.bindTexture(gl.TEXTURE_2D, this.texColorIncluded);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindTexture(gl.TEXTURE_2D, this.texData);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, null);
            gl.bindTexture(gl.TEXTURE_2D, this.texColorExcluded);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
            gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer);
            gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, width, height);
        }
    }

    updateMaterial(materialId: number, shaderData: any) {
        if (!this.gl) return;
        const gl = this.gl;
        const parts = shaderData.vs.split('// --- Graph Body (VS) ---');
        const vsSource = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', parts[0]||'').replace('// %VERTEX_BODY%', parts[1]||'');
        const program = this.createProgram(gl, vsSource, shaderData.fs);
        if (program) {
            const old = this.materialPrograms.get(materialId); if (old) gl.deleteProgram(old);
            this.materialPrograms.set(materialId, program);
        }
    }

    registerMesh(id: number, geometry: any) {
        if (!this.gl) return;
        const gl = this.gl;
        const vao = gl.createVertexArray()!; gl.bindVertexArray(vao);
        const createBuf = (data: any, type: number) => {
            const b = gl.createBuffer(); gl.bindBuffer(type, b);
            gl.bufferData(type, data instanceof Float32Array || data instanceof Uint16Array ? data : new (type===gl.ELEMENT_ARRAY_BUFFER?Uint16Array:Float32Array)(data), gl.STATIC_DRAW);
            return b;
        };
        createBuf(geometry.vertices, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        createBuf(geometry.normals, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        createBuf(geometry.uvs, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0);
        createBuf(geometry.indices, gl.ELEMENT_ARRAY_BUFFER);
        const stride = 22 * 4; const inst = gl.createBuffer()!; gl.bindBuffer(gl.ARRAY_BUFFER, inst);
        gl.bufferData(gl.ARRAY_BUFFER, INITIAL_CAPACITY * stride, gl.DYNAMIC_DRAW);
        for(let k=0; k<4; k++) { gl.enableVertexAttribArray(2+k); gl.vertexAttribPointer(2+k, 4, gl.FLOAT, false, stride, k*16); gl.vertexAttribDivisor(2+k, 1); }
        gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16*4); gl.vertexAttribDivisor(6, 1);
        gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19*4); gl.vertexAttribDivisor(7, 1);
        gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, 20*4); gl.vertexAttribDivisor(9, 1);
        gl.enableVertexAttribArray(10); gl.vertexAttribPointer(10, 1, gl.FLOAT, false, stride, 21*4); gl.vertexAttribDivisor(10, 1);
        gl.bindVertexArray(null);
        this.meshes.set(id, { vao, count: geometry.indices.length, instanceBuffer: inst, cpuBuffer: new Float32Array(INITIAL_CAPACITY * 22), instanceCount: 0 });
    }

    render(store: ComponentStorage, count: number, selectedIndices: Set<number>, vp: Float32Array, width: number, height: number, cam: any) {
        if (!this.gl || !this.defaultProgram) return;
        const gl = this.gl; const time = performance.now() / 1000;
        this.buckets.clear(); this.excludedBuckets.clear();
        for (let i = 0; i < count; i++) {
            if (store.isActive[i] && store.meshType[i] !== 0) { 
                const key = (store.materialIndex[i] << 16) | store.meshType[i];
                if (store.effectIndex[i] >= 99.5) { if(!this.excludedBuckets.has(key)) this.excludedBuckets.set(key, []); this.excludedBuckets.get(key)!.push(i); }
                else { if(!this.buckets.has(key)) this.buckets.set(key, []); this.buckets.get(key)!.push(i); }
            }
        }
        this.drawCalls = 0; this.triangleCount = 0;
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboIncluded);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.clearColor(0.1, 0.1, 0.1, 1.0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        this.renderBuckets(this.buckets, store, selectedIndices, vp, cam, time);
        if (this.showGrid && !this.gridExcludePP) { gl.drawBuffers([gl.COLOR_ATTACHMENT0]); this.renderGrid(gl, vp); }
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboExcluded);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        this.renderBuckets(this.excludedBuckets, store, selectedIndices, vp, cam, time);
        if (this.showGrid && this.gridExcludePP) this.renderGrid(gl, vp);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.disable(gl.DEPTH_TEST);
        gl.useProgram(this.ppProgram);
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texColorIncluded); gl.uniform1i(gl.getUniformLocation(this.ppProgram!, 'u_scene'), 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texData); gl.uniform1i(gl.getUniformLocation(this.ppProgram!, 'u_data'), 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texColorExcluded); gl.uniform1i(gl.getUniformLocation(this.ppProgram!, 'u_excluded'), 2);
        const setU = (n: string, v: number) => { const l = gl.getUniformLocation(this.ppProgram!, n); if(l) gl.uniform1f(l, v); };
        setU('u_enabled', this.ppConfig.enabled?1:0); setU('u_vignetteStrength', this.ppConfig.vignetteStrength);
        setU('u_aberrationStrength', this.ppConfig.aberrationStrength); setU('u_toneMapping', this.ppConfig.toneMapping?1:0);
        gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.enable(gl.DEPTH_TEST);
    }

    private renderGrid(gl: WebGL2RenderingContext, vp: Float32Array) {
        if (!this.gridProgram || !this.quadVAO) return;
        gl.useProgram(this.gridProgram); gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false);
        gl.uniformMatrix4fv(gl.getUniformLocation(this.gridProgram, 'u_viewProjection'), false, vp);
        gl.uniform1f(gl.getUniformLocation(this.gridProgram, 'u_opacity'), this.gridOpacity);
        gl.uniform1f(gl.getUniformLocation(this.gridProgram, 'u_gridSize'), this.gridSize);
        gl.uniform1f(gl.getUniformLocation(this.gridProgram, 'u_subdivisions'), this.gridSubdivisions);
        gl.uniform1f(gl.getUniformLocation(this.gridProgram, 'u_fadeDist'), this.gridFadeDistance);
        gl.uniform3fv(gl.getUniformLocation(this.gridProgram, 'u_gridColor'), this.gridColor);
        gl.bindVertexArray(this.quadVAO); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); gl.depthMask(true); gl.disable(gl.BLEND);
    }

    private renderBuckets(buckets: Map<number, number[]>, store: any, selected: Set<number>, vp: Float32Array, cam: any, time: number) {
        const gl = this.gl!;
        buckets.forEach((indices, key) => {
            const matId = key >> 16; const meshId = key & 0xFFFF; const mesh = this.meshes.get(meshId); if(!mesh) return;
            const program = (matId > 0 && this.materialPrograms.has(matId)) ? this.materialPrograms.get(matId)! : this.defaultProgram!;
            gl.useProgram(program);
            gl.uniformMatrix4fv(gl.getUniformLocation(program, 'u_viewProjection'), false, vp);
            gl.uniform1f(gl.getUniformLocation(program, 'u_time'), time);
            gl.uniform3f(gl.getUniformLocation(program, 'u_cameraPos'), cam.x, cam.y, cam.z);
            gl.uniform1i(gl.getUniformLocation(program, 'u_renderMode'), this.renderMode);
            if (this.textureArray) { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray); gl.uniform1i(gl.getUniformLocation(program, 'u_textures'), 0); }
            let instanceCount = 0; const stride = 22; const buf = mesh.cpuBuffer;
            for (const idx of indices) {
                const off = instanceCount * stride; const wm = idx * 16;
                for (let k = 0; k < 16; k++) buf[off+k] = store.worldMatrix[wm+k];
                buf[off+16] = store.colorR[idx]; buf[off+17] = store.colorG[idx]; buf[off+18] = store.colorB[idx];
                buf[off+19] = selected.has(idx) ? 1.0 : 0.0; buf[off+20] = store.textureIndex[idx]; buf[off+21] = store.effectIndex[idx];
                instanceCount++;
            }
            if (instanceCount > 0) {
                gl.bindVertexArray(mesh.vao); gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, buf.subarray(0, instanceCount * stride));
                gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, instanceCount);
                this.drawCalls++; this.triangleCount += (mesh.count/3) * instanceCount;
            }
        });
    }
}
