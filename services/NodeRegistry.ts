
import { Ti3DEngine } from './engine';
import { Mat4Utils } from './math';

export type DataType = 'float' | 'vec3' | 'vec4' | 'stream' | 'texture' | 'any';

export interface PortDef {
  id: string;
  name: string;
  type: DataType;
  color?: string; // UI Color override
}

export interface NodeDef {
  type: string;
  category: string;
  title: string;
  inputs: PortDef[];
  outputs: PortDef[];
  // Logic executed by the engine. 
  // inputs = array of values resolved from upstream. 
  // data = internal node state (e.g. user entered float value).
  execute: (inputs: any[], data: any, engine: Ti3DEngine) => any;
}

const TYPE_COLORS: Record<DataType, string> = {
  float: '#9ca3af', // Gray
  vec3: '#f59e0b',  // Amber
  vec4: '#ec4899',  // Pink
  stream: '#10b981', // Emerald
  texture: '#ef4444', // Red
  any: '#ffffff'
};

export const getTypeColor = (t: DataType) => TYPE_COLORS[t] || '#fff';

// --- Registry Definitions ---

export const NodeRegistry: Record<string, NodeDef> = {
  // --- Query / ECS ---
  'AllEntities': {
    type: 'AllEntities',
    category: 'Query',
    title: 'All Entities',
    inputs: [],
    outputs: [{ id: 'out', name: 'Ptr Stream', type: 'stream' }],
    execute: (_, __, engine) => {
       const count = engine.ecs.count;
       const { isActive } = engine.ecs.store;
       // In a real scenario, cache this array
       const indices = new Int32Array(count); 
       let c = 0;
       for(let i=0; i<count; i++) if(isActive[i]) indices[c++] = i;
       return { indices: indices.subarray(0,c), count: c };
    }
  },

  // --- Logic / Actions ---
  'DrawAxes': {
    type: 'DrawAxes',
    category: 'Debug',
    title: 'Draw Axes',
    inputs: [{ id: 'in', name: 'Stream', type: 'stream' }],
    outputs: [],
    execute: (inputs, _, engine) => {
        const stream = inputs[0];
        if(!stream || !stream.indices) return;
        const { indices, count } = stream;
        const { posX, posY, posZ } = engine.ecs.store;
        
        for(let k=0; k<count; k++) {
            const i = indices[k];
            const x = posX[i], y = posY[i], z = posZ[i];
            engine.debugRenderer.drawLine({x,y,z}, {x:x+1,y,z}, {r:1,g:0,b:0});
            engine.debugRenderer.drawLine({x,y,z}, {x,y:y+1,z}, {r:0,g:1,b:0});
            engine.debugRenderer.drawLine({x,y,z}, {x,y,z:z+1}, {r:0,g:0,b:1});
        }
    }
  },

  // --- Input ---
  'Time': {
    type: 'Time',
    category: 'Input',
    title: 'Time',
    inputs: [],
    outputs: [{ id: 'out', name: 't', type: 'float' }],
    execute: (_, __, engine) => performance.now() / 1000
  },
  'Float': {
    type: 'Float',
    category: 'Input',
    title: 'Float Constant',
    inputs: [],
    outputs: [{ id: 'out', name: 'Val', type: 'float' }],
    execute: (_, data) => parseFloat(data?.value || 0)
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
    execute: (inputs, data) => {
        // Inputs might be connected, or fall back to data
        const x = inputs[0] ?? parseFloat(data?.x || 0);
        const y = inputs[1] ?? parseFloat(data?.y || 0);
        const z = inputs[2] ?? parseFloat(data?.z || 0);
        return { x, y, z };
    }
  },

  // --- Math ---
  'Sine': {
    type: 'Sine',
    category: 'Math',
    title: 'Sine',
    inputs: [{ id: 'in', name: 'In', type: 'float' }],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    execute: (inputs) => Math.sin(inputs[0] || 0)
  },
  'Add': {
    type: 'Add',
    category: 'Math',
    title: 'Add',
    inputs: [
        { id: 'a', name: 'A', type: 'any' },
        { id: 'b', name: 'B', type: 'any' }
    ],
    outputs: [{ id: 'out', name: 'Out', type: 'any' }],
    execute: (inputs) => {
        const a = inputs[0] || 0;
        const b = inputs[1] || 0;
        // Simple overloading support
        if (typeof a === 'number' && typeof b === 'number') return a + b;
        if (typeof a === 'object' && typeof b === 'object') return { x: a.x+b.x, y: a.y+b.y, z: a.z+b.z };
        return 0;
    }
  },
  'Vec3Split': {
    type: 'Vec3Split',
    category: 'Math',
    title: 'Split Vec3',
    inputs: [{ id: 'in', name: 'Vec3', type: 'vec3' }],
    outputs: [
        { id: 'x', name: 'X', type: 'float' },
        { id: 'y', name: 'Y', type: 'float' },
        { id: 'z', name: 'Z', type: 'float' }
    ],
    execute: (inputs) => {
        const v = inputs[0] || {x:0, y:0, z:0};
        return v; // Return the object, the engine resolves sub-keys
    }
  },
  
  // --- Wave Viewer (Special) ---
  'WaveViewer': {
      type: 'WaveViewer',
      category: 'Debug',
      title: 'Wave Viewer',
      inputs: [{ id: 'in', name: 'In', type: 'float' }],
      outputs: [],
      execute: (inputs) => inputs[0] // Pass through for generic usage, actual logic handled in UI for visual
  }
};
