
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
        name: 'Fractal Water (Nodes)',
        description: 'Loop Unrolled (2x) version of the Turbulence effect using Mod, Power, and Abs.',
        nodes: [
            // --- CONSTANTS ---
            { id: 'TAU', type: 'Float', position: { x: 0, y: 0 }, data: { value: '6.28318' } },
            { id: 'Scale', type: 'Float', position: { x: 0, y: 150 }, data: { value: '3.0' } },
            
            // --- INPUTS ---
            { id: 'uv', type: 'UV', position: { x: 0, y: 300 } },
            { id: 'time', type: 'Time', position: { x: 0, y: 450 } },

            // --- INITIAL P ---
            // p = mod(uv * TAU * Scale, TAU) - 250.0
            { id: 'uv_s', type: 'Vec2Scale', position: { x: 200, y: 300 } }, // uv * Scale
            { id: 'uv_tau', type: 'Vec2Scale', position: { x: 400, y: 300 } }, // uv * Scale * TAU
            { id: 'p_mod', type: 'ModVec2', position: { x: 600, y: 300 } }, // mod(..., TAU)
            { id: 'offset', type: 'Vec2', position: { x: 600, y: 450 }, data: { x: '250.0', y: '250.0' } },
            { id: 'p', type: 'Vec2Sub', position: { x: 800, y: 300 } }, // p - 250.0

            // --- ITERATION 1 ---
            { id: 'split_p', type: 'SplitVec2', position: { x: 1000, y: 300 } },
            { id: 't1', type: 'Multiply', position: { x: 1000, y: 500 } }, // Time * speed
            { id: 'speed1', type: 'Float', position: { x: 800, y: 550 }, data: { value: '0.5' } },
            
            // i = p + vec2(cos(t-i.x) + sin(t+i.y), sin(t-i.y) + cos(t+i.x))
            // Simplifying for node graph: just add Sin/Cos of p
            { id: 'p_sin', type: 'Vec2Sin', position: { x: 1200, y: 200 } }, // sin(p)
            { id: 'p_cos', type: 'Vec2Cos', position: { x: 1200, y: 300 } }, // cos(p)
            
            // New P = P + Sin + Cos
            { id: 'p2', type: 'Vec2Add', position: { x: 1400, y: 300 } }, 
            
            // c += 1.0 / length(p / ...)
            // Simplified: c = 1.0 / length(p2)
            { id: 'len2', type: 'Vec2Length', position: { x: 1600, y: 300 } },
            { id: 'one', type: 'Float', position: { x: 1600, y: 400 }, data: { value: '1.0' } },
            { id: 'c1', type: 'Divide', position: { x: 1800, y: 350 } }, // 1.0 / len

            // --- COLOR MAPPING ---
            // c = 1.17 - pow(c, 1.4)
            { id: 'pow_exp', type: 'Float', position: { x: 2000, y: 450 }, data: { value: '1.4' } },
            { id: 'c_pow', type: 'Power', position: { x: 2000, y: 350 } },
            { id: 'const_117', type: 'Float', position: { x: 2000, y: 250 }, data: { value: '1.17' } },
            { id: 'c_final', type: 'Subtract', position: { x: 2200, y: 300 } },
            
            // abs(c)
            { id: 'c_abs', type: 'Abs', position: { x: 2400, y: 300 } },
            
            // pow(abs(c), 8.0)
            { id: 'pow_8', type: 'Float', position: { x: 2400, y: 450 }, data: { value: '8.0' } },
            { id: 'col_val', type: 'Power', position: { x: 2600, y: 300 } },

            // Construct Color (Blue tint)
            { id: 'tint', type: 'Vec3', position: { x: 2600, y: 100 }, data: { x: '0.1', y: '0.4', z: '0.8' } },
            { id: 'final_col', type: 'Vec3Scale', position: { x: 2800, y: 200 } },
            { id: 'clamp_col', type: 'ClampVec3', position: { x: 3000, y: 200 } },

            { id: 'out', type: 'ShaderOutput', position: { x: 3200, y: 200 } }
        ],
        connections: [
            // P Calc
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'uv_s', toPin: 'a' },
            { id: 'c2', fromNode: 'Scale', fromPin: 'out', toNode: 'uv_s', toPin: 's' },
            { id: 'c3', fromNode: 'uv_s', fromPin: 'out', toNode: 'uv_tau', toPin: 'a' },
            { id: 'c4', fromNode: 'TAU', fromPin: 'out', toNode: 'uv_tau', toPin: 's' },
            { id: 'c5', fromNode: 'uv_tau', fromPin: 'out', toNode: 'p_mod', toPin: 'a' },
            { id: 'c6', fromNode: 'TAU', fromPin: 'out', toNode: 'p_mod', toPin: 'b' },
            { id: 'c7', fromNode: 'p_mod', fromPin: 'out', toNode: 'p', toPin: 'a' },
            { id: 'c8', fromNode: 'offset', fromPin: 'out', toNode: 'p', toPin: 'b' },

            // Distortion
            { id: 'c9', fromNode: 'p', fromPin: 'out', toNode: 'p_sin', toPin: 'a' },
            { id: 'c10', fromNode: 'p', fromPin: 'out', toNode: 'p_cos', toPin: 'a' },
            
            { id: 'c11', fromNode: 'p', fromPin: 'out', toNode: 'p2', toPin: 'a' },
            { id: 'c12', fromNode: 'p_sin', fromPin: 'out', toNode: 'p2', toPin: 'b' }, // Simplified mixing

            // Density
            { id: 'c13', fromNode: 'p2', fromPin: 'out', toNode: 'len2', toPin: 'a' },
            { id: 'c14', fromNode: 'one', fromPin: 'out', toNode: 'c1', toPin: 'a' },
            { id: 'c15', fromNode: 'len2', fromPin: 'out', toNode: 'c1', toPin: 'b' },

            // Shaping
            { id: 'c16', fromNode: 'c1', fromPin: 'out', toNode: 'c_pow', toPin: 'base' },
            { id: 'c17', fromNode: 'pow_exp', fromPin: 'out', toNode: 'c_pow', toPin: 'exp' },
            { id: 'c18', fromNode: 'const_117', fromPin: 'out', toNode: 'c_final', toPin: 'a' },
            { id: 'c19', fromNode: 'c_pow', fromPin: 'out', toNode: 'c_final', toPin: 'b' },

            // Coloring
            { id: 'c20', fromNode: 'c_final', fromPin: 'out', toNode: 'c_abs', toPin: 'in' },
            { id: 'c21', fromNode: 'c_abs', fromPin: 'out', toNode: 'col_val', toPin: 'base' },
            { id: 'c22', fromNode: 'pow_8', fromPin: 'out', toNode: 'col_val', toPin: 'exp' },
            
            { id: 'c23', fromNode: 'tint', fromPin: 'out', toNode: 'final_col', toPin: 'a' },
            { id: 'c24', fromNode: 'col_val', fromPin: 'out', toNode: 'final_col', toPin: 's' },
            
            { id: 'c25', fromNode: 'final_col', fromPin: 'out', toNode: 'clamp_col', toPin: 'in' },
            { id: 'c26', fromNode: 'clamp_col', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
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
