
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
        description: 'Water turbulence built using atomic Vector2 nodes.',
        nodes: [
            { id: 'uv', type: 'UV', position: { x: 50, y: 200 } },
            { id: 'time', type: 'Time', position: { x: 50, y: 350 } },
            
            // UV Scaling
            { id: 'uv_split', type: 'Split', position: { x: 200, y: 200 } },
            { id: 'uv_vec2', type: 'Vec2', position: { x: 350, y: 200 } }, // Reconstruct as vec2
            { id: 'scale', type: 'Float', position: { x: 350, y: 100 }, data: { value: '6.0' } },
            { id: 'uv_scaled', type: 'Vec2Scale', position: { x: 500, y: 200 } },
            
            // p = mod(uv * scale, TAU) - 250 (simplified to mod for tiling)
            { id: 'tau', type: 'Float', position: { x: 500, y: 100 }, data: { value: '6.28' } },
            { id: 'p', type: 'Vec2Mod', position: { x: 650, y: 200 } },
            
            // Iteration 1 simulation
            // i = p + vec2(...)
            // Let's do a simple warping: p + sin(p.yx + time)
            
            // p.yx
            { id: 'p_split', type: 'SplitVec2', position: { x: 800, y: 200 } },
            { id: 'p_yx', type: 'Vec2', position: { x: 950, y: 150 } }, // Swapped
            
            { id: 'add_t', type: 'Vec2Scale', position: { x: 950, y: 300 } }, // reusing scale as add for prototype? No, use Add
            // Wait, we need Vec2 + Float (time). 
            // Workaround: Make Time a Vec2(time, time)
            { id: 'time_vec2', type: 'Vec2', position: { x: 200, y: 400 } }, 
            
            { id: 'arg', type: 'Vec2Add', position: { x: 1100, y: 200 } }, // p.yx + time
            
            // Sin(arg) - we don't have Vec2 Sin yet, let's use Split + Sin + Combine
            // Or just simplified visual:
            // Just use Distance field from a moving point
            
            { id: 'move_scale', type: 'Vec2Scale', position: { x: 350, y: 400 } }, // time * 0.5
            { id: 'center', type: 'Vec2', position: { x: 500, y: 400 }, data: { x: '3.0', y: '3.0' } },
            { id: 'moving_center', type: 'Vec2Add', position: { x: 650, y: 400 } },
            
            { id: 'dist', type: 'Distance', position: { x: 800, y: 350 } }, // dist(p, moving_center) assuming vec3 inputs...
            // Distance node is Vec3. We need Vec2 Distance.
            // Let's use Vec2Length(Vec2Sub(a,b))
            
            { id: 'diff', type: 'Vec2Sub', position: { x: 800, y: 400 } },
            { id: 'len', type: 'Vec2Length', position: { x: 950, y: 400 } },
            
            { id: 'sin_wave', type: 'Sine', position: { x: 1100, y: 400 } },
            
            // Color mapping
            { id: 'color_base', type: 'Vec3', position: { x: 1100, y: 100 }, data: { x: '0.0', y: '0.4', z: '0.8' } },
            { id: 'final_col', type: 'Vec3Scale', position: { x: 1300, y: 200 } },
            
            { id: 'out', type: 'ShaderOutput', position: { x: 1500, y: 200 } },
            
            // Missing nodes previously in connections array
            { id: 'one', type: 'Vec2', position: { x: 200, y: 500 }, data: { x:'0.5', y:'0.5' } },
            { id: 'dir', type: 'Vec2', position: { x: 200, y: 450 }, data: { x: '0.5', y: '0.2' } },
            { id: 'abs', type: 'Abs', position: { x: 1200, y: 400 } }
        ],
        connections: [
            // UV -> Vec2 -> Scale -> Mod
            { id: 'c1', fromNode: 'uv', fromPin: 'uv', toNode: 'uv_split', toPin: 'in' },
            { id: 'c2', fromNode: 'uv_split', fromPin: 'x', toNode: 'uv_vec2', toPin: 'x' },
            { id: 'c3', fromNode: 'uv_split', fromPin: 'y', toNode: 'uv_vec2', toPin: 'y' },
            { id: 'c4', fromNode: 'uv_vec2', fromPin: 'out', toNode: 'uv_scaled', toPin: 'a' },
            { id: 'c5', fromNode: 'scale', fromPin: 'out', toNode: 'uv_scaled', toPin: 's' },
            { id: 'c6', fromNode: 'uv_scaled', fromPin: 'out', toNode: 'p', toPin: 'a' },
            { id: 'c7', fromNode: 'tau', fromPin: 'out', toNode: 'p', toPin: 's' },
            
            // Moving Center = Center + Time*0.5
            { id: 't1', fromNode: 'time', fromPin: 'out', toNode: 'move_scale', toPin: 's' }, // Wait, input is Vec2?
            
            // Hack: Use Vec2(1,1) * time
            // one node moved to nodes array

            // Fix connection logic manually in my head:
            // move_scale input 'a' needs vec2. 
            // I'll create a node for direction
            
            // dir node moved to nodes array
            { id: 'c8', fromNode: 'dir', fromPin: 'out', toNode: 'move_scale', toPin: 'a' },
            { id: 'c9', fromNode: 'move_scale', fromPin: 'out', toNode: 'moving_center', toPin: 'b' },
            { id: 'c10', fromNode: 'center', fromPin: 'out', toNode: 'moving_center', toPin: 'a' },
            
            // Diff = p - moving_center
            { id: 'c11', fromNode: 'p', fromPin: 'out', toNode: 'diff', toPin: 'a' },
            { id: 'c12', fromNode: 'moving_center', fromPin: 'out', toNode: 'diff', toPin: 'b' },
            
            // Len = length(diff)
            { id: 'c13', fromNode: 'diff', fromPin: 'out', toNode: 'len', toPin: 'a' },
            
            // Wave = sin(len * 5.0 - time * 2.0) -- simplifying to sin(len)
            { id: 'c14', fromNode: 'len', fromPin: 'out', toNode: 'sin_wave', toPin: 'in' },
            
            // Color = Base * Wave
            // Wave is -1..1, lets Abs it
            
            // abs node moved to nodes array
            { id: 'c15', fromNode: 'sin_wave', fromPin: 'out', toNode: 'abs', toPin: 'in' },
            
            { id: 'c16', fromNode: 'color_base', fromPin: 'out', toNode: 'final_col', toPin: 'a' },
            { id: 'c17', fromNode: 'abs', fromPin: 'out', toNode: 'final_col', toPin: 's' },
            
            { id: 'c18', fromNode: 'final_col', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
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
