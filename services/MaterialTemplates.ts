
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
        name: 'Procedural Water (Graph)',
        description: 'High-quality caustic water effect built with nodes (Domain Warping).',
        nodes: [
            // --- INPUTS ---
            { id: 'uv', type: 'UV', position: { x: -100, y: 100 } },
            { id: 'time', type: 'Time', position: { x: -100, y: 250 } },
            
            // --- CONSTANTS ---
            { id: 'uv_scale_factor', type: 'Float', position: { x: 50, y: 0 }, data: { value: '8.0' } },
            { id: 'warp_strength', type: 'Float', position: { x: 300, y: 0 }, data: { value: '0.8' } },
            { id: 'time_speed', type: 'Float', position: { x: 50, y: 350 }, data: { value: '0.5' } },

            // --- SCALE UV ---
            { id: 'uv_scale', type: 'Vec2Scale', position: { x: 200, y: 100 } },

            // --- TIME SETUP ---
            { id: 'slow_time', type: 'Multiply', position: { x: 50, y: 250 } }, // Time * 0.5
            { id: 'time_vec', type: 'Vec2', position: { x: 200, y: 250 } },     // Vec2(Time)

            // --- WARP PASS 1: p + Sin(p + t) ---
            { id: 'p1_add_t', type: 'Vec2Add', position: { x: 400, y: 150 } },
            { id: 'p1_sin', type: 'Vec2Sin', position: { x: 550, y: 150 } },
            { id: 'p1_strength', type: 'Vec2Scale', position: { x: 700, y: 150 } }, // Sin * Strength
            { id: 'p1_warped', type: 'Vec2Add', position: { x: 850, y: 100 } },      // UV + Warp1

            // --- WARP PASS 2: p1 + Cos(p1 + t) ---
            { id: 'p2_add_t', type: 'Vec2Add', position: { x: 1000, y: 150 } },
            { id: 'p2_cos', type: 'Vec2Cos', position: { x: 1150, y: 150 } }, // Use Cos for variety
            { id: 'p2_warped', type: 'Vec2Add', position: { x: 1300, y: 100 } },

            // --- CAUSTIC INTENSITY: 1.0 / Length(Sin(p2)) ---
            // This creates the "web" pattern
            { id: 'final_sin', type: 'Vec2Sin', position: { x: 1450, y: 150 } },
            { id: 'len', type: 'Vec2Length', position: { x: 1600, y: 150 } },
            
            { id: 'thickness', type: 'Float', position: { x: 1600, y: 250 }, data: { value: '0.05' } },
            { id: 'inv_len', type: 'Divide', position: { x: 1750, y: 150 } }, // 0.05 / Len

            // --- COLOR & SHARPEN ---
            { id: 'contrast', type: 'Float', position: { x: 1750, y: 250 }, data: { value: '1.2' } },
            { id: 'sharp', type: 'Pow', position: { x: 1900, y: 150 } },
            
            { id: 'tint', type: 'Vec3', position: { x: 1900, y: 50 }, data: { x: '0.1', y: '0.5', z: '1.0' } },
            { id: 'final_col', type: 'Vec3Scale', position: { x: 2050, y: 150 } },
            
            // --- CLAMP (Use Vec3Clamp since output of final_col is Vec3) ---
            { id: 'clamp_min', type: 'Float', position: { x: 2050, y: 250 }, data: { value: '0.0' } },
            { id: 'clamp_max', type: 'Float', position: { x: 2050, y: 300 }, data: { value: '1.5' } }, // Allow slight HDR
            { id: 'clamped', type: 'Vec3Clamp', position: { x: 2200, y: 150 } },

            // --- OUT ---
            { id: 'out', type: 'ShaderOutput', position: { x: 2400, y: 150 } }
        ],
        connections: [
            // Time setup
            { id: 't1', fromNode: 'time', fromPin: 'out', toNode: 'slow_time', toPin: 'a' },
            { id: 't2', fromNode: 'time_speed', fromPin: 'out', toNode: 'slow_time', toPin: 'b' },
            { id: 't3', fromNode: 'slow_time', fromPin: 'out', toNode: 'time_vec', toPin: 'x' },
            { id: 't4', fromNode: 'slow_time', fromPin: 'out', toNode: 'time_vec', toPin: 'y' },

            // Scale UV
            { id: 's1', fromNode: 'uv', fromPin: 'uv', toNode: 'uv_scale', toPin: 'a' },
            { id: 's2', fromNode: 'uv_scale_factor', fromPin: 'out', toNode: 'uv_scale', toPin: 's' },

            // --- Pass 1 ---
            { id: 'p1_1', fromNode: 'uv_scale', fromPin: 'out', toNode: 'p1_add_t', toPin: 'a' },
            { id: 'p1_2', fromNode: 'time_vec', fromPin: 'out', toNode: 'p1_add_t', toPin: 'b' },
            
            { id: 'p1_3', fromNode: 'p1_add_t', fromPin: 'out', toNode: 'p1_sin', toPin: 'a' },
            
            { id: 'p1_4', fromNode: 'p1_sin', fromPin: 'out', toNode: 'p1_strength', toPin: 'a' },
            { id: 'p1_5', fromNode: 'warp_strength', fromPin: 'out', toNode: 'p1_strength', toPin: 's' },
            
            { id: 'p1_6', fromNode: 'uv_scale', fromPin: 'out', toNode: 'p1_warped', toPin: 'a' },
            { id: 'p1_7', fromNode: 'p1_strength', fromPin: 'out', toNode: 'p1_warped', toPin: 'b' },

            // --- Pass 2 ---
            { id: 'p2_1', fromNode: 'p1_warped', fromPin: 'out', toNode: 'p2_add_t', toPin: 'a' },
            { id: 'p2_2', fromNode: 'time_vec', fromPin: 'out', toNode: 'p2_add_t', toPin: 'b' },
            
            { id: 'p2_3', fromNode: 'p2_add_t', fromPin: 'out', toNode: 'p2_cos', toPin: 'a' },
            
            { id: 'p2_4', fromNode: 'p1_warped', fromPin: 'out', toNode: 'p2_warped', toPin: 'a' },
            { id: 'p2_5', fromNode: 'p2_cos', fromPin: 'out', toNode: 'p2_warped', toPin: 'b' },

            // --- Caustics ---
            { id: 'c_1', fromNode: 'p2_warped', fromPin: 'out', toNode: 'final_sin', toPin: 'a' },
            { id: 'c_2', fromNode: 'final_sin', fromPin: 'out', toNode: 'len', toPin: 'a' },
            
            { id: 'c_3', fromNode: 'thickness', fromPin: 'out', toNode: 'inv_len', toPin: 'a' },
            { id: 'c_4', fromNode: 'len', fromPin: 'out', toNode: 'inv_len', toPin: 'b' },

            // --- Finish ---
            { id: 'f_1', fromNode: 'inv_len', fromPin: 'out', toNode: 'sharp', toPin: 'a' },
            { id: 'f_2', fromNode: 'contrast', fromPin: 'out', toNode: 'sharp', toPin: 'b' },
            
            { id: 'f_3', fromNode: 'tint', fromPin: 'out', toNode: 'final_col', toPin: 'a' },
            { id: 'f_4', fromNode: 'sharp', fromPin: 'out', toNode: 'final_col', toPin: 's' },
            
            // Connect to Vec3Clamp (uses 'in' instead of 'x')
            { id: 'f_5', fromNode: 'final_col', fromPin: 'out', toNode: 'clamped', toPin: 'in' },
            { id: 'f_6', fromNode: 'clamp_min', fromPin: 'out', toNode: 'clamped', toPin: 'min' },
            { id: 'f_7', fromNode: 'clamp_max', fromPin: 'out', toNode: 'clamped', toPin: 'max' },
            
            { id: 'out_1', fromNode: 'clamped', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
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
        name: 'Water Turbulence (Code)',
        description: 'Complex procedural water caustics effect (GLSL).',
        nodes: [
            { id: 'uv', type: 'UV', position: { x: 50, y: 150 } },
            { id: 'time', type: 'Time', position: { x: 50, y: 300 } },
            { id: 'water', type: 'WaterTurbulence', position: { x: 300, y: 200 } },
            { id: 'out', type: 'ShaderOutput', position: { x: 600, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'water', toPin: 'uv' },
            { id: 'c2', fromNode: 'time', fromPin: 'out', toNode: 'water', toPin: 'time' },
            { id: 'c3', fromNode: 'water', fromPin: 'rgb', toNode: 'out', toPin: 'rgb' }
        ]
    },
    {
        name: 'Radial Circle',
        description: 'A soft circle using Distance and SmoothStep.',
        nodes: [
            { id: 'uv', type: 'UV', position: { x: 50, y: 150 } },
            { id: 'center', type: 'Vec3', position: { x: 50, y: 300 }, data: { x: '0.5', y: '0.5', z: '0.0' } },
            { id: 'dist', type: 'Distance', position: { x: 250, y: 200 } },
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
            { id: 'split', type: 'Split', position: { x: 200, y: 100 } },
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
            { id: 'out', type: 'ShaderOutput', position: { x: 600, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'out', toPin: 'rgb' }
        ]
    }
];
