
// services/renderers/WebGLRenderer.ts

import { ComponentStorage } from '../ecs/ComponentStorage';
import { SceneGraph } from '../SceneGraph';
import { Mat4, Mat4Utils } from '../math';
import { INITIAL_CAPACITY, MESH_TYPES } from '../constants';

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
out vec3 v_objectPos; // Center of the object
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
    // These names must match what NodeRegistry uses. 
    vec3 v_pos_graph = a_position; 
    v_worldPos = (model * localPos).xyz;
    v_normal = mat3(model) * a_normal;
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
    v_normal = mat3(model) * a_normal; 
    v_worldPos = worldPos.xyz;
    v_objectPos = vec3(model[3][0], model[3][1], model[3][2]);
}`;

const FS_DEFAULT_SOURCE = `#version 300 es
precision mediump float;
precision mediump sampler2DArray;

in vec3 v_normal;
in vec3 v_worldPos;
in vec3 v_objectPos;
in vec3 v_color;
in float v_isSelected;
in vec2 v_uv;
in float v_texIndex;
in float v_effectIndex;

uniform sampler2DArray u_textures;

// MRT Output
layout(location=0) out vec4 outColor;
layout(location=1) out vec4 outData; // R=EffectID

void main() {
    vec3 normal = normalize(v_normal);
    vec3 lightDir = normalize(vec3(0.5, 0.8, 0.5));
    
    // Default fallback color
    vec4 texColor = vec4(1.0, 1.0, 1.0, 1.0);
    
    // v_texIndex: 0=White, 1=Grid, 2=Noise, 3=Brick
    texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    
    float diff = max(dot(normal, lightDir), 0.0);
    vec3 ambient = vec3(0.3);
    
    vec3 finalAlbedo = v_color * texColor.rgb;
    vec3 result = finalAlbedo * (ambient + diff); 
    
    if (v_isSelected > 0.5) {
        result = mix(result, vec3(1.0, 1.0, 0.0), 0.3);
    }
    
    outColor = vec4(result, 1.0);
    // Write Effect Index to Red channel of attachment 1. 
    // Requires Floating Point Texture to store values > 1.0
    outData = vec4(v_effectIndex, 0.0, 0.0, 1.0);
}`;

// --- POST PROCESS SHADERS ---

const PP_VS = `#version 300 es
layout(location=0) in vec2 a_pos;
out vec2 v_uv;
void main() {
    v_uv = a_pos * 0.5 + 0.5;
    gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const PP_FS = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_scene;
uniform sampler2D u_data; // MRT Texture (R=EffectID)
uniform vec2 u_resolution;
uniform float u_time;

// Config Uniforms
uniform float u_enabled;
uniform float u_vignetteStrength;
uniform float u_aberrationStrength;
uniform float u_toneMapping;

out vec4 outColor;

// ACES Tone Mapping
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

// Effect 2: Glitch / Offset
vec3 applyGlitch(vec3 color, vec2 uv) {
    float offset = sin(uv.y * 50.0 + u_time * 10.0) * 0.01;
    float r = texture(u_scene, uv + vec2(offset, 0.0)).r;
    float g = texture(u_scene, uv).g;
    float b = texture(u_scene, uv - vec2(offset, 0.0)).b;
    return vec3(r, g, b);
}

// Effect 3: Invert / Thermal
vec3 applyInvert(vec3 color) {
    vec3 inv = 1.0 - color;
    // Tint slightly blue/orange for thermal feel
    return mix(inv, vec3(0.0, 0.5, 1.0), 0.2);
}

// Effect 4: Grayscale
vec3 applyGrayscale(vec3 color) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    return vec3(gray);
}

// Effect 5: Halftone (Comic)
vec3 applyHalftone(vec3 color, vec2 uv) {
    float gray = dot(color, vec3(0.299, 0.587, 0.114));
    float scale = 120.0; // Dot density
    
    // Rotate 45 deg
    float s = sin(0.785); float c = cos(0.785);
    vec2 rotUV = mat2(c, -s, s, c) * (uv * u_resolution / u_resolution.y);
    
    vec2 nearest = 2.0 * fract(scale * rotUV) - 1.0;
    float dist = length(nearest);
    float radius = sqrt(1.0 - gray);
    float dotPattern = step(radius, dist);
    
    return mix(vec3(0.1), vec3(1.0), dotPattern) * color;
}

// Effect 6: Cross Hatch (Sketch)
vec3 applyCrossHatch(vec3 color, vec2 uv) {
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    vec3 outCol = vec3(1.0); // Paper white
    
    // Screen space coords for consistent hatch size
    vec2 coord = gl_FragCoord.xy;
    
    if (lum < 0.8) {
        if (mod(coord.x + coord.y, 10.0) == 0.0) outCol *= 0.6;
    }
    if (lum < 0.6) {
        if (mod(coord.x - coord.y, 10.0) == 0.0) outCol *= 0.6;
    }
    if (lum < 0.4) {
        if (mod(coord.x + coord.y - 5.0, 10.0) == 0.0) outCol *= 0.6;
    }
    if (lum < 0.2) {
        if (mod(coord.x - coord.y - 5.0, 10.0) == 0.0) outCol *= 0.6;
    }
    
    // Mix slightly with original color for flavor
    return mix(outCol, color, 0.3);
}

// Effect 7: Posterize (Cel)
vec3 applyPosterize(vec3 color) {
    float steps = 4.0;
    return floor(color * steps) / steps;
}

// Effect 8: Dither (Retro 1-bit)
vec3 applyDither(vec3 color) {
    float lum = dot(color, vec3(0.299, 0.587, 0.114));
    // Bayer Matrix 4x4
    int x = int(gl_FragCoord.x) % 4;
    int y = int(gl_FragCoord.y) % 4;
    float M[16] = float[](
        0., 8., 2., 10.,
        12., 4., 14., 6.,
        3., 11., 1., 9.,
        15., 7., 13., 5.
    );
    float threshold = M[y * 4 + x] / 16.0;
    
    return lum < threshold ? vec3(0.05, 0.15, 0.1) : vec3(0.6, 0.7, 0.5); // Gameboy greens
}

void main() {
    vec3 color = texture(u_scene, v_uv).rgb;
    
    // Read Object ID / Effect ID from the Data Buffer
    // ID is stored in Red channel.
    float effectId = texture(u_data, v_uv).r;
    
    // Per-Object Effects (Integers 1..8)
    // Tolerance for float comparison
    if (effectId > 0.5 && effectId < 1.5) {
        color = applyPixelate(color, v_uv);
    } else if (effectId > 1.5 && effectId < 2.5) {
        color = applyGlitch(color, v_uv);
    } else if (effectId > 2.5 && effectId < 3.5) {
        color = applyInvert(color);
    } else if (effectId > 3.5 && effectId < 4.5) {
        color = applyGrayscale(color);
    } else if (effectId > 4.5 && effectId < 5.5) {
        color = applyHalftone(color, v_uv);
    } else if (effectId > 5.5 && effectId < 6.5) {
        color = applyCrossHatch(color, v_uv);
    } else if (effectId > 6.5 && effectId < 7.5) {
        color = applyPosterize(color);
    } else if (effectId > 7.5 && effectId < 8.5) {
        color = applyDither(color);
    }

    if (u_enabled > 0.5) {
        // 1. Chromatic Aberration
        if (u_aberrationStrength > 0.0) {
            float offset = u_aberrationStrength;
            float r = texture(u_scene, v_uv + vec2(offset, 0.0)).r;
            float b = texture(u_scene, v_uv - vec2(offset, 0.0)).b;
            // Only apply aberration to base color, mix carefully
            color.r = max(color.r, r);
            color.b = max(color.b, b);
        }

        // 2. Vignette
        if (u_vignetteStrength > 0.0) {
            vec2 uv = v_uv * (1.0 - v_uv.yx);
            float vig = uv.x * uv.y * 15.0;
            vig = pow(vig, 0.15 * u_vignetteStrength);
            color *= vig;
        }

        // 3. Tone Mapping (ACES)
        if (u_toneMapping > 0.5) {
            color = aces(color);
        }

        // 4. Gamma Correction
        color = pow(color, vec3(1.0 / 2.2));
    } else {
        // Simple Gamma only for fair comparison, or raw linear if debugging
        color = pow(color, vec3(1.0 / 2.2));
    }

    outColor = vec4(color, 1.0);
}`;

interface MeshBatch {
    vao: WebGLVertexArrayObject;
    count: number;
    instanceBuffer: WebGLBuffer;
    cpuBuffer: Float32Array; // Persistent buffer for this mesh type
    instanceCount: number; // Number of instances this frame
}

export class WebGLRenderer {
    gl: WebGL2RenderingContext | null = null;
    
    // Program Management
    defaultProgram: WebGLProgram | null = null;
    materialPrograms: Map<number, WebGLProgram> = new Map();
    
    meshes: Map<number, MeshBatch> = new Map();
    textureArray: WebGLTexture | null = null;
    
    // Post Processing State
    fbo: WebGLFramebuffer | null = null;
    fboTexture: WebGLTexture | null = null;
    fboDataTexture: WebGLTexture | null = null; // MRT Texture
    depthRenderbuffer: WebGLRenderbuffer | null = null;
    ppProgram: WebGLProgram | null = null;
    quadVAO: WebGLVertexArrayObject | null = null;
    
    // Track FBO size to prevent unnecessary resizing
    private fboWidth: number = 0;
    private fboHeight: number = 0;
    
    drawCalls = 0;
    triangleCount = 0;
    showGrid = true;
    
    ppConfig: PostProcessConfig = {
        enabled: true,
        vignetteStrength: 1.0,
        aberrationStrength: 0.002,
        toneMapping: true
    };
    
    // Render Buckets: Map<MaterialID, Array<EntityIndex>>
    // Reused per frame to avoid allocation
    private buckets: Map<number, number[]> = new Map();

    init(canvas: HTMLCanvasElement) {
        this.gl = canvas.getContext('webgl2', { 
            alpha: false, 
            antialias: false, // Turn off MSAA for manual post-process pipeline (or handle MSAA FBOs)
            powerPreference: "high-performance" 
        });
        
        if (!this.gl) {
            console.error("WebGL2 not supported");
            return;
        }

        const gl = this.gl;
        
        // CRITICAL: Enable Floating Point Textures for MRT (Effect IDs > 1.0)
        const ext = gl.getExtension("EXT_color_buffer_float");
        if (!ext) {
            console.warn("EXT_color_buffer_float not supported! Per-object effects may be clamped.");
        }

        gl.enable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE); 
        gl.clearColor(0.1, 0.1, 0.1, 1.0);

        // Compile default shader with empty vertex logic
        const defaultVS = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', '').replace('// %VERTEX_BODY%', '');
        this.defaultProgram = this.createProgram(gl, defaultVS, FS_DEFAULT_SOURCE);
        this.initTextureArray(gl);
        this.initPostProcess(gl);
        
        // Register Default Primitives
        this.registerMesh(MESH_TYPES['Cube'], this.createCubeData());
        this.registerMesh(MESH_TYPES['Sphere'], this.createSphereData(24, 16));
        this.registerMesh(MESH_TYPES['Plane'], this.createPlaneData());
    }

    initPostProcess(gl: WebGL2RenderingContext) {
        // Initialize with 1x1 to ensure FBO is complete immediately. 
        // Real size comes in `resize()` later.
        this.fboWidth = 1;
        this.fboHeight = 1;

        // 1. Create Framebuffer Resources
        this.fbo = gl.createFramebuffer();
        this.fboTexture = gl.createTexture();
        this.fboDataTexture = gl.createTexture(); // MRT
        this.depthRenderbuffer = gl.createRenderbuffer();

        // Main Color Texture (Standard 8-bit RGBA)
        gl.bindTexture(gl.TEXTURE_2D, this.fboTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.fboWidth, this.fboHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        // Data Texture (RGBA32F - Float Texture to support ID > 1.0)
        // Using Nearest filter to strictly preserve integer IDs
        gl.bindTexture(gl.TEXTURE_2D, this.fboDataTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.fboWidth, this.fboHeight, 0, gl.RGBA, gl.FLOAT, null);
        
        // Depth Renderbuffer
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.fboWidth, this.fboHeight);
        
        // Attach to FBO
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.fboDataTexture, 0); 
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderbuffer);
        
        // Tell WebGL to draw to both attachments
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        
        // Verify Status
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            console.error("FBO Incomplete at init:", status);
        }
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        // 2. Create Fullscreen Quad
        this.quadVAO = gl.createVertexArray();
        const quadVBO = gl.createBuffer();
        gl.bindVertexArray(this.quadVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        const verts = new Float32Array([ -1, -1,  1, -1,  -1, 1,  1, 1 ]);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        // 3. Compile Post Process Shader
        this.ppProgram = this.createProgram(gl, PP_VS, PP_FS);
    }

    resize(w: number, h: number) { 
        if(!this.gl) return;
        const gl = this.gl;
        
        // Ensure valid positive dimensions
        w = Math.max(1, w);
        h = Math.max(1, h);

        // Update Canvas size
        if (gl.canvas.width !== w || gl.canvas.height !== h) {
            gl.canvas.width = w;
            gl.canvas.height = h;
        }
        
        // Resize FBO attachments if dimensions changed
        if (this.fboWidth !== w || this.fboHeight !== h) {
            this.fboWidth = w;
            this.fboHeight = h;

            if (this.fboTexture && this.fboDataTexture && this.depthRenderbuffer && this.fbo) {
                // Resize Color
                gl.bindTexture(gl.TEXTURE_2D, this.fboTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
                
                // Resize Data (Keep using Float32)
                gl.bindTexture(gl.TEXTURE_2D, this.fboDataTexture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, null);
                
                gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer);
                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
                
                // Re-validate just in case
                gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
                const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
                if (status !== gl.FRAMEBUFFER_COMPLETE) console.error("FBO Incomplete after resize", status);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
        }
    }

    updateMaterial(materialId: number, shaderData: { vs: string, fs: string } | string) {
        if (!this.gl) return;
        
        // If empty, delete
        if (!shaderData) {
            const p = this.materialPrograms.get(materialId);
            if (p) this.gl.deleteProgram(p);
            this.materialPrograms.delete(materialId);
            return;
        }

        let vsSource = '';
        let fsSource = '';

        if (typeof shaderData === 'string') {
            // Legacy/Fallback for just Fragment shader
            vsSource = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', '').replace('// %VERTEX_BODY%', '');
            fsSource = shaderData;
        } else {
            // Full Compilation
            const parts = shaderData.vs.split('// --- Graph Body (VS) ---');
            const functions = parts[0] || '';
            const body = parts[1] || '';
            
            vsSource = VS_TEMPLATE.replace('// %VERTEX_LOGIC%', functions).replace('// %VERTEX_BODY%', body);
            fsSource = shaderData.fs;
        }

        const program = this.createProgram(this.gl, vsSource, fsSource);
        if (program) {
            // Delete old if exists
            const old = this.materialPrograms.get(materialId);
            if (old) this.gl.deleteProgram(old);
            
            this.materialPrograms.set(materialId, program);
        }
    }

    ensureCapacity(count: number) {
        // Stride is now 22 floats per instance (added effectIndex)
        const stride = 22;
        const requiredSize = count * stride;

        this.meshes.forEach(mesh => {
            if (mesh.cpuBuffer.length < requiredSize) {
                // Grow buffer (1.5x)
                const newSize = Math.max(requiredSize, mesh.cpuBuffer.length * 1.5);
                const newBuffer = new Float32Array(newSize);
                mesh.cpuBuffer = newBuffer;
                
                // Resize GPU buffer
                const gl = this.gl;
                if (gl) {
                    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                    gl.bufferData(gl.ARRAY_BUFFER, newBuffer.byteLength, gl.DYNAMIC_DRAW);
                }
            }
        });
    }

    initTextureArray(gl: WebGL2RenderingContext) {
        const width = 64, height = 64, depth = 4;
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, depth);

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

    registerMesh(typeId: number, data: { vertices: Float32Array | number[], normals: Float32Array | number[], uvs: Float32Array | number[], indices: Uint16Array | number[] }) {
        if (!this.gl) return;
        const gl = this.gl;

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);

        const createBuffer = (type: number, src: any) => {
            const buf = gl.createBuffer();
            gl.bindBuffer(type, buf);
            const typedData = (type === gl.ELEMENT_ARRAY_BUFFER && !(src instanceof Uint16Array)) ? new Uint16Array(src) 
                            : (type === gl.ARRAY_BUFFER && !(src instanceof Float32Array)) ? new Float32Array(src) 
                            : src;
            gl.bufferData(type, typedData, gl.STATIC_DRAW);
            return buf;
        };

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

        // Instance Buffer Setup
        // Increased stride to 22 floats
        const initialCapacity = INITIAL_CAPACITY * 22; 
        const instBuf = gl.createBuffer();
        const cpuBuffer = new Float32Array(initialCapacity);
        
        gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
        gl.bufferData(gl.ARRAY_BUFFER, cpuBuffer.byteLength, gl.DYNAMIC_DRAW);
        
        const stride = 22 * 4; 
        for (let i = 0; i < 4; i++) {
            const loc = 2 + i;
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 4, gl.FLOAT, false, stride, i * 16);
            gl.vertexAttribDivisor(loc, 1);
        }
        
        // Color
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16 * 4);
        gl.vertexAttribDivisor(6, 1);
        
        // isSelected
        gl.enableVertexAttribArray(7);
        gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19 * 4);
        gl.vertexAttribDivisor(7, 1);
        
        // texIndex
        gl.enableVertexAttribArray(9);
        gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, 20 * 4);
        gl.vertexAttribDivisor(9, 1);

        // effectIndex (Loc 10)
        gl.enableVertexAttribArray(10);
        gl.vertexAttribPointer(10, 1, gl.FLOAT, false, stride, 21 * 4);
        gl.vertexAttribDivisor(10, 1);

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null); 

        this.meshes.set(typeId, { 
            vao: vao!, 
            count: data.indices.length, 
            instanceBuffer: instBuf!,
            cpuBuffer,
            instanceCount: 0
        });
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

    createProgram(gl: WebGL2RenderingContext, vsSource: string, fsSource: string) {
        const vs = gl.createShader(gl.VERTEX_SHADER);
        if (!vs) return null;
        gl.shaderSource(vs, vsSource);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error("VS Log:", gl.getShaderInfoLog(vs));
            return null;
        }

        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        if (!fs) return null;
        gl.shaderSource(fs, fsSource);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("FS Log:", gl.getShaderInfoLog(fs));
            return null;
        }

        const p = gl.createProgram();
        if (!p) return null;
        gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
            console.error("Link Log:", gl.getProgramInfoLog(p));
            return null;
        }
        return p;
    }

    render(store: ComponentStorage, count: number, selectedIndices: Set<number>, viewProjection: Mat4, width: number, height: number, cameraPos: {x:number,y:number,z:number}) {
        if (!this.gl || !this.defaultProgram || !this.fbo) return;
        const gl = this.gl;
        
        // 1. Pass: Render Scene to Framebuffer
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.viewport(0, 0, this.fboWidth, this.fboHeight); // Use FBO dims
        
        // Clear Color and Data buffers
        gl.clearBufferfv(gl.COLOR, 0, [0.1, 0.1, 0.1, 1.0]); 
        gl.clearBufferfv(gl.COLOR, 1, [0.0, 0.0, 0.0, 0.0]); 
        gl.clear(gl.DEPTH_BUFFER_BIT);
        
        // --- 1. Bucket Sort Entities by Material ---
        // Reuse map arrays to prevent GC
        for (const arr of this.buckets.values()) arr.length = 0;
        
        for (let i = 0; i < count; i++) {
            if (!store.isActive[i]) continue;
            // Check grid visibility
            if (!this.showGrid && store.textureIndex[i] === 1) continue;

            const matId = store.materialIndex[i];
            // Use 0 as default key for no material
            const key = matId || 0;
            
            if (!this.buckets.has(key)) this.buckets.set(key, []);
            this.buckets.get(key)!.push(i);
        }

        // Ensure capacity
        this.ensureCapacity(store.capacity);
        this.drawCalls = 0; 
        this.triangleCount = 0;

        // --- 2. Render Each Material Group ---
        this.buckets.forEach((indices, matId) => {
            if (indices.length === 0) return;

            // Pick Program
            let program = this.defaultProgram!;
            if (matId !== 0 && this.materialPrograms.has(matId)) {
                program = this.materialPrograms.get(matId)!;
            }
            
            gl.useProgram(program);
            
            // Set Common Uniforms
            const uVP = gl.getUniformLocation(program, 'u_viewProjection');
            if (uVP) gl.uniformMatrix4fv(uVP, false, viewProjection);
            
            const uTime = gl.getUniformLocation(program, 'u_time');
            if (uTime) gl.uniform1f(uTime, performance.now() / 1000);

            // Note: Use actual drawing resolution, which matches FBO size here
            const uRes = gl.getUniformLocation(program, 'u_resolution');
            if (uRes) gl.uniform2f(uRes, this.fboWidth, this.fboHeight);
            
            const uCam = gl.getUniformLocation(program, 'u_cameraPos');
            if (uCam) gl.uniform3f(uCam, cameraPos.x, cameraPos.y, cameraPos.z);

            const uTex = gl.getUniformLocation(program, 'u_textures');
            if (uTex) {
                if (this.textureArray) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
                    gl.uniform1i(uTex, 0);
                }
            }

            // Reset mesh batch counts
            this.meshes.forEach(mesh => mesh.instanceCount = 0);

            // Fill Mesh Buffers for this Material
            for (const index of indices) {
                const type = store.meshType[index];
                const mesh = this.meshes.get(type);
                
                if (mesh) {
                    // Stride is 22 floats
                    const ptr = mesh.instanceCount * 22;
                    const start = index * 16;
                    const buf = mesh.cpuBuffer;

                    buf.set(store.worldMatrix.subarray(start, start + 16), ptr);
                    
                    buf[ptr + 16] = store.colorR[index];
                    buf[ptr + 17] = store.colorG[index];
                    buf[ptr + 18] = store.colorB[index];
                    buf[ptr + 19] = selectedIndices.has(index) ? 1.0 : 0.0;
                    buf[ptr + 20] = store.textureIndex[index];
                    buf[ptr + 21] = store.effectIndex[index];
                    
                    mesh.instanceCount++;
                }
            }

            // Draw Batches for this Material
            this.meshes.forEach(mesh => {
                if (mesh.instanceCount > 0) {
                    gl.bindVertexArray(mesh.vao);
                    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.instanceBuffer);
                    
                    gl.bufferSubData(gl.ARRAY_BUFFER, 0, mesh.cpuBuffer.subarray(0, mesh.instanceCount * 22));
                    
                    gl.drawElementsInstanced(gl.TRIANGLES, mesh.count, gl.UNSIGNED_SHORT, 0, mesh.instanceCount);
                    
                    this.drawCalls++;
                    this.triangleCount += (mesh.count / 3) * mesh.instanceCount;
                }
            });
        });

        gl.bindVertexArray(null);
        
        // 2. Pass: Post Processing (Composite to Screen)
        if (this.ppProgram && this.quadVAO && this.fboTexture && this.fboDataTexture) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null); // Back to Screen
            gl.viewport(0, 0, width, height); // Canvas size
            gl.clearColor(0,0,0,1);
            gl.clear(gl.COLOR_BUFFER_BIT); 
            
            gl.useProgram(this.ppProgram);
            
            // Pass Toggle State
            const uEnabled = gl.getUniformLocation(this.ppProgram, 'u_enabled');
            if (uEnabled) gl.uniform1f(uEnabled, this.ppConfig.enabled ? 1.0 : 0.0);
            
            const uTime = gl.getUniformLocation(this.ppProgram, 'u_time');
            if (uTime) gl.uniform1f(uTime, performance.now() / 1000);
            
            const uVig = gl.getUniformLocation(this.ppProgram, 'u_vignetteStrength');
            if (uVig) gl.uniform1f(uVig, this.ppConfig.vignetteStrength);
            
            const uAberration = gl.getUniformLocation(this.ppProgram, 'u_aberrationStrength');
            if (uAberration) gl.uniform1f(uAberration, this.ppConfig.aberrationStrength);
            
            const uTone = gl.getUniformLocation(this.ppProgram, 'u_toneMapping');
            if (uTone) gl.uniform1f(uTone, this.ppConfig.toneMapping ? 1.0 : 0.0);
            
            // Bind the FBO texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.fboTexture);
            const uScene = gl.getUniformLocation(this.ppProgram, 'u_scene');
            if (uScene) gl.uniform1i(uScene, 0);
            
            // Bind Data Texture
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.fboDataTexture);
            const uData = gl.getUniformLocation(this.ppProgram, 'u_data');
            if (uData) gl.uniform1i(uData, 1);
            
            const uRes = gl.getUniformLocation(this.ppProgram, 'u_resolution');
            if (uRes) gl.uniform2f(uRes, width, height);

            gl.bindVertexArray(this.quadVAO);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindVertexArray(null);
        }
    }
}
