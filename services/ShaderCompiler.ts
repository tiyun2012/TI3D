
import { GraphNode, GraphConnection } from '../types';
import { NodeRegistry } from './NodeRegistry';

export const compileShader = (nodes: GraphNode[], connections: GraphConnection[]): string => {
    // 1. Find Output Node (Only one shader output supported for now)
    const outNode = nodes.find(n => n.type === 'ShaderOutput');
    if (!outNode) {
        return ''; // No shader logic detected
    }

    const lines: string[] = [];
    const globalFunctions: string[] = [];
    const visited = new Set<string>();
    const varMap = new Map<string, string>(); // Map nodeId -> glslVariableName

    // Recursive traversal to generate dependencies first
    const visit = (nodeId: string): string => {
        if (visited.has(nodeId)) return varMap.get(nodeId) || 'vec3(0.0)';
        
        const node = nodes.find(n => n.id === nodeId);
        if (!node) return 'vec3(0.0)';

        const def = NodeRegistry[node.type];
        if (!def || !def.glsl) return 'vec3(0.0)'; // Skip CPU-only nodes

        // Gather Inputs recursively
        const inputVars = def.inputs.map(input => {
            const conn = connections.find(c => c.toNode === nodeId && c.toPin === input.id);
            if (conn) {
                const sourceVar = visit(conn.fromNode); // Generate code for dependency
                
                // Handle special case: Split node outputs are separate variables (swizzling)
                const sourceNode = nodes.find(n => n.id === conn.fromNode);
                if (sourceNode && sourceNode.type === 'Split') {
                    // sourceVar is 'v_nodeId', but we need 'v_nodeId_x' etc.
                    return `${sourceVar}_${conn.fromPin}`;
                }
                
                return sourceVar;
            }
            // Use default/data value
            if (node.data && node.data[input.id] !== undefined) {
                 const val = node.data[input.id];
                 // Ensure floats have decimals for GLSL
                 if (def.type === 'Float' || input.type === 'float') {
                     const s = val.toString();
                     return s.includes('.') ? s : s + '.0';
                 }
                 return val;
            }
            return null; // Let glsl function handle nulls with defaults
        });

        // Generate unique variable name
        const varName = `v_${nodeId.replace(/-/g, '_')}`;
        
        // Generate line of code
        const result = def.glsl(inputVars as string[], varName, node.data);
        
        if (typeof result === 'string') {
            lines.push(result);
        } else {
            // It's a complex node with global functions
            if (result.functions) {
                globalFunctions.push(result.functions);
            }
            lines.push(result.body);
        }
        
        varMap.set(nodeId, varName);
        visited.add(nodeId);
        return varName;
    };

    visit(outNode.id);

    // Assembly
    return `#version 300 es
    precision mediump float;
    
    uniform float u_time;
    uniform vec2 u_resolution;
    uniform sampler2DArray u_textures; // Needed if any node uses textures implicitly
    
    in vec2 v_uv;
    out vec4 fragColor;

    // --- Global Functions ---
    ${globalFunctions.join('\n')}

    void main() {
        ${lines.join('\n        ')}
    }
    `;
};
