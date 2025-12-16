
import { GraphNode, GraphConnection } from '../types';

export interface MaterialTemplate {
    name: string;
    description: string;
    nodes: GraphNode[];
    connections: GraphConnection[];
}

export const MATERIAL_TEMPLATES: MaterialTemplate[] = [
    {
        name: 'Empty Canvas',
        description: 'Start from scratch.',
        nodes: [
            { id: 'out', type: 'ShaderOutput', position: { x: 600, y: 200 } }
        ],
        connections: []
    },
    {
        name: 'For Loop',
        description: 'Demonstrates the GLSL ForLoop node to create a rotating pattern.',
        nodes: [
            { id: 'uv', type: 'UV', position: { x: 50, y: 200 } },
            { id: 'uv_vec3', type: 'Vec2ToVec3', position: { x: 250, y: 200 } },
            { id: 'count', type: 'Float', position: { x: 300, y: 50 }, data: { value: '10' } },
            { 
                id: 'loop', 
                type: 'ForLoop', 
                position: { x: 500, y: 150 },
                data: {
                    code: `
// Rotating Lights Pattern
float theta = (index / 10.0) * 6.283 + time;
vec2 offset = vec2(cos(theta), sin(theta)) * 0.3;
float d = length(a.xy - 0.5 - offset);

// Color variation based on index
// Use floats (0.0, 2.0, 4.0) explicitly
vec3 col = 0.5 + 0.5 * cos(vec3(0.0, 2.0, 4.0) + index);

// Accumulate light (1/d falloff)
acc += (vec3(0.015) / (d + 0.001)) * col;
                    `
                }
            },
            { id: 'out', type: 'ShaderOutput', position: { x: 850, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'uv_vec3', toPin: 'in' },
            { id: 'c2', fromNode: 'count', fromPin: 'out', toNode: 'loop', toPin: 'count' },
            { id: 'c3', fromNode: 'uv_vec3', fromPin: 'out', toNode: 'loop', toPin: 'a' },
            { id: 'c4', fromNode: 'loop', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
        ]
    },
    {
        name: 'Water Turbulence (Loop)',
        description: 'Water effect implemented using ForLoop and Math nodes (No custom block).',
        nodes: [
            // --- CONSTANTS ---
            { id: 'TAU', type: 'Float', position: { x: -100, y: 50 }, data: { value: '6.28318' } },
            { id: 'Offset', type: 'Vec2', position: { x: 300, y: 350 }, data: { x: '250.0', y: '250.0' } },
            { id: 'Iter', type: 'Float', position: { x: 700, y: 0 }, data: { value: '5.0' } },
            
            // --- INPUTS ---
            { id: 'uv', type: 'UV', position: { x: -100, y: 200 } },
            { id: 'uv_s', type: 'Vec2Scale', position: { x: 100, y: 200 } },
            { id: 'mod', type: 'ModVec2', position: { x: 300, y: 200 } },
            { id: 'p', type: 'Vec2Sub', position: { x: 500, y: 200 } },
            
            // --- LOOP INIT ---
            // Pack vec3(p.x, p.y, 1.0) -> init
            // Pack vec3(p.x, p.y, 0.0) -> a (param)
            { id: 'one', type: 'Float', position: { x: 500, y: 350 }, data: { value: '1.0' } },
            { id: 'init_pack', type: 'Vec2ToVec3', position: { x: 700, y: 150 } }, // p, 1.0
            { id: 'p_pack', type: 'Vec2ToVec3', position: { x: 700, y: 250 } }, // p, 0.0
            
            // --- LOOP ---
            { 
                id: 'loop', 
                type: 'ForLoop', 
                position: { x: 950, y: 100 },
                data: {
                    code: `
// Water Iteration
// p is passed in a.xy
// iter_p is acc.xy (renamed from i to avoid conflict)
// c is acc.z
// time is u_time (global)

float t = time * (1.0 - (3.5 / (index + 1.0)));
vec2 p = a.xy;
vec2 iter_p = acc.xy;
float c = acc.z;

vec2 next_p = p + vec2(cos(t - iter_p.x) + sin(t + iter_p.y), sin(t - iter_p.y) + cos(t + iter_p.x));
float dist = length(vec2(p.x / (sin(next_p.x+t)/0.005), p.y / (cos(next_p.y+t)/0.005)));

acc = vec3(next_p, c + (1.0 / dist));`
                }
            },
            
            // --- POST PROCESS ---
            // Extract c (z)
            { id: 'split', type: 'Split', position: { x: 1250, y: 200 } },
            
            // c /= 5.0
            { id: 'div_5', type: 'Divide', position: { x: 1450, y: 200 } },
            { id: 'five', type: 'Float', position: { x: 1250, y: 350 }, data: { value: '5.0' } },
            
            // 1.17 - pow(c, 1.4)
            { id: 'pow_14', type: 'Power', position: { x: 1650, y: 200 } },
            { id: 'exp_14', type: 'Float', position: { x: 1450, y: 350 }, data: { value: '1.4' } },
            { id: 'sub_117', type: 'Subtract', position: { x: 1850, y: 200 } },
            { id: 'val_117', type: 'Float', position: { x: 1650, y: 100 }, data: { value: '1.17' } },
            
            // pow(abs(c), 8.0)
            { id: 'abs_c', type: 'Abs', position: { x: 2050, y: 200 } },
            { id: 'pow_8', type: 'Power', position: { x: 2250, y: 200 } },
            { id: 'exp_8', type: 'Float', position: { x: 2050, y: 350 }, data: { value: '8.0' } },
            
            // Color Construction
            { id: 'vec_c', type: 'Vec3', position: { x: 2450, y: 200 } }, // (c,c,c) is implicit if using single float to vec3, but our Vec3 node takes 3 floats.
            // Wait, we need to fan out the float to x,y,z of Vec3 node or use Vec3Scale on white
            { id: 'white', type: 'Vec3', position: { x: 2450, y: 50 }, data: { x:'1',y:'1',z:'1'} },
            { id: 'col_base', type: 'Vec3Scale', position: { x: 2650, y: 200 } },
            
            { id: 'tint', type: 'Vec3', position: { x: 2650, y: 350 }, data: { x: '0.0', y: '0.35', z: '0.5' } },
            { id: 'add_tint', type: 'Vec3Add', position: { x: 2850, y: 200 } },
            
            { id: 'clamp', type: 'ClampVec3', position: { x: 3050, y: 200 } },
            { id: 'out', type: 'ShaderOutput', position: { x: 3250, y: 200 } }
        ],
        connections: [
            // Pre-Calc
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'uv_s', toPin: 'a' },
            { id: 'c2', fromNode: 'TAU', fromPin: 'out', toNode: 'uv_s', toPin: 's' },
            { id: 'c3', fromNode: 'uv_s', fromPin: 'out', toNode: 'mod', toPin: 'a' },
            { id: 'c4', fromNode: 'TAU', fromPin: 'out', toNode: 'mod', toPin: 'b' },
            { id: 'c5', fromNode: 'mod', fromPin: 'out', toNode: 'p', toPin: 'a' },
            { id: 'c6', fromNode: 'Offset', fromPin: 'out', toNode: 'p', toPin: 'b' },
            
            // Init Loop
            { id: 'c7', fromNode: 'p', fromPin: 'out', toNode: 'init_pack', toPin: 'in' },
            { id: 'c8', fromNode: 'one', fromPin: 'out', toNode: 'init_pack', toPin: 'z' },
            { id: 'c9', fromNode: 'p', fromPin: 'out', toNode: 'p_pack', toPin: 'in' },
            
            // Loop Connections
            { id: 'c10', fromNode: 'Iter', fromPin: 'out', toNode: 'loop', toPin: 'count' },
            { id: 'c11', fromNode: 'init_pack', fromPin: 'out', toNode: 'loop', toPin: 'init' },
            { id: 'c12', fromNode: 'p_pack', fromPin: 'out', toNode: 'loop', toPin: 'a' },
            
            // Post Process
            { id: 'c13', fromNode: 'loop', fromPin: 'out', toNode: 'split', toPin: 'in' },
            { id: 'c14', fromNode: 'split', fromPin: 'z', toNode: 'div_5', toPin: 'a' },
            { id: 'c15', fromNode: 'five', fromPin: 'out', toNode: 'div_5', toPin: 'b' },
            
            { id: 'c16', fromNode: 'div_5', fromPin: 'out', toNode: 'pow_14', toPin: 'base' },
            { id: 'c17', fromNode: 'exp_14', fromPin: 'out', toNode: 'pow_14', toPin: 'exp' },
            
            { id: 'c18', fromNode: 'val_117', fromPin: 'out', toNode: 'sub_117', toPin: 'a' },
            { id: 'c19', fromNode: 'pow_14', fromPin: 'out', toNode: 'sub_117', toPin: 'b' },
            
            { id: 'c20', fromNode: 'sub_117', fromPin: 'out', toNode: 'abs_c', toPin: 'in' },
            { id: 'c21', fromNode: 'abs_c', fromPin: 'out', toNode: 'pow_8', toPin: 'base' },
            { id: 'c22', fromNode: 'exp_8', fromPin: 'out', toNode: 'pow_8', toPin: 'exp' },
            
            { id: 'c23', fromNode: 'white', fromPin: 'out', toNode: 'col_base', toPin: 'a' },
            { id: 'c24', fromNode: 'pow_8', fromPin: 'out', toNode: 'col_base', toPin: 's' },
            
            { id: 'c25', fromNode: 'col_base', fromPin: 'out', toNode: 'add_tint', toPin: 'a' },
            { id: 'c26', fromNode: 'tint', fromPin: 'out', toNode: 'add_tint', toPin: 'b' },
            
            { id: 'c27', fromNode: 'add_tint', fromPin: 'out', toNode: 'clamp', toPin: 'in' },
            { id: 'c28', fromNode: 'clamp', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
        ]
    },
    {
        name: 'Sine Wave Pulse',
        description: 'Uniform color that pulses over time.',
        nodes: [
            { id: 'time', type: 'Time', position: { x: 100, y: 200 } },
            { id: 'sin', type: 'Sine', position: { x: 300, y: 200 } },
            { id: 'color', type: 'Vec3', position: { x: 500, y: 200 }, data: { y: '0.2', z: '1.0' } }, 
            { id: 'out', type: 'ShaderOutput', position: { x: 750, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'time', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            { id: 'c2', fromNode: 'sin', fromPin: 'out', toNode: 'color', toPin: 'x' },
            { id: 'c3', fromNode: 'color', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
        ]
    },
    {
        name: 'Radial Circle',
        description: 'A soft circle using Distance and SmoothStep.',
        nodes: [
            { id: 'uv', type: 'UV', position: { x: 50, y: 150 } },
            // Changed Center to Vec2
            { id: 'center', type: 'Vec2', position: { x: 50, y: 300 }, data: { x: '0.5', y: '0.5' } },
            // Changed Distance to Vec2Distance
            { id: 'dist', type: 'Vec2Distance', position: { x: 250, y: 200 } },
            { id: 'edge0', type: 'Float', position: { x: 300, y: 350 }, data: { value: '0.45' } },
            { id: 'edge1', type: 'Float', position: { x: 300, y: 450 }, data: { value: '0.40' } },
            { id: 'smooth', type: 'SmoothStep', position: { x: 500, y: 200 } },
            { id: 'color', type: 'Vec3', position: { x: 500, y: 50 }, data: { x: '1.0', y: '0.2', z: '0.5' } },
            { id: 'black', type: 'Vec3', position: { x: 500, y: 400 }, data: { x: '0.0', y: '0.0', z: '0.0' } },
            { id: 'mix_col', type: 'Mix', position: { x: 750, y: 200 } },
            { id: 'out', type: 'ShaderOutput', position: { x: 950, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'dist', toPin: 'a' },
            { id: 'c2', fromNode: 'center', fromPin: 'out', toNode: 'dist', toPin: 'b' },
            { id: 'c3', fromNode: 'edge0', fromPin: 'out', toNode: 'smooth', toPin: 'e0' },
            { id: 'c4', fromNode: 'edge1', fromPin: 'out', toNode: 'smooth', toPin: 'e1' },
            { id: 'c5', fromNode: 'dist', fromPin: 'out', toNode: 'smooth', toPin: 'x' },
            { id: 'c6', fromNode: 'black', fromPin: 'out', toNode: 'mix_col', toPin: 'a' },
            { id: 'c7', fromNode: 'color', fromPin: 'out', toNode: 'mix_col', toPin: 'b' },
            { id: 'c8', fromNode: 'smooth', fromPin: 'out', toNode: 'mix_col', toPin: 't' },
            { id: 'c9', fromNode: 'mix_col', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
        ]
    },
    {
        name: 'Moving Sine Gradient',
        description: 'A smooth gradient wave moving horizontally.',
        nodes: [
            // Inputs
            { id: 'uv', type: 'UV', position: { x: 50, y: 100 } },
            { id: 'time', type: 'Time', position: { x: 50, y: 250 } },
            
            // Colors
            { id: 'col1', type: 'Vec3', position: { x: 600, y: 50 }, data: { x: '0.1', y: '0.1', z: '0.9' } }, // Blue
            { id: 'col2', type: 'Vec3', position: { x: 600, y: 350 }, data: { x: '1.0', y: '0.5', z: '0.0' } }, // Orange
            
            // Logic: (UV.x + Time) -> Sine -> Normalize -> Mix
            // Changed to SplitVec2
            { id: 'split', type: 'SplitVec2', position: { x: 200, y: 100 } },
            { id: 'add_t', type: 'Add', position: { x: 350, y: 200 } },
            { id: 'sin', type: 'Sine', position: { x: 500, y: 200 } },
            
            // Normalize (-1..1 to 0..1)
            { id: 'c_one', type: 'Float', position: { x: 500, y: 320 }, data: { value: '1.0' } },
            { id: 'add_1', type: 'Add', position: { x: 650, y: 200 } },
            { id: 'c_half', type: 'Float', position: { x: 650, y: 320 }, data: { value: '0.5' } },
            { id: 'mul_05', type: 'Multiply', position: { x: 800, y: 200 } },
            
            // Mix
            { id: 'mix', type: 'Mix', position: { x: 950, y: 200 } },
            { id: 'out', type: 'ShaderOutput', position: { x: 1150, y: 200 } }
        ],
        connections: [
            // UV.x + Time
            { id: '1', fromNode: 'uv', fromPin: 'uv', toNode: 'split', toPin: 'in' },
            { id: '2', fromNode: 'split', fromPin: 'x', toNode: 'add_t', toPin: 'a' },
            { id: '3', fromNode: 'time', fromPin: 'out', toNode: 'add_t', toPin: 'b' },
            
            // Sin(x+t)
            { id: '4', fromNode: 'add_t', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            
            // (Sin + 1) * 0.5
            { id: '5', fromNode: 'sin', fromPin: 'out', toNode: 'add_1', toPin: 'a' },
            { id: '6', fromNode: 'c_one', fromPin: 'out', toNode: 'add_1', toPin: 'b' },
            { id: '7', fromNode: 'add_1', fromPin: 'out', toNode: 'mul_05', toPin: 'a' },
            { id: '8', fromNode: 'c_half', fromPin: 'out', toNode: 'mul_05', toPin: 'b' },
            
            // Mix Colors
            { id: '9', fromNode: 'col1', fromPin: 'out', toNode: 'mix', toPin: 'a' },
            { id: '10', fromNode: 'col2', fromPin: 'out', toNode: 'mix', toPin: 'b' },
            { id: '11', fromNode: 'mul_05', fromPin: 'out', toNode: 'mix', toPin: 't' },
            
            // Output
            { id: '12', fromNode: 'mix', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
        ]
    },
    {
        name: 'UV Coordinates',
        description: 'Visualize UV texture coordinates.',
        nodes: [
            { id: 'uv', type: 'UV', position: { x: 300, y: 200 } },
            // Need to convert vec2 to vec3 for shader output
            { id: 'uv_to_vec3', type: 'Vec3', position: { x: 450, y: 200 } }, 
            { id: 'split', type: 'SplitVec2', position: { x: 450, y: 50 } }, // Alternative: Split then reconstruct
            { id: 'out', type: 'ShaderOutput', position: { x: 600, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'split', toPin: 'in' },
            { id: 'c2', fromNode: 'split', fromPin: 'x', toNode: 'uv_to_vec3', toPin: 'x' },
            { id: 'c3', fromNode: 'split', fromPin: 'y', toNode: 'uv_to_vec3', toPin: 'y' },
            { id: 'c4', fromNode: 'uv_to_vec3', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
        ]
    }
];