import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GraphNode, GraphConnection } from '../types';
import { Icon } from './Icon';
import { engineInstance } from '../services/engine';
import { NodeRegistry, getTypeColor } from '../services/NodeRegistry';

// Constants
const GRID_SIZE = 20;
const NODE_WIDTH = 180;
const REROUTE_SIZE = 12;

const INITIAL_NODES: GraphNode[] = [
    { id: '1', type: 'Time', position: { x: 50, y: 100 } },
    { id: '2', type: 'Sine', position: { x: 280, y: 100 } },
    { id: '3', type: 'Float', position: { x: 50, y: 250 }, data: { value: 1.5 } },
    { id: '4', type: 'Add', position: { x: 500, y: 150 } },
    { id: '5', type: 'WaveViewer', position: { x: 750, y: 150 } }
];

const INITIAL_CONNECTIONS: GraphConnection[] = [
    { id: 'c1', fromNode: '1', fromPin: 'out', toNode: '2', toPin: 'in' },
    { id: 'c2', fromNode: '2', fromPin: 'out', toNode: '4', toPin: 'a' },
    { id: 'c3', fromNode: '3', fromPin: 'out', toNode: '4', toPin: 'b' },
    { id: 'c4', fromNode: '4', fromPin: 'out', toNode: '5', toPin: 'in' },
];

export const NodeGraph: React.FC = () => {
    const [nodes, setNodes] = useState<GraphNode[]>(INITIAL_NODES);
    const [connections, setConnections] = useState<GraphConnection[]>(INITIAL_CONNECTIONS);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    
    const containerRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
    
    const [connecting, setConnecting] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [searchFilter, setSearchFilter] = useState('');
    const [panning, setPanning] = useState(false);

    useEffect(() => {
        engineInstance.compileGraph(nodes, connections);
    }, [nodes, connections]);

    // --- Helpers ---

    const screenToGraph = (clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return {
            x: (clientX - rect.left - transform.x) / transform.k,
            y: (clientY - rect.top - transform.y) / transform.k
        };
    };

    // Robust math-based pin lookup. Matches CSS layout exactly to prevent visual jitter during zoom/pan.
    const getPinOffset = (nodeX: number, nodeY: number, nodeType: string, pinId: string, type: 'input'|'output') => {
        if (nodeType === 'Reroute') {
            return { x: nodeX + REROUTE_SIZE/2, y: nodeY + REROUTE_SIZE/2 };
        }
        
        const def = NodeRegistry[nodeType];
        if (!def) return { x: nodeX, y: nodeY };

        // Determine vertical stack index
        // Order: Inputs -> [Float Input] -> Outputs
        let index = 0;
        if (type === 'output') {
            index += def.inputs.length;
            if (nodeType === 'Float') index += 1;
            const outIdx = def.outputs.findIndex(p => p.id === pinId);
            index += outIdx !== -1 ? outIdx : 0;
        } else {
            const inIdx = def.inputs.findIndex(p => p.id === pinId);
            index += inIdx !== -1 ? inIdx : 0;
        }

        // Layout Constants (Tailwind & CSS Logic)
        const HEADER_HEIGHT = 36; // h-9
        const PADDING_TOP = 8;    // p-2 (top part)
        const ITEM_HEIGHT = 24;   // h-6
        const GAP = 4;            // space-y-1
        const BORDER = 1;         // border width (border-black)

        // Y Position: Top Border + Header + Body Padding + Stack Index * (Item + Gap) + Half Item
        const yOffset = BORDER + HEADER_HEIGHT + PADDING_TOP + (index * (ITEM_HEIGHT + GAP)) + (ITEM_HEIGHT / 2);
        
        // X Position:
        // Input: 1px (Border) - 6px (Pin Center Offset from Content Start) + 6px (Pin Radius) = 1px (Inside Left Border)
        // Output: NODE_WIDTH - 1px (Border) = 179px (Inside Right Border)
        const xOffset = type === 'output' ? (NODE_WIDTH - BORDER) : BORDER;

        return {
            x: nodeX + xOffset,
            y: nodeY + yOffset
        };
    };

    const calculateCurve = (x1: number, y1: number, x2: number, y2: number) => {
        const dist = Math.abs(x1 - x2) * 0.4; 
        const cX1 = x1 + Math.max(dist, 50); 
        const cX2 = x2 - Math.max(dist, 50);
        return `M ${x1} ${y1} C ${cX1} ${y1} ${cX2} ${y2} ${x2} ${y2}`;
    };

    // --- Interaction ---

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);
        const mouse = screenToGraph(e.clientX, e.clientY);

        setTransform(t => {
            const newK = Math.min(Math.max(t.k * zoom, 0.2), 3);
            return {
                x: e.clientX - containerRef.current!.getBoundingClientRect().left - (mouse.x * newK),
                y: e.clientY - containerRef.current!.getBoundingClientRect().top - (mouse.y * newK),
                k: newK
            };
        });
    };

    const handleNodeMouseDown = (e: React.MouseEvent, node: GraphNode) => {
        e.stopPropagation();
        const startMouse = { x: e.clientX, y: e.clientY };
        const startNodePos = { ...node.position };

        // Cache related connections for fast updates
        const connectedLines = connections
            .filter(c => c.fromNode === node.id || c.toNode === node.id)
            .map(c => {
                const isOutput = c.fromNode === node.id;
                const otherNodeId = isOutput ? c.toNode : c.fromNode;
                const otherNode = nodes.find(n => n.id === otherNodeId);
                
                // Calculate static offsets relative to the moving node
                const myPinPos = getPinOffset(node.position.x, node.position.y, node.type, isOutput ? c.fromPin : c.toPin, isOutput ? 'output' : 'input');
                const offsetX = myPinPos.x - startNodePos.x;
                const offsetY = myPinPos.y - startNodePos.y;

                // Calculate absolute pos of the other node's pin
                let otherPinPos = { x: 0, y: 0 };
                if (otherNode) {
                    otherPinPos = getPinOffset(otherNode.position.x, otherNode.position.y, otherNode.type, isOutput ? c.toPin : c.fromPin, isOutput ? 'input' : 'output');
                }

                return {
                    id: c.id,
                    isOutput, 
                    offsetX,
                    offsetY,
                    otherPinPos
                };
            });

        const handleWinMove = (ev: MouseEvent) => {
            const dx = (ev.clientX - startMouse.x) / transform.k;
            const dy = (ev.clientY - startMouse.y) / transform.k;
            const newX = startNodePos.x + dx;
            const newY = startNodePos.y + dy;

            // 1. Update Node Div directly (bypass React Render)
            const el = nodeRefs.current.get(node.id);
            if(el) {
                el.style.left = `${newX}px`;
                el.style.top = `${newY}px`;
            }

            // 2. Update Wires Imperatively
            connectedLines.forEach(link => {
                const pathEl = pathRefs.current.get(link.id);
                if(!pathEl) return;

                const movingPinX = newX + link.offsetX;
                const movingPinY = newY + link.offsetY;

                const start = link.isOutput ? { x: movingPinX, y: movingPinY } : link.otherPinPos;
                const end = link.isOutput ? link.otherPinPos : { x: movingPinX, y: movingPinY };

                pathEl.setAttribute('d', calculateCurve(start.x, start.y, end.x, end.y));
            });
        };

        const handleWinUp = (ev: MouseEvent) => {
            window.removeEventListener('mousemove', handleWinMove);
            window.removeEventListener('mouseup', handleWinUp);
            
            // Sync final position to React State
            const dx = (ev.clientX - startMouse.x) / transform.k;
            const dy = (ev.clientY - startMouse.y) / transform.k;
            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, position: { x: startNodePos.x + dx, y: startNodePos.y + dy } } : n));
        };

        window.addEventListener('mousemove', handleWinMove);
        window.addEventListener('mouseup', handleWinUp);
    };

    const handlePinDown = (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        const pos = screenToGraph(e.clientX, e.clientY);
        setConnecting({ nodeId, pinId, type, x: pos.x, y: pos.y });
    };

    const handlePinUp = (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        if (connecting && connecting.nodeId !== nodeId && connecting.type !== type) {
             const source = connecting.type === 'output' ? connecting : { nodeId, pinId };
             const target = connecting.type === 'input' ? connecting : { nodeId, pinId };
             
             // Check duplicates
             const exists = connections.some(c => c.fromNode === source.nodeId && c.fromPin === source.pinId && c.toNode === target.nodeId && c.toPin === target.pinId);
             if (!exists) {
                 const clean = connections.filter(c => !(c.toNode === target.nodeId && c.toPin === target.pinId));
                 setConnections([...clean, { id: crypto.randomUUID(), fromNode: source.nodeId, fromPin: source.pinId, toNode: target.nodeId, toPin: target.pinId }]);
             }
        }
        setConnecting(null);
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (panning) {
            setTransform(t => ({ ...t, x: t.x + e.movementX, y: t.y + e.movementY }));
        }
        if (connecting) {
            const pos = screenToGraph(e.clientX, e.clientY);
            setConnecting(prev => prev ? { ...prev, x: pos.x, y: pos.y } : null);
        }
    };

    // --- Render ---

    const addNode = (type: string) => {
         if(!contextMenu || !containerRef.current) return;
         const rect = containerRef.current.getBoundingClientRect();
         const pos = {
             x: (contextMenu.x - rect.left - transform.x) / transform.k,
             y: (contextMenu.y - rect.top - transform.y) / transform.k
         };
         setNodes(p => [...p, { id: crypto.randomUUID(), type, position: pos, data: {} }]);
         setContextMenu(null);
         setSearchFilter('');
    };

    return (
        <div 
            ref={containerRef}
            className="w-full h-full bg-[#111] overflow-hidden relative select-none"
            onWheel={handleWheel}
            onMouseDown={e => {
                if(e.button===0 || e.button===1) setPanning(true);
                if(e.button===2) setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
                else setContextMenu(null);
            }}
            onMouseMove={handleMouseMove}
            onMouseUp={() => { setPanning(false); setConnecting(null); }}
            onContextMenu={e => e.preventDefault()}
        >
             {/* Grid */}
             <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundSize: `${GRID_SIZE * transform.k}px ${GRID_SIZE * transform.k}px`,
                    backgroundPosition: `${transform.x}px ${transform.y}px`,
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)'
                }}
            />

            <div style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0' }} className="w-full h-full">
                
                {/* Wires */}
                <svg className="absolute top-0 left-0 w-1 h-1 overflow-visible pointer-events-none">
                    {connections.map(c => {
                        const fromNode = nodes.find(n => n.id === c.fromNode);
                        const toNode = nodes.find(n => n.id === c.toNode);
                        if(!fromNode || !toNode) return null;

                        // Use math-based offsets for stable rendering during transforms
                        const p1 = getPinOffset(fromNode.position.x, fromNode.position.y, fromNode.type, c.fromPin, 'output');
                        const p2 = getPinOffset(toNode.position.x, toNode.position.y, toNode.type, c.toPin, 'input');
                        const d = calculateCurve(p1.x, p1.y, p2.x, p2.y);
                        
                        const def = NodeRegistry[fromNode.type];
                        const port = def?.outputs.find(p => p.id === c.fromPin);
                        const color = port?.color || getTypeColor(port?.type || 'any');

                        return (
                            <path 
                                key={c.id} 
                                ref={el => { if(el) pathRefs.current.set(c.id, el) }} 
                                d={d} stroke={color} strokeWidth="2" fill="none" 
                            />
                        );
                    })}
                    
                    {connecting && (() => {
                         const node = nodes.find(n => n.id === connecting.nodeId);
                         if(!node) return null;
                         const p1 = getPinOffset(node.position.x, node.position.y, node.type, connecting.pinId, connecting.type);
                         const p2 = { x: connecting.x, y: connecting.y };
                         // Always Source -> Target
                         const start = connecting.type === 'output' ? p1 : p2;
                         const end = connecting.type === 'output' ? p2 : p1;
                         return <path d={calculateCurve(start.x, start.y, end.x, end.y)} stroke="#fff" strokeWidth="2" strokeDasharray="5,5" fill="none" />;
                    })()}
                </svg>

                {/* Nodes */}
                {nodes.map(node => {
                    const def = NodeRegistry[node.type];
                    if(!def) return null;
                    const isReroute = node.type === 'Reroute';
                    
                    return (
                        <div
                            key={node.id}
                            ref={el => { if(el) nodeRefs.current.set(node.id, el) }}
                            className={`absolute flex flex-col pointer-events-auto transition-shadow hover:shadow-2xl ${isReroute ? '' : 'rounded-md shadow-xl border border-black bg-[#1e1e1e]'}`}
                            style={{ 
                                left: node.position.x, top: node.position.y,
                                width: isReroute ? REROUTE_SIZE : NODE_WIDTH, 
                                height: isReroute ? REROUTE_SIZE : 'auto'
                            }}
                        >
                             {isReroute ? (
                                <div className="w-full h-full rounded-full bg-gray-400 hover:bg-white cursor-move border border-black"
                                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                >
                                    <div className="absolute inset-0 z-10" onMouseUp={(e) => handlePinUp(e, node.id, 'in', 'input')}/>
                                    <div className="absolute inset-0 z-10" onMouseDown={(e) => handlePinDown(e, node.id, 'out', 'output')}/>
                                </div>
                             ) : (
                                <>
                                    <div 
                                        className="h-9 px-3 flex items-center justify-between bg-white/5 border-b border-white/5 rounded-t-md cursor-grab active:cursor-grabbing"
                                        onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                    >
                                        <span className="text-xs font-bold text-gray-200">{def.title}</span>
                                    </div>
                                    <div className="p-2 space-y-1">
                                        {def.inputs.map(input => (
                                            <div key={input.id} className="relative h-6 flex items-center">
                                                <div 
                                                    id={`pin-${node.id}-input-${input.id}`}
                                                    className="w-3 h-3 rounded-full border border-black hover:scale-125 transition-transform cursor-crosshair -ml-3.5 z-10"
                                                    style={{ backgroundColor: input.color || getTypeColor(input.type) }}
                                                    onMouseDown={(e) => handlePinDown(e, node.id, input.id, 'input')}
                                                    onMouseUp={(e) => handlePinUp(e, node.id, input.id, 'input')}
                                                />
                                                <span className="text-[10px] text-gray-400 ml-2">{input.name}</span>
                                            </div>
                                        ))}
                                        
                                        {def.type === 'Float' && (
                                            <input 
                                                type="number" className="w-full h-6 bg-black/40 text-xs text-white px-1 rounded border border-white/10"
                                                value={node.data?.value || 0}
                                                onChange={(e) => setNodes(p => p.map(n => n.id===node.id ? {...n, data: {value: e.target.value}} : n))}
                                                onMouseDown={e => e.stopPropagation()}
                                            />
                                        )}

                                        {def.outputs.map(output => (
                                            <div key={output.id} className="relative h-6 flex items-center justify-end">
                                                <span className="text-[10px] text-gray-400 mr-2">{output.name}</span>
                                                <div 
                                                    id={`pin-${node.id}-output-${output.id}`}
                                                    className="w-3 h-3 rounded-full border border-black hover:scale-125 transition-transform cursor-crosshair -mr-3.5 z-10"
                                                    style={{ backgroundColor: output.color || getTypeColor(output.type) }}
                                                    onMouseDown={(e) => handlePinDown(e, node.id, output.id, 'output')}
                                                    onMouseUp={(e) => handlePinUp(e, node.id, output.id, 'output')}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </>
                             )}
                        </div>
                    );
                })}
            </div>

            {/* Context Menu */}
            {contextMenu && contextMenu.visible && (
                <div 
                    className="fixed w-48 bg-[#252525] border border-black shadow-2xl rounded text-xs flex flex-col z-50 overflow-hidden"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <input autoFocus placeholder="Search..." className="p-2 bg-[#1a1a1a] text-white outline-none border-b border-black/50" value={searchFilter} onChange={e => setSearchFilter(e.target.value)} />
                    <div className="max-h-64 overflow-y-auto">
                         {Object.values(NodeRegistry).filter(d => d.title.toLowerCase().includes(searchFilter.toLowerCase())).map(def => (
                             <button key={def.type} className="w-full text-left px-3 py-2 text-gray-300 hover:bg-blue-600 hover:text-white" onClick={() => addNode(def.type)}>{def.title}</button>
                         ))}
                    </div>
                </div>
            )}
        </div>
    );
};