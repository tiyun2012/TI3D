
import { GraphNode, GraphConnection } from '../types';

export interface MaterialTemplate {
    name: string;
    description: string;
    nodes: GraphNode[];
    connections: GraphConnection[];
}

export const MATERIAL_TEMPLATES: MaterialTemplate[] = [
    {
        name: 'Empty Shader',
        description: 'A blank canvas with just an output node.',
        nodes: [
            { id: 'out', type: 'ShaderOutput', position: { x: 800, y: 200 } }
        ],
        connections: []
    },
    {
        name: 'Unlit Color',
        description: 'Basic flat color shader.',
        nodes: [
            { id: 'color', type: 'Vec3', position: { x: 400, y: 200 }, data: { x: 1.0, y: 0.0, z: 0.5 } },
            { id: 'out', type: 'ShaderOutput', position: { x: 800, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'color', fromPin: 'out', toNode: 'out', toPin: 'rgb' }
        ]
    },
    {
        name: 'Time Pulse',
        description: 'Color pulsing over time.',
        nodes: [
            { id: 'time', type: 'Time', position: { x: 200, y: 200 } },
            { id: 'sin', type: 'Sine', position: { x: 400, y: 200 } },
            { id: 'split', type: 'Split', position: { x: 600, y: 200 } }, // Just to demo flow
            { id: 'out', type: 'ShaderOutput', position: { x: 800, y: 200 } }
        ],
        connections: [
            { id: 'c1', fromNode: 'time', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            // This is a rough template, user connects the rest
        ]
    }
];
