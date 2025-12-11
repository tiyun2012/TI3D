import React, { useState, useRef, useEffect, useMemo } from 'react';
import { GraphNode, GraphConnection } from '../types';
import { Icon } from './Icon';
import { engineInstance } from '../services/engine';
import { NodeRegistry, getTypeColor } from '../services/NodeRegistry';

// Constants for fallback only
const GRID_SIZE = 20;
const NODE_WIDTH = 180;
const REROUTE_SIZE = 12;

// ... (Keep INITIAL_NODES and INITIAL_CONNECTIONS as they were) ...
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
    
    // Interaction State
    const [connecting, setConnecting] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [searchFilter, setSearchFilter] = useState('');
    const [panning, setPanning] = useState(false);

    useEffect(() => {
        engineInstance.compileGraph(nodes, connections);
    }, [nodes, connections]);

    // --- 1. Coordinate System Helper ---
    // Converts a Screen Pixel coordinate (clientX/Y) to Graph Space (Node X/Y)
    const screenToGraph = (clientX: number, clientY: number) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return { x: 0, y: 0 };
        return {
            x: (clientX - rect.left - transform.x) / transform.k,
            y: (clientY - rect.top - transform.y) / transform.k
        };
    };

    // --- 2. Dynamic Port Positioning ---
    // Finds the real DOM center of a pin. If not rendered, falls back to estimation.
    const getPinPosition = (node: GraphNode, pinId: string, type: 'input'|'output') => {
        // Try to find the DOM element
        const elementId = `pin-${node.id}-${type}-${pinId}`;
        const el = document.getElementById(elementId);

        if (el && containerRef.current) {
            const rect = el.getBoundingClientRect();
            const centerScreenX = rect.left + rect.width / 2;
            const centerScreenY = rect.top + rect.height / 2;
            return screenToGraph(centerScreenX, centerScreenY);
        }

        // Fallback (Estimate)
        const def = NodeRegistry[node.type];
        if (!def) return { x: node.position.x, y: node.position.y };

        // Simple estimate logic for when DOM isn't ready
        const list = type === 'input' ? def.inputs : def.outputs;
        const index = list.findIndex(p => p.id === pinId);
        const yOffset = 40 + (index * 24); // Magic numbers as backup only
        return {
            x: node.position.x + (type === 'output' ? NODE_WIDTH : 0),
            y: node.position.y + yOffset
        };
    };

    // --- 3. Robust Bezier Curve Calculation ---
    // Always draws from "Source" (Right side) to "Target" (Left side)
    const calculateCurve = (x1: number, y1: number, x2: number, y2: number) => {
        const dist = Math.abs(x1 - x2) * 0.4; // 40% curvature
        // Tangent 1: Always shoots RIGHT from Source
        const cX1 = x1 + Math.max(dist, 50); 
        // Tangent 2: Always shoots LEFT from Target (or enters from left)
        const cX2 = x2 - Math.max(dist, 50);
        
        return `M ${x1} ${y1} C ${cX1} ${y1} ${cX2} ${y2} ${x2} ${y2}`;
    };

    // --- Handlers ---

    const handleWheel = (e: React.WheelEvent) => {
        e.stopPropagation();
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoom = Math.exp(wheel * zoomIntensity);
        const mouse = screenToGraph(e.clientX, e.clientY);

        setTransform(t => {
            const newK = Math.min(Math.max(t.k * zoom, 0.2), 3); // Limit zoom levels
            // Zoom towards mouse
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

        const handleWinMove = (ev: MouseEvent) => {
            const dx = (ev.clientX - startMouse.x) / transform.k;
            const dy = (ev.clientY - startMouse.y) / transform.k;
            
            // Fast DOM update for smoothness
            const el = nodeRefs.current.get(node.id);
            if(el) {
                el.style.left = `${startNodePos.x + dx}px`;
                el.style.top = `${startNodePos.y + dy}px`;
            }
            
            // Note: In a full implementation, we would also update 
            // connected SVG paths here imperatively to avoid React render lag.
            // For simplicity in this step, we'll let React catch up on MouseUp 
            // or trigger a state update if you want live wires (costs performance).
            
            // Force re-render for live wires (optional trade-off)
            setNodes(prev => prev.map(n => n.id === node.id ? { ...n, position: { x: startNodePos.x + dx, y: startNodePos.y + dy } } : n));
        };

        const handleWinUp = () => {
            window.removeEventListener('mousemove', handleWinMove);
            window.removeEventListener('mouseup', handleWinUp);
        };
        window.addEventListener('mousemove', handleWinMove);
        window.addEventListener('mouseup', handleWinUp);
    };

    // Connection Handling
    const handlePinDown = (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        const pos = screenToGraph(e.clientX, e.clientY);
        setConnecting({ nodeId, pinId, type, x: pos.x, y: pos.y });
    };

    const handlePinUp = (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        if (connecting) {
            // Ensure we are connecting Output -> Input
            if (connecting.nodeId !== nodeId && connecting.type !== type) {
                const source = connecting.type === 'output' ? connecting : { nodeId, pinId };
                const target = connecting.type === 'input' ? connecting : { nodeId, pinId };
                
                // Check dupes
                const exists = connections.some(c => 
                    c.fromNode === source.nodeId && c.fromPin === source.pinId &&
                    c.toNode === target.nodeId && c.toPin === target.pinId
                );
                
                if (!exists) {
                    // Logic: Input pins usually only accept ONE connection (except specialized arrays).
                    // Remove existing connection to this input if replacing
                    const cleanConnections = connections.filter(c => 
                        !(c.toNode === target.nodeId && c.toPin === target.pinId)
                    );
                    
                    setConnections([...cleanConnections, {
                        id: crypto.randomUUID(),
                        fromNode: source.nodeId, fromPin: source.pinId,
                        toNode: target.nodeId, toPin: target.pinId
                    }]);
                }
            }
        }
        setConnecting(null);
    };

    const handleBgMouseMove = (e: React.MouseEvent) => {
        if (panning) {
            setTransform(t => ({ ...t, x: t.x + e.movementX, y: t.y + e.movementY }));
        }
        if (connecting) {
            const pos = screenToGraph(e.clientX, e.clientY);
            setConnecting(prev => prev ? { ...prev, x: pos.x, y: pos.y } : null);
        }
    };

    return (
        <div 
            ref={containerRef}
            className="w-full h-full bg-[#111] overflow-hidden relative select-none"
            onWheel={handleWheel}
            onMouseDown={(e) => {
                if (e.button === 0 || e.button === 1) setPanning(true);
                if (e.button === 2) setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
                else setContextMenu(null);
            }}
            onMouseMove={handleBgMouseMove}
            onMouseUp={() => { setPanning(false); setConnecting(null); }}
            onContextMenu={e => e.preventDefault()}
        >
            {/* Grid */}
            <div 
                className="absolute inset-0 pointer-events-none opacity-20"
                style={{
                    backgroundSize: `${GRID_SIZE * transform.k}px ${GRID_SIZE * transform.k}px`,
                    backgroundPosition: `${transform.x}px ${transform.y}px`,
                    backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)'
                }}
            />

            {/* Content Layer (Scaled) */}
            <div 
                style={{ transform: `translate(${transform.x}px, ${transform.y}px) scale(${transform.k})`, transformOrigin: '0 0' }}
                className="w-full h-full"
            >
                {/* SVG Connections Layer */}
                <svg className="absolute top-0 left-0 w-1 h-1 overflow-visible pointer-events-none">
                    {/* Render Existing Connections */}
                    {connections.map(c => {
                        const fromNode = nodes.find(n => n.id === c.fromNode);
                        const toNode = nodes.find(n => n.id === c.toNode);
                        if(!fromNode || !toNode) return null;
                        
                        const p1 = getPinPosition(fromNode, c.fromPin, 'output');
                        const p2 = getPinPosition(toNode, c.toPin, 'input');
                        const d = calculateCurve(p1.x, p1.y, p2.x, p2.y);
                        
                        const def = NodeRegistry[fromNode.type];
                        const port = def?.outputs.find(p => p.id === c.fromPin);
                        const color = port?.color || getTypeColor(port?.type || 'any');

                        return (
                            <path key={c.id} d={d} stroke={color} strokeWidth="2" fill="none" />
                        );
                    })}

                    {/* Render Active Drag Line */}
                    {connecting && (() => {
                         const startNode = nodes.find(n => n.id === connecting.nodeId);
                         if(!startNode) return null;
                         
                         const fixedPos = getPinPosition(startNode, connecting.pinId, connecting.type);
                         const mousePos = { x: connecting.x, y: connecting.y };

                         // Determine flow direction based on what we are dragging FROM
                         // If dragging from Output: Fixed -> Mouse
                         // If dragging from Input: Mouse -> Fixed
                         const pStart = connecting.type === 'output' ? fixedPos : mousePos;
                         const pEnd   = connecting.type === 'output' ? mousePos : fixedPos;
                         
                         const def = NodeRegistry[startNode.type];
                         const list = connecting.type === 'input' ? def.inputs : def.outputs;
                         const port = list.find(p => p.id === connecting.pinId);
                         const color = port?.color || getTypeColor(port?.type || 'any');

                         return (
                            <path 
                                d={calculateCurve(pStart.x, pStart.y, pEnd.x, pEnd.y)} 
                                stroke={color} strokeWidth="2" strokeDasharray="5,5" fill="none" 
                            />
                         );
                    })()}
                </svg>

                {/* Nodes Layer */}
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
                            {/* Header / Title */}
                            {!isReroute && (
                                <div 
                                    className="h-9 px-3 flex items-center justify-between bg-white/5 border-b border-white/5 rounded-t-md cursor-grab active:cursor-grabbing"
                                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                >
                                    <span className="text-xs font-bold text-gray-200">{def.title}</span>
                                </div>
                            )}
                            
                            {/* Reroute Body */}
                            {isReroute && (
                                <div 
                                    className="w-full h-full rounded-full bg-gray-400 hover:bg-white cursor-move border border-black"
                                    onMouseDown={(e) => handleNodeMouseDown(e, node)}
                                />
                            )}

                            {/* Inputs & Outputs */}
                            <div className={`p-2 space-y-2 ${isReroute ? 'hidden' : ''}`}>
                                {/* Inputs */}
                                {def.inputs.map(input => (
                                    <div key={input.id} className="relative h-6 flex items-center">
                                        <div 
                                            // ID for DOM lookup
                                            id={`pin-${node.id}-input-${input.id}`}
                                            className="w-3 h-3 rounded-full border border-black hover:scale-125 transition-transform cursor-crosshair -ml-3.5 z-10"
                                            style={{ backgroundColor: input.color || getTypeColor(input.type) }}
                                            onMouseDown={(e) => handlePinDown(e, node.id, input.id, 'input')}
                                            onMouseUp={(e) => handlePinUp(e, node.id, input.id, 'input')}
                                        />
                                        <span className="text-[10px] text-gray-400 ml-2">{input.name}</span>
                                    </div>
                                ))}
                                
                                {/* Node Content (Sliders etc) */}
                                {def.type === 'Float' && (
                                    <input 
                                        type="number" className="w-full bg-black/40 text-xs text-white px-1 rounded border border-white/10"
                                        value={node.data?.value || 0}
                                        onChange={(e) => setNodes(prev => prev.map(n => n.id === node.id ? { ...n, data: { value: e.target.value } } : n))}
                                        onMouseDown={e => e.stopPropagation()}
                                    />
                                )}

                                {/* Outputs */}
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
                        </div>
                    );
                })}
            </div>
            
            {/* Context Menu (Simplified) */}
            {contextMenu && contextMenu.visible && (
                <div 
                    className="fixed w-48 bg-[#252525] border border-black shadow-2xl rounded text-xs z-50"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                >
                    <div className="p-1">
                        {Object.values(NodeRegistry).map(def => (
                            <div 
                                key={def.type}
                                className="px-3 py-2 hover:bg-blue-600 cursor-pointer text-gray-200"
                                onClick={() => {
                                    const rect = containerRef.current!.getBoundingClientRect();
                                    const pos = screenToGraph(contextMenu.x, contextMenu.y);
                                    setNodes(p => [...p, { id: crypto.randomUUID(), type: def.type, position: pos, data: {} }]);
                                    setContextMenu(null);
                                }}
                            >
                                {def.title}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};