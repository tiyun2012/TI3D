
// services/NodeRegistry.ts

import type { Ti3DEngine } from './engine';
import { Mat4Utils } from './math';

export type DataType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'stream' | 'texture' | 'any';

export interface PortDef {
  id: string;
  name: string;
  type: DataType;
  color?: string;
  optional?: boolean;
}

export interface NodeDef {
  type: string;
  category: string;
  title: string;
  inputs: PortDef[];
  outputs: PortDef[];
  execute: (inputs: any[], data: any, engine: Ti3DEngine) => any;
  // New: GLSL Generation Code
  // inputs: array of variable names (e.g. "v_node1", "v_node2")
  // id: unique variable name for this node's output (e.g. "v_node3")
  glsl?: (inputs: string[], id: string, data: any) => string;
}

const TYPE_COLORS: Record<DataType, string> = {
  float: '#9ca3af', vec2: '#a3e635', vec3: '#f59e0b', vec4: '#ec4899', mat4: '#8b5cf6', 
  stream: '#10b981', texture: '#ef4444', any: '#ffffff'
};

export const getTypeColor = (t: DataType) => TYPE_COLORS[t] || '#fff';

export const NodeRegistry: Record<string, NodeDef> = {
  // --- SHADER SPECIFIC NODES ---

  'ShaderOutput': {
      type: 'ShaderOutput',
      category: 'Shader',
      title: 'Frag Color',
      inputs: [{ id: 'rgb', name: 'RGB', type: 'vec3' }],
      outputs: [],
      execute: () => {}, // No CPU execution
      glsl: (inVars, id) => `fragColor = vec4(${inVars[0] || 'vec3(1.0, 0.0, 1.0)'}, 1.0);`
  },

  'UV': {
      type: 'UV',
      category: 'Shader',
      title: 'UV Coord',
      inputs: [],
      outputs: [{ id: 'uv', name: 'UV', type: 'vec3' }], // vec3 for compatibility with Split (which assumes .z access safe)
      execute: () => ({ x:0, y:0, z:0 }), 
      glsl: (inVars, id) => `vec3 ${id} = vec3(v_uv, 0.0);`
  },

  'Split': {
      type: 'Split',
      category: 'Shader Math',
      title: 'Split',
      inputs: [{ id: 'in', name: 'Vec2/3/4', type: 'any' }],
      outputs: [
          { id: 'x', name: 'X', type: 'float' },
          { id: 'y', name: 'Y', type: 'float' },
          { id: 'z', name: 'Z', type: 'float' },
          { id: 'w', name: 'W', type: 'float' }
      ],
      execute: (i) => ({ x: i[0]?.x||0, y: i[0]?.y||0, z: i[0]?.z||0 }),
      glsl: (inVars, id) => {
          // Simplified for vec2/vec3 support. We rely on ShaderCompiler to append _x, _y etc. when connecting.
          const v = inVars[0] || 'vec3(0.0)';
          return `
          float ${id}_x = ${v}.x;
          float ${id}_y = ${v}.y;
          float ${id}_z = ${v}.z; 
          float ${id}_w = 0.0; // dummy
          `;
      }
  },

  'Fract': {
      type: 'Fract',
      category: 'Shader Math',
      title: 'Fract',
      inputs: [{ id: 'in', name: 'In', type: 'any' }], // Polymorphic ideally, treating as float/vec3
      outputs: [{ id: 'out', name: 'Out', type: 'any' }],
      execute: (i) => i[0] - Math.floor(i[0]),
      glsl: (inVars, id) => `vec3 ${id} = fract(${inVars[0] || 'vec3(0.0)'});` // Simplified to vec3 for prototype
  },

  'Mix': {
      type: 'Mix',
      category: 'Shader Math',
      title: 'Mix',
      inputs: [
          { id: 'a', name: 'A', type: 'vec3' },
          { id: 'b', name: 'B', type: 'vec3' },
          { id: 't', name: 'T', type: 'float' }
      ],
      outputs: [{ id: 'out', name: 'Out', type: 'vec3' }],
      execute: (i) => 0, 
      glsl: (inVars, id) => `vec3 ${id} = mix(${inVars[0]||'vec3(0.0)'}, ${inVars[1]||'vec3(1.0)'}, ${inVars[2]||'0.5'});`
  },

  // --- HYBRID NODES (CPU + GLSL) ---

  'Time': {
    type: 'Time',
    category: 'Input',
    title: 'Time',
    inputs: [],
    outputs: [{ id: 'out', name: 'Time', type: 'float' }],
    execute: (_, __, ___) => performance.now() / 1000,
    glsl: (inVars, id) => `float ${id} = u_time;`
  },

  'Float': {
    type: 'Float',
    category: 'Input',
    title: 'Float',
    inputs: [],
    outputs: [{ id: 'out', name: 'Value', type: 'float' }],
    execute: (_, data) => parseFloat(data?.value || '0'),
    glsl: (inVars, id, data) => {
        const val = parseFloat(data?.value || '0.0');
        // Force decimal point for floats
        const str = val.toString();
        return `float ${id} = ${str.includes('.') ? str : str + '.0'};`;
    }
  },

  'Vec3': {
    type: 'Vec3',
    category: 'Input',
    title: 'Vector3',
    inputs: [
        { id: 'x', name: 'X', type: 'float' },
        { id: 'y', name: 'Y', type: 'float' },
        { id: 'z', name: 'Z', type: 'float' }
    ],
    outputs: [{ id: 'out', name: 'Vec3', type: 'vec3' }],
    execute: (inputs) => ({ x: inputs[0]||0, y: inputs[1]||0, z: inputs[2]||0 }),
    glsl: (inVars, id) => `vec3 ${id} = vec3(${inVars[0]||'0.0'}, ${inVars[1]||'0.0'}, ${inVars[2]||'0.0'});`
  },

  'Sine': {
    type: 'Sine',
    category: 'Math',
    title: 'Sine',
    inputs: [{ id: 'in', name: 'In', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => Math.sin(inputs[0] || 0),
    glsl: (inVars, id) => `float ${id} = sin(${inVars[0] || '0.0'});`
  },

  'Cosine': {
    type: 'Cosine',
    category: 'Math',
    title: 'Cosine',
    inputs: [{ id: 'in', name: 'In', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => Math.cos(inputs[0] || 0),
    glsl: (inVars, id) => `float ${id} = cos(${inVars[0] || '0.0'});`
  },

  'Add': {
    type: 'Add',
    category: 'Math',
    title: 'Add',
    inputs: [
        { id: 'a', name: 'A', type: 'float' },
        { id: 'b', name: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => (inputs[0] || 0) + (inputs[1] || 0),
    glsl: (inVars, id) => `float ${id} = ${inVars[0] || '0.0'} + ${inVars[1] || '0.0'};`
  },

  'Multiply': {
    type: 'Multiply',
    category: 'Math',
    title: 'Multiply',
    inputs: [
        { id: 'a', name: 'A', type: 'float' },
        { id: 'b', name: 'B', type: 'float' }
    ],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => (inputs[0] || 0) * (inputs[1] || 0),
    glsl: (inVars, id) => `float ${id} = ${inVars[0] || '0.0'} * ${inVars[1] || '1.0'};`
  },
  
  'WaveViewer': {
      type: 'WaveViewer',
      category: 'Debug',
      title: 'Wave Viewer',
      inputs: [{ id: 'in', name: 'In', type: 'float' }],
      outputs: [],
      execute: (inputs) => inputs[0] 
  },

  // --- ECS / QUERY NODES (CPU ONLY) ---
  
  'AllEntities': {
    type: 'AllEntities',
    category: 'Query',
    title: 'All Entities',
    inputs: [],
    outputs: [{ id: 'out', name: 'Stream', type: 'stream' }],
    execute: (_, __, engine) => {
       const count = engine.ecs.count;
       const { isActive } = engine.ecs.store;
       const indices = new Int32Array(count); 
       let c = 0;
       for(let i=0; i<count; i++) if(isActive[i]) indices[c++] = i;
       return { indices: indices.subarray(0,c), count: c };
    }
  },

  'BatchApplyTransform': {
    type: 'BatchApplyTransform',
    category: 'Entity',
    title: 'Batch Apply Transform',
    inputs: [
        { id: 'entities', name: 'Entities', type: 'stream' },
        { id: 'pos', name: 'Position', type: 'vec3', optional: true },
        { id: 'rot', name: 'Rotation', type: 'vec3', optional: true },
        { id: 'scl', name: 'Scale', type: 'vec3', optional: true }
    ],
    outputs: [],
    execute: (inputs, data, engine) => {
        const stream = inputs[0];
        const pos = inputs[1];
        const rot = inputs[2];
        const scl = inputs[3];
        
        if (!stream?.indices) return;
        
        const { indices, count } = stream;
        const store = engine.ecs.store;
        
        for (let i = 0; i < count; i++) {
            const idx = indices[i];
            if (pos) store.setPosition(idx, pos.x, pos.y, pos.z);
            if (rot) store.setRotation(idx, rot.x, rot.y, rot.z);
            if (scl) store.setScale(idx, scl.x, scl.y, scl.z);
        }
    }
  },

  'GetTransformComponents': {
    type: 'GetTransformComponents',
    category: 'Entity',
    title: 'Get Transform',
    inputs: [{ id: 'id', name: 'Entity ID', type: 'any' }],
    outputs: [
      { id: 'pos', name: 'Pos', type: 'vec3' },
      { id: 'rot', name: 'Rot', type: 'vec3' },
      { id: 'scl', name: 'Scale', type: 'vec3' }
    ],
    execute: (inputs, data, engine) => {
        const id = inputs[0];
        if (typeof id !== 'string') return { pos: {x:0,y:0,z:0}, rot: {x:0,y:0,z:0}, scl: {x:1,y:1,z:1} };
        
        const idx = engine.ecs.idToIndex.get(id);
        if (idx === undefined) return { pos: {x:0,y:0,z:0}, rot: {x:0,y:0,z:0}, scl: {x:1,y:1,z:1} };
        
        const store = engine.ecs.store;
        return {
            pos: { x: store.posX[idx], y: store.posY[idx], z: store.posZ[idx] },
            rot: { x: store.rotX[idx], y: store.rotY[idx], z: store.rotZ[idx] },
            scl: { x: store.scaleX[idx], y: store.scaleY[idx], z: store.scaleZ[idx] }
        };
    }
  },

  // --- MATRIX MATH NODES ---
  
  'MatrixMultiply': {
    type: 'MatrixMultiply',
    category: 'Matrix',
    title: 'Multiply',
    inputs: [
      { id: 'a', name: 'A', type: 'mat4' },
      { id: 'b', name: 'B', type: 'mat4' }
    ],
    outputs: [{ id: 'out', name: 'Result', type: 'mat4' }],
    execute: (inputs) => {
      const a = inputs[0] || Mat4Utils.create();
      const b = inputs[1] || Mat4Utils.create();
      return Mat4Utils.multiply(a, b, Mat4Utils.create());
    }
  },
  
  'MatrixCompose': {
    type: 'MatrixCompose',
    category: 'Matrix',
    title: 'Compose',
    inputs: [
      { id: 'p', name: 'Pos', type: 'vec3' },
      { id: 'r', name: 'Rot', type: 'vec3' },
      { id: 's', name: 'Scl', type: 'vec3' }
    ],
    outputs: [{ id: 'out', name: 'Mat4', type: 'mat4' }],
    execute: (inputs) => {
      const p = inputs[0] || {x:0,y:0,z:0};
      const r = inputs[1] || {x:0,y:0,z:0};
      const s = inputs[2] || {x:1,y:1,z:1};
      return Mat4Utils.compose(p.x, p.y, p.z, r.x, r.y, r.z, s.x, s.y, s.z, Mat4Utils.create());
    }
  },

  'LookAtMatrix': {
    type: 'LookAtMatrix',
    category: 'Camera',
    title: 'Look At',
    inputs: [
      { id: 'eye', name: 'Eye', type: 'vec3' },
      { id: 'target', name: 'Target', type: 'vec3' },
      { id: 'up', name: 'Up', type: 'vec3' }
    ],
    outputs: [{ id: 'out', name: 'Mat4', type: 'mat4' }],
    execute: (inputs) => {
        const eye = inputs[0] || { x: 0, y: 0, z: 5 };
        const target = inputs[1] || { x: 0, y: 0, z: 0 };
        const up = inputs[2] || { x: 0, y: 1, z: 0 };
        return Mat4Utils.lookAt(eye, target, up, Mat4Utils.create());
    }
  }
};
