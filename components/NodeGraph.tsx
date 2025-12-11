
import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { GraphNode, GraphConnection } from '../types';
import { Icon } from './Icon';
import { engineInstance } from '../services/engine';
import { NodeRegistry, getTypeColor, NodeDef } from '../services/NodeRegistry';

// Constants
const GRID_SIZE = 20;
const NODE_WIDTH = 180;
const HEADER_HEIGHT = 36;
const PIN_HEIGHT = 24;

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
    // State
    const [nodes, setNodes] = useState<GraphNode[]>(INITIAL_NODES);
    const [connections, setConnections] = useState<GraphConnection[]>(INITIAL_CONNECTIONS);
    
    // Viewport Transform (CSS)
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    
    // Interaction
    const containerRef = useRef<HTMLDivElement>(null);
    const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
    const [panning, setPanning] = useState(false);
    const [connecting, setConnecting] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number } | null>(null);
    
    // Context Menu
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [searchFilter, setSearchFilter] = useState('');

    // --- Graph compilation ---
    useEffect(() => {
        engineInstance.compileGraph(nodes, connections);
    }, [nodes, connections]);

    // --- Viewport Logic ---
    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);
        
        const rect = containerRef.current?.getBoundingClientRect();
        if(!rect) return;

        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        setTransform(t => {
            const newK = Math.min(Math.max(t.k * zoom, 0.1), 5);
            return {
                x: mouseX - (mouseX - t.x) * (newK / t.k),
                y: mouseY - (mouseY - t.y) * (newK / t.k),
                k: newK
            };
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (e.button === 2) {
             setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
             return;
        }
        setContextMenu(null);
        if (e.button === 1 || (e.button === 0 && e.target === containerRef.current)) {
            setPanning(true);
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (panning) {
            setTransform(t => ({ ...t, x: t.x + e.movementX, y: t.y + e.movementY }));
        }
        if (draggingNodeId) {
            setNodes(prev => prev.map(n => n.id === draggingNodeId 
                ? { ...n, position: { x: n.position.x + e.movementX / transform.k, y: n.position.y + e.movementY / transform.k } } 
                : n
            ));
        }
        if (connecting) {
            // Update drag line end point (in screen space converted to local)
            const rect = containerRef.current?.getBoundingClientRect();
            if(rect) {
                setConnecting(prev => prev ? { ...prev, x: (e.clientX - rect.left - transform.x) / transform.k, y: (e.clientY - rect.top - transform.y) / transform.k } : null);
            }
        }
    };

    const handleMouseUp = () => {
        setPanning(false);
        setDraggingNodeId(null);
        setConnecting(null);
    };

    // --- Connection Logic ---
    const getPinPosition = (node: GraphNode, pinId: string, type: 'input'|'output') => {
        const def = NodeRegistry[node.type];
        if(!def) return { x: 0, y: 0 };
        
        const list = type === 'input' ? def.inputs : def.outputs;
        const index = list.findIndex(p => p.id === pinId);
        
        // Calculate offset
        // Header height + (Pin Height * Index) + (Pin Height / 2)
        const yOffset = HEADER_HEIGHT + (index * PIN_HEIGHT) + (PIN_HEIGHT / 2);
        
        return {
            x: node.position.x + (type === 'output' ? NODE_WIDTH : 0),
            y: node.position.y + yOffset
        };
    };

    const handlePinDown = (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        const rect = containerRef.current?.getBoundingClientRect();
        if(!rect) return;
        
        setConnecting({
            nodeId,
            pinId,
            type,
            x: (e.clientX - rect.left - transform.x) / transform.k,
            y: (e.clientY - rect.top - transform.y) / transform.k
        });
    };

    const handlePinUp = (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        if (connecting) {
            if (connecting.nodeId !== nodeId && connecting.type !== type) {
                // Valid connection
                const from = type === 'input' ? { node: connecting.nodeId, pin: connecting.pinId } : { node: nodeId, pin: pinId };
                const to = type === 'input' ? { node: nodeId, pin: pinId } : { node: connecting.nodeId, pin: connecting.pinId };
                
                // Prevent duplicate or double connections to same input
                const filtered = connections.filter(c => !(c.toNode === to.node && c.toPin === to.pin));
                
                setConnections([...filtered, {
                    id: crypto.randomUUID(),
                    fromNode: from.node, fromPin: from.pin,
                    toNode: to.node, toPin: to.pin
                }]);
            }
        }
        setConnecting(null);
    };

    const renderCurve = (x1: number, y1: number, x2: number, y2: number, color: string, active = false) => {
        const dist = Math.abs(x1 - x2) * 0.5;
        const d = `M ${x1} ${y1} C ${x1 + dist} ${y1} ${x2 - dist} ${y2} ${x2} ${y2}`;
        return (
            <g key={`${x1}-${y1}-${x2}-${y2}`}>
                <path d={d} stroke="transparent" strokeWidth="12" fill="none" className="hover:stroke-white/20 cursor-pointer" />
                <path d={d} stroke={color} strokeWidth={active ? 3 : 2} fill="none" />
            </g>
        );
    };

    // --- Node Spawn ---
    const spawnNode = (type: string) => {
        if(contextMenu && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            const x = (contextMenu.x - rect.left - transform.x) / transform.k;
            const y = (contextMenu.y - rect.top - transform.y) / transform.k;
            
            setNodes(prev => [...prev, { id: crypto.randomUUID(), type, position: {x, y}, data: {} }]);
            setContextMenu(null);
            setSearchFilter('');
        }
    };

    // --- Render ---

    // Filter registry for context menu
    const filteredRegistry = Object.values(NodeRegistry).filter(def => 
        def.title.toLowerCase().includes(searchFilter.toLowerCase())
    );

    return (
        <div 
            ref={containerRef}
            className="w-full h-full bg-[#111] overflow-hidden relative select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onContextMenu={e => e.preventDefault()}
        >
            {/* Grid Background (CSS Pattern) */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundSize: `${GRID_SIZE * transform.k}px ${GRID_SIZE * transform.k}px`,
                    backgroundPosition: `${transform.x}px ${transform.y}px`,
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)'
                }}
            />

            {/* Transformed Graph Container */}
            <div 
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0' }}
                className="w-full h-full"
            >
                {/* Connections Layer (SVG) */}
                <svg className="absolute top-0 left-0 w-1 h-1 overflow-visible pointer-events-none">
                    {connections.map(c => {
                        const fromNode = nodes.find(n => n.id === c.fromNode);
                        const toNode = nodes.find(n => n.id === c.toNode);
                        if(!fromNode || !toNode) return null;
                        
                        const p1 = getPinPosition(fromNode, c.fromPin, 'output');
                        const p2 = getPinPosition(toNode, c.toPin, 'input');
                        
                        // Color based on From Type
                        const def = NodeRegistry[fromNode.type];
                        const port = def?.outputs.find(p => p.id === c.fromPin);
                        const color = port?.color || getTypeColor(port?.type || 'any');

                        return renderCurve(p1.x, p1.y, p2.x, p2.y, color);
                    })}
                    {connecting && (() => {
                         const node = nodes.find(n => n.id === connecting.nodeId);
                         if(!node) return null;
                         const p1 = getPinPosition(node, connecting.pinId, connecting.type);
                         // Flip curvature if dragging from input
                         const p2 = { x: connecting.x, y: connecting.y };
                         
                         const def = NodeRegistry[node.type];
                         const list = connecting.type === 'input' ? def.inputs : def.outputs;
                         const port = list.find(p => p.id === connecting.pinId);
                         const color = port?.color || getTypeColor(port?.type || 'any');

                         return connecting.type === 'output' 
                            ? renderCurve(p1.x, p1.y, p2.x, p2.y, color, true)
                            : renderCurve(p2.x, p2.y, p1.x, p1.y, color, true);
                    })()}
                </svg>

                {/* Nodes Layer (Divs) */}
                {nodes.map(node => {
                    const def = NodeRegistry[node.type];
                    if(!def) return null;

                    return (
                        <div
                            key={node.id}
                            className={`absolute rounded-md shadow-xl border border-black flex flex-col pointer-events-auto transition-shadow hover:shadow-2xl
                                ${draggingNodeId === node.id ? 'ring-1 ring-blue-500 z-10' : ''}
                            `}
                            style={{ 
                                left: node.position.x, 
                                top: node.position.y,
                                width: NODE_WIDTH,
                                backgroundColor: '#1e1e1e' 
                            }}
                        >
                            {/* Header */}
                            <div 
                                className="h-9 px-3 flex items-center justify-between bg-white/5 border-b border-white/5 rounded-t-md cursor-grab active:cursor-grabbing"
                                onMouseDown={(e) => { e.stopPropagation(); setDraggingNodeId(node.id); }}
                            >
                                <span className="text-xs font-bold text-gray-200">{def.title}</span>
                            </div>

                            {/* Body */}
                            <div className="p-2 space-y-1">
                                {def.inputs.map(input => (
                                    <div key={input.id} className="relative h-6 flex items-center">
                                        <div 
                                            className="w-3 h-3 rounded-full border border-black hover:scale-125 transition-transform cursor-crosshair -ml-3.5 z-10"
                                            style={{ backgroundColor: input.color || getTypeColor(input.type) }}
                                            onMouseDown={(e) => handlePinDown(e, node.id, input.id, 'input')}
                                            onMouseUp={(e) => handlePinUp(e, node.id, input.id, 'input')}
                                        />
                                        <span className="text-[10px] text-gray-400 ml-2">{input.name}</span>
                                    </div>
                                ))}
                                {/* Custom Data Input (Simplified for Demo) */}
                                {def.type === 'Float' && (
                                     <input 
                                        type="number" 
                                        className="w-full bg-black/40 text-xs text-white px-1 rounded border border-white/10"
                                        value={node.data.value || 0}
                                        onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { value: e.target.value } } : n))}
                                        onMouseDown={e => e.stopPropagation()}
                                     />
                                )}
                                {def.type === 'Vec3' && (
                                     <div className="grid grid-cols-3 gap-1">
                                        {['x','y','z'].map(k => (
                                            <input key={k}
                                                type="number" className="w-full bg-black/40 text-[9px] text-white px-0.5 rounded border border-white/10"
                                                placeholder={k.toUpperCase()}
                                                value={node.data[k] || 0}
                                                onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { ...n.data, [k]: e.target.value } } : n))}
                                                onMouseDown={e => e.stopPropagation()}
                                            />
                                        ))}
                                     </div>
                                )}
                                {def.outputs.map(output => (
                                    <div key={output.id} className="relative h-6 flex items-center justify-end">
                                        <span className="text-[10px] text-gray-400 mr-2">{output.name}</span>
                                        <div 
                                            className="w-3 h-3 rounded-full border border-black hover:scale-125 transition-transform cursor-crosshair -mr-3.5 z-10"
                                            style={{ backgroundColor: output.color || getTypeColor(output.type) }}
                                            onMouseDown={(e) => handlePinDown(e, node.id, output.id, 'output')}
                                            onMouseUp={(e) => handlePinUp(e, node.id, output.id, 'output')}
                                        />
                                    </div>
                                ))}
                            </div>
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
                    <input 
                        autoFocus
                        placeholder="Search nodes..."
                        className="p-2 bg-[#1a1a1a] text-white outline-none border-b border-black/50"
                        value={searchFilter}
                        onChange={e => setSearchFilter(e.target.value)}
                    />
                    <div className="max-h-64 overflow-y-auto">
                        {filteredRegistry.map(def => (
                            <button 
                                key={def.type}
                                className="w-full text-left px-3 py-2 text-gray-300 hover:bg-blue-600 hover:text-white flex items-center justify-between group"
                                onClick={() => spawnNode(def.type)}
                            >
                                <span>{def.title}</span>
                                <span className="text-[10px] text-gray-500 group-hover:text-blue-200">{def.category}</span>
                            </button>
                        ))}
                        {filteredRegistry.length === 0 && <div className="p-2 text-gray-500 text-center">No nodes found</div>}
                    </div>
                </div>
            )}
            
            {/* Overlay Info */}
             <div className="absolute top-4 left-4 pointer-events-none">
                <div className="bg-black/80 text-white px-3 py-1.5 rounded text-xs backdrop-blur-md border border-white/10 shadow-lg">
                    <span className="text-gray-400">Split Brain Graph</span> <span className="text-green-400">Active</span>
                </div>
            </div>
        </div>
    );
};
