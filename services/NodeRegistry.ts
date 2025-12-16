
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
  // Updated signature: can return a string (body only) or an object with global functions
  glsl?: (inputs: string[], id: string, data: any) => string | { functions: string; body: string };
}

const TYPE_COLORS: Record<DataType, string> = {
  float: '#9ca3af', vec2: '#a3e635', vec3: '#f59e0b', vec4: '#ec4899', mat4: '#8b5cf6', 
  stream: '#10b981', texture: '#ef4444', any: '#ffffff'
};

export const getTypeColor = (t: DataType) => TYPE_COLORS[t] || '#fff';

const formatFloat = (val: any) => {
    const s = String(val || '0');
    return s.includes('.') ? s : s + '.0';
};

export const NodeRegistry: Record<string, NodeDef> = {
  // --- SHADER SPECIFIC NODES ---

  'ShaderOutput': {
      type: 'ShaderOutput',
      category: 'Shader',
      title: 'Material Output',
      inputs: [
          { id: 'rgb', name: 'Base Color', type: 'vec3' },
          { id: 'offset', name: 'Vertex Offset', type: 'vec3', optional: true }
      ],
      outputs: [],
      execute: () => {}, 
      glsl: (inVars, id) => {
          // This node is special; the compiler handles the connections manually.
          // But if referenced directly, we can return empty.
          return '';
      }
  },

  'ForLoop': {
      type: 'ForLoop',
      category: 'Advanced',
      title: 'For Loop (GLSL)',
      inputs: [
          { id: 'count', name: 'Iterations', type: 'float' },
          { id: 'init', name: 'Init (acc)', type: 'vec3' },
          { id: 'a', name: 'Param A', type: 'vec3', optional: true },
          { id: 'b', name: 'Param B', type: 'vec3', optional: true }
      ],
      outputs: [{ id: 'out', name: 'Result', type: 'vec3' }],
      execute: () => ({ x: 0, y: 0, z: 0 }), // CPU not supported
      glsl: (inVars, id, data) => {
          const userCode = data?.code || 'acc += a + vec3(sin(index + time));';
          // Define function globally, call it in main
          const funcName = `${id}_func`;
          return {
              functions: `
                vec3 ${funcName}(int count, vec3 init, vec3 a, vec3 b, float time) {
                    vec3 acc = init;
                    for(int _iter=0; _iter<count; _iter++) {
                        float index = float(_iter);
                        // Available: acc, index, a, b, time
                        ${userCode}
                    }
                    return acc;
                }
              `,
              body: `vec3 ${id} = ${funcName}(int(${inVars[0]||'10'}), vec3(${inVars[1]||'0.0'}), vec3(${inVars[2]||'0.0'}), vec3(${inVars[3]||'0.0'}), u_time);`
          };
      }
  },

  'CustomExpression': {
      type: 'CustomExpression',
      category: 'Advanced',
      title: 'Custom Code',
      inputs: [
          { id: 'a', name: 'A (float)', type: 'float' },
          { id: 'b', name: 'B (vec3)', type: 'vec3' },
          { id: 'c', name: 'C (vec3)', type: 'vec3' },
          { id: 'time', name: 'Time', type: 'float' }
      ],
      outputs: [{ id: 'out', name: 'Result (vec3)', type: 'vec3' }],
      execute: () => ({ x: 0, y: 0, z: 0 }), 
      glsl: (inVars, id, data) => {
          const userCode = data?.code || `
            vec3 result = vec3(0.0);
            result = b * sin(a + time);
            return result;
          `;
          const funcName = `${id}_func`;
          return {
              functions: `
                vec3 ${funcName}(float a, vec3 b, vec3 arg_c, float time) {
                    ${userCode}
                }
              `,
              body: `vec3 ${id} = ${funcName}(${inVars[0]||'0.0'}, ${inVars[1]||'vec3(0.0)'}, ${inVars[2]||'vec3(0.0)'}, ${inVars[3]||'0.0'});`
          };
      }
  },

  'UV': {
      type: 'UV',
      category: 'Geometry',
      title: 'UV Coord',
      inputs: [],
      outputs: [{ id: 'uv', name: 'UV', type: 'vec2' }], 
      execute: () => ({ x:0, y:0 }), 
      glsl: (inVars, id) => `vec2 ${id} = v_uv;`
  },

  'WorldPosition': {
      type: 'WorldPosition',
      category: 'Geometry',
      title: 'World Position',
      inputs: [],
      outputs: [{ id: 'pos', name: 'Position', type: 'vec3' }],
      execute: () => ({ x:0, y:0, z:0 }),
      glsl: (v, id) => `vec3 ${id} = v_worldPos;`
  },

  'ObjectPosition': {
      type: 'ObjectPosition',
      category: 'Geometry',
      title: 'Object Position',
      inputs: [],
      outputs: [{ id: 'pos', name: 'Position', type: 'vec3' }],
      execute: () => ({ x:0, y:0, z:0 }),
      glsl: (v, id) => `vec3 ${id} = v_objectPos;`
  },

  'WorldNormal': {
      type: 'WorldNormal',
      category: 'Geometry',
      title: 'World Normal',
      inputs: [],
      outputs: [{ id: 'norm', name: 'Normal', type: 'vec3' }],
      execute: () => ({ x:0, y:1, z:0 }),
      glsl: (v, id) => `vec3 ${id} = normalize(v_normal);`
  },

  'VertexColor': {
      type: 'VertexColor',
      category: 'Geometry',
      title: 'Vertex Color',
      inputs: [],
      outputs: [{ id: 'col', name: 'Color', type: 'vec3' }],
      execute: () => ({ x:1, y:1, z:1 }),
      glsl: (v, id) => `vec3 ${id} = v_color;`
  },

  'CameraPosition': {
      type: 'CameraPosition',
      category: 'Input',
      title: 'Camera Position',
      inputs: [],
      outputs: [{ id: 'pos', name: 'Position', type: 'vec3' }],
      execute: () => ({ x:0, y:0, z:5 }),
      glsl: (v, id) => `vec3 ${id} = u_cameraPos;`
  },

  'ViewDirection': {
      type: 'ViewDirection',
      category: 'Geometry',
      title: 'View Direction',
      inputs: [],
      outputs: [{ id: 'dir', name: 'Direction', type: 'vec3' }],
      execute: () => ({ x:0, y:0, z:1 }),
      glsl: (v, id) => `vec3 ${id} = normalize(u_cameraPos - v_worldPos);`
  },

  'Split': {
      type: 'Split',
      category: 'Vector',
      title: 'Split (Vec3)',
      inputs: [{ id: 'in', name: 'Vec3', type: 'vec3' }],
      outputs: [
          { id: 'x', name: 'X', type: 'float' },
          { id: 'y', name: 'Y', type: 'float' },
          { id: 'z', name: 'Z', type: 'float' }
      ],
      execute: (i) => ({ x: i[0]?.x||0, y: i[0]?.y||0, z: i[0]?.z||0 }),
      glsl: (inVars, id) => {
          const v = inVars[0] || 'vec3(0.0)';
          return `
          float ${id}_x = ${v}.x;
          float ${id}_y = ${v}.y;
          float ${id}_z = ${v}.z; 
          `;
      }
  },

  'SplitVec2': {
      type: 'SplitVec2',
      category: 'Vector',
      title: 'Split (Vec2)',
      inputs: [{ id: 'in', name: 'Vec2', type: 'vec2' }],
      outputs: [
          { id: 'x', name: 'X', type: 'float' },
          { id: 'y', name: 'Y', type: 'float' }
      ],
      execute: (i) => ({ x: i[0]?.x||0, y: i[0]?.y||0 }),
      glsl: (inVars, id) => {
          const v = inVars[0] || 'vec2(0.0)';
          return `
          float ${id}_x = ${v}.x;
          float ${id}_y = ${v}.y;
          `;
      }
  },
  
  'Vec2ToVec3': {
      type: 'Vec2ToVec3',
      category: 'Vector',
      title: 'Vec2 -> Vec3',
      inputs: [
          { id: 'in', name: 'XY (Vec2)', type: 'vec2' },
          { id: 'z', name: 'Z (Float)', type: 'float', optional: true }
      ],
      outputs: [{ id: 'out', name: 'Vec3', type: 'vec3' }],
      execute: (i) => ({ x: i[0]?.x||0, y: i[0]?.y||0, z: i[1]||0 }),
      glsl: (inVars, id) => {
          return `vec3 ${id} = vec3(${inVars[0] || 'vec2(0.0)'}, ${inVars[1] || '0.0'});`;
      }
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
      execute: (i) => {
          // Simplified CPU Mix
          return { x: 0, y: 0, z: 0 }; 
      },
      glsl: (inVars, id) => `vec3 ${id} = mix(${inVars[0]||'vec3(0.0)'}, ${inVars[1]||'vec3(1.0)'}, ${inVars[2]||'0.5'});`
  },
  
  'DotProduct': {
      type: 'DotProduct',
      category: 'Vector',
      title: 'Dot Product',
      inputs: [
          { id: 'a', name: 'A', type: 'vec3' },
          { id: 'b', name: 'B', type: 'vec3' }
      ],
      outputs: [{ id: 'out', name: 'Dot', type: 'float' }],
      execute: (i) => 0, 
      glsl: (v, id) => `float ${id} = dot(${v[0]||'vec3(0)'}, ${v[1]||'vec3(0)'});`
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
        const str = val.toString();
        return `float ${id} = ${str.includes('.') ? str : str + '.0'};`;
    }
  },

  'Vec2': {
    type: 'Vec2',
    category: 'Input',
    title: 'Vector2',
    inputs: [
        { id: 'x', name: 'X', type: 'float' },
        { id: 'y', name: 'Y', type: 'float' }
    ],
    outputs: [{ id: 'out', name: 'Vec2', type: 'vec2' }],
    execute: (inputs, data) => ({ 
        x: inputs[0] ?? parseFloat(data?.x || '0'), 
        y: inputs[1] ?? parseFloat(data?.y || '0') 
    }),
    glsl: (inVars, id, data) => {
        const x = inVars[0] || formatFloat(data?.x);
        const y = inVars[1] || formatFloat(data?.y);
        return `vec2 ${id} = vec2(${x}, ${y});`;
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
    execute: (inputs, data) => ({ 
        x: inputs[0] ?? parseFloat(data?.x || '0'), 
        y: inputs[1] ?? parseFloat(data?.y || '0'), 
        z: inputs[2] ?? parseFloat(data?.z || '0') 
    }),
    glsl: (inVars, id, data) => {
        const x = inVars[0] || formatFloat(data?.x);
        const y = inVars[1] || formatFloat(data?.y);
        const z = inVars[2] || formatFloat(data?.z);
        return `vec3 ${id} = vec3(${x}, ${y}, ${z});`;
    }
  },

  // --- VEC2 MATH ---
  
  'Vec2Add': {
    type: 'Vec2Add', category: 'Vec2 Math', title: 'Add',
    inputs: [{ id: 'a', name: 'A', type: 'vec2' }, { id: 'b', name: 'B', type: 'vec2' }],
    outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
    execute: (i) => ({x:(i[0]?.x||0)+(i[1]?.x||0), y:(i[0]?.y||0)+(i[1]?.y||0)}),
    glsl: (v, id) => `vec2 ${id} = ${v[0]||'vec2(0)'} + ${v[1]||'vec2(0)'};`
  },
  'Vec2Sub': {
    type: 'Vec2Sub', category: 'Vec2 Math', title: 'Subtract',
    inputs: [{ id: 'a', name: 'A', type: 'vec2' }, { id: 'b', name: 'B', type: 'vec2' }],
    outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
    execute: (i) => ({x:(i[0]?.x||0)-(i[1]?.x||0), y:(i[0]?.y||0)-(i[1]?.y||0)}),
    glsl: (v, id) => `vec2 ${id} = ${v[0]||'vec2(0)'} - ${v[1]||'vec2(0)'};`
  },
  'Vec2Mul': {
    type: 'Vec2Mul', category: 'Vec2 Math', title: 'Multiply',
    inputs: [{ id: 'a', name: 'A', type: 'vec2' }, { id: 'b', name: 'B', type: 'vec2' }],
    outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
    execute: (i) => ({x:(i[0]?.x||0)*(i[1]?.x||0), y:(i[0]?.y||0)*(i[1]?.y||0)}),
    glsl: (v, id) => `vec2 ${id} = ${v[0]||'vec2(0)'} * ${v[1]||'vec2(1)'};`
  },
  'Vec2Divide': {
    type: 'Vec2Divide', category: 'Vec2 Math', title: 'Divide',
    inputs: [{ id: 'a', name: 'A', type: 'vec2' }, { id: 'b', name: 'B', type: 'vec2' }],
    outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
    execute: (i) => {
        const a = i[0] || {x:0,y:0};
        const b = i[1] || {x:1,y:1};
        return { x: a.x / (b.x || 1), y: a.y / (b.y || 1) };
    },
    glsl: (v, id) => `vec2 ${id} = ${v[0]||'vec2(0)'} / (${v[1]||'vec2(1)'} + 0.00001);`
  },
  'Vec2Scale': {
    type: 'Vec2Scale', category: 'Vec2 Math', title: 'Scale (Float)',
    inputs: [{ id: 'a', name: 'Vec', type: 'vec2' }, { id: 's', name: 'Scale', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
    execute: (i) => ({x:(i[0]?.x||0)*i[1], y:(i[0]?.y||0)*i[1]}),
    glsl: (v, id) => `vec2 ${id} = ${v[0]||'vec2(0)'} * ${v[1]||'1.0'};`
  },
  'Vec2Length': {
    type: 'Vec2Length', category: 'Vec2 Math', title: 'Length',
    inputs: [{ id: 'a', name: 'Vec', type: 'vec2' }],
    outputs: [{ id: 'out', name: 'Len', type: 'float' }],
    execute: (i) => Math.hypot(i[0]?.x||0, i[0]?.y||0),
    glsl: (v, id) => `float ${id} = length(${v[0]||'vec2(0)'});`
  },
  'Vec2Distance': {
    type: 'Vec2Distance', category: 'Vec2 Math', title: 'Distance',
    inputs: [{ id: 'a', name: 'A', type: 'vec2' }, { id: 'b', name: 'B', type: 'vec2' }],
    outputs: [{ id: 'out', name: 'Dist', type: 'float' }],
    execute: (i) => Math.hypot(i[0].x-i[1].x, i[0].y-i[1].y),
    glsl: (inVars, id) => `float ${id} = distance(${inVars[0] || 'vec2(0.0)'}, ${inVars[1] || 'vec2(0.0)'});`
  },
  'Vec2Sin': {
      type: 'Vec2Sin', category: 'Vec2 Math', title: 'Sine (Vec2)',
      inputs: [{ id: 'in', name: 'In', type: 'vec2' }],
      outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
      execute: (i) => ({ x: Math.sin(i[0]?.x||0), y: Math.sin(i[0]?.y||0) }),
      glsl: (v, id) => `vec2 ${id} = sin(${v[0] || 'vec2(0.0)'});`
  },
  'Vec2Cos': {
      type: 'Vec2Cos', category: 'Vec2 Math', title: 'Cosine (Vec2)',
      inputs: [{ id: 'in', name: 'In', type: 'vec2' }],
      outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
      execute: (i) => ({ x: Math.cos(i[0]?.x||0), y: Math.cos(i[0]?.y||0) }),
      glsl: (v, id) => `vec2 ${id} = cos(${v[0] || 'vec2(0.0)'});`
  },
  'ModVec2': {
      type: 'ModVec2',
      category: 'Vec2 Math',
      title: 'Modulo (Vec2)',
      inputs: [{ id: 'a', name: 'A', type: 'vec2' }, { id: 'b', name: 'B', type: 'float' }],
      outputs: [{ id: 'out', name: 'Out', type: 'vec2' }],
      execute: (i) => ({ x: (i[0]?.x||0)%(i[1]||1), y: (i[0]?.y||0)%(i[1]||1) }),
      glsl: (v, id) => `vec2 ${id} = mod(${v[0] || 'vec2(0.0)'}, ${v[1] || '1.0'});`
  },

  // --- SCALAR MATH ---

  'Sine': {
    type: 'Sine', category: 'Math', title: 'Sine',
    inputs: [{ id: 'in', name: 'In', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => Math.sin(inputs[0] || 0),
    glsl: (inVars, id) => `float ${id} = sin(${inVars[0] || '0.0'});`
  },

  'Cosine': {
    type: 'Cosine', category: 'Math', title: 'Cosine',
    inputs: [{ id: 'in', name: 'In', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => Math.cos(inputs[0] || 0),
    glsl: (inVars, id) => `float ${id} = cos(${inVars[0] || '0.0'});`
  },

  'Add': {
    type: 'Add', category: 'Math', title: 'Add (Float)',
    inputs: [{ id: 'a', name: 'A', type: 'float' }, { id: 'b', name: 'B', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => (inputs[0] || 0) + (inputs[1] || 0),
    glsl: (inVars, id) => `float ${id} = ${inVars[0] || '0.0'} + ${inVars[1] || '0.0'};`
  },

  'Subtract': {
    type: 'Subtract', category: 'Math', title: 'Subtract (Float)',
    inputs: [{ id: 'a', name: 'A', type: 'float' }, { id: 'b', name: 'B', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => (inputs[0] || 0) - (inputs[1] || 0),
    glsl: (inVars, id) => `float ${id} = ${inVars[0] || '0.0'} - ${inVars[1] || '0.0'};`
  },

  'Multiply': {
    type: 'Multiply', category: 'Math', title: 'Multiply (Float)',
    inputs: [{ id: 'a', name: 'A', type: 'float' }, { id: 'b', name: 'B', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => (inputs[0] || 0) * (inputs[1] || 0),
    glsl: (inVars, id) => `float ${id} = ${inVars[0] || '0.0'} * ${inVars[1] || '1.0'};`
  },

  'Divide': {
    type: 'Divide', category: 'Math', title: 'Divide (Float)',
    inputs: [{ id: 'a', name: 'A', type: 'float' }, { id: 'b', name: 'B', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => (inputs[0] || 0) / (inputs[1] || 1),
    glsl: (inVars, id) => `float ${id} = ${inVars[0] || '0.0'} / (${inVars[1] || '1.0'} + 0.00001);`
  },

  'Mod': {
      type: 'Mod', category: 'Math', title: 'Modulo',
      inputs: [{ id: 'a', name: 'A', type: 'float' }, { id: 'b', name: 'B', type: 'float' }],
      outputs: [{ id: 'out', name: 'Out', type: 'float' }],
      execute: (i) => (i[0] || 0) % (i[1] || 1),
      glsl: (v, id) => `float ${id} = mod(${v[0] || '0.0'}, ${v[1] || '1.0'});`
  },

  'Power': {
      type: 'Power', category: 'Math', title: 'Power',
      inputs: [{ id: 'base', name: 'Base', type: 'float' }, { id: 'exp', name: 'Exp', type: 'float' }],
      outputs: [{ id: 'out', name: 'Out', type: 'float' }],
      execute: (i) => Math.pow(i[0] || 0, i[1] || 1),
      glsl: (v, id) => `float ${id} = pow(${v[0] || '0.0'}, ${v[1] || '1.0'});`
  },

  'Abs': {
      type: 'Abs', category: 'Math', title: 'Absolute',
      inputs: [{ id: 'in', name: 'In', type: 'float' }],
      outputs: [{ id: 'out', name: 'Out', type: 'float' }],
      execute: (i) => Math.abs(i[0] || 0),
      glsl: (v, id) => `float ${id} = abs(${v[0] || '0.0'});`
  },

  'Clamp': {
      type: 'Clamp', category: 'Math', title: 'Clamp',
      inputs: [
          { id: 'in', name: 'In', type: 'float' },
          { id: 'min', name: 'Min', type: 'float' },
          { id: 'max', name: 'Max', type: 'float' }
      ],
      outputs: [{ id: 'out', name: 'Out', type: 'float' }],
      execute: (i) => Math.max(i[1]||0, Math.min(i[2]||1, i[0]||0)),
      glsl: (v, id) => `float ${id} = clamp(${v[0] || '0.0'}, ${v[1] || '0.0'}, ${v[2] || '1.0'});`
  },

  'SmoothStep': {
      type: 'SmoothStep', category: 'Math', title: 'SmoothStep',
      inputs: [{ id: 'e0', name: 'Edge0', type: 'float' }, { id: 'e1', name: 'Edge1', type: 'float' }, { id: 'x', name: 'X', type: 'float' }],
      outputs: [{ id: 'out', name: 'Out', type: 'float' }],
      execute: (inputs) => {
          const e0 = inputs[0] || 0; const e1 = inputs[1] || 1; const x = inputs[2] || 0;
          const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
          return t * t * (3 - 2 * t);
      },
      glsl: (inVars, id) => `float ${id} = smoothstep(${inVars[0] || '0.0'}, ${inVars[1] || '1.0'}, ${inVars[2] || '0.5'});`
  },
  
  // --- VEC3 MATH ---
  
  'Vec3Add': {
    type: 'Vec3Add', category: 'Vec3 Math', title: 'Add',
    inputs: [{ id: 'a', name: 'A', type: 'vec3' }, { id: 'b', name: 'B', type: 'vec3' }],
    outputs: [{ id: 'out', name: 'Out', type: 'vec3' }],
    execute: (i) => ({x:(i[0]?.x||0)+(i[1]?.x||0), y:(i[0]?.y||0)+(i[1]?.y||0), z:(i[0]?.z||0)+(i[1]?.z||0)}),
    glsl: (v, id) => `vec3 ${id} = ${v[0]||'vec3(0)'} + ${v[1]||'vec3(0)'};`
  },
  'Vec3Scale': {
    type: 'Vec3Scale', category: 'Vec3 Math', title: 'Scale (Float)',
    inputs: [{ id: 'a', name: 'Vec', type: 'vec3' }, { id: 's', name: 'Scale', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'vec3' }],
    execute: (i) => ({x:(i[0]?.x||0)*i[1], y:(i[0]?.y||0)*i[1], z:(i[0]?.z||0)*i[1]}),
    glsl: (v, id) => `vec3 ${id} = ${v[0]||'vec3(0)'} * ${v[1]||'1.0'};`
  },
  'ClampVec3': {
      type: 'ClampVec3', category: 'Vec3 Math', title: 'Clamp (Vec3)',
      inputs: [
          { id: 'in', name: 'In', type: 'vec3' },
          { id: 'min', name: 'Min', type: 'float' },
          { id: 'max', name: 'Max', type: 'float' }
      ],
      outputs: [{ id: 'out', name: 'Out', type: 'vec3' }],
      execute: (i) => {
          const min = i[1]||0, max = i[2]||1;
          const v = i[0] || {x:0, y:0, z:0};
          return {
              x: Math.max(min, Math.min(max, v.x)),
              y: Math.max(min, Math.min(max, v.y)),
              z: Math.max(min, Math.min(max, v.z))
          };
      },
      glsl: (v, id) => `vec3 ${id} = clamp(${v[0] || 'vec3(0.0)'}, ${v[1] || '0.0'}, ${v[2] || '1.0'});`
  },
  
  'WaterTurbulence': {
      type: 'WaterTurbulence', category: 'Effects', title: 'Water Turbulence (Code)',
      inputs: [{ id: 'uv', name: 'UV', type: 'vec2' }, { id: 'time', name: 'Time', type: 'float' }],
      outputs: [{ id: 'rgb', name: 'Color', type: 'vec3' }],
      execute: () => ({ x:0, y:0, z:1 }),
      glsl: (inVars, id) => {
        const uv = inVars[0] || 'v_uv';
        const time = inVars[1] || 'u_time';
        return `
        vec2 ${id}_uv = ${uv};
        float ${id}_time = ${time} * 0.5 + 23.0;
        
        vec2 ${id}_p = mod(${id}_uv.xy * 6.28318530718, 6.28318530718) - 250.0;
        vec2 ${id}_i = vec2(${id}_p);
        float ${id}_c = 1.0;
        float ${id}_inten = .005;

        for (int n = 0; n < 5; n++) 
        {
            float t = ${id}_time * (1.0 - (3.5 / float(n+1)));
            ${id}_i = ${id}_p + vec2(cos(t - ${id}_i.x) + sin(t + ${id}_i.y), sin(t - ${id}_i.y) + cos(t + ${id}_i.x));
            ${id}_c += 1.0/length(vec2(${id}_p.x / (sin(${id}_i.x+t)/${id}_inten),${id}_p.y / (cos(${id}_i.y+t)/${id}_inten)));
        }
        ${id}_c /= 5.0;
        ${id}_c = 1.17-pow(${id}_c, 1.4);
        vec3 ${id} = vec3(pow(abs(${id}_c), 8.0));
        ${id} = clamp(${id} + vec3(0.0, 0.35, 0.5), 0.0, 1.0);
        `;
      }
  },
  
  'WaterDistortion': {
      type: 'WaterDistortion',
      category: 'Effects',
      title: 'Water Distortion',
      inputs: [
          { id: 'uv', name: 'UV', type: 'vec2' },
          { id: 'time', name: 'Time', type: 'float' },
          { id: 'normStr', name: 'Normal Str', type: 'float' },
          { id: 'distStr', name: 'Distortion Str', type: 'float' }
      ],
      outputs: [{ id: 'rgb', name: 'Color', type: 'vec3' }],
      execute: () => ({ x:0, y:0, z:1 }),
      glsl: (inVars, id, data) => {
          const funcName = `heightToNormal_${id}`;
          // Default: Height=2 (Noise), Background=3 (Brick)
          const normalCh = data?.normalChannel || '2.0';
          const bgCh = data?.bgChannel || '3.0'; 
          
          return {
              functions: `
                  vec4 ${funcName}(vec2 uv, float strength, float texIdx) {
                      vec2 s = vec2(1.0/64.0, 1.0/64.0);
                      float p = texture(u_textures, vec3(uv, texIdx)).x;
                      float h1 = texture(u_textures, vec3(uv + s * vec2(1,0), texIdx)).x;
                      float v1 = texture(u_textures, vec3(uv + s * vec2(0,1), texIdx)).x;
                      vec2 xy = (p - vec2(h1, v1)) * strength;
                      return vec4(xy + .5, 1., 1.);
                  }
              `,
              body: `
                  vec2 ${id}_uv = ${inVars[0] || 'v_uv'};
                  float ${id}_t = ${inVars[1] || 'u_time'} * 0.06;
                  float ${id}_nStr = ${inVars[2] || '5.0'};
                  float ${id}_dStr = ${inVars[3] || '0.12'};
                  
                  vec4 ${id}_norm = ${funcName}(${id}_uv + ${id}_t, ${id}_nStr, ${normalCh});
                  vec2 ${id}_disp = clamp((${id}_norm.xy - 0.5) * ${id}_dStr, -1.0, 1.0);
                  
                  vec3 ${id} = texture(u_textures, vec3(${id}_uv + ${id}_t/6.0 + ${id}_disp, ${bgCh})).rgb;
                  ${id} *= vec3(0.8, 0.8, 1.0);
              `
          };
      }
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
  }
};