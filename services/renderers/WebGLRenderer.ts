
// services/renderers/WebGLRenderer.ts

import { ComponentStorage } from '../ecs/ComponentStorage';
import { SceneGraph } from '../SceneGraph';
import { Mat4, Mat4Utils } from '../math';
import { INITIAL_CAPACITY, MESH_TYPES, COMPONENT_MASKS } from '../constants';
import { ComponentType } from '../../types';

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
    // v_objectPos remains the same (pivot)
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

// --- STYLIZED LIGHTING FUNCTION ---
vec3 getStylizedLighting(vec3 normal, vec3 viewDir, vec3 albedo) {
    // 1. Directional Light (N dot L)
    // We reverse lightDir because typically lightDir points FROM source TO world, 
    // but dot product needs vectors pointing OUT from surface.
    // However, u_lightDir here is extracted from the Forward vector of the object,
    // which usually points IN the direction of the light rays.
    // Standard Diffuse: dot(N, -LightDir) if LightDir is ray direction.
    float NdotL = dot(normal, -u_lightDir);
    
    // 2. Toon Ramp (Hard edge)
    // Smoothstep creates a soft band instead of a hard pixel line
    // 0.0 to 0.05 creates a sharp transition at the terminator
    float lightBand = smoothstep(0.0, 0.05, NdotL);
    
    // 3. Shadow Color (Ambient)
    // Cool blue-ish shadow for artistic contrast
    vec3 shadowColor = vec3(0.05, 0.05, 0.15); 
    
    // 4. Rim Light (Fresnel)
    // Highlights edges to make object pop from background
    float NdotV = 1.0 - max(dot(normal, viewDir), 0.0);
    // Rim only appears on lit side or slightly wrapping? 
    // Let's make it appear everywhere but masked slightly by light for style
    float rim = pow(NdotV, 4.0);
    float rimIntensity = 0.5;
    
    // Compose
    vec3 litColor = albedo * u_lightColor * u_lightIntensity;
    vec3 finalLight = mix(shadowColor * albedo, litColor, lightBand);
    
    // Add Rim (White/Light Color)
    finalLight += vec3(rim) * rimIntensity * u_lightColor;

    return finalLight;
}

void main() {
    vec3 normal = normalize(v_normal);
    vec3 viewDir = normalize(u_cameraPos - v_worldPos);
    
    // Default texture sampling
    vec4 texColor = texture(u_textures, vec3(v_uv, v_texIndex));
    vec3 albedo = v_color * texColor.rgb;
    
    vec3 result = vec3(0.0);

    if (u_renderMode == 0) { // LIT
        result = getStylizedLighting(normal, viewDir, albedo);
    } else if (u_renderMode == 1) { // NORMALS
        result = normal * 0.5 + 0.5;
    } else if (u_renderMode == 2) { // UNLIT
        result = albedo;
    } else if (u_renderMode == 3) { // WIREFRAME (Simulated via barycentric in geo shader usually, here just color)
        result = vec3(0.0, 1.0, 0.0); 
    } else {
        result = albedo;
    }
    
    if (v_isSelected > 0.5) {
        // Selection Highlight
        result = mix(result, vec3(1.0, 0.8, 0.2), 0.3);
    }
    
    outColor = vec4(result, 1.0);
    outData = vec4(v_effectIndex, 0.0, 0.0, 1.0);
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
    gridProgram: WebGLProgram | null = null;
    
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
    
    // Grid Props
    gridOpacity = 0.3;
    gridSize = 10.0;
    gridFadeDistance = 200.0;
    gridColor = [0.5, 0.5, 0.5];
    gridExcludePP = false; // New Option
    
    // 0 = Lit (Default), 1 = Normals (Debug)
    renderMode: number = 0;
    
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
        this.initGridShader(gl);
        
        // Register Default Primitives
        this.registerMesh(MESH_TYPES['Cube'], this.createCubeData());
        this.registerMesh(MESH_TYPES['Sphere'], this.createSphereData(24, 16));
        this.registerMesh(MESH_TYPES['Plane'], this.createPlaneData());
    }

    initGridShader(gl: WebGL2RenderingContext) {
        const gridVS = `#version 300 es
        layout(location=0) in vec3 a_position;
        uniform mat4 u_viewProjection;
        out vec3 v_worldPos;
        void main() {
            // Scale plane HUGE to act as infinite grid (500x500)
            vec3 pos = a_position * 500.0;
            v_worldPos = pos;
            gl_Position = u_viewProjection * vec4(pos, 1.0);
        }`;

        const gridFS = `#version 300 es
        precision mediump float;
        in vec3 v_worldPos;
        
        // OUTPUTS MUST MATCH THE MRT CONFIGURATION (2 Buffers)
        layout(location=0) out vec4 outColor;
        layout(location=1) out vec4 outData; 
        
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
            
            // Major grid lines
            vec2 grid10 = abs(fract(coord * (1.0/u_gridSize) - 0.5) - 0.5) / (derivative * (1.0/u_gridSize));
            float line10 = min(grid10.x, grid10.y);
            float alpha10 = 1.0 - min(line10, 1.0);
            
            // Highlight axes
            float xAxis = 1.0 - min(abs(v_worldPos.z) / derivative.y, 1.0);
            float zAxis = 1.0 - min(abs(v_worldPos.x) / derivative.x, 1.0);

            // Fade out distance
            float dist = length(v_worldPos.xz);
            float fade = max(0.0, 1.0 - dist / u_fadeDist);

            vec3 color = u_gridColor; 
            float finalAlpha = alpha * u_opacity; // Base dim grid

            if (alpha10 > 0.0) {
                finalAlpha = max(finalAlpha, alpha10 * (u_opacity * 1.5));
                color = mix(color, vec3(1.0), 0.2); // Brighter major lines
            }

            if (xAxis > 0.0) {
                finalAlpha = max(finalAlpha, xAxis);
                color = vec3(1.0, 0.1, 0.1); // Red X
            }
            if (zAxis > 0.0) {
                finalAlpha = max(finalAlpha, zAxis);
                color = vec3(0.1, 0.1, 1.0); // Blue Z
            }

            if (finalAlpha * fade <= 0.05) discard;
            outColor = vec4(color, finalAlpha * fade);
            outData = vec4(0.0); // No effect ID for grid
        }`;
        
        this.gridProgram = this.createProgram(gl, gridVS, gridFS);
    }

    initPostProcess(gl: WebGL2RenderingContext) {
        // Initialize with 1x1 to ensure FBO is complete immediately. 
        this.fboWidth = 1;
        this.fboHeight = 1;

        this.fbo = gl.createFramebuffer();
        this.fboTexture = gl.createTexture();
        this.fboDataTexture = gl.createTexture(); 
        this.depthRenderbuffer = gl.createRenderbuffer();

        gl.bindTexture(gl.TEXTURE_2D, this.fboTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.fboWidth, this.fboHeight, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

        gl.bindTexture(gl.TEXTURE_2D, this.fboDataTexture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.fboWidth, this.fboHeight, 0, gl.RGBA, gl.FLOAT, null);
        
        gl.bindRenderbuffer(gl.RENDERBUFFER, this.depthRenderbuffer);
        gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, this.fboWidth, this.fboHeight);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboTexture, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.fboDataTexture, 0); 
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, this.depthRenderbuffer);
        gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);

        this.quadVAO = gl.createVertexArray();
        const quadVBO = gl.createBuffer();
        gl.bindVertexArray(this.quadVAO);
        gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
        const verts = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
        gl.bufferData(gl.ARRAY_BUFFER, verts, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        gl.bindVertexArray(null);

        this.ppProgram = this.createProgram(gl, PP_VS, PP_FS);
    }

    createProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram | null {
        const vs = gl.createShader(gl.VERTEX_SHADER);
        const fs = gl.createShader(gl.FRAGMENT_SHADER);
        const prog = gl.createProgram();
        
        if (!vs || !fs || !prog) return null;

        gl.shaderSource(vs, vsSrc);
        gl.compileShader(vs);
        if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
            console.error("VS Error:", gl.getShaderInfoLog(vs));
            return null;
        }

        gl.shaderSource(fs, fsSrc);
        gl.compileShader(fs);
        if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
            console.error("FS Error:", gl.getShaderInfoLog(fs));
            return null;
        }

        gl.attachShader(prog, vs);
        gl.attachShader(prog, fs);
        gl.linkProgram(prog);
        
        if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
            console.error("Link Error:", gl.getProgramInfoLog(prog));
            return null;
        }
        
        return prog;
    }

    initTextureArray(gl: WebGL2RenderingContext) {
        this.textureArray = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
        gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, 1, 1, 4); // 4 layers
        
        // White
        const white = new Uint8Array([255, 255, 255, 255]);
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, white);
        
        // Grid pattern (Layer 1)
        const grid = new Uint8Array([200, 200, 200, 255]); 
        gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 1, 1, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, grid);
        
        // Noise (Layer 2)
        // ... (placeholder)
        
        // Brick (Layer 3)
        // ... (placeholder)
        
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    }

    resize(width: number, height: number) {
        if (!this.gl) return;
        
        // Ensure the canvas buffer matches the display size
        const canvas = this.gl.canvas as HTMLCanvasElement;
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }

        this.gl.viewport(0, 0, width, height);
        
        if (this.fboWidth !== width || this.fboHeight !== height) {
            this.fboWidth = width;
            this.fboHeight = height;
            
            // Resize Textures
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.fboTexture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
            
            this.gl.bindTexture(this.gl.TEXTURE_2D, this.fboDataTexture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA32F, width, height, 0, this.gl.RGBA, this.gl.FLOAT, null);
            
            this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, this.depthRenderbuffer);
            this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, width, height);
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
        
        const vao = gl.createVertexArray();
        if(!vao) return;
        gl.bindVertexArray(vao);

        const createBuffer = (data: Float32Array | Uint16Array, type: number) => {
            const buf = gl.createBuffer();
            gl.bindBuffer(type, buf);
            gl.bufferData(type, data, gl.STATIC_DRAW);
            return buf;
        };

        const v = geometry.vertices instanceof Float32Array ? geometry.vertices : new Float32Array(geometry.vertices);
        const n = geometry.normals instanceof Float32Array ? geometry.normals : new Float32Array(geometry.normals);
        const u = geometry.uvs instanceof Float32Array ? geometry.uvs : new Float32Array(geometry.uvs);
        const i = geometry.indices instanceof Uint16Array ? geometry.indices : new Uint16Array(geometry.indices);

        const vBuf = createBuffer(v, gl.ARRAY_BUFFER);
        gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const nBuf = createBuffer(n, gl.ARRAY_BUFFER);
        gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);
        
        const uBuf = createBuffer(u, gl.ARRAY_BUFFER);
        gl.enableVertexAttribArray(8); gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0); // Loc 8 for UV

        const iBuf = createBuffer(i, gl.ELEMENT_ARRAY_BUFFER);

        // Instance Buffer (Matrix + Color + Selection + TexIndex + EffectIndex)
        // Matrix (4x4 = 16 floats), Color (3 floats), Sel (1), Tex (1), Eff (1) = 22 floats per instance
        const stride = 22 * 4; 
        const instanceBuffer = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, instanceBuffer);
        // Allocation for max instances happens in render loop if needed, or initial fixed size
        gl.bufferData(gl.ARRAY_BUFFER, INITIAL_CAPACITY * stride, gl.DYNAMIC_DRAW);

        // Matrix (Loc 2,3,4,5)
        for(let k=0; k<4; k++) {
            gl.enableVertexAttribArray(2+k);
            gl.vertexAttribPointer(2+k, 4, gl.FLOAT, false, stride, k*16);
            gl.vertexAttribDivisor(2+k, 1);
        }
        
        // Color (Loc 6)
        gl.enableVertexAttribArray(6);
        gl.vertexAttribPointer(6, 3, gl.FLOAT, false, stride, 16*4);
        gl.vertexAttribDivisor(6, 1);

        // Selection (Loc 7)
        gl.enableVertexAttribArray(7);
        gl.vertexAttribPointer(7, 1, gl.FLOAT, false, stride, 19*4);
        gl.vertexAttribDivisor(7, 1);
        
        // Texture Index (Loc 9)
        gl.enableVertexAttribArray(9);
        gl.vertexAttribPointer(9, 1, gl.FLOAT, false, stride, 20*4);
        gl.vertexAttribDivisor(9, 1);

        // Effect Index (Loc 10)
        gl.enableVertexAttribArray(10);
        gl.vertexAttribPointer(10, 1, gl.FLOAT, false, stride, 21*4);
        gl.vertexAttribDivisor(10, 1);

        gl.bindVertexArray(null);

        this.meshes.set(id, {
            vao,
            count: i.length,
            instanceBuffer,
            cpuBuffer: new Float32Array(INITIAL_CAPACITY * 22),
            instanceCount: 0
        });
    }

    render(
        store: ComponentStorage,
        count: number,
        selectedIndices: Set<number>,
        viewProjection: Float32Array,
        width: number,
        height: number,
        cameraPos: { x: number, y: number, z: number }
    ) {
        if (!this.gl || !this.defaultProgram) return;
        const gl = this.gl;

        const ppEnabled = this.ppConfig.enabled;

        // 1. Prepare Framebuffer & Clear
        if (ppEnabled && this.fbo) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        } else {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        }

        gl.viewport(0, 0, width, height);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // --- RENDER SCENE ---
        this.meshes.forEach(mesh => mesh.instanceCount = 0);
        this.ensureCapacity(count);

        this.buckets.clear();
        
        const { isActive, meshType, materialIndex } = store;
        
        for (let i = 0; i < count; i++) {
            if (isActive[i] && meshType[i] !== 0) { 
                const matId = materialIndex[i];
                const mType = meshType[i];
                const key = (matId << 16) | mType;
                
                if (!this.buckets.has(key)) this.buckets.set(key, []);
                this.buckets.get(key)!.push(i);
            }
        }

        this.drawCalls = 0;
        this.triangleCount = 0;

        const time = performance.now() / 1000;

        this.buckets.forEach((indices, key) => {
            const matId = key >> 16;
            const mType = key & 0xFFFF;
            
            const mesh = this.meshes.get(mType);
            if (!mesh) return;

            let program = this.defaultProgram!;
            if (matId > 0 && this.materialPrograms.has(matId)) {
                program = this.materialPrograms.get(matId)!;
            }
            
            gl.useProgram(program);
            
            const uVP = gl.getUniformLocation(program, 'u_viewProjection');
            if (uVP) gl.uniformMatrix4fv(uVP, false, viewProjection);
            
            const uTime = gl.getUniformLocation(program, 'u_time');
            if (uTime) gl.uniform1f(uTime, time);
            
            const uCam = gl.getUniformLocation(program, 'u_cameraPos');
            if (uCam) gl.uniform3f(uCam, cameraPos.x, cameraPos.y, cameraPos.z);
            
            const uMode = gl.getUniformLocation(program, 'u_renderMode');
            if (uMode) gl.uniform1i(uMode, this.renderMode);

            if (this.textureArray) {
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D_ARRAY, this.textureArray);
                const uTex = gl.getUniformLocation(program, 'u_textures');
                if (uTex) gl.uniform1i(uTex, 0);
            }
            
            let lightDir = [0.5, 1.0, 0.5];
            let lightColor = [1, 1, 1];
            let lightIntensity = 1.0;
            
            for(let i=0; i<count; i++) {
                if(store.isActive[i] && (store.componentMask[i] & COMPONENT_MASKS.LIGHT)) {
                    lightColor = [store.colorR[i], store.colorG[i], store.colorB[i]];
                    lightIntensity = store.lightIntensity[i];
                    break; 
                }
            }
            
            const len = Math.sqrt(lightDir[0]**2 + lightDir[1]**2 + lightDir[2]**2);
            lightDir = [lightDir[0]/len, lightDir[1]/len, lightDir[2]/len];

            const uLDir = gl.getUniformLocation(program, 'u_lightDir');
            if (uLDir) gl.uniform3fv(uLDir, lightDir);
            
            const uLCol = gl.getUniformLocation(program, 'u_lightColor');
            if (uLCol) gl.uniform3fv(uLCol, lightColor);
            
            const uLInt = gl.getUniformLocation(program, 'u_lightIntensity');
            if (uLInt) gl.uniform1f(uLInt, lightIntensity);

            let instanceCount = 0;
            const stride = 22;
            const buffer = mesh.cpuBuffer;
            
            for (let i = 0; i < indices.length; i++) {
                const idx = indices[i];
                const offset = instanceCount * stride;
                
                const wmIndex = idx * 16;
                for (let k = 0; k < 16; k++) {
                    buffer[offset + k] = store.worldMatrix[wmIndex + k];
                }
                
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

        // --- RENDER GRID (Mode A: Included in PP) ---
        if (this.showGrid && !this.gridExcludePP && this.gridProgram) {
            this.renderGrid(gl, viewProjection);
        }

        // --- POST PROCESS PASS ---
        if (ppEnabled && this.ppProgram && this.quadVAO && this.fbo) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            gl.viewport(0, 0, width, height);
            gl.clear(gl.COLOR_BUFFER_BIT); 
            // NOTE: Usually we don't clear depth here if we want to keep scene depth,
            // but the PP pass is a full screen quad.
            
            gl.useProgram(this.ppProgram);
            
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.fboTexture); 
            const uScene = gl.getUniformLocation(this.ppProgram, 'u_scene');
            if (uScene) gl.uniform1i(uScene, 0);
            
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, this.fboDataTexture); 
            const uData = gl.getUniformLocation(this.ppProgram, 'u_data');
            if (uData) gl.uniform1i(uData, 1);
            
            const uRes = gl.getUniformLocation(this.ppProgram, 'u_resolution');
            if (uRes) gl.uniform2f(uRes, width, height);
            
            const uTimePP = gl.getUniformLocation(this.ppProgram, 'u_time');
            if (uTimePP) gl.uniform1f(uTimePP, time);
            
            const setUniform = (name: string, val: number) => {
                const loc = gl.getUniformLocation(this.ppProgram!, name);
                if (loc) gl.uniform1f(loc, val);
            }
            setUniform('u_enabled', 1.0);
            setUniform('u_vignetteStrength', this.ppConfig.vignetteStrength);
            setUniform('u_aberrationStrength', this.ppConfig.aberrationStrength);
            setUniform('u_toneMapping', this.ppConfig.toneMapping ? 1.0 : 0.0);

            gl.bindVertexArray(this.quadVAO);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            gl.bindVertexArray(null);
        }

        // --- RENDER GRID (Mode B: Excluded from PP) ---
        if (this.showGrid && this.gridExcludePP && this.gridProgram) {
            // If PP was active, we are currently bound to Default FB.
            // But we need the depth buffer from the FBO to handle occlusion correctly.
            if (ppEnabled && this.fbo) {
                // Copy depth from FBO to Default FB
                gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.fbo);
                gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null);
                gl.blitFramebuffer(
                    0, 0, width, height,
                    0, 0, width, height,
                    gl.DEPTH_BUFFER_BIT,
                    gl.NEAREST
                );
                // Bind Default FB again for drawing
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
            }
            
            this.renderGrid(gl, viewProjection);
        }
    }

    private renderGrid(gl: WebGL2RenderingContext, viewProjection: Float32Array) {
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        gl.depthMask(false); 
        
        gl.useProgram(this.gridProgram);
        
        const uVP = gl.getUniformLocation(this.gridProgram!, 'u_viewProjection');
        if (uVP) gl.uniformMatrix4fv(uVP, false, viewProjection);
        
        const uOp = gl.getUniformLocation(this.gridProgram!, 'u_opacity');
        if (uOp) gl.uniform1f(uOp, this.gridOpacity);
        
        const uSz = gl.getUniformLocation(this.gridProgram!, 'u_gridSize');
        if (uSz) gl.uniform1f(uSz, this.gridSize);
        
        const uFD = gl.getUniformLocation(this.gridProgram!, 'u_fadeDist');
        if (uFD) gl.uniform1f(uFD, this.gridFadeDistance);
        
        const uCol = gl.getUniformLocation(this.gridProgram!, 'u_gridColor');
        if (uCol) gl.uniform3fv(uCol, this.gridColor);

        const planeMesh = this.meshes.get(MESH_TYPES['Plane']);
        if (planeMesh) {
            gl.bindVertexArray(planeMesh.vao);
            gl.drawElements(gl.TRIANGLES, planeMesh.count, gl.UNSIGNED_SHORT, 0);
            gl.bindVertexArray(null);
        }
        
        gl.depthMask(true);
        gl.disable(gl.BLEND);
    }

    createCubeData() {
        const v = [ -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5, 0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5,0.5,-0.5, 0.5,0.5,-0.5, -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5, -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, 0.5,0.5,0.5, -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5 ];
        const n = [ 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, 1,0,0, 1,0,0, 1,0,0, 1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0 ];
        const u = [ 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1 ];
        const idx = [ 0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11, 12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23 ];
        return { vertices: new Float32Array(v), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(idx) };
    }

    createSphereData(latBands: number, longBands: number) {
        const radius = 0.5; const v=[], n=[], u=[], idx=[];
        for (let lat = 0; lat <= latBands; lat++) {
            const theta = lat * Math.PI / latBands; const sinTheta = Math.sin(theta); const cosTheta = Math.cos(theta);
            for (let lon = 0; lon <= longBands; lon++) {
                const phi = lon * 2 * Math.PI / longBands; const sinPhi = Math.sin(phi); const cosPhi = Math.cos(phi);
                const x = cosPhi * sinTheta; const y = cosTheta; const z = sinPhi * sinTheta;
                n.push(x, y, z); u.push(1 - (lon / longBands), 1 - (lat / latBands)); v.push(x * radius, y * radius, z * radius);
            }
        }
        for (let lat = 0; lat < latBands; lat++) {
            for (let lon = 0; lon < longBands; lon++) {
                const first = (lat * (longBands + 1)) + lon; const second = first + longBands + 1;
                idx.push(first, second, first + 1, second, second + 1, first + 1);
            }
        }
        return { vertices: new Float32Array(v), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(idx) };
    }

    createPlaneData() {
        const v = [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5];
        const n = [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0];
        const u = [0, 0, 1, 0, 1, 1, 0, 1];
        const idx = [0, 1, 2, 0, 2, 3];
        return { vertices: new Float32Array(v), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(idx) };
    }
}
