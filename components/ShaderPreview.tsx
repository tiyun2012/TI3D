
import React, { useEffect, useRef, useState } from 'react';
import { engineInstance } from '../services/engine';

const VERTEX_SHADER = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=8) in vec2 a_uv;

// Match the varyings expected by the main ShaderCompiler output
out vec2 v_uv;
out vec3 v_normal;
out vec3 v_worldPos;
out vec3 v_objectPos; 
out vec3 v_color;
out float v_isSelected;
out float v_texIndex;
out float v_effectIndex;

void main() {
    v_uv = a_uv;
    
    // Provide dummy values for the preview quad
    // Map -1..1 quad to sphere-like normals for better preview lighting
    v_normal = normalize(vec3(a_pos.xy, 1.0)); 
    v_worldPos = a_pos; 
    v_objectPos = a_pos; 
    v_color = vec3(1.0);
    v_isSelected = 0.0;
    v_texIndex = 0.0;
    v_effectIndex = 0.0;

    gl_Position = vec4(a_pos, 1.0);
}`;

const FALLBACK_FRAGMENT = `#version 300 es
precision mediump float;
out vec4 fragColor;
void main() {
    fragColor = vec4(0.1, 0.1, 0.1, 1.0); // Dark Gray Background
}`;

interface ShaderPreviewProps {
    minimal?: boolean;
}

export const ShaderPreview: React.FC<ShaderPreviewProps> = ({ minimal = false }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>(0);
    const programRef = useRef<WebGLProgram | null>(null);
    const textureRef = useRef<WebGLTexture | null>(null);
    const [error, setError] = useState<string | null>(null);
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!gl) return;

        // --- 1. Setup Geometry (Quad) ---
        const positions = new Float32Array([
            -1, -1, 0,  1, -1, 0,  -1, 1, 0,  1, 1, 0
        ]);
        const uvs = new Float32Array([
            0, 0,  1, 0,  0, 1,  1, 1
        ]);

        const vao = gl.createVertexArray();
        gl.bindVertexArray(vao);
        
        const pBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, pBuf);
        gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

        const uvBuf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
        gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
        gl.enableVertexAttribArray(8); 
        gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0);

        // --- 2. Setup Textures (Mirroring WebGLRenderer logic) ---
        const initPreviewTextures = () => {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D_ARRAY, tex);
            const width = 256;
            const height = 256;
            const depth = 4;
            gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, width, height, depth);
            
            const data = new Uint8Array(width * height * 4 * depth);
            for (let layer = 0; layer < depth; layer++) {
                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        const idx = (layer * width * height + y * width + x) * 4;
                        let r = 255, g = 255, b = 255;

                        if (layer === 1) { // Grid
                            const scale = 32;
                            const check = ((Math.floor(x / scale) + Math.floor(y / scale)) % 2 === 0);
                            const c = check ? 220 : 255;
                            r = c; g = c; b = c;
                        } else if (layer === 2) { // Noise
                            const n = Math.random() * 255;
                            r = n; g = n; b = n;
                        } else if (layer === 3) { // Brick
                            const brickH = 32; const brickW = 64;
                            const row = Math.floor(y / brickH);
                            const offset = (row % 2 === 0) ? 0 : brickW / 2;
                            const bx = (x + offset) % brickW;
                            const by = y % brickH;
                            if (bx < 4 || by < 4) { r = 180; g = 180; b = 180; } 
                            else { const n = Math.random() * 30; r = 160 + n; g = 60 + n; b = 40 + n; }
                        }
                        data[idx] = r; data[idx+1] = g; data[idx+2] = b; data[idx+3] = 255;
                    }
                }
            }
            gl.texSubImage3D(gl.TEXTURE_2D_ARRAY, 0, 0, 0, 0, width, height, depth, gl.RGBA, gl.UNSIGNED_BYTE, data);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.REPEAT);
            textureRef.current = tex;
        };

        initPreviewTextures();

        let compiledSource = '';

        const compile = (fragSource: string) => {
            // Cleanup old
            if (programRef.current) gl.deleteProgram(programRef.current);

            const vs = gl.createShader(gl.VERTEX_SHADER)!;
            gl.shaderSource(vs, VERTEX_SHADER);
            gl.compileShader(vs);

            const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
            // Ensure default is valid if source is empty
            gl.shaderSource(fs, fragSource || FALLBACK_FRAGMENT);
            gl.compileShader(fs);
            
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                const log = gl.getShaderInfoLog(fs);
                // Don't spam console for incomplete edits
                if (fragSource !== FALLBACK_FRAGMENT) {
                    console.warn("Preview Compile Error:", log);
                    setError(log);
                }
                return; 
            }

            const p = gl.createProgram()!;
            gl.attachShader(p, vs);
            gl.attachShader(p, fs);
            gl.linkProgram(p);

            if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
                console.warn("Preview Link Error:", gl.getProgramInfoLog(p));
                return;
            }

            programRef.current = p;
            setError(null);
        };

        // Initial Compile
        compile(engineInstance.currentShaderSource || FALLBACK_FRAGMENT);

        const render = (time: number) => {
            // Check for updates from Engine
            if (engineInstance.currentShaderSource !== compiledSource) {
                compiledSource = engineInstance.currentShaderSource;
                compile(compiledSource);
            }

            // Sync canvas size
            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;
            if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
                canvas.width = displayWidth;
                canvas.height = displayHeight;
                gl.viewport(0, 0, canvas.width, canvas.height);
            }

            gl.clearColor(0.1, 0.1, 0.1, 1);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (programRef.current) {
                gl.useProgram(programRef.current);
                
                const uTime = gl.getUniformLocation(programRef.current, 'u_time');
                if (uTime) gl.uniform1f(uTime, time / 1000);
                
                const uRes = gl.getUniformLocation(programRef.current, 'u_resolution');
                if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);

                // Bind Textures
                if (textureRef.current) {
                    gl.activeTexture(gl.TEXTURE0);
                    gl.bindTexture(gl.TEXTURE_2D_ARRAY, textureRef.current);
                    const uTex = gl.getUniformLocation(programRef.current, 'u_textures');
                    if (uTex) gl.uniform1i(uTex, 0);
                }

                // Default lighting uniforms for preview
                const uLDir = gl.getUniformLocation(programRef.current, 'u_lightDir');
                if (uLDir) gl.uniform3f(uLDir, 0.5, 1.0, 0.5);
                
                const uLCol = gl.getUniformLocation(programRef.current, 'u_lightColor');
                if (uLCol) gl.uniform3f(uLCol, 1.0, 1.0, 1.0);
                
                const uLInt = gl.getUniformLocation(programRef.current, 'u_lightIntensity');
                if (uLInt) gl.uniform1f(uLInt, 1.0);

                const uCam = gl.getUniformLocation(programRef.current, 'u_cameraPos');
                if(uCam) gl.uniform3f(uCam, 0, 0, 2);

                gl.bindVertexArray(vao);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            requestRef.current = requestAnimationFrame(render);
        };

        requestRef.current = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(requestRef.current);
            if (gl) {
                gl.deleteVertexArray(vao);
                gl.deleteBuffer(pBuf);
                gl.deleteBuffer(uvBuf);
                if (programRef.current) gl.deleteProgram(programRef.current);
                if (textureRef.current) gl.deleteTexture(textureRef.current);
            }
        };
    }, []); // Run once on mount

    return (
        <div className={`w-full h-full flex flex-col ${minimal ? 'rounded overflow-hidden' : 'bg-black/50'}`}>
            {!minimal && (
                <div className="p-2 border-b border-white/5 text-[10px] text-text-secondary uppercase font-bold tracking-wider">
                    Material Output
                </div>
            )}
            <div className="flex-1 relative bg-[url('https://transparenttextures.com/patterns/checkerboard.png')] bg-repeat">
                <canvas 
                    ref={canvasRef} 
                    className="absolute inset-0 w-full h-full block" 
                />
                
                {error && (
                    <div className="absolute inset-0 bg-red-900/90 text-white p-2 font-mono text-[10px] overflow-auto whitespace-pre-wrap scrollbar-thin scrollbar-thumb-white/20">
                        <div className="font-bold border-b border-white/20 mb-1 pb-1 flex justify-between items-center">
                            <span>SHADER ERROR</span>
                            <button onClick={() => setError(null)} className="text-white/50 hover:text-white">✕</button>
                        </div>
                        {error}
                    </div>
                )}
            </div>
        </div>
    );
};
