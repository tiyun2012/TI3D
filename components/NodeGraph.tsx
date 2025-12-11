
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GraphNode, GraphConnection } from '../types';
import { Icon } from './Icon';
import { engineInstance } from '../services/engine';

// --- Node Definitions ---

const NODE_DEFINITIONS: Record<string, Partial<GraphNode>> = {
  // --- Data Logic Nodes (New) ---
  'AllEntities': {
      type: 'AllEntities',
      category: 'Logic',
      title: 'All Entities',
      inputs: [],
      outputs: [{ id: 'out', name: 'Entities', type: 'stream' }]
  },
  'DrawAxes': {
      type: 'DrawAxes',
      category: 'Logic',
      title: 'Draw Axes',
      inputs: [{ id: 'in', name: 'Entities', type: 'stream', defaultValue: null }],
      outputs: []
  },
  
  // --- Shader Nodes (Existing) ---
  'Master': {
    type: 'Master',
    category: 'Master',
    title: 'PBR Master',
    inputs: [
      { id: 'albedo', name: 'Albedo', type: 'vec3', defaultValue: '#ffffff' },
      { id: 'normal', name: 'Normal', type: 'vec3', defaultValue: [0.5, 0.5, 1] },
      { id: 'metallic', name: 'Metallic', type: 'float', defaultValue: 0 },
      { id: 'roughness', name: 'Roughness', type: 'float', defaultValue: 0.5 },
      { id: 'emission', name: 'Emission', type: 'vec3', defaultValue: '#000000' }
    ],
    outputs: []
  },
  'Add': {
    type: 'Math',
    category: 'Math',
    title: 'Add',
    inputs: [
      { id: 'a', name: 'A', type: 'dynamic', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'dynamic', defaultValue: 0 }
    ],
    outputs: [{ id: 'out', name: 'Out', type: 'dynamic' }]
  },
  'Multiply': {
    type: 'Math',
    category: 'Math',
    title: 'Multiply',
    inputs: [
      { id: 'a', name: 'A', type: 'dynamic', defaultValue: 1 },
      { id: 'b', name: 'B', type: 'dynamic', defaultValue: 1 }
    ],
    outputs: [{ id: 'out', name: 'Out', type: 'dynamic' }]
  },
  'Sine': {
    type: 'Math',
    category: 'Math',
    title: 'Sine',
    inputs: [
      { id: 'in', name: 'In', type: 'float', defaultValue: 0 }
    ],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }]
  },
  'Split': {
    type: 'Math',
    category: 'Vector',
    title: 'Split',
    inputs: [
      { id: 'in', name: 'In', type: 'vec4', defaultValue: [0,0,0,0] }
    ],
    outputs: [
      { id: 'r', name: 'R', type: 'float' },
      { id: 'g', name: 'G', type: 'float' },
      { id: 'b', name: 'B', type: 'float' },
      { id: 'a', name: 'A', type: 'float' }
    ]
  },
  'Combine': {
    type: 'Math',
    category: 'Vector',
    title: 'Combine',
    inputs: [
      { id: 'r', name: 'R', type: 'float', defaultValue: 0 },
      { id: 'g', name: 'G', type: 'float', defaultValue: 0 },
      { id: 'b', name: 'B', type: 'float', defaultValue: 0 }
    ],
    outputs: [
      { id: 'out', name: 'RGB', type: 'vec3' }
    ]
  },
  'Texture2D': {
    type: 'Texture',
    category: 'Input',
    title: 'Sample Texture 2D',
    inputs: [
      { id: 'uv', name: 'UV', type: 'vec2', defaultValue: [0,0] }
    ],
    outputs: [
      { id: 'rgba', name: 'RGBA', type: 'vec4' },
      { id: 'r', name: 'R', type: 'float' },
      { id: 'g', name: 'G', type: 'float' },
      { id: 'b', name: 'B', type: 'float' },
      { id: 'a', name: 'A', type: 'float' }
    ],
    data: { textureName: 'Texture_1' }
  },
  'Time': {
    type: 'Input',
    category: 'Input',
    title: 'Time',
    inputs: [],
    outputs: [{ id: 'out', name: 'Time', type: 'float' }]
  },
  'Color': {
    type: 'Input',
    category: 'Input',
    title: 'Color',
    inputs: [],
    outputs: [{ id: 'out', name: 'Out', type: 'vec3' }],
    data: { value: '#3b82f6' }
  },
  'Float': {
    type: 'Input',
    category: 'Input',
    title: 'Float',
    inputs: [],
    outputs: [{ id: 'out', name: 'Out', type: 'float' }],
    data: { value: 1.0 }
  },
  'GLSLView': {
    type: 'Utility',
    category: 'Utility',
    title: 'GLSL Source',
    inputs: [],
    outputs: [],
    data: { code: '' }
  },
  'WaveViewer': {
    type: 'Utility',
    category: 'Utility',
    title: 'Wave Viewer',
    inputs: [{ id: 'in', name: 'In', type: 'float', defaultValue: 0 }],
    outputs: [],
    data: {}
  }
};

const INITIAL_NODES: GraphNode[] = [
  {
    id: 'master_1',
    ...NODE_DEFINITIONS['Master'] as any,
    position: { x: 800, y: 100 }
  },
  // Wave Visualization Logic
  {
    id: 'time_1',
    ...NODE_DEFINITIONS['Time'] as any,
    position: { x: 50, y: 100 }
  },
  {
    id: 'sin_1',
    ...NODE_DEFINITIONS['Sine'] as any,
    position: { x: 250, y: 100 }
  },
  {
    id: 'add_1',
    ...NODE_DEFINITIONS['Add'] as any,
    position: { x: 250, y: 200 }
  },
  {
    id: 'wave_1',
    ...NODE_DEFINITIONS['WaveViewer'] as any,
    position: { x: 450, y: 50 }
  },
  // Split Logic Demo
  {
    id: 'color_1',
    ...NODE_DEFINITIONS['Color'] as any,
    position: { x: 50, y: 300 },
    data: { value: '#ff0000' }
  },
  {
    id: 'split_1',
    ...NODE_DEFINITIONS['Split'] as any,
    position: { x: 250, y: 300 }
  },
  {
    id: 'combine_1',
    ...NODE_DEFINITIONS['Combine'] as any,
    position: { x: 450, y: 300 }
  },
  {
    id: 'glsl_1',
    ...NODE_DEFINITIONS['GLSLView'] as any,
    position: { x: 800, y: 450 }
  }
];

const INITIAL_CONNECTIONS: GraphConnection[] = [
  { id: 'c1', fromNode: 'time_1', fromPin: 'out', toNode: 'sin_1', toPin: 'in' },
  { id: 'c2', fromNode: 'sin_1', fromPin: 'out', toNode: 'wave_1', toPin: 'in' },
  { id: 'c4', fromNode: 'color_1', fromPin: 'out', toNode: 'split_1', toPin: 'in' },
  { id: 'c5', fromNode: 'split_1', fromPin: 'r', toNode: 'combine_1', toPin: 'g' }, // Swapping channels for fun
  { id: 'c6', fromNode: 'combine_1', fromPin: 'out', toNode: 'master_1', toPin: 'albedo' },
];

// --- Runtime Evaluation Helper (For WaveViewer) ---
const evaluateNode = (
  nodeId: string, 
  nodes: GraphNode[], 
  connections: GraphConnection[], 
  time: number, 
  visited = new Set<string>()
): any => {
  if(visited.has(nodeId)) return 0; // Cycle protection
  visited.add(nodeId);

  const node = nodes.find(n => n.id === nodeId);
  if(!node) return 0;

  // Helper to get input value
  const getInput = (pinId: string, defaultValue: any) => {
    const conn = connections.find(c => c.toNode === nodeId && c.toPin === pinId);
    if(conn) {
      const val = evaluateNode(conn.fromNode, nodes, connections, time, new Set(visited));
      // Handle Pin Swizzling for Runtime
      if (typeof val === 'object' && val !== null) {
          if (conn.fromPin === 'r' || conn.fromPin === 'x') return val.x || val.r || 0;
          if (conn.fromPin === 'g' || conn.fromPin === 'y') return val.y || val.g || 0;
          if (conn.fromPin === 'b' || conn.fromPin === 'z') return val.z || val.b || 0;
          if (conn.fromPin === 'a' || conn.fromPin === 'w') return val.w || val.a || 0;
      }
      return val;
    }
    return defaultValue;
  };

  switch(node.title) {
    case 'Time': return time;
    case 'Float': return parseFloat(node.data?.value || 0);
    case 'Sine': return Math.sin(getInput('in', 0));
    case 'Add': return getInput('a', 0) + getInput('b', 0);
    case 'Multiply': return getInput('a', 1) * getInput('b', 1);
    case 'Wave Viewer': return getInput('in', 0);
    case 'Color': {
        const hex = node.data?.value || '#000000';
        const r = parseInt(hex.slice(1,3), 16)/255;
        const g = parseInt(hex.slice(3,5), 16)/255;
        const b = parseInt(hex.slice(5,7), 16)/255;
        return { r, g, b, a: 1 };
    }
    case 'Split': {
        const input = getInput('in', { r:0, g:0, b:0, a:0 });
        return input;
    }
    case 'Combine': {
        const r = getInput('r', 0);
        const g = getInput('g', 0);
        const b = getInput('b', 0);
        return { r, g, b, a: 1 };
    }
    default: return 0;
  }
};

// --- Wave Viewer Component ---
const WaveVisualizer = ({ nodeId, nodes, connections }: { nodeId: string, nodes: GraphNode[], connections: GraphConnection[] }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    
    useEffect(() => {
        let animId: number;
        const history: number[] = new Array(180).fill(0); // Store last 180 frames
        
        const loop = () => {
            const time = performance.now() / 1000;
            const result = evaluateNode(nodeId, nodes, connections, time);
            
            // Handle if result is vector vs float
            let value = 0;
            if (typeof result === 'number') value = result;
            else if (typeof result === 'object') value = result.r || result.x || 0;

            // Update History
            history.push(value);
            history.shift(); 

            // Draw
            const cvs = canvasRef.current;
            if(cvs) {
                const ctx = cvs.getContext('2d');
                if(ctx) {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0,0, cvs.width, cvs.height);
                    
                    // Grid
                    ctx.strokeStyle = '#222';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.moveTo(0, cvs.height/2);
                    ctx.lineTo(cvs.width, cvs.height/2);
                    ctx.stroke();

                    // Wave
                    ctx.beginPath();
                    ctx.strokeStyle = '#00ff00';
                    ctx.lineWidth = 2;
                    
                    // Visualize range [-2, 2] roughly
                    const range = 4.0; 
                    const center = cvs.height / 2;
                    
                    history.forEach((val, i) => {
                        const x = (i / history.length) * cvs.width;
                        const y = center - (val / range) * cvs.height;
                        if(i===0) ctx.moveTo(x, y);
                        else ctx.lineTo(x, y);
                    });
                    ctx.stroke();

                    // Text Value
                    ctx.fillStyle = '#00ff00';
                    ctx.font = '10px monospace';
                    ctx.fillText(value.toFixed(2), 4, 12);
                }
            }

            animId = requestAnimationFrame(loop);
        };
        animId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(animId);
    }, [nodes, connections, nodeId]);

    return <canvas ref={canvasRef} width={180} height={80} className="w-full h-20 bg-black rounded border border-gray-700 mt-1" />;
};

export const NodeGraph: React.FC = () => {
  const [nodes, setNodes] = useState<GraphNode[]>(INITIAL_NODES);
  const [connections, setConnections] = useState<GraphConnection[]>(INITIAL_CONNECTIONS);
  
  // Canvas State
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const canvasRef = useRef<HTMLDivElement>(null);

  // Interaction State
  const [isDraggingCanvas, setIsDraggingCanvas] = useState(false);
  const [dragNodeId, setDragNodeId] = useState<string | null>(null);
  const [tempConnection, setTempConnection] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number } | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  
  // Context Menu
  const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);

  // --- Compile Graph for Engine (Logic Nodes) ---
  useEffect(() => {
     engineInstance.updateGraph(nodes, connections);
  }, [nodes, connections]);

  // --- GLSL Generation Logic ---
  const generateGLSL = useMemo(() => {
    // ... existing GLSL generation logic (same as previous) ...
    const masterNode = nodes.find(n => n.type === 'Master');
    if (!masterNode) return "// No Master Node found";

    let lines: string[] = [];
    let declarations: string[] = [];
    let variableCount = 0;
    const visited = new Map<string, string>(); // NodeID -> VarName

    declarations.push("uniform float u_Time;");
    declarations.push("uniform sampler2D u_MainTex;");
    declarations.push("struct Input { vec2 uv; };");
    declarations.push("");

    function getVarName(nodeId: string) {
      if (visited.has(nodeId)) return visited.get(nodeId);
      const name = `v_${variableCount++}`;
      visited.set(nodeId, name);
      return name;
    }

    function resolveInput(targetNode: GraphNode, inputId: string, fallback: any): string {
      const conn = connections.find(c => c.toNode === targetNode.id && c.toPin === inputId);
      if (conn) {
        const sourceNode = nodes.find(n => n.id === conn.fromNode);
        if (sourceNode) {
          const varName = processNode(sourceNode, conn.fromPin);
          const pin = conn.fromPin;
          if (['r', 'g', 'b', 'a', 'x', 'y', 'z', 'w'].includes(pin)) {
              if (pin !== 'rgba') {
                   return `${varName}.${pin}`;
              }
          }
          return varName;
        }
      }
      if (typeof fallback === 'number') return `float(${fallback})`;
      if (typeof fallback === 'string' && fallback.startsWith('#')) {
         const r = parseInt(fallback.slice(1,3), 16)/255;
         const g = parseInt(fallback.slice(3,5), 16)/255;
         const b = parseInt(fallback.slice(5,7), 16)/255;
         return `vec3(${r.toFixed(3)}, ${g.toFixed(3)}, ${b.toFixed(3)})`;
      }
      if (Array.isArray(fallback)) {
        if (fallback.length === 2) return `vec2(${fallback.join(',')})`;
        if (fallback.length === 3) return `vec3(${fallback.join(',')})`;
        if (fallback.length === 4) return `vec4(${fallback.join(',')})`;
      }
      return '0.0';
    }

    function processNode(node: GraphNode, outputPinId: string = 'out'): string {
      if (visited.has(node.id)) return visited.get(node.id)!;

      const varName = getVarName(node.id)!;
      let code = "";

      switch (node.title) {
        case 'Add': {
          const a = resolveInput(node, 'a', 0);
          const b = resolveInput(node, 'b', 0);
          code = `vec3 ${varName} = ${a} + ${b};`; 
          break;
        }
        case 'Multiply': {
          const a = resolveInput(node, 'a', 1);
          const b = resolveInput(node, 'b', 1);
          code = `vec3 ${varName} = ${a} * ${b};`;
          break;
        }
        case 'Sine': {
          const i = resolveInput(node, 'in', 0);
          code = `float ${varName} = sin(${i});`;
          break;
        }
        case 'Sample Texture 2D': {
          code = `vec4 ${varName} = texture(u_MainTex, i.uv);`;
          break;
        }
        case 'Time': {
          code = `float ${varName} = u_Time;`;
          break;
        }
        case 'Color': {
          const col = resolveInput(node, 'dummy', node.data.value);
          code = `vec3 ${varName} = ${col};`;
          break;
        }
        case 'Float': {
          code = `float ${varName} = ${parseFloat(node.data.value).toFixed(3)};`;
          break;
        }
        case 'Split': {
          const val = resolveInput(node, 'in', [0,0,0,0]);
          code = `vec4 ${varName} = vec4(${val}, 1.0);`;
          break;
        }
        case 'Combine': {
            const r = resolveInput(node, 'r', 0);
            const g = resolveInput(node, 'g', 0);
            const b = resolveInput(node, 'b', 0);
            code = `vec3 ${varName} = vec3(${r}, ${g}, ${b});`;
            break;
        }
        case 'Wave Viewer': {
          const i = resolveInput(node, 'in', 0);
          code = `float ${varName} = ${i};`;
          break;
        }
        default:
           code = `// Unknown node ${node.title}`;
      }

      lines.push("  " + code);
      return varName;
    }

    lines.push("void surf(Input i, inout SurfaceOutputStandard o) {");
    const albedo = resolveInput(masterNode, 'albedo', '#ffffff');
    const emission = resolveInput(masterNode, 'emission', '#000000');
    lines.push(`  o.Albedo = ${albedo};`);
    lines.push(`  o.Emission = ${emission};`);
    lines.push(`  o.Alpha = 1.0;`);
    lines.push("}");

    return [...declarations, ...lines].join('\n');
  }, [nodes, connections]);

  // --- Interaction Handlers ---

  const handleWheel = (e: React.WheelEvent) => {
    // Zoom Logic
    const zoomSensitivity = 0.001;
    const newScale = Math.min(Math.max(0.1, scale - e.deltaY * zoomSensitivity), 5);
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if(!rect) return;
    
    // Mouse relative to canvas
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Calculate world position before zoom
    const worldX = (mouseX - offset.x) / scale;
    const worldY = (mouseY - offset.y) / scale;
    
    // Calculate new offset to keep world position under mouse
    const newOffsetX = mouseX - worldX * newScale;
    const newOffsetY = mouseY - worldY * newScale;
    
    setScale(newScale);
    setOffset({ x: newOffsetX, y: newOffsetY });
  };

  const handleMouseDown = (e: React.MouseEvent, nodeId?: string, pinId?: string, type?: 'input'|'output') => {
    if (e.button === 2) {
      e.preventDefault();
      // Right click menu (keep it screen space)
      setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
      return;
    }
    setContextMenu(null);

    // Middle Mouse or Space+Click or Background Click = Pan
    if (e.button === 1 || (e.button === 0 && !nodeId)) {
        e.preventDefault();
        setIsDraggingCanvas(true);
        return;
    }

    if (pinId && nodeId && type) {
      e.stopPropagation();
      setTempConnection({ nodeId, pinId, type, x: e.clientX, y: e.clientY });
    } else if (nodeId) {
      e.stopPropagation();
      setDragNodeId(nodeId);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    // Update raw mouse pos for temp connection rendering (screen space)
    const rect = canvasRef.current?.getBoundingClientRect();
    if(rect) {
         // We need mouse pos in World Space for connection end if we render it inside the scale div
         // But tempConnection is rendered in SVG inside scale div.
         // Let's store screen space mouse for general usage
         // and calculate world space inside render
    }
    setMousePos({ x: e.clientX, y: e.clientY });

    if (dragNodeId) {
      setNodes(prev => prev.map(n => {
        if (n.id === dragNodeId) {
          // Adjust delta by scale
          return { ...n, position: { x: n.position.x + e.movementX / scale, y: n.position.y + e.movementY / scale }};
        }
        return n;
      }));
    } else if (isDraggingCanvas) {
      setOffset(prev => ({ x: prev.x + e.movementX, y: prev.y + e.movementY }));
    }
  };

  const handleMouseUp = (e: React.MouseEvent, targetNodeId?: string, targetPinId?: string, targetType?: 'input'|'output') => {
    if (tempConnection && targetNodeId && targetPinId && targetType) {
      if (tempConnection.type !== targetType && tempConnection.nodeId !== targetNodeId) {
        const from = tempConnection.type === 'output' ? { node: tempConnection.nodeId, pin: tempConnection.pinId } : { node: targetNodeId, pin: targetPinId };
        const to = tempConnection.type === 'input' ? { node: tempConnection.nodeId, pin: tempConnection.pinId } : { node: targetNodeId, pin: targetPinId };
        
        const newConnections = connections.filter(c => !(c.toNode === to.node && c.toPin === to.pin));
        
        newConnections.push({
          id: crypto.randomUUID(),
          fromNode: from.node,
          fromPin: from.pin,
          toNode: to.node,
          toPin: to.pin
        });
        setConnections(newConnections);
      }
    }
    
    setIsDraggingCanvas(false);
    setDragNodeId(null);
    setTempConnection(null);
  };

  const addNode = (defKey: string, screenX: number, screenY: number) => {
    const def = NODE_DEFINITIONS[defKey];
    if (!def) return;
    
    // Convert Screen Coords to World Coords
    const canvasRect = canvasRef.current?.getBoundingClientRect();
    const localX = (screenX - (canvasRect?.left || 0) - offset.x) / scale;
    const localY = (screenY - (canvasRect?.top || 0) - offset.y) / scale;

    const newNode: GraphNode = {
      id: crypto.randomUUID(),
      ...def as any,
      position: { x: localX, y: localY },
      data: def.data ? JSON.parse(JSON.stringify(def.data)) : {}
    };
    setNodes(prev => [...prev, newNode]);
    setContextMenu(null);
  };

  const updateNodeData = (id: string, key: string, value: any) => {
    setNodes(prev => prev.map(n => n.id === id ? { ...n, data: { ...n.data, [key]: value } } : n));
  };

  // --- Rendering ---

  // Helper to convert Screen Mouse to Local Graph Space
  const getMouseInGraph = () => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if(!rect) return {x:0, y:0};
      return {
          x: (mousePos.x - rect.left - offset.x) / scale,
          y: (mousePos.y - rect.top - offset.y) / scale
      };
  };

  const renderConnectionPath = (c: GraphConnection | { fromNode: string, fromPin: string, endX: number, endY: number }) => {
    let startX, startY, endX, endY;

    if ('id' in c) {
      // Existing Connection
      const from = nodes.find(n => n.id === c.fromNode);
      const to = nodes.find(n => n.id === c.toNode);
      if (!from || !to) return null;
      
      const fromIdx = from.outputs.findIndex(o => o.id === c.fromPin);
      const toIdx = to.inputs.findIndex(i => i.id === c.toPin);
      
      startX = from.position.x + (from.title === 'Wave Viewer' ? 224 : 192); 
      startY = from.position.y + 42 + (fromIdx * 24); 
      endX = to.position.x;
      endY = to.position.y + 42 + (toIdx * 24);
    } else {
      // Temp Connection
      const from = nodes.find(n => n.id === c.fromNode);
      if (!from) return null;
       const fromIdx = from.outputs.findIndex(o => o.id === c.fromPin);
       startX = from.position.x + (from.title === 'Wave Viewer' ? 224 : 192);
       startY = from.position.y + 42 + (fromIdx * 24); 
       
       if (tempConnection?.type === 'input') {
         startX = c.endX;
         startY = c.endY;
         const n = nodes.find(n => n.id === tempConnection.nodeId);
         const pIdx = n?.inputs.findIndex(i => i.id === tempConnection.pinId) || 0;
         endX = n!.position.x;
         endY = n!.position.y + 42 + (pIdx * 24);
       } else {
         endX = c.endX;
         endY = c.endY;
       }
    }

    const dist = Math.abs(endX - startX) * 0.5;
    const path = `M ${startX} ${startY} C ${startX + dist} ${startY}, ${endX - dist} ${endY}, ${endX} ${endY}`;

    return <path d={path} stroke="#888" strokeWidth="2" fill="none" className="pointer-events-none" />;
  };

  const mouseGraphPos = getMouseInGraph();

  return (
    <div 
      ref={canvasRef}
      className="w-full h-full bg-[#111] relative overflow-hidden cursor-crosshair"
      onMouseDown={(e) => handleMouseDown(e)}
      onMouseMove={handleMouseMove}
      onMouseUp={(e) => handleMouseUp(e)}
      onWheel={handleWheel}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Dynamic Grid */}
      <div 
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)',
          backgroundSize: `${20 * scale}px ${20 * scale}px`,
          backgroundPosition: `${offset.x}px ${offset.y}px`
        }}
      />

      {/* Scaled Content Container */}
      <div 
        className="absolute inset-0 origin-top-left"
        style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})` }}
      >
        {/* SVG Layer for Connections */}
        <svg className="absolute w-[50000px] h-[50000px] pointer-events-none overflow-visible" style={{ left: -25000, top: -25000 }}>
            <g transform="translate(25000, 25000)">
                {connections.map(c => <g key={c.id}>{renderConnectionPath(c)}</g>)}
                {tempConnection && tempConnection.type === 'output' && renderConnectionPath({
                    fromNode: tempConnection.nodeId, 
                    fromPin: tempConnection.pinId, 
                    endX: mouseGraphPos.x, 
                    endY: mouseGraphPos.y 
                })}
                {tempConnection && tempConnection.type === 'input' && renderConnectionPath({
                    fromNode: tempConnection.nodeId, 
                    fromPin: tempConnection.pinId, 
                    endX: mouseGraphPos.x, 
                    endY: mouseGraphPos.y 
                })}
            </g>
        </svg>

        {/* Nodes */}
        {nodes.map(node => (
          <div
            key={node.id}
            className={`absolute w-48 rounded shadow-xl border pointer-events-auto flex flex-col transition-shadow hover:shadow-2xl
              ${node.category === 'Logic' ? 'border-purple-600 bg-[#252030]' : 
                node.type === 'Master' ? 'border-gray-500 bg-[#1a1a1a]' : 'border-black bg-[#252525]'}
              ${node.type === 'Utility' ? 'w-96' : ''}
              ${node.title === 'Wave Viewer' ? 'w-56' : ''}
              ${dragNodeId === node.id ? 'ring-2 ring-blue-500 z-10' : ''}
            `}
            style={{ left: node.position.x, top: node.position.y }}
            onMouseDown={(e) => handleMouseDown(e, node.id)}
          >
            {/* Header */}
            <div className={`px-2 py-1 text-xs font-bold text-gray-200 border-b border-black rounded-t select-none
                ${node.category === 'Logic' ? 'bg-purple-900/50' : ''}
                ${node.category === 'Math' ? 'bg-blue-900/50' : ''}
                ${node.category === 'Input' ? 'bg-red-900/50' : ''}
                ${node.category === 'Vector' ? 'bg-purple-900/50' : ''}
                ${node.category === 'Master' ? 'bg-gray-700' : ''}
                ${node.title === 'Wave Viewer' ? 'bg-green-900/50' : ''}
            `}>
              {node.title}
            </div>

            {/* Body */}
            {node.title === 'GLSL Source' ? (
                <div className="p-2 font-mono text-[10px] text-green-400 bg-black overflow-auto max-h-64" onMouseDown={e => e.stopPropagation()}>
                    <pre>{generateGLSL}</pre>
                </div>
            ) : (
            <div className="p-2 space-y-2">
              {/* Inputs */}
              {node.inputs.map(input => {
                const isConnected = connections.some(c => c.toNode === node.id && c.toPin === input.id);
                return (
                    <div key={input.id} className="relative flex items-center h-5">
                    {/* Pin Circle */}
                    <div 
                        className={`w-2 h-2 rounded-full hover:bg-white cursor-pointer -ml-3 mr-2 border border-black ${input.type === 'stream' ? 'bg-purple-500' : 'bg-gray-500'}`}
                        onMouseDown={(e) => handleMouseDown(e, node.id, input.id, 'input')}
                        onMouseUp={(e) => handleMouseUp(e, node.id, input.id, 'input')}
                    />
                    <span className="text-[10px] text-gray-300 mr-2 select-none">{input.name}</span>
                    
                    {/* Inline Editor */}
                    {!isConnected && input.type !== 'vec3' && input.type !== 'vec2' && input.type !== 'vec4' && input.type !== 'stream' && (
                        <div className="flex-1">
                            {node.title === 'Color' && input.id === 'dummy' ? null : 
                             node.title === 'Float' ? 
                                <input 
                                    type="number" 
                                    className="w-full bg-[#111] text-[10px] px-1 rounded border border-gray-700 text-gray-300 outline-none focus:border-blue-500" 
                                    value={node.data?.value || 0}
                                    onChange={(e) => updateNodeData(node.id, 'value', e.target.value)}
                                    onMouseDown={e => e.stopPropagation()}
                                /> 
                             : null
                            }
                        </div>
                    )}
                     {node.title === 'Color' && !isConnected && (
                        <input 
                            type="color" 
                            value={node.data?.value || '#ffffff'} 
                            onChange={(e) => updateNodeData(node.id, 'value', e.target.value)}
                            className="w-8 h-4 bg-transparent border-none cursor-pointer"
                            onMouseDown={e => e.stopPropagation()}
                        />
                    )}
                    </div>
                );
              })}

              {/* Outputs */}
              {node.outputs.map(output => (
                <div key={output.id} className="relative flex items-center justify-end h-5">
                  <span className="text-[10px] text-gray-300 mr-2 select-none">{output.name}</span>
                  <div 
                    className={`w-2 h-2 rounded-full hover:bg-white cursor-pointer -mr-3 border border-black ${output.type === 'stream' ? 'bg-purple-500' : 'bg-gray-500'}`}
                    onMouseDown={(e) => handleMouseDown(e, node.id, output.id, 'output')}
                    onMouseUp={(e) => handleMouseUp(e, node.id, output.id, 'output')}
                  />
                </div>
              ))}
              
              {/* Preview Image for Texture */}
              {node.type === 'Texture' && (
                  <div className="mt-2 w-24 h-24 bg-gray-800 border border-gray-600 rounded mx-auto flex items-center justify-center">
                      <Icon name="Image" className="text-gray-600" />
                  </div>
              )}

              {/* Wave Visualizer */}
              {node.title === 'Wave Viewer' && (
                  <WaveVisualizer nodeId={node.id} nodes={nodes} connections={connections} />
              )}
            </div>
            )}
          </div>
        ))}
      </div>
      
      {/* Context Menu */}
      {contextMenu && contextMenu.visible && (
        <div 
            className="fixed bg-[#2a2a2a] border border-black shadow-2xl rounded w-40 py-1 z-50 text-xs"
            style={{ left: contextMenu.x, top: contextMenu.y }}
        >
            <div className="px-2 py-1 text-gray-500 font-bold bg-[#1a1a1a]">Create Node</div>
            {Object.keys(NODE_DEFINITIONS).map(key => (
                <button 
                    key={key}
                    className="w-full text-left px-4 py-1.5 hover:bg-blue-600 text-gray-200"
                    onClick={() => addNode(key, contextMenu.x, contextMenu.y)}
                >
                    {NODE_DEFINITIONS[key].title}
                </button>
            ))}
        </div>
      )}

      {/* Overlay UI */}
      <div className="absolute top-4 left-4 pointer-events-none">
         <div className="bg-black/70 text-white px-3 py-1 rounded text-sm backdrop-blur-sm border border-white/10 shadow-lg">
            Shader & Logic Graph
         </div>
         <div className="text-[10px] text-gray-400 mt-1 bg-black/50 p-1 rounded inline-block">
            Try adding "All Entities" and connecting to "Draw Axes"
         </div>
      </div>

    </div>
  );
};
