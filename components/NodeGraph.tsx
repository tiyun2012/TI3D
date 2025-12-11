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
    // State
    const [nodes, setNodes] = useState<GraphNode[]>(INITIAL_NODES);
    const [connections, setConnections] = useState<GraphConnection[]>(INITIAL_CONNECTIONS);
    const [transform, setTransform] = useState({ x: 0, y: 0, k: 1 });
    
    // Refs for High Performance Dragging
    const containerRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
    const hoverPathRefs = useRef<Map<string, SVGPathElement>>(new Map());
    
    const [connecting, setConnecting] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [searchFilter, setSearchFilter] = useState('');
    const [panning, setPanning] = useState(false);

    // --- Graph compilation ---
    useEffect(() => {
        engineInstance.compileGraph(nodes, connections);
    }, [nodes, connections]);

    // --- Helpers ---
    const getPinOffset = (nodeX: number, nodeY: number, pinId: string, type: 'input'|'output', nodeType: string) => {
        const def = NodeRegistry[nodeType];
        if(!def) return { x: 0, y: 0 };
        
        if (nodeType === 'Reroute') {
             return { x: nodeX + REROUTE_SIZE/2, y: nodeY + REROUTE_SIZE/2 };
        }

        const list = type === 'input' ? def.inputs : def.outputs;
        const index = list.findIndex(p => p.id === pinId);
        
        const yOffset = HEADER_HEIGHT + (index * PIN_HEIGHT) + (PIN_HEIGHT / 2);
        
        return {
            x: nodeX + (type === 'output' ? NODE_WIDTH : 0),
            y: nodeY + yOffset
        };
    };

    const calculateCurve = (x1: number, y1: number, x2: number, y2: number, reverse = false) => {
        const dist = Math.abs(x1 - x2) * 0.5;
        // If reverse (dragging input to output), flip curvature
        const cX1 = x1 + (reverse ? -dist : dist);
        const cX2 = x2 - (reverse ? -dist : dist);
        return `M ${x1} ${y1} C ${cX1} ${y1} ${cX2} ${y2} ${x2} ${y2}`;
    };

    // --- Viewport Pan/Zoom ---
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

    // --- Uncontrolled Dragging Logic ---
    const handleNodeMouseDown = (e: React.MouseEvent, node: GraphNode) => {
        e.stopPropagation();
        e.preventDefault(); // Prevent text selection
        
        const startMouseX = e.clientX;
        const startMouseY = e.clientY;
        const initNodeX = node.position.x;
        const initNodeY = node.position.y;
        
        // Caching connected lines
        const relatedConnections = connections.filter(c => c.fromNode === node.id || c.toNode === node.id);
        
        const handleWinMove = (ev: MouseEvent) => {
            const dx = (ev.clientX - startMouseX) / transform.k;
            const dy = (ev.clientY - startMouseY) / transform.k;
            const newX = initNodeX + dx;
            const newY = initNodeY + dy;

            // 1. Update Node DOM directly
            const el = nodeRefs.current.get(node.id);
            if(el) {
                el.style.left = `${newX}px`;
                el.style.top = `${newY}px`;
            }

            // 2. Update Related Connections DOM directly
            relatedConnections.forEach(c => {
                const isOutput = c.fromNode === node.id;
                const otherNodeId = isOutput ? c.toNode : c.fromNode;
                const otherNode = nodes.find(n => n.id === otherNodeId);
                
                // If we can't find the other node, we can't draw the line.
                // Note: If dragging multiple nodes, this simple logic might lag for the 'other' moving node.
                // For single node drag, 'otherNode' is static, so we use its react state position.
                if (!otherNode) return;

                const p1 = isOutput 
                    ? getPinOffset(newX, newY, c.fromPin, 'output', node.type)
                    : getPinOffset(otherNode.position.x, otherNode.position.y, c.fromPin, 'output', otherNode.type);
                
                const p2 = isOutput
                    ? getPinOffset(otherNode.position.x, otherNode.position.y, c.toPin, 'input', otherNode.type)
                    : getPinOffset(newX, newY, c.toPin, 'input', node.type);

                const d = calculateCurve(p1.x, p1.y, p2.x, p2.y);
                
                const pEl = pathRefs.current.get(c.id);
                if(pEl) pEl.setAttribute('d', d);
                const hEl = hoverPathRefs.current.get(c.id);
                if(hEl) hEl.setAttribute('d', d);
            });
        };

        const handleWinUp = (ev: MouseEvent) => {
            window.removeEventListener('mousemove', handleWinMove);
            window.removeEventListener('mouseup', handleWinUp);
            
            // Sync final position to React State
            const dx = (ev.clientX - startMouseX) / transform.k;
            const dy = (ev.clientY - startMouseY) / transform.k;
            const finalX = initNodeX + dx;
            const finalY = initNodeY + dy;
            
            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, position: { x: finalX, y: finalY } } : n));
        };

        window.addEventListener('mousemove', handleWinMove);
        window.addEventListener('mouseup', handleWinUp);
    };

    // --- Panning ---
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
        if (connecting) {
            const rect = containerRef.current?.getBoundingClientRect();
            if(rect) {
                setConnecting(prev => prev ? { ...prev, x: (e.clientX - rect.left - transform.x) / transform.k, y: (e.clientY - rect.top - transform.y) / transform.k } : null);
            }
        }
    };

    const handleMouseUp = () => {
        setPanning(false);
        setConnecting(null);
    };

    // --- Connections ---
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
                const from = type === 'input' ? { node: connecting.nodeId, pin: connecting.pinId } : { node: nodeId, pin: pinId };
                const to = type === 'input' ? { node: nodeId, pin: pinId } : { node: connecting.nodeId, pin: connecting.pinId };
                
                const exists = connections.some(c => c.toNode === to.node && c.toPin === to.pin);
                if (!exists) {
                    setConnections(prev => [...prev, {
                        id: crypto.randomUUID(),
                        fromNode: from.node, fromPin: from.pin,
                        toNode: to.node, toPin: to.pin
                    }]);
                }
            }
        }
        setConnecting(null);
    };

    // --- Spawning ---
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
            {/* Grid Pattern */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundSize: `${GRID_SIZE * transform.k}px ${GRID_SIZE * transform.k}px`,
                    backgroundPosition: `${transform.x}px ${transform.y}px`,
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)'
                }}
            />

            <div 
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0' }}
                className="w-full h-full"
            >
                {/* SVG Connections */}
                <svg className="absolute top-0 left-0 w-1 h-1 overflow-visible pointer-events-none">
                    {connections.map(c => {
                        const fromNode = nodes.find(n => n.id === c.fromNode);
                        const toNode = nodes.find(n => n.id === c.toNode);
                        if(!fromNode || !toNode) return null;
                        
                        const p1 = getPinOffset(fromNode.position.x, fromNode.position.y, c.fromPin, 'output', fromNode.type);
                        const p2 = getPinOffset(toNode.position.x, toNode.position.y, c.toPin, 'input', toNode.type);
                        const d = calculateCurve(p1.x, p1.y, p2.x, p2.y);
                        
                        const def = NodeRegistry[fromNode.type];
                        const port = def?.outputs.find(p => p.id === c.fromPin);
                        const color = port?.color || getTypeColor(port?.type || 'any');

                        return (
                            <g key={c.id}>
                                <path 
                                    ref={el => { if(el) hoverPathRefs.current.set(c.id, el) }}
                                    d={d} stroke="transparent" strokeWidth="12" fill="none" className="pointer-events-auto hover:stroke-white/20 cursor-pointer" 
                                />
                                <path 
                                    ref={el => { if(el) pathRefs.current.set(c.id, el) }}
                                    d={d} stroke={color} strokeWidth="2" fill="none" 
                                />
                            </g>
                        );
                    })}
                    {connecting && (() => {
                         const node = nodes.find(n => n.id === connecting.nodeId);
                         if(!node) return null;
                         const p1 = getPinOffset(node.position.x, node.position.y, connecting.pinId, connecting.type, node.type);
                         const p2 = { x: connecting.x, y: connecting.y };
                         
                         const def = NodeRegistry[node.type];
                         const list = connecting.type === 'input' ? def.inputs : def.outputs;
                         const port = list.find(p => p.id === connecting.pinId);
                         const color = port?.color || getTypeColor(port?.type || 'any');

                         return (
                            <path 
                                d={connecting.type === 'output' ? calculateCurve(p1.x, p1.y, p2.x, p2.y) : calculateCurve(p2.x, p2.y, p1.x, p1.y, true)} 
                                stroke={color} strokeWidth="2" fill="none" 
                            />
                         );
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
                            className={`absolute flex flex-col pointer-events-auto transition-shadow hover:shadow-2xl
                                ${isReroute ? '' : 'rounded-md shadow-xl border border-black bg-[#1e1e1e]'}
                            `}
                            style={{ 
                                left: node.position.x, 
                                top: node.position.y,
                                width: isReroute ? REROUTE_SIZE : NODE_WIDTH,
                                height: isReroute ? REROUTE_SIZE : 'auto'
                            }}
                        >
                            {/* Node Body */}
                            {isReroute ? (
                                <div 
                                    className="w-full h-full rounded-full bg-gray-400 hover:bg-white cursor-move border border-black"
                                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                    title="Reroute"
                                >
                                    {/* Invisible pin Hit Areas for Reroute */}
                                    <div 
                                        className="absolute inset-0 z-10"
                                        onMouseUp={(e) => handlePinUp(e, node.id, 'in', 'input')}
                                    />
                                    <div 
                                        className="absolute inset-0 z-10"
                                        onMouseDown={(e) => handlePinDown(e, node.id, 'out', 'output')}
                                    />
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
                                                    className="w-3 h-3 rounded-full border border-black hover:scale-125 transition-transform cursor-crosshair -ml-3.5 z-10"
                                                    style={{ backgroundColor: input.color || getTypeColor(input.type) }}
                                                    onMouseDown={(e) => handlePinDown(e, node.id, input.id, 'input')}
                                                    onMouseUp={(e) => handlePinUp(e, node.id, input.id, 'input')}
                                                />
                                                <span className="text-[10px] text-gray-400 ml-2">{input.name}</span>
                                            </div>
                                        ))}
                                        
                                        {/* Inline Controls (Simplified) */}
                                        {def.type === 'Float' && (
                                            <input 
                                                type="number" className="w-full bg-black/40 text-xs text-white px-1 rounded border border-white/10"
                                                value={node.data.value || 0}
                                                onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { value: e.target.value } } : n))}
                                                onMouseDown={e => e.stopPropagation()}
                                            />
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
                    <input 
                        autoFocus placeholder="Search nodes..."
                        className="p-2 bg-[#1a1a1a] text-white outline-none border-b border-black/50"
                        value={searchFilter} onChange={e => setSearchFilter(e.target.value)}
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
                    </div>
                </div>
            )}
        </div>
    );
};