
// services/ShaderCompiler.ts

import { GraphNode, GraphConnection } from '../types';
import { NodeRegistry } from './NodeRegistry';

interface CompileResult {
    vs: string;
    fs: string;
}

export const compileShader = (nodes: GraphNode[], connections: GraphConnection[]): CompileResult | string => {
    // 1. Find Output Node (Only one shader output supported for now)
    const outNode = nodes.find(n => n.type === 'ShaderOutput');
    if (!outNode) {
        return ''; // No shader logic detected
    }

    // --- Helper for traversing graph from a specific input pin ---
    const generateGraphFromInput = (startPin: string): { body: string; functions: string[] } => {
        const lines: string[] = [];
        const globalFunctions: string[] = [];
        const visited = new Set<string>();
        const varMap = new Map<string, string>(); 

        // Recursive traversal
        const visit = (nodeId: string): string => {
            if (visited.has(nodeId)) return varMap.get(nodeId) || 'vec3(0.0)';
            
            const node = nodes.find(n => n.id === nodeId);
            if (!node) return 'vec3(0.0)';

            const def = NodeRegistry[node.type];
            if (!def || !def.glsl) return 'vec3(0.0)'; 

            // Gather Inputs
            const inputVars = def.inputs.map(input => {
                const conn = connections.find(c => c.toNode === nodeId && c.toPin === input.id);
                if (conn) {
                    const sourceVar = visit(conn.fromNode);
                    const sourceNode = nodes.find(n => n.id === conn.fromNode);
                    // Handle Split outputs
                    if (sourceNode && sourceNode.type === 'Split') {
                        return `${sourceVar}_${conn.fromPin}`;
                    }
                    return sourceVar;
                }
                // Defaults
                if (node.data && node.data[input.id] !== undefined) {
                     const val = node.data[input.id];
                     if (def.type === 'Float' || input.type === 'float') {
                         const s = val.toString();
                         return s.includes('.') ? s : s + '.0';
                     }
                     return val;
                }
                return null;
            });

            const varName = `v_${nodeId.replace(/-/g, '_')}`;
            const result = def.glsl(inputVars as string[], varName, node.data);
            
            if (typeof result === 'string') {
                lines.push(result);
            } else {
                if (result.functions) globalFunctions.push(result.functions);
                lines.push(result.body);
            }
            
            varMap.set(nodeId, varName);
            visited.add(nodeId);
            return varName;
        };

        // Start traversal if connected
        const rootConn = connections.find(c => c.toNode === outNode.id && c.toPin === startPin);
        let finalVar = 'vec3(0.0)';
        if (rootConn) {
            finalVar = visit(rootConn.fromNode);
        }
        
        return {
            body: lines.join('\n        '),
            functions: [...new Set(globalFunctions)] // Deduplicate functions
        };
    };

    // 2. Generate Vertex Shader Logic (from 'offset' pin)
    const vsData = generateGraphFromInput('offset');
    const vsInputConn = connections.find(c => c.toNode === outNode.id && c.toPin === 'offset');
    const vsFinalAssignment = vsInputConn ? `vertexOffset = v_${vsInputConn.fromNode.replace(/-/g, '_')};` : '';

    // 3. Generate Fragment Shader Logic (from 'rgb' pin)
    const fsData = generateGraphFromInput('rgb');
    const fsInputConn = connections.find(c => c.toNode === outNode.id && c.toPin === 'rgb');
    const fsFinalAssignment = fsInputConn ? `vec3 finalColor = v_${fsInputConn.fromNode.replace(/-/g, '_')};` : 'vec3 finalColor = vec3(1.0, 0.0, 1.0);';

    // IMPORTANT: No indentation before separator comments to ensure exact string match for splitting
    const vsSource = `// --- Global Functions (VS) ---
${vsData.functions.join('\n')}

// --- Graph Body (VS) ---
${vsData.body}
${vsFinalAssignment}`;

    const fsSource = `#version 300 es
    precision mediump float;
    precision mediump sampler2DArray;
    
    uniform highp float u_time;
    uniform vec2 u_resolution;
    uniform vec3 u_cameraPos;
    uniform sampler2DArray u_textures;
    uniform int u_renderMode; // 0=Lit, 1=Normals
    
    // Varyings
    in highp vec3 v_normal;
    in highp vec3 v_worldPos;
    in highp vec3 v_objectPos;
    in highp vec3 v_color;
    in highp float v_isSelected;
    in highp vec2 v_uv;
    in highp float v_texIndex;
    in highp float v_effectIndex;

    // MRT Outputs
    layout(location=0) out vec4 outColor;
    layout(location=1) out vec4 outData; // R=EffectID

    // --- Global Functions (FS) ---
    ${fsData.functions.join('\n')}

    void main() {
        vec4 fragColor;
        ${fsData.body}
        
        ${fsFinalAssignment}
        
        // Debug Override
        if (u_renderMode == 1) {
            finalColor = normalize(v_normal) * 0.5 + 0.5;
        }
        
        if (v_isSelected > 0.5) {
            finalColor = mix(finalColor, vec3(1.0, 1.0, 0.0), 0.3);
        }
        
        outColor = vec4(finalColor, 1.0);
        // Write Effect Index to Data Buffer to satisfy MRT requirements (Normalized to 0..1 for safety)
        outData = vec4(v_effectIndex / 255.0, 0.0, 0.0, 1.0);
    }
    `;

    return {
        vs: vsSource,
        fs: fsSource
    };
};
