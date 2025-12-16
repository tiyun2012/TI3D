
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
        name: 'Plasma Water',
        description: 'A rippling water-like effect using sine wave interference.',
        nodes: [
            // --- CONSTANTS ---
            { id: 'Scale', type: 'Float', position: { x: 0, y: 150 }, data: { value: '10.0' } },
            { id: 'Speed', type: 'Float', position: { x: 0, y: 400 }, data: { value: '1.0' } },
            
            // --- INPUTS ---
            { id: 'uv', type: 'UV', position: { x: 0, y: 250 } },
            { id: 'time', type: 'Time', position: { x: 0, y: 500 } },

            // --- SCALE UV ---
            { id: 'uv_scaled', type: 'Vec2Scale', position: { x: 200, y: 200 } },
            
            // --- TIME MULT ---
            { id: 't_speed', type: 'Multiply', position: { x: 200, y: 450 } },

            // --- SPLIT ---
            { id: 'split', type: 'SplitVec2', position: { x: 400, y: 200 } },

            // --- WAVE X ---
            // sin(x + t)
            { id: 'add_x', type: 'Add', position: { x: 600, y: 100 } },
            { id: 'sin_x', type: 'Sine', position: { x: 800, y: 100 } },

            // --- WAVE Y ---
            // cos(y + t)
            { id: 'add_y', type: 'Add', position: { x: 600, y: 300 } },
            { id: 'cos_y', type: 'Cosine', position: { x: 800, y: 300 } },

            // --- COMBINE ---
            { id: 'sum', type: 'Add', position: { x: 1000, y: 200 } }, // -2 to 2 range
            
            // --- NORMALIZE TO 0-1 ---
            { id: 'offset', type: 'Float', position: { x: 1000, y: 350 }, data: { value: '0.5' } },
            { id: 'factor', type: 'Float', position: { x: 1000, y: 450 }, data: { value: '0.25' } },
            { id: 'mul_norm', type: 'Multiply', position: { x: 1200, y: 200 } }, // sum * 0.25
            { id: 'add_norm', type: 'Add', position: { x: 1400, y: 200 } }, // + 0.5

            // --- COLORS ---
            { id: 'col1', type: 'Vec3', position: { x: 1400, y: 50 }, data: { x: '0.0', y: '0.1', z: '0.5' } }, // Deep Blue
            { id: 'col2', type: 'Vec3', position: { x: 1400, y: 350 }, data: { x: '0.0', y: '0.6', z: '1.0' } }, // Light Blue
            
            // --- MIX ---
            { id: 'mix_water', type: 'Mix', position: { x: 1600, y: 200 } },
            
            // --- OUTPUT ---
            { id: 'out', type: 'ShaderOutput', position: { x: 1800, y: 200 } }
        ],
        connections: [
            // Scale UV
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'uv_scaled', toPin: 'a' },
            { id: 'c2', fromNode: 'Scale', fromPin: 'out', toNode: 'uv_scaled', toPin: 's' },
            
            // Time Speed
            { id: 'c3', fromNode: 'time', fromPin: 'out', toNode: 't_speed', toPin: 'a' },
            { id: 'c4', fromNode: 'Speed', fromPin: 'out', toNode: 't_speed', toPin: 'b' },

            // Split
            { id: 'c5', fromNode: 'uv_scaled', fromPin: 'out', toNode: 'split', toPin: 'in' },

            // X Chain
            { id: 'c6', fromNode: 'split', fromPin: 'x', toNode: 'add_x', toPin: 'a' },
            { id: 'c7', fromNode: 't_speed', fromPin: 'out', toNode: 'add_x', toPin: 'b' },
            { id: 'c8', fromNode: 'add_x', fromPin: 'out', toNode: 'sin_x', toPin: 'in' },

            // Y Chain
            { id: 'c9', fromNode: 'split', fromPin: 'y', toNode: 'add_y', toPin: 'a' },
            { id: 'c10', fromNode: 't_speed', fromPin: 'out', toNode: 'add_y', toPin: 'b' },
            { id: 'c11', fromNode: 'add_y', fromPin: 'out', toNode: 'cos_y', toPin: 'in' },

            // Combine
            { id: 'c12', fromNode: 'sin_x', fromPin: 'out', toNode: 'sum', toPin: 'a' },
            { id: 'c13', fromNode: 'cos_y', fromPin: 'out', toNode: 'sum', toPin: 'b' },

            // Normalize
            { id: 'c14', fromNode: 'sum', fromPin: 'out', toNode: 'mul_norm', toPin: 'a' },
            { id: 'c15', fromNode: 'factor', fromPin: 'out', toNode: 'mul_norm', toPin: 'b' },
            { id: 'c16', fromNode: 'mul_norm', fromPin: 'out', toNode: 'add_norm', toPin: 'a' },
            { id: 'c17', fromNode: 'offset', fromPin: 'out', toNode: 'add_norm', toPin: 'b' },

            // Color Mix
            { id: 'c18', fromNode: 'col1', fromPin: 'out', toNode: 'mix_water', toPin: 'a' },
            { id: 'c19', fromNode: 'col2', fromPin: 'out', toNode: 'mix_water', toPin: 'b' },
            { id: 'c20', fromNode: 'add_norm', fromPin: 'out', toNode: 'mix_water', toPin: 't' },

            // Output
            { id: 'c21', fromNode: 'mix_water', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
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
