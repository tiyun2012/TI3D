
import { GraphNode } from '../types';
import { assetManager } from './AssetManager';

export interface PortDefinition {
    id: string;
    name: string;
    type: string;
    color?: string;
}

export interface NodeDefinition {
    type: string;
    category: string;
    title: string;
    inputs: PortDefinition[];
    outputs: PortDefinition[];
    data?: any;
    execute?: (inputs: any[], data: any) => any;
    glsl?: (inputs: string[], varName: string, data: any) => string | { body: string, functions: string };
}

export const getTypeColor = (type: string) => {
    switch(type) {
        case 'float': return '#a6e22e'; // Green
        case 'vec3': return '#66d9ef';  // Blue
        case 'vec2': return '#fd971f';  // Orange
        case 'pose': return '#ff0080';  // Hot Pink (Rigging Flow)
        case 'entity_list': return '#ae81ff'; // Purple
        case 'boolean': return '#f92672'; // Red
        case 'geometry': return '#00dcb4'; // Teal (Houdini-ish)
        case 'string': return '#e6db74'; // Yellow
        case 'any': return '#f8f8f2';   // White
        default: return '#f8f8f2';
    }
};

export const NodeRegistry: Record<string, NodeDefinition> = {
    // --- IO NODES ---
    'StaticMesh': {
        type: 'StaticMesh',
        category: 'Input',
        title: 'Static Mesh',
        inputs: [],
        outputs: [
            { id: 'geo', name: 'Geometry', type: 'geometry' }
        ],
        data: { assetId: '' },
        execute: (i, d) => {
            if (!d.assetId) return null;
            const asset = assetManager.getAsset(d.assetId);
            if (asset && asset.type === 'MESH') {
                return {
                    type: 'geometry',
                    name: asset.name,
                    vertexCount: asset.geometry.vertices.length / 3,
                    polyCount: asset.geometry.indices.length / 3,
                    source: asset
                };
            }
            return null;
        }
    },

    // --- SHADER NODES ---
    'ShaderOutput': {
        type: 'ShaderOutput', category: 'Output', title: 'Material Output',
        inputs: [
            { id: 'rgb', name: 'Color (RGB)', type: 'vec3' },
            { id: 'alpha', name: 'Alpha', type: 'float' },
            { id: 'normal', name: 'Normal', type: 'vec3' },
            { id: 'offset', name: 'World Offset', type: 'vec3' }
        ],
        outputs: []
    },
    'Time': {
        type: 'Time', category: 'Input', title: 'Time',
        inputs: [], outputs: [{ id: 'out', name: 'Time', type: 'float' }],
        glsl: (i, v) => `float ${v} = u_time;`,
        execute: () => performance.now() / 1000
    },
    'Float': {
        type: 'Float', category: 'Input', title: 'Float',
        inputs: [], outputs: [{id:'out', name:'Value', type:'float'}],
        data: { value: 0.0 },
        glsl: (i, v, d) => `float ${v} = ${d.value.includes('.') ? d.value : d.value + '.0'};`,
        execute: (i, d) => parseFloat(d.value)
    },
    'Vec3': {
        type: 'Vec3', category: 'Input', title: 'Vector 3',
        inputs: [], outputs: [{id:'out', name:'Vector', type:'vec3'}],
        data: { x: 0.0, y: 0.0, z: 0.0 },
        glsl: (i, v, d) => `vec3 ${v} = vec3(${d.x}, ${d.y}, ${d.z});`,
        execute: (i, d) => ({ x: parseFloat(d.x), y: parseFloat(d.y), z: parseFloat(d.z) })
    },
    // ... Math Nodes ...
    'Sine': {
        type: 'Sine', category: 'Math', title: 'Sine',
        inputs: [{id:'in', name:'In', type:'float'}],
        outputs: [{id:'out', name:'Out', type:'float'}],
        glsl: (i, v) => `float ${v} = sin(${i[0]});`,
        execute: (i) => Math.sin(i[0] || 0)
    },
    'Multiply': {
        type: 'Multiply', category: 'Math', title: 'Multiply',
        inputs: [{id:'a', name:'A', type:'float'}, {id:'b', name:'B', type:'float'}],
        outputs: [{id:'out', name:'Result', type:'float'}],
        glsl: (i, v) => `float ${v} = ${i[0]} * ${i[1]};`,
        execute: (i) => (i[0]||0) * (i[1]||0)
    },
    'GreaterThan': {
        type: 'GreaterThan', category: 'Logic', title: 'A > B',
        inputs: [{id:'a', name:'A', type:'float'}, {id:'b', name:'B', type:'float'}],
        outputs: [{id:'out', name:'Bool', type:'boolean'}],
        execute: (i) => (i[0]||0) > (i[1]||0)
    },
    'Branch': {
        type: 'Branch', category: 'Logic', title: 'Branch',
        inputs: [
            { id: 'condition', name: 'Condition', type: 'boolean' },
            { id: 'true', name: 'True', type: 'any' },
            { id: 'false', name: 'False', type: 'any' }
        ],
        outputs: [{ id: 'out', name: 'Result', type: 'any' }],
        execute: (i) => (i[0] ? i[1] : i[2])
    },
    'Sequence': {
        type: 'Sequence', category: 'Logic', title: 'Sequence',
        inputs: [{ id: 'in', name: 'In', type: 'any' }],
        outputs: [
            { id: '0', name: 'Then 0', type: 'any' },
            { id: '1', name: 'Then 1', type: 'any' },
            { id: '2', name: 'Then 2', type: 'any' },
            { id: '3', name: 'Then 3', type: 'any' }
        ],
        execute: (i) => ({ '0': i[0], '1': i[0], '2': i[0], '3': i[0] })
    },

    // --- RIGGING NODES ---
    'RigInput': {
        type: 'RigInput', category: 'Rigging', title: 'Input Pose',
        inputs: [],
        outputs: [{ id: 'pose', name: 'Pose', type: 'pose' }],
        execute: () => ({ type: 'PoseData' })
    },
    'RigOutput': {
        type: 'RigOutput', category: 'Rigging', title: 'Output Pose',
        inputs: [{ id: 'pose', name: 'Pose', type: 'pose' }],
        outputs: [],
        execute: () => {}
    },
    'GetBoneTransform': {
        type: 'GetBoneTransform', category: 'Rigging', title: 'Get Bone',
        inputs: [{ id: 'pose', name: 'Pose', type: 'pose' }],
        outputs: [
            { id: 'pos', name: 'Position', type: 'vec3' },
            { id: 'rot', name: 'Rotation', type: 'vec3' },
            { id: 'scale', name: 'Scale', type: 'vec3' }
        ],
        data: { bone: 'Bone001', space: 'Local' },
        execute: () => ({ pos: {x:0,y:0,z:0}, rot: {x:0,y:0,z:0}, scale: {x:1,y:1,z:1} })
    },
    'SetBoneTransform': {
        type: 'SetBoneTransform', category: 'Rigging', title: 'Set Bone',
        inputs: [
            { id: 'pose', name: 'Pose', type: 'pose' },
            { id: 'pos', name: 'Position', type: 'vec3' },
            { id: 'rot', name: 'Rotation', type: 'vec3' },
            { id: 'weight', name: 'Weight', type: 'float' }
        ],
        outputs: [{ id: 'outPose', name: 'Pose', type: 'pose' }],
        data: { bone: 'Bone001', space: 'Local' },
        execute: (i) => i[0]
    },
    'TwoBoneIK': {
        type: 'TwoBoneIK', category: 'Rigging', title: 'Two Bone IK',
        inputs: [
            { id: 'pose', name: 'Pose', type: 'pose' },
            { id: 'target', name: 'Target', type: 'vec3' },
            { id: 'pole', name: 'Pole Vector', type: 'vec3' },
            { id: 'weight', name: 'Weight', type: 'float' }
        ],
        outputs: [{ id: 'outPose', name: 'Pose', type: 'pose' }],
        data: { root: 'Thigh_L', mid: 'Calf_L', eff: 'Foot_L' },
        execute: (i) => i[0]
    },

    // --- UTILITY ---
    'Vec3Scale': {
        type: 'Vec3Scale', category: 'Vector', title: 'Scale Vec3',
        inputs: [{id:'a', name:'Vec', type:'vec3'}, {id:'s', name:'Scale', type:'float'}],
        outputs: [{id:'out', name:'Result', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = ${i[0]} * ${i[1]};`,
        execute: (i) => ({ x: (i[0]?.x||0)*i[1], y: (i[0]?.y||0)*i[1], z: (i[0]?.z||0)*i[1] })
    },
    'SimplexNoise': {
        type: 'SimplexNoise', category: 'Advanced', title: 'Simplex Noise',
        inputs: [{ id: 'pos', name: 'Pos', type: 'vec3' }, { id: 'scale', name: 'Scale', type: 'float' }, { id: 'time', name: 'Time', type: 'float' }],
        outputs: [{ id: 'out', name: 'Value', type: 'float' }],
        glsl: (i, v) => ({ body: `float ${v} = 0.0;`, functions: '' })
    }
};
