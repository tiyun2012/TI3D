
import { GraphNode } from '../types';
import { assetManager } from './AssetManager';
// Removed engineInstance import to fix circular dependency

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
    // Context now passed to execute
    execute?: (inputs: any[], data: any, context?: any) => any;
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

const snoise = `
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
float snoise(vec3 v) { 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 0.142857142857; 
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );    
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                dot(p2,x2), dot(p3,x3) ) );
}
`;

// Helper to determine type from variable name prefix (e.g. vec3_ID -> vec3)
const getType = (varName: string | undefined) => {
    if (!varName) return 'float';
    if (varName.startsWith('vec3')) return 'vec3';
    if (varName.startsWith('vec2')) return 'vec2';
    return 'float';
};

// Helper to resolve the dominant type between two inputs
const resolveType = (a: string | undefined, b: string | undefined) => {
    const tA = getType(a);
    const tB = getType(b);
    if (tA === 'vec3' || tB === 'vec3') return 'vec3';
    if (tA === 'vec2' || tB === 'vec2') return 'vec2';
    return 'float';
};

// Helper to cast variable to target type for GLSL
const cast = (varName: string | undefined, targetType: string) => {
    // If input is missing, default based on target
    const val = varName || (targetType === 'vec3' ? 'vec3(0.0)' : (targetType === 'vec2' ? 'vec2(0.0)' : '0.0'));
    
    // Check if it's a literal number string
    const isNum = /^-?[0-9]*\.?[0-9]+$/.test(val);
    
    if (isNum) {
        if (targetType === 'vec3') return `vec3(${val})`;
        if (targetType === 'vec2') return `vec2(${val})`;
        return val;
    }

    const curType = getType(val);
    if (curType === targetType) return val;
    
    // Casting rules
    if (targetType === 'vec3') {
        if (curType === 'float') return `vec3(${val})`;
        if (curType === 'vec2') return `vec3(${val}, 0.0)`;
    }
    if (targetType === 'vec2') {
        if (curType === 'float') return `vec2(${val})`;
        if (curType === 'vec3') return `${val}.xy`;
    }
    if (targetType === 'float') {
        if (curType === 'vec3') return `${val}.x`; // Fallback, usually meaningless
    }
    
    return val; 
};

export const NodeRegistry: Record<string, NodeDefinition> = {
    // --- IO NODES ---
    'StaticMesh': {
        type: 'StaticMesh', category: 'Input', title: 'Static Mesh',
        inputs: [], outputs: [{ id: 'geo', name: 'Geometry', type: 'geometry' }],
        data: { assetId: '' },
        execute: (i, d) => {
            if (!d.assetId) return null;
            const asset = assetManager.getAsset(d.assetId);
            return (asset && asset.type === 'MESH') ? { type: 'geometry', source: asset } : null;
        }
    },

    // --- SHADER IO ---
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
    'Vec2': {
        type: 'Vec2', category: 'Input', title: 'Vector 2',
        inputs: [], outputs: [{id:'out', name:'Vec2', type:'vec2'}],
        data: { x: 0.0, y: 0.0 },
        glsl: (i, v, d) => `vec2 ${v} = vec2(${d.x}, ${d.y});`
    },
    
    // --- GEOMETRY ---
    'UV': {
        type: 'UV', category: 'Geometry', title: 'UV',
        inputs: [], outputs: [{id:'uv', name:'UV', type:'vec2'}],
        glsl: (i, v) => `vec2 ${v} = v_uv;`
    },
    'WorldPosition': {
        type: 'WorldPosition', category: 'Geometry', title: 'World Pos',
        inputs: [], outputs: [{id:'pos', name:'XYZ', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = v_worldPos;`
    },
    'ObjectPosition': {
        type: 'ObjectPosition', category: 'Geometry', title: 'Object Pos',
        inputs: [], outputs: [{id:'pos', name:'XYZ', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = v_objectPos;`
    },
    'WorldNormal': {
        type: 'WorldNormal', category: 'Geometry', title: 'Normal',
        inputs: [], outputs: [{id:'norm', name:'Dir', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = normalize(v_normal);`
    },
    'ViewDirection': {
        type: 'ViewDirection', category: 'Geometry', title: 'View Dir',
        inputs: [], outputs: [{id:'dir', name:'Dir', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = normalize(u_cameraPos - v_worldPos);`
    },

    // --- MATH ---
    'Sine': {
        type: 'Sine', category: 'Math', title: 'Sine',
        inputs: [{id:'in', name:'In', type:'float'}], outputs: [{id:'out', name:'Out', type:'float'}],
        glsl: (i, v) => `float ${v} = sin(${cast(i[0], 'float')});`,
        execute: (i) => Math.sin(i[0] || 0)
    },
    'Multiply': {
        type: 'Multiply', category: 'Math', title: 'Multiply',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}], outputs: [{id:'out', name:'Result', type:'any'}],
        glsl: (i, v) => {
            const type = resolveType(i[0], i[1]);
            return `${type} ${v} = ${cast(i[0], type)} * ${cast(i[1], type)};`;
        },
        execute: (i) => (i[0]||0) * (i[1]||0)
    },
    'Add': {
        type: 'Add', category: 'Math', title: 'Add',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}], outputs: [{id:'out', name:'Result', type:'any'}],
        glsl: (i, v) => {
            const type = resolveType(i[0], i[1]);
            return `${type} ${v} = ${cast(i[0], type)} + ${cast(i[1], type)};`;
        },
        execute: (i) => (i[0]||0) + (i[1]||0)
    },
    'Subtract': {
        type: 'Subtract', category: 'Math', title: 'Subtract',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}], outputs: [{id:'out', name:'Result', type:'any'}],
        glsl: (i, v) => {
            const type = resolveType(i[0], i[1]);
            return `${type} ${v} = ${cast(i[0], type)} - ${cast(i[1], type)};`;
        },
        execute: (i) => (i[0]||0) - (i[1]||0)
    },
    'Divide': {
        type: 'Divide', category: 'Math', title: 'Divide',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}], outputs: [{id:'out', name:'Result', type:'any'}],
        glsl: (i, v) => {
            const type = resolveType(i[0], i[1]);
            return `${type} ${v} = ${cast(i[0], type)} / (${cast(i[1], type)} + 0.0001);`;
        },
        execute: (i) => (i[0]||0) / ((i[1]||0) + 0.0001)
    },
    'Power': {
        type: 'Power', category: 'Math', title: 'Power',
        inputs: [{id:'base', name:'Base', type:'any'}, {id:'exp', name:'Exp', type:'float'}], outputs: [{id:'out', name:'Result', type:'any'}],
        glsl: (i, v) => {
            const type = getType(i[0]);
            return `${type} ${v} = pow(${cast(i[0], type)}, ${cast(i[1], type)});`;
        }
    },
    'Abs': {
        type: 'Abs', category: 'Math', title: 'Abs',
        inputs: [{id:'in', name:'In', type:'any'}], outputs: [{id:'out', name:'Out', type:'any'}],
        glsl: (i, v) => {
            const type = getType(i[0]);
            return `${type} ${v} = abs(${cast(i[0], type)});`;
        }
    },
    'Mix': {
        type: 'Mix', category: 'Math', title: 'Mix',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}, {id:'t', name:'T', type:'float'}], outputs: [{id:'out', name:'Result', type:'any'}],
        glsl: (i, v) => {
            const type = resolveType(i[0], i[1]);
            return `${type} ${v} = mix(${cast(i[0], type)}, ${cast(i[1], type)}, ${cast(i[2], 'float')});`;
        }
    },
    'SmoothStep': {
        type: 'SmoothStep', category: 'Math', title: 'SmoothStep',
        inputs: [{id:'e0', name:'Edge0', type:'float'}, {id:'e1', name:'Edge1', type:'float'}, {id:'x', name:'X', type:'float'}], outputs: [{id:'out', name:'Result', type:'float'}],
        glsl: (i, v) => `float ${v} = smoothstep(${cast(i[0], 'float')}, ${cast(i[1], 'float')}, ${cast(i[2], 'float')});`
    },
    
    // --- VECTOR OPS ---
    'DotProduct': {
        type: 'DotProduct', category: 'Vector', title: 'Dot',
        inputs: [{id:'a', name:'A', type:'vec3'}, {id:'b', name:'B', type:'vec3'}], outputs: [{id:'out', name:'Out', type:'float'}],
        glsl: (i, v) => `float ${v} = dot(${cast(i[0], 'vec3')}, ${cast(i[1], 'vec3')});`
    },
    'CrossProduct': {
        type: 'CrossProduct', category: 'Vector', title: 'Cross',
        inputs: [{id:'a', name:'A', type:'vec3'}, {id:'b', name:'B', type:'vec3'}], outputs: [{id:'out', name:'Out', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = cross(${cast(i[0], 'vec3')}, ${cast(i[1], 'vec3')});`
    },
    'Split': {
        type: 'Split', category: 'Vector', title: 'Split Vec3',
        inputs: [{id:'in', name:'In', type:'vec3'}], outputs: [{id:'x', name:'X', type:'float'}, {id:'y', name:'Y', type:'float'}, {id:'z', name:'Z', type:'float'}],
        glsl: (i, v) => `vec3 ${v} = ${cast(i[0], 'vec3')}; float ${v}_x = ${v}.x; float ${v}_y = ${v}.y; float ${v}_z = ${v}.z;`
    },
    'SplitVec2': {
        type: 'SplitVec2', category: 'Vector', title: 'Split Vec2',
        inputs: [{id:'in', name:'In', type:'vec2'}], outputs: [{id:'x', name:'X', type:'float'}, {id:'y', name:'Y', type:'float'}],
        glsl: (i, v) => `vec2 ${v} = ${cast(i[0], 'vec2')}; float ${v}_x = ${v}.x; float ${v}_y = ${v}.y;`
    },
    'Vec2ToVec3': {
        type: 'Vec2ToVec3', category: 'Vector', title: 'Vec2 -> Vec3',
        inputs: [{id:'in', name:'XY', type:'vec2'}, {id:'z', name:'Z', type:'float'}], outputs: [{id:'out', name:'Vec3', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = vec3(${cast(i[0], 'vec2')}, ${cast(i[1], 'float')});`
    },
    'MakeVec3': {
        type: 'MakeVec3', category: 'Vector', title: 'Make Vec3',
        inputs: [{id:'x', name:'X', type:'float'}, {id:'y', name:'Y', type:'float'}, {id:'z', name:'Z', type:'float'}], outputs: [{id:'out', name:'Vec3', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = vec3(${cast(i[0], 'float')}, ${cast(i[1], 'float')}, ${cast(i[2], 'float')});`,
        execute: (i) => ({ x: i[0]||0, y: i[1]||0, z: i[2]||0 })
    },
    'Vec2Scale': {
        type: 'Vec2Scale', category: 'Vector', title: 'Scale Vec2',
        inputs: [{id:'a', name:'Vec', type:'vec2'}, {id:'s', name:'Scale', type:'float'}], outputs: [{id:'out', name:'Result', type:'vec2'}],
        glsl: (i, v) => `vec2 ${v} = ${cast(i[0], 'vec2')} * ${cast(i[1], 'float')};`
    },
    'ModVec2': {
        type: 'ModVec2', category: 'Math', title: 'Mod Vec2',
        inputs: [{id:'a', name:'A', type:'vec2'}, {id:'b', name:'B', type:'float'}], outputs: [{id:'out', name:'Result', type:'vec2'}],
        glsl: (i, v) => `vec2 ${v} = mod(${cast(i[0], 'vec2')}, ${cast(i[1], 'float')});`
    },
    'Vec2Sub': {
        type: 'Vec2Sub', category: 'Math', title: 'Sub Vec2',
        inputs: [{id:'a', name:'A', type:'vec2'}, {id:'b', name:'B', type:'vec2'}], outputs: [{id:'out', name:'Result', type:'vec2'}],
        glsl: (i, v) => `vec2 ${v} = ${cast(i[0], 'vec2')} - ${cast(i[1], 'vec2')};`
    },
    'Vec2Distance': {
        type: 'Vec2Distance', category: 'Math', title: 'Dist Vec2',
        inputs: [{id:'a', name:'A', type:'vec2'}, {id:'b', name:'B', type:'vec2'}], outputs: [{id:'out', name:'Dist', type:'float'}],
        glsl: (i, v) => `float ${v} = distance(${cast(i[0], 'vec2')}, ${cast(i[1], 'vec2')});`
    },
    'ClampVec3': {
        type: 'ClampVec3', category: 'Math', title: 'Clamp Vec3',
        inputs: [{id:'in', name:'In', type:'vec3'}, {id:'min', name:'Min', type:'vec3'}, {id:'max', name:'Max', type:'vec3'}], outputs: [{id:'out', name:'Result', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = clamp(${cast(i[0], 'vec3')}, ${cast(i[1], 'vec3')}, ${cast(i[2], 'vec3')});`
    },
    'Vec3Scale': {
        type: 'Vec3Scale', category: 'Vector', title: 'Scale Vec3',
        inputs: [{id:'a', name:'Vec', type:'vec3'}, {id:'s', name:'Scale', type:'float'}], outputs: [{id:'out', name:'Result', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = ${cast(i[0], 'vec3')} * ${cast(i[1], 'float')};`,
        execute: (i) => ({ x: (i[0]?.x||0)*i[1], y: (i[0]?.y||0)*i[1], z: (i[0]?.z||0)*i[1] })
    },
    'Vec3Add': {
        type: 'Vec3Add', category: 'Vector', title: 'Add Vec3',
        inputs: [{id:'a', name:'A', type:'vec3'}, {id:'b', name:'B', type:'vec3'}], outputs: [{id:'out', name:'Result', type:'vec3'}],
        glsl: (i, v) => `vec3 ${v} = ${cast(i[0], 'vec3')} + ${cast(i[1], 'vec3')};`,
        execute: (i) => ({ x: (i[0]?.x||0)+(i[1]?.x||0), y: (i[0]?.y||0)+(i[1]?.y||0), z: (i[0]?.z||0)+(i[1]?.z||0) })
    },

    // --- EFFECTS ---
    'WaterDistortion': {
        type: 'WaterDistortion', category: 'Effects', title: 'Water Distortion',
        inputs: [
            { id: 'uv', name: 'UV', type: 'vec2' },
            { id: 'time', name: 'Time', type: 'float' },
            { id: 'normStr', name: 'Norm Str', type: 'float' },
            { id: 'distStr', name: 'Dist Str', type: 'float' }
        ],
        outputs: [{ id: 'rgb', name: 'Color', type: 'vec3' }],
        glsl: (i, v) => {
            const uv = i[0] || 'v_uv';
            const t = i[1] || '0.0';
            return `vec3 ${v} = vec3(0.0, 0.5, 1.0) + vec3(sin(${uv}.x * 20.0 + ${t}) * 0.1);`;
        }
    },
    'SimplexNoise': {
        type: 'SimplexNoise', category: 'Advanced', title: 'Simplex Noise',
        inputs: [{ id: 'pos', name: 'Pos', type: 'vec3' }, { id: 'scale', name: 'Scale', type: 'float' }, { id: 'time', name: 'Time', type: 'float' }],
        outputs: [{ id: 'out', name: 'Value', type: 'float' }],
        glsl: (i, v) => ({ 
            body: `float ${v} = snoise((${cast(i[0], 'vec3')} * ${cast(i[1], 'float')}) + vec3(${cast(i[2], 'float')}));`, 
            functions: snoise 
        })
    },

    // --- LOGIC ---
    'GreaterThan': {
        type: 'GreaterThan', category: 'Logic', title: 'A > B',
        inputs: [{id:'a', name:'A', type:'float'}, {id:'b', name:'B', type:'float'}], outputs: [{id:'out', name:'Bool', type:'boolean'}],
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

    // --- RIGGING ---
    'RigInput': {
        type: 'RigInput', category: 'Rigging', title: 'Input Pose',
        inputs: [], outputs: [{ id: 'pose', name: 'Pose', type: 'pose' }],
        execute: () => ({ type: 'PoseData' })
    },
    'RigOutput': {
        type: 'RigOutput', category: 'Rigging', title: 'Output Pose',
        inputs: [{ id: 'pose', name: 'Pose', type: 'pose' }], outputs: [],
        execute: () => {}
    },
    'GetBoneTransform': {
        type: 'GetBoneTransform', category: 'Rigging', title: 'Get Bone',
        inputs: [{ id: 'pose', name: 'Pose', type: 'pose' }],
        outputs: [{ id: 'pos', name: 'Position', type: 'vec3' }, { id: 'rot', name: 'Rotation', type: 'vec3' }, { id: 'scale', name: 'Scale', type: 'vec3' }],
        data: { bone: 'Bone001', space: 'Local' },
        execute: () => ({ pos: {x:0,y:0,z:0}, rot: {x:0,y:0,z:0}, scale: {x:1,y:1,z:1} })
    },
    'SetBoneTransform': {
        type: 'SetBoneTransform', category: 'Rigging', title: 'Set Bone',
        inputs: [{ id: 'pose', name: 'Pose', type: 'pose' }, { id: 'pos', name: 'Position', type: 'vec3' }, { id: 'rot', name: 'Rotation', type: 'vec3' }, { id: 'weight', name: 'Weight', type: 'float' }],
        outputs: [{ id: 'outPose', name: 'Pose', type: 'pose' }],
        data: { bone: 'Bone001', space: 'Local' },
        execute: (i) => i[0]
    },
    'TwoBoneIK': {
        type: 'TwoBoneIK', category: 'Rigging', title: 'Two Bone IK',
        inputs: [{ id: 'pose', name: 'Pose', type: 'pose' }, { id: 'target', name: 'Target', type: 'vec3' }, { id: 'pole', name: 'Pole Vector', type: 'vec3' }, { id: 'weight', name: 'Weight', type: 'float' }],
        outputs: [{ id: 'outPose', name: 'Pose', type: 'pose' }],
        data: { root: 'Thigh_L', mid: 'Calf_L', eff: 'Foot_L' },
        execute: (i) => i[0]
    },
    // New nodes for Static Mesh Rigging
    'GetEntityTransform': {
        type: 'GetEntityTransform', category: 'Rigging', title: 'Get Transform',
        inputs: [], // Implicit context
        outputs: [{ id: 'pos', name: 'Position', type: 'vec3' }, { id: 'rot', name: 'Rotation', type: 'vec3' }, { id: 'scale', name: 'Scale', type: 'vec3' }],
        execute: (i, data, context) => {
            if (context?.entityId && context?.ecs) {
                const proxy = context.ecs.createProxy(context.entityId, context.sceneGraph);
                if (proxy && proxy.components.Transform) {
                    return { 
                        pos: { ...proxy.components.Transform.position },
                        rot: { ...proxy.components.Transform.rotation },
                        scale: { ...proxy.components.Transform.scale }
                    };
                }
            }
            return { pos: {x:0,y:0,z:0}, rot: {x:0,y:0,z:0}, scale: {x:1,y:1,z:1} };
        }
    },
    'SetEntityTransform': {
        type: 'SetEntityTransform', category: 'Rigging', title: 'Set Transform',
        inputs: [{ id: 'pos', name: 'Position', type: 'vec3' }, { id: 'rot', name: 'Rotation', type: 'vec3' }, { id: 'scale', name: 'Scale', type: 'vec3' }],
        outputs: [{ id: 'out', name: 'Done', type: 'pose' }],
        execute: (i, data, context) => {
            if (context?.entityId && context?.ecs) {
                const proxy = context.ecs.createProxy(context.entityId, context.sceneGraph);
                if (proxy && proxy.components.Transform) {
                    if (i[0]) proxy.components.Transform.position = i[0];
                    if (i[1]) proxy.components.Transform.rotation = i[1];
                    if (i[2]) proxy.components.Transform.scale = i[2];
                }
            }
            return {};
        }
    },

    // --- ADVANCED ---
    'CustomExpression': {
        type: 'CustomExpression', category: 'Advanced', title: 'Custom Code',
        inputs: [{id:'a', name:'A', type:'any'}, {id:'b', name:'B', type:'any'}, {id:'time', name:'Time', type:'float'}],
        outputs: [{id:'out', name:'Result', type:'vec3'}],
        data: { code: 'result = vec3(0.0);' },
        glsl: (i, v, d) => {
            const code = d.code || 'result = vec3(0.0);';
            return `
            vec3 ${v};
            {
                vec3 a = ${cast(i[0], 'vec3')};
                vec3 b = ${cast(i[1], 'vec3')};
                float time = ${cast(i[2], 'float')};
                vec3 result;
                ${code}
                ${v} = result;
            }`;
        }
    },
    'ForLoop': {
        type: 'ForLoop', category: 'Advanced', title: 'For Loop',
        inputs: [{id:'count', name:'Count', type:'float'}, {id:'init', name:'Init', type:'vec3'}, {id:'a', name:'Param A', type:'vec3'}],
        outputs: [{id:'out', name:'Result', type:'vec3'}],
        data: { code: 'acc += a;' },
        glsl: (i, v, d) => {
            const count = i[0] || '1.0';
            const init = i[1] || 'vec3(0.0)';
            const paramA = i[2] || 'vec3(0.0)';
            const code = d.code || 'acc += a;';
            return `
            vec3 ${v};
            {
                vec3 acc = ${init};
                vec3 a = ${paramA};
                int c = int(${count});
                float time = u_time;
                for(int i=0; i<20; i++) { // Safety cap
                    if(i >= c) break;
                    float index = float(i);
                    ${code}
                }
                ${v} = acc;
            }`;
        }
    }
};
