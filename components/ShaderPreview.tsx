
import React, { useEffect, useRef } from 'react';
import { engineInstance } from '../services/engine';

const VERTEX_SHADER = `#version 300 es
layout(location=0) in vec3 a_pos;
layout(location=8) in vec2 a_uv;
out vec2 v_uv;
void main() {
    v_uv = a_uv;
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
    
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        const gl = canvas.getContext('webgl2', { preserveDrawingBuffer: true });
        if (!gl) return;

        // Quad Geometry
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
        gl.enableVertexAttribArray(8); // Match main renderer layout location=8 for consistency
        gl.vertexAttribPointer(8, 2, gl.FLOAT, false, 0, 0);

        let program: WebGLProgram | null = null;
        let compiledSource = '';

        const compile = (fragSource: string) => {
            if (program) gl.deleteProgram(program);
            
            const vs = gl.createShader(gl.VERTEX_SHADER)!;
            gl.shaderSource(vs, VERTEX_SHADER);
            gl.compileShader(vs);

            const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
            gl.shaderSource(fs, fragSource || FALLBACK_FRAGMENT);
            gl.compileShader(fs);
            
            if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
                // console.warn("Shader Preview Compile Error:", gl.getShaderInfoLog(fs));
                // Keep old program or use fallback if valid
                if (program) return; 
            }

            const p = gl.createProgram()!;
            gl.attachShader(p, vs);
            gl.attachShader(p, fs);
            gl.linkProgram(p);
            program = p;
        };

        compile(FALLBACK_FRAGMENT);

        const render = (time: number) => {
            // Check for updates
            if (engineInstance.currentShaderSource !== compiledSource) {
                compiledSource = engineInstance.currentShaderSource;
                compile(compiledSource);
            }

            // Sync canvas size to display size
            const displayWidth = canvas.clientWidth;
            const displayHeight = canvas.clientHeight;
            if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
                canvas.width = displayWidth;
                canvas.height = displayHeight;
            }

            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.clearColor(0,0,0,1);
            gl.clear(gl.COLOR_BUFFER_BIT);

            if (program) {
                gl.useProgram(program);
                
                const uTime = gl.getUniformLocation(program, 'u_time');
                if (uTime) gl.uniform1f(uTime, time / 1000);
                
                const uRes = gl.getUniformLocation(program, 'u_resolution');
                if (uRes) gl.uniform2f(uRes, canvas.width, canvas.height);

                gl.bindVertexArray(vao);
                gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }

            requestRef.current = requestAnimationFrame(render);
        };

        requestRef.current = requestAnimationFrame(render);

        return () => {
            cancelAnimationFrame(requestRef.current);
            gl.deleteVertexArray(vao);
            gl.deleteBuffer(pBuf);
            gl.deleteBuffer(uvBuf);
            if (program) gl.deleteProgram(program);
        };
    }, []);

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
            </div>
        </div>
    );
};
