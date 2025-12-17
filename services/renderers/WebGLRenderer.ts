
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
    
    // Pre-calculate context variables for the graph
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
    
    // Update Varyings with final transformed data
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

// Config Uniforms
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

// Effect 1: Pixelate
vec3 applyPixelate(vec3 color, vec2 uv) {
    float pixels = 64.0;
    vec2 pUV = floor(uv * pixels) / pixels;
    return texture(u_scene, pUV).rgb;
}

// Effect 2: Glitch
vec3 applyGlitch(vec3 color, vec2 uv) {
    float offset = sin(uv.y * 50.0 + u_time * 10.0) * 0.01;
    float r = texture(u_scene, uv + vec2(offset, 0.0)).r;
    float g = texture(u_scene, uv).g;
    float b = texture(u_scene, uv - vec2(offset, 0.0)).b;
    return vec3(r, g, b);
}

// Effect 3: Invert
vec3 applyInvert(vec3 color) {
    return mix(1.0 - color, vec3(0.0, 0.5, 1.0), 0.2);
}

void main() {
    // 1. Get Base Scene (Included)
    vec3 color = texture(u_scene, v_uv).rgb;
    
    // 2. Apply Effects to Included Objects
    float rawId = floor(texture(u_data, v_uv).r * 255.0 + 0.5);
    float effectId = rawId; 
    
    if (effectId > 0.5 && effectId < 1.5) color = applyPixelate(color, v_uv);
    else if (effectId > 1.5 && effectId < 2.5) color = applyGlitch(color, v_uv);
    else if (effectId > 2.5 && effectId < 3.5) color = applyInvert(color);

    if (u_enabled > 0.5) {
        if (u_aberrationStrength > 0.0) {
            float offset = u_aberrationStrength;
            float r = texture(u_scene, v_uv + vec2(offset, 0.0)).r;
            float b = texture(u_scene, v_uv - vec2(offset, 0.0)).b;
            color.r = r;
            color.b = b;
        }
        if (u_vignetteStrength > 0.0) {
            vec2 uv = v_uv * (1.0 - v_uv.yx);
            float vig = uv.x * uv.y * 15.0;
            vig = pow(vig, 0.15 * u_vignetteStrength);
            color *= vig;
        }
        if (u_toneMapping > 0.5) {
            color = aces(color);
        }
        color = pow(color, vec3(1.0 / 2.2));
    } else {
        color = pow(color, vec3(1.0 / 2.2));
    }

    // 3. Composite Excluded Objects (Overlay)
    vec4 excluded = texture(u_excluded, v_uv);
    if (excluded.a > 0.0) {
        vec3 excColor = pow(excluded.rgb, vec3(1.0 / 2.2));
        color = mix(color, excColor, excluded.a);
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
    
    // Multi-Pass FBOs
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
    gridSize = 10.0;
    gridFadeDistance = 200.0;
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
        this.gl = canvas.getContext('webgl2', { 
            alpha: false, 
            antialias: false, 
            powerPreference: "high-performance" 
        });
        
        if (!this.gl) { console.error("WebGL2 not supported"); return; }
        const gl = this.gl;
        const ext = gl.getExtension("EXT_color_buffer_float");
        if (!ext) console.warn("EXT_color_buffer_float not supported");

        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE); 
        gl.clearColor(0.1, 0.1, 0.1, 1.0);

        const defaultVS = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', '').replace('// %VERTEX_BODY%', '');
        this.defaultProgram = this.createProgram(gl, defaultVS, FS_DEFAULT_SOURCE);
        this.initTextureArray(gl);
        this.initPostProcess(gl);
        this.initGridShader(gl);
        
        // Register meshes from AssetManager
        const meshes = assetManager.getAssetsByType('MESH') as StaticMeshAsset[];
        meshes.forEach(asset => {
            const id = assetManager.getMeshID(asset.id);
            if (id > 0) {
                this.registerMesh(id, asset.geometry);
            }
        });
    }

    initGridShader(gl: WebGL2RenderingContext) {
        const gridVS = `#version 300 es
        layout(location=0) in vec3 a_position;
        uniform mat4 u_viewProjection;
        out vec3 v_worldPos;
        void main() {
            vec3 pos = a_position * 500.0;
            v_worldPos = pos;
            gl_Position = u_viewProjection * vec4(pos, 1.0);
        }`;

        const gridFS = `#version 300 es
        precision mediump float;
        in vec3 v_worldPos;
        layout(location=0) out vec4 outColor;
        
        uniform float u_opacity;
        uniform float u_gridSize;
        uniform float u_fadeDist;
        uniform vec3 u_gridColor;

        void main() {
            vec2 coord = v_worldPos.xz;
            vec2 derivative = fwidth(coord);
            vec2 grid = abs(fract(coord - 0.5) - 0.5) / derivative;
            float line = min(grid.x, grid.y);
            float alpha = 1.0 - min(line, 1.0);
            vec2 grid10 = abs(fract(coord * (1.0/u_gridSize) - 0.5) - 0.5) / (derivative * (1.0/u_gridSize));
            float line10 = min(grid10.x, grid10.y);
            float alpha10 = 1.0 - min(line10, 1.0);
            float xAxis = 1.0 - min(abs(v_worldPos.z) / derivative.y, 1.0);
            float zAxis = 1.0 - min(abs(v_worldPos.x) / derivative.x, 1.0);
            float dist = length(v_worldPos.xz);
            float fade = max(0.0, 1.0 - dist / u_fadeDist);

            vec3 color = u_gridColor; 
            float finalAlpha = alpha * u_opacity; 
            if (alpha10 > 0.0) {
                finalAlpha = max(finalAlpha, alpha10 * (u_opacity * 1.5));
                color = mix(color, vec3(1.0), 0.2); 
            }
            if (xAxis > 0.0) { finalAlpha = max(finalAlpha, xAxis); color = vec3(1.0, 0.1, 0.1); }
            if (zAxis > 0.0) { finalAlpha = max(finalAlpha, zAxis); color = vec3(0.1, 0.1, 1.0); }

            if (finalAlpha * fade <= 0.05) discard;
            outColor = vec4(color, finalAlpha * fade);
        }`;
        
        this.gridProgram = this.createProgram(gl, gridVS, gridFS);
    }

    initPostProcess(gl: WebGL2RenderingContext) {
        this.fboWidth = 1; this.fboHeight = 1;
        
        // Shared Depth Buffer
        this.depthRenderbuffer = gl.createRenderbuffer();
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, this.fboWidth, this.fboHeight);

        // FBO 1: Included Objects (Color + Data + Depth)
        this.fboIncluded = gl.createFramebuffer();
        this.texColorIncluded = this.createTexture(gl, gl.RGBA, gl.UNSIGNED_BYTE);
        this.texData = this.createTexture(gl, gl.RGBA32F, gl.FLOAT);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboIncluded);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColorIncluded, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.texData, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderbuffer);
        
        // FBO 2: Excluded Objects (Color + Shared Depth)
        this.fboExcluded = gl.createFramebuffer();
        this.texColorExcluded = this.createTexture(gl, gl.RGBA, gl.UNSIGNED_BYTE);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboExcluded);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.texColorExcluded, 0);
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderbuffer); // Reuse Depth!

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // Quad
        this.quadVAO = gl.createVertexArray();
        const quadVBO = gl.createBuffer();
        gl.bindVertexArray(this.quadVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

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
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { console.error("VS:", gl.getShaderInfoLog(vs)); return null; }
        const fs = gl.createShader(gl.FRAGMENT_SHADER)!; gl.shaderSource(fs, fsSrc); gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { console.error("FS:", gl.getShaderInfoLog(fs)); return null; }
        const prog = gl.createProgram()!; gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
        return prog;
    }

    initTextureArray(gl: WebGL2RenderingContext) {
        this.textureArray = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 4);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255,255,255,255]));
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([200,200,200,255]));
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }

    resize(width: number, height: number) {
        if (!this.gl) return;
        const canvas = this.gl.canvas as HTMLCanvasElement;
        if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
        this.gl.viewport(0, 0, width, height);
        
        if (this.fboWidth !== width || this.fboHeight !== height) {
            this.fboWidth = width; this.fboHeight = height;
            // Resize all attachments
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texColorIncluded);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texData);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, width, height, 0, this.gl.RGBA, this.gl.FLOAT, null);
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.texColorExcluded);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
            
            this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthRenderbuffer);
            this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT24, width, height);
        }
    }

    updateMaterial(materialId: number, shaderData: { vs: string, fs: string } | string) {
        if (!this.gl) return;
        if (!shaderData) {
            const p = this.materialPrograms.get(materialId);
            if (p) this.gl.deleteProgram(p);
            this.materialPrograms.delete(materialId);
            return;
        }
        let vsSource = '', fsSource = '';
        if (typeof shaderData === 'string') {
            vsSource = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', '').replace('// %VERTEX_BODY%', '');
            fsSource = shaderData;
        } else {
            const parts = shaderData.vs.split('// --- Graph Body (VS) ---');
            vsSource = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', parts[0]||'').replace('// %VERTEX_BODY%', parts[1]||'');
            fsSource = shaderData.fs;
        }
        const program = this.createProgram(this.gl, vsSource, fsSource);
        if (program) {
            const old = this.materialPrograms.get(materialId);
            if (old) this.gl.deleteProgram(old);
            this.materialPrograms.set(materialId, program);
        }
    }

    ensureCapacity(count: number) {
        const stride = 22;
        const requiredSize = count * stride;
        this.meshes.forEach(mesh => {
            if (mesh.cpuBuffer.length < requiredSize) {
                const newSize = Math.max(requiredSize, mesh.cpuBuffer.length * 1.5);
                const newBuffer = new Float32Array(newSize);
                mesh.cpuBuffer = newBuffer;
                const gl = this.gl;
                if (gl) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, newBuffer.byteLength, gl.DYNAMIC_DRAW);
                }
            }
        });
    }

    registerMesh(id: number, geometry: { vertices: Float32Array|number[], normals: Float32Array|number[], uvs: Float32Array|number[], indices: Uint16Array|number[] }) {
        if (!this.gl) return;
        const gl = this.gl;
        const vao = gl.createVertexArray(); if(!vao) return;
        gl.bindVertexArray(vao);
        const createBuffer = (data: any, type: number) => {
            const buf = gl.createBuffer(); gl.bindBuffer(type, buf);
            gl.bufferData(type, data instanceof Float32Array || data instanceof Uint16Array ? data : new (type===gl.ELEMENT_ARRAY_BUFFER?Uint16Array:Float32Array)(data), gl.STATIC_DRAW);
            return buf;
        };
        createBuffer(geometry.vertices, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
        createBuffer(geometry.normals, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        createBuffer(geometry.uvs, gl.ARRAY_BUFFER); gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0);
        createBuffer(geometry.indices, gl.ELEMENT_ARRAY_BUFFER);
        
        const stride = 22 * 4; 
        const instanceBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        gl.bufferData(gl.ARRAY_BUFFER, INITIAL_CAPACITY * stride, gl.DYNAMIC_DRAW);
        for(let k=0; k<4; k++) { gl.enableVertexAttribArray(2+k); gl.vertexAttribPointer(2+k, 4, gl.FLOAT, false, stride, k*16); gl.vertexAttribDivisor(2+k, 1); }
        gl.enableVertexAttribArray(6); gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16*4); gl.vertexAttribDivisor(6, 1);
        gl.enableVertexAttribArray(7); gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19*4); gl.vertexAttribDivisor(7, 1);
        gl.enableVertexAttribArray(9); gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, 20*4); gl.vertexAttribDivisor(9, 1);
        gl.enableVertexAttribArray(10); gl.vertexAttribPointer(10, 1, gl.FLOAT, false, stride, 21*4); gl.vertexAttribDivisor(10, 1);
        gl.bindVertexArray(null);
        this.meshes.set(id, { vao, count: geometry.indices.length, instanceBuffer, cpuBuffer: new Float32Array(INITIAL_CAPACITY * 22), instanceCount: 0 });
    }

    render(store: ComponentStorage, count: number, selectedIndices: Set<number>, viewProjection: Float32Array, width: number, height: number, cameraPos: { x: number, y: number, z: number }) {
        if (!this.gl || !this.defaultProgram) return;
        const gl = this.gl;
        const time = performance.now() / 1000;
        const ppEnabled = this.ppConfig.enabled;

        this.buckets.clear();
        this.excludedBuckets.clear();
        
        const { isActive, meshType, materialIndex, effectIndex } = store;
        for (let i = 0; i < count; i++) {
            if (isActive[i] && meshType[i] !== 0) { 
                const key = (materialIndex[i] << 16) | meshType[i];
                if (effectIndex[i] >= 99.5) { 
                    if (!this.excludedBuckets.has(key)) this.excludedBuckets.set(key, []);
                    this.excludedBuckets.get(key)!.push(i);
                } else {
                    if (!this.buckets.has(key)) this.buckets.set(key, []);
                    this.buckets.get(key)!.push(i);
                }
            }
        }

        this.drawCalls = 0; this.triangleCount = 0;
        this.meshes.forEach(mesh => mesh.instanceCount = 0);
        this.ensureCapacity(count);

        if (ppEnabled && this.fboIncluded && this.fboExcluded) {
            // --- PASS 1: Included -> FBO1 (Color + Data + Depth) ---
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboIncluded);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
            gl.viewport(0, 0, width, height);
            gl.clearColor(0.1, 0.1, 0.1, 1.0); // Background Color
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            
            this.renderBuckets(this.buckets, store, selectedIndices, viewProjection, cameraPos, time);
            
            if (this.showGrid && !this.gridExcludePP && this.gridProgram) {
                // Grid only writes color, not data
                gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
                this.renderGrid(gl, viewProjection);
            }

            // --- PASS 2: Excluded -> FBO2 (Color Only, Share Depth) ---
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fboExcluded);
            gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
            gl.viewport(0, 0, width, height);
            // Clear Color to Transparent, DO NOT CLEAR DEPTH (Shared with Pass 1)
            gl.clearColor(0.0, 0.0, 0.0, 0.0); 
            gl.clear(gl.COLOR_BUFFER_BIT); 
            
            this.renderBuckets(this.excludedBuckets, store, selectedIndices, viewProjection, cameraPos, time);

            if (this.showGrid && this.gridExcludePP && this.gridProgram) {
                this.renderGrid(gl, viewProjection);
            }

            // --- PASS 3: Composite ---
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, width, height);
            gl.disable(gl.DEPTH_TEST);
            gl.clear(gl.COLOR_BUFFER_BIT); 
            
            gl.useProgram(this.ppProgram);
            
            gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texColorIncluded); 
            const uSc = gl.getUniformLocation(this.ppProgram!, 'u_scene'); if(uSc) gl.uniform1i(uSc, 0);
            
            gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.texData); 
            const uDat = gl.getUniformLocation(this.ppProgram!, 'u_data'); if(uDat) gl.uniform1i(uDat, 1);
            
            gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.texColorExcluded); 
            const uExc = gl.getUniformLocation(this.ppProgram!, 'u_excluded'); if(uExc) gl.uniform1i(uExc, 2);
            
            const uRes = gl.getUniformLocation(this.ppProgram!, 'u_resolution'); if (uRes) gl.uniform2f(uRes, width, height);
            const uTimePP = gl.getUniformLocation(this.ppProgram!, 'u_time'); if (uTimePP) gl.uniform1f(uTimePP, time);
            
            const setUniform = (name: string, val: number) => { const loc = gl.getUniformLocation(this.ppProgram!, name); if (loc) gl.uniform1f(loc, val); }
            setUniform('u_enabled', 1.0);
            setUniform('u_vignetteStrength', this.ppConfig.vignetteStrength);
            setUniform('u_aberrationStrength', this.ppConfig.aberrationStrength);
            setUniform('u_toneMapping', this.ppConfig.toneMapping ? 1.0 : 0.0);

            gl.bindVertexArray(this.quadVAO);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindVertexArray(null);
            gl.enable(gl.DEPTH_TEST); // Restore

        } else {
            // --- SIMPLE PATH ---
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, width, height);
            gl.clearColor(0.1, 0.1, 0.1, 1.0);
            gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
            
            this.renderBuckets(this.buckets, store, selectedIndices, viewProjection, cameraPos, time);
            this.renderBuckets(this.excludedBuckets, store, selectedIndices, viewProjection, cameraPos, time);
            
            if (this.showGrid && this.gridProgram) {
                this.renderGrid(gl, viewProjection);
            }
        }
    }

    private renderBuckets(buckets: Map<number, number[]>, store: ComponentStorage, selectedIndices: Set<number>, vp: Float32Array, cam: {x:number, y:number, z:number}, time: number) {
        if (buckets.size === 0) return;
        const gl = this.gl!;
        
        buckets.forEach((indices, key) => {
            const matId = key >> 16;
            const mType = key & 0xFFFF;
            
            const mesh = this.meshes.get(mType);
            if (!mesh) return;

            let program = this.defaultProgram!;
            if (matId > 0 && this.materialPrograms.has(matId)) {
                program = this.materialPrograms.get(matId)!;
            }
            
            gl.useProgram(program);
            
            const uVP = gl.getUniformLocation(program, 'u_viewProjection'); if (uVP) gl.uniformMatrix4fv(uVP, false, vp);
            const uTime = gl.getUniformLocation(program, 'u_time'); if (uTime) gl.uniform1f(uTime, time);
            const uCam = gl.getUniformLocation(program, 'u_cameraPos'); if (uCam) gl.uniform3f(uCam, cam.x, cam.y, cam.z);
            const uMode = gl.getUniformLocation(program, 'u_renderMode'); if (uMode) gl.uniform1i(uMode, this.renderMode);

            if (this.textureArray) {
                gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
                const uTex = gl.getUniformLocation(program, 'u_textures'); if (uTex) gl.uniform1i(uTex, 0);
            }
            
            let lightDir = [0.5, 1.0, 0.5]; let lightColor = [1, 1, 1]; let lightIntensity = 1.0;
            
            for(let i=0; i<store.isActive.length; i++) {
                if(store.isActive[i] && (store.componentMask[i] & COMPONENT_MASKS.LIGHT)) {
                    lightColor = [store.colorR[i], store.colorG[i], store.colorB[i]];
                    lightIntensity = store.lightIntensity[i];
                    const idx = i * 16;
                    lightDir = [ store.worldMatrix[idx + 8], store.worldMatrix[idx + 9], store.worldMatrix[idx + 10] ];
                    const len = Math.sqrt(lightDir[0]**2 + lightDir[1]**2 + lightDir[2]**2);
                    if(len > 0.0001) lightDir = [lightDir[0]/len, lightDir[1]/len, lightDir[2]/len]; else lightDir = [0, 0, 1];
                    break; 
                }
            }
            
            const uLDir = gl.getUniformLocation(program, 'u_lightDir'); if (uLDir) gl.uniform3fv(uLDir, lightDir);
            const uLCol = gl.getUniformLocation(program, 'u_lightColor'); if (uLCol) gl.uniform3fv(uLCol, lightColor);
            const uLInt = gl.getUniformLocation(program, 'u_lightIntensity'); if (uLInt) gl.uniform1f(uLInt, lightIntensity);

            let instanceCount = 0;
            const stride = 22;
            const buffer = mesh.cpuBuffer;
            
            for (let i = 0; i < indices.length; i++) {
                const idx = indices[i];
                const offset = instanceCount * stride;
                const wmIndex = idx * 16;
                for (let k = 0; k < 16; k++) buffer[offset + k] = store.worldMatrix[wmIndex + k];
                buffer[offset + 16] = store.colorR[idx];
                buffer[offset + 17] = store.colorG[idx];
                buffer[offset + 18] = store.colorB[idx];
                buffer[offset + 19] = selectedIndices.has(idx) ? 1.0 : 0.0;
                buffer[offset + 20] = store.textureIndex[idx];
                buffer[offset + 21] = store.effectIndex[idx];
                instanceCount++;
            }

            if (instanceCount > 0) {
                gl.bindVertexArray(mesh.vao);
                gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, buffer.subarray(0, instanceCount * stride));
                gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, instanceCount);
                gl.bindVertexArray(null);
                
                this.drawCalls++;
                this.triangleCount += (mesh.count / 3) * instanceCount;
            }
        });
    }
    
    private renderGrid(gl: WebGL2RenderingContext, viewProjection: Float32Array) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false); 
        
        gl.useProgram(this.gridProgram);
        const uVP = gl.getUniformLocation(this.gridProgram!, 'u_viewProjection'); if (uVP) gl.uniformMatrix4fv(uVP, false, viewProjection);
        const uOp = gl.getUniformLocation(this.gridProgram!, 'u_opacity'); if (uOp) gl.uniform1f(uOp, this.gridOpacity);
        const uSz = gl.getUniformLocation(this.gridProgram!, 'u_gridSize'); if (uSz) gl.uniform1f(uSz, this.gridSize);
        const uFD = gl.getUniformLocation(this.gridProgram!, 'u_fadeDist'); if (uFD) gl.uniform1f(uFD, this.gridFadeDistance);
        const uCol = gl.getUniformLocation(this.gridProgram!, 'u_gridColor'); if (uCol) gl.uniform3fv(uCol, this.gridColor);

        // Find the plane mesh ID (assumed 3 based on MESH_TYPES, or we query AssetManager for default plane)
        // Since we synced IDs in AssetManager, we know MESH_TYPES['Plane'] is 3.
        const planeMesh = this.meshes.get(MESH_TYPES['Plane']);
        if (planeMesh) {
            gl.bindVertexArray(planeMesh.vao);
            gl.drawElements(gl.TRIANGLES, planeMesh.count, gl.UNSIGNED_SHORT, 0);
            gl.bindVertexArray(null);
        }
        
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }
}
