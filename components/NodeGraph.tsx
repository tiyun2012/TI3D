import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { GraphNode, GraphConnection } from '../types';
import { engineInstance } from '../services/engine';
import { NodeRegistry, getTypeColor } from '../services/NodeRegistry';

// --- 1. Shared Layout Constants (Explicit Pixels) ---
const LayoutConfig = {
    GRID_SIZE: 20,
    NODE_WIDTH: 180,
    REROUTE_SIZE: 12,
    HEADER_HEIGHT: 36, // Explicit pixel height
    ITEM_HEIGHT: 24,   // Explicit pixel height
    PIN_RADIUS: 6,
    BORDER: 1,         // Assumes 1px border
    GAP: 4,            // Vertical gap between rows
    PADDING_TOP: 8,    // Top padding for the body
    WIRE_GAP: 0 
};

// --- 2. Math Helpers ---
const GraphMath = {
    getPinPosition: (node: GraphNode, pinId: string, type: 'input' | 'output') => {
        if (node.type === 'Reroute') {
            const centerY = node.position.y + LayoutConfig.REROUTE_SIZE / 2;
            if (type === 'input') return { x: node.position.x, y: centerY }; 
            else return { x: node.position.x + LayoutConfig.REROUTE_SIZE, y: centerY };
        }

        const def = NodeRegistry[node.type];
        if (!def) return { x: node.position.x, y: node.position.y };

        let index = 0;
        if (type === 'output') {
            index += def.inputs.length;
            if (node.type === 'Float') index += 1;
            const outIdx = def.outputs.findIndex(p => p.id === pinId);
            index += outIdx !== -1 ? outIdx : 0;
        } else {
            const inIdx = def.inputs.findIndex(p => p.id === pinId);
            index += inIdx !== -1 ? inIdx : 0;
        }

        // Exact math matching the DOM layout logic
        const yOffset = LayoutConfig.BORDER + LayoutConfig.HEADER_HEIGHT + LayoutConfig.PADDING_TOP + 
                       (index * (LayoutConfig.ITEM_HEIGHT + LayoutConfig.GAP)) + (LayoutConfig.ITEM_HEIGHT / 2);
        
        const xOffset = type === 'output' ? LayoutConfig.NODE_WIDTH : 0;
        return { x: node.position.x + xOffset, y: node.position.y + yOffset };
    },

    calculateCurve: (x1: number, y1: number, x2: number, y2: number) => {
        const dist = Math.abs(x1 - x2) * 0.4;
        const cX1 = x1 + Math.max(dist, 50);
        const cX2 = x2 - Math.max(dist, 50);
        return `M ${x1} ${y1} C ${cX1} ${y1} ${cX2} ${y2} ${x2} ${y2}`;
    },

    screenToWorld: (clientX: number, clientY: number, rect: DOMRect, transform: { x: number, y: number, k: number }) => {
        return {
            x: (clientX - rect.left - transform.x) / transform.k,
            y: (clientY - rect.top - transform.y) / transform.k
        };
    }
};

const INITIAL_NODES: GraphNode[] = [
    { id: '1', type: 'Time', position: { x: 50, y: 100 } },
    { id: '2', type: 'Sine', position: { x: 280, y: 100 } },
    { id: '3', type: 'Float', position: { x: 50, y: 250 }, data: { value: "1.5" } },
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
    const [connecting, setConnecting] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number, dataType: string } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [searchFilter, setSearchFilter] = useState('');
    
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);

    const transformRef = useRef({ x: 0, y: 0, k: 1 });
    const viewRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
    
    const activeListenersRef = useRef<{ move?: (ev: MouseEvent) => void; up?: (ev: MouseEvent) => void }>({});

    // OPTIMIZATION: Debounce graph compilation
    useEffect(() => {
        const timeoutId = setTimeout(() => {
            engineInstance.compileGraph(nodes, connections);
        }, 150); 
        return () => clearTimeout(timeoutId);
    }, [nodes, connections]);

    // OPTIMIZATION: Fast Node Lookup Map
    const nodeMap = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

    const getPortType = useCallback((nodeId: string, pinId: string, type: 'input' | 'output') => {
        const node = nodeMap.get(nodeId);
        if (!node) return 'any';
        if (node.type === 'Reroute') return 'any';
        
        const def = NodeRegistry[node.type];
        if (!def) return 'any';
        
        const list = type === 'input' ? def.inputs : def.outputs;
        const port = list.find(p => p.id === pinId);
        return port ? port.type : 'any';
    }, [nodeMap]);

    const isCompatible = useCallback((sourceType: string, targetType: string) => {
        return sourceType === 'any' || targetType === 'any' || sourceType === targetType;
    }, []);

    const updateViewportStyle = useCallback(() => {
        if (viewRef.current && containerRef.current) {
            const { x, y, k } = transformRef.current;
            viewRef.current.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${k})`;
            containerRef.current.style.backgroundPosition = `${x}px ${y}px`;
            containerRef.current.style.backgroundSize = `${LayoutConfig.GRID_SIZE * k}px ${LayoutConfig.GRID_SIZE * k}px`;
        }
    }, []);

    useLayoutEffect(() => {
        updateViewportStyle();
    }, [updateViewportStyle]);

    const cleanupListeners = useCallback(() => {
        if (activeListenersRef.current.move) window.removeEventListener('mousemove', activeListenersRef.current.move);
        if (activeListenersRef.current.up) window.removeEventListener('mouseup', activeListenersRef.current.up);
        activeListenersRef.current = {};
    }, []);

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.stopPropagation();
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        const current = transformRef.current;
        const newK = Math.min(Math.max(current.k * zoomFactor, 0.2), 3);
        
        const mouseX = (e.clientX - rect.left - current.x) / current.k;
        const mouseY = (e.clientY - rect.top - current.y) / current.k;

        const newX = e.clientX - rect.left - (mouseX * newK);
        const newY = e.clientY - rect.top - (mouseY * newK);

        transformRef.current = { x: newX, y: newY, k: newK };
        updateViewportStyle();
    }, [updateViewportStyle]);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button === 2) { 
            setContextMenu({ x: e.clientX, y: e.clientY, visible: true });
            return;
        }
        setContextMenu(null);

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        if (e.button === 1 || (e.button === 0 && e.altKey)) {
            e.preventDefault();
            cleanupListeners();

            const startX = e.clientX;
            const startY = e.clientY;
            const startTrans = { ...transformRef.current };
            let frameId = 0;

            const onMove = (ev: MouseEvent) => {
                cancelAnimationFrame(frameId);
                frameId = requestAnimationFrame(() => {
                    const dx = ev.clientX - startX;
                    const dy = ev.clientY - startY;
                    transformRef.current.x = startTrans.x + dx;
                    transformRef.current.y = startTrans.y + dy;
                    updateViewportStyle();
                });
            };

            const onUp = () => {
                cancelAnimationFrame(frameId);
                cleanupListeners();
            };

            activeListenersRef.current = { move: onMove, up: onUp };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        } else if (e.button === 0) {
            if (!e.shiftKey && !e.ctrlKey) {
                setSelectedNodeIds(new Set());
            }

            const startX = e.clientX - rect.left;
            const startY = e.clientY - rect.top;
            setSelectionBox({ startX, startY, currentX: startX, currentY: startY });

            let frameId = 0;

            const onMove = (ev: MouseEvent) => {
                const currentX = ev.clientX - rect.left;
                const currentY = ev.clientY - rect.top;
                
                setSelectionBox(prev => prev ? { ...prev, currentX, currentY } : null);

                cancelAnimationFrame(frameId);
                frameId = requestAnimationFrame(() => {
                     const minX = Math.min(startX, currentX);
                     const maxX = Math.max(startX, currentX);
                     const minY = Math.min(startY, currentY);
                     const maxY = Math.max(startY, currentY);
                     
                     const newSelected = new Set(e.shiftKey || e.ctrlKey ? selectedNodeIds : []);
                     
                     nodeRefs.current.forEach((el, id) => {
                         const nodeRect = el.getBoundingClientRect();
                         const nx = nodeRect.left - rect.left;
                         const ny = nodeRect.top - rect.top;
                         const nw = nodeRect.width;
                         const nh = nodeRect.height;
                         
                         if (minX < nx + nw && maxX > nx && minY < ny + nh && maxY > ny) {
                             newSelected.add(id);
                         }
                     });
                     setSelectedNodeIds(newSelected);
                });
            };

            const onUp = () => {
                cancelAnimationFrame(frameId);
                cleanupListeners();
                setSelectionBox(null);
            };
            
            activeListenersRef.current = { move: onMove, up: onUp };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        }
    }, [cleanupListeners, updateViewportStyle, selectedNodeIds]);

    const handleNodeDragStart = useCallback((e: React.MouseEvent, node: GraphNode) => {
        e.stopPropagation();
        if (e.button !== 0 || e.altKey) return;
        
        cleanupListeners();

        let currentSelection = new Set(selectedNodeIds);
        if (!currentSelection.has(node.id)) {
            if (!e.shiftKey && !e.ctrlKey) {
                currentSelection = new Set([node.id]);
            } else {
                currentSelection.add(node.id);
            }
            setSelectedNodeIds(currentSelection);
        }

        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        const startMouse = { x: e.clientX, y: e.clientY };
        const k = transformRef.current.k;
        
        const startPositions = new Map<string, {x: number, y: number}>();
        nodes.forEach(n => {
            if (currentSelection.has(n.id)) {
                startPositions.set(n.id, { ...n.position });
            }
        });

        let frameId = 0;

        const activeLinks = connections
            .filter(c => currentSelection.has(c.fromNode) || currentSelection.has(c.toNode))
            .map(c => {
                const fromNode = nodeMap.get(c.fromNode);
                const toNode = nodeMap.get(c.toNode);
                if (!fromNode || !toNode) return null;

                const pathEl = pathRefs.current.get(c.id);
                if (!pathEl) return null;

                const isFromSelected = currentSelection.has(c.fromNode);
                const isToSelected = currentSelection.has(c.toNode);

                return {
                    pathEl,
                    fromNodeId: c.fromNode,
                    fromPin: c.fromPin,
                    toNodeId: c.toNode,
                    toPin: c.toPin,
                    isFromSelected,
                    isToSelected
                };
            })
            .filter(Boolean);

        const onMove = (ev: MouseEvent) => {
            cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                const dx = (ev.clientX - startMouse.x) / k;
                const dy = (ev.clientY - startMouse.y) / k;

                startPositions.forEach((startPos, id) => {
                    const nodeEl = nodeRefs.current.get(id);
                    if (nodeEl) {
                        const nx = startPos.x + dx;
                        const ny = startPos.y + dy;
                        nodeEl.style.transform = `translate(${nx}px, ${ny}px)`;
                    }
                });

                for(const link of activeLinks) {
                    if (!link) continue;

                    const getPos = (id: string, defPos: {x:number, y:number}) => {
                         if (startPositions.has(id)) {
                             const s = startPositions.get(id)!;
                             return { x: s.x + dx, y: s.y + dy };
                         }
                         return defPos;
                    };

                    const n1 = nodeMap.get(link.fromNodeId)!;
                    const n2 = nodeMap.get(link.toNodeId)!;

                    const p1 = GraphMath.getPinPosition(
                        { ...n1, position: getPos(n1.id, n1.position) }, 
                        link.fromPin, 'output'
                    );
                    const p2 = GraphMath.getPinPosition(
                        { ...n2, position: getPos(n2.id, n2.position) }, 
                        link.toPin, 'input'
                    );

                    p1.x += LayoutConfig.WIRE_GAP;
                    p2.x -= LayoutConfig.WIRE_GAP;
                    
                    link.pathEl.setAttribute('d', GraphMath.calculateCurve(p1.x, p1.y, p2.x, p2.y));
                }
            });
        };

        const onUp = (ev: MouseEvent) => {
            cancelAnimationFrame(frameId);
            cleanupListeners();

            const dx = (ev.clientX - startMouse.x) / k;
            const dy = (ev.clientY - startMouse.y) / k;

            setNodes(prev => prev.map(n => {
                if (startPositions.has(n.id)) {
                    const s = startPositions.get(n.id)!;
                    return { ...n, position: { x: s.x + dx, y: s.y + dy } };
                }
                return n;
            }));
        };

        activeListenersRef.current = { move: onMove, up: onUp };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [nodes, connections, cleanupListeners, selectedNodeIds, nodeMap]);

    const handlePinDown = useCallback((e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        e.preventDefault();
        cleanupListeners();

        const rect = containerRef.current?.getBoundingClientRect();
        if(!rect) return;
        
        const pos = GraphMath.screenToWorld(e.clientX, e.clientY, rect, transformRef.current);
        const dataType = getPortType(nodeId, pinId, type);
        
        setConnecting({ nodeId, pinId, type, x: pos.x, y: pos.y, dataType });

        const onMove = (ev: MouseEvent) => {
            const worldPos = GraphMath.screenToWorld(ev.clientX, ev.clientY, rect, transformRef.current);
            setConnecting(prev => prev ? { ...prev, x: worldPos.x, y: worldPos.y } : null);
        };
        
        const onUp = () => {
            cleanupListeners();
            setConnecting(null);
        };

        activeListenersRef.current = { move: onMove, up: onUp };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [cleanupListeners, getPortType]);

    const handlePinUp = useCallback((e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        
        setConnecting(prev => {
            if (prev && prev.nodeId !== nodeId && prev.type !== type) {
                const source = prev.type === 'output' ? prev : { nodeId, pinId };
                const target = prev.type === 'input' ? prev : { nodeId, pinId };
                
                const sourceType = getPortType(source.nodeId, source.pinId, 'output');
                const targetType = getPortType(target.nodeId, target.pinId, 'input');
                
                if (!isCompatible(sourceType, targetType)) return null;
                if (source.nodeId === target.nodeId) return null;

                setConnections(curr => {
                    const exists = curr.some(c => c.fromNode === source.nodeId && c.fromPin === source.pinId && c.toNode === target.nodeId && c.toPin === target.pinId);
                    if (exists) return curr;

                    const clean = curr.filter(c => !(c.toNode === target.nodeId && c.toPin === target.pinId));
                    return [...clean, { id: crypto.randomUUID(), fromNode: source.nodeId, fromPin: source.pinId, toNode: target.nodeId, toPin: target.pinId }];
                });
            }
            return null;
        });
    }, [getPortType, isCompatible]);

    const addNode = (type: string) => {
        if(!contextMenu || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const pos = GraphMath.screenToWorld(contextMenu.x, contextMenu.y, rect, transformRef.current);
        const newNodeId = crypto.randomUUID();
        setNodes(p => [...p, { id: newNodeId, type, position: pos, data: {} }]);
        setSelectedNodeIds(new Set([newNodeId]));
        setContextMenu(null);
        setSearchFilter('');
    };

    const renderPort = (nodeId: string, pinId: string, type: 'input'|'output', color?: string) => {
        let isActive = false;
        let isCompatiblePort = false;

        if (connecting && connecting.nodeId !== nodeId && connecting.type !== type) {
            const myType = getPortType(nodeId, pinId, type);
            if (isCompatible(connecting.dataType, myType)) {
                isActive = true;
                isCompatiblePort = true;
            }
        }

        let borderClass = 'border-black';
        let bgStyle = color || '#fff';
        let scaleClass = 'hover:scale-125';

        if (isActive && isCompatiblePort) {
            borderClass = 'border-emerald-500 ring-2 ring-emerald-400';
            scaleClass = 'scale-125';
            bgStyle = '#fff';
        }

        return (
            <div 
                className={`absolute w-3 h-3 rounded-full border ${borderClass} ${scaleClass} transition-all cursor-crosshair z-10`}
                style={{ 
                    backgroundColor: bgStyle,
                    [type === 'input' ? 'left' : 'right']: -LayoutConfig.PIN_RADIUS, 
                    top: '50%',
                    transform: 'translateY(-50%)'
                }}
                onMouseDown={(e) => handlePinDown(e, nodeId, pinId, type)}
                onMouseUp={(e) => handlePinUp(e, nodeId, pinId, type)}
            />
        );
    };

    const renderedWires = useMemo(() => {
        return connections.map(c => {
            const fromNode = nodeMap.get(c.fromNode);
            const toNode = nodeMap.get(c.toNode);
            if (!fromNode || !toNode) return null;

            const p1 = GraphMath.getPinPosition(fromNode, c.fromPin, 'output');
            const p2 = GraphMath.getPinPosition(toNode, c.toPin, 'input');
            
            p1.x += LayoutConfig.WIRE_GAP;
            p2.x -= LayoutConfig.WIRE_GAP;

            const d = GraphMath.calculateCurve(p1.x, p1.y, p2.x, p2.y);
            
            const def = NodeRegistry[fromNode.type];
            const port = def?.outputs.find(p => p.id === c.fromPin);
            const color = port?.color || getTypeColor(port?.type || 'any');

            return <path key={c.id} ref={el => { if(el) pathRefs.current.set(c.id, el) }} d={d} stroke={color} strokeWidth="2" fill="none" />;
        });
    }, [nodeMap, connections]);

    return (
        <div 
            ref={containerRef}
            className="w-full h-full bg-[#111] overflow-hidden relative select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onContextMenu={e => e.preventDefault()}
        >
             <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)' }}
            />

            <div ref={viewRef} className="w-full h-full origin-top-left will-change-transform" style={{ transform: `translate3d(0px, 0px, 0) scale(1)` }}>
                <svg className="absolute top-0 left-0 overflow-visible pointer-events-none w-1 h-1">
                    {renderedWires}
                    {connecting && (() => {
                         const node = nodeMap.get(connecting.nodeId);
                         if(!node) return null;
                         const pinPos = GraphMath.getPinPosition(node, connecting.pinId, connecting.type);
                         
                         if (connecting.type === 'output') pinPos.x += LayoutConfig.WIRE_GAP;
                         else pinPos.x -= LayoutConfig.WIRE_GAP;

                         const p2 = { x: connecting.x, y: connecting.y };
                         const start = connecting.type === 'output' ? pinPos : p2;
                         const end = connecting.type === 'output' ? p2 : pinPos;
                         
                         const color = getTypeColor(connecting.dataType as any);
                         return <path d={GraphMath.calculateCurve(start.x, start.y, end.x, end.y)} stroke={color} strokeWidth="2" strokeDasharray="5,5" fill="none" />;
                    })()}
                </svg>

                {nodes.map(node => {
                    const def = NodeRegistry[node.type];
                    if(!def) return null;
                    const isReroute = node.type === 'Reroute';
                    const isSelected = selectedNodeIds.has(node.id);
                    
                    const borderStyle = isSelected ? 'ring-1 ring-accent border-accent' : 'border-white/10';

                    return (
                        <div
                            key={node.id}
                            ref={el => { if(el) nodeRefs.current.set(node.id, el) }}
                            className={`absolute flex flex-col pointer-events-auto transition-shadow hover:shadow-2xl 
                                ${isReroute ? '' : `rounded-md shadow-xl border bg-[#1e1e1e] ${borderStyle}`}`}
                            style={{ 
                                transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                                width: isReroute ? LayoutConfig.REROUTE_SIZE : LayoutConfig.NODE_WIDTH, 
                                height: isReroute ? LayoutConfig.REROUTE_SIZE : 'auto'
                            }}
                        >
                             {isReroute ? (
                                <div className={`relative w-full h-full rounded-full cursor-move border ${isSelected ? 'bg-white border-accent' : 'bg-gray-400 hover:bg-white border-black'}`}
                                    onMouseDown={(e) => handleNodeDragStart(e, node)}
                                >
                                    {renderPort(node.id, 'in', 'input')}
                                    {renderPort(node.id, 'out', 'output')}
                                </div>
                             ) : (
                                <>
                                    <div 
                                        className={`px-3 flex items-center justify-between border-b border-white/5 rounded-t-md cursor-grab active:cursor-grabbing ${isSelected ? 'bg-accent/20' : 'bg-white/5'}`}
                                        style={{ height: LayoutConfig.HEADER_HEIGHT }}
                                        onMouseDown={(e) => handleNodeDragStart(e, node)}
                                    >
                                        <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-gray-200'}`}>{def.title}</span>
                                    </div>
                                    <div 
                                        style={{ 
                                            paddingTop: LayoutConfig.PADDING_TOP,
                                            paddingLeft: 8,
                                            paddingRight: 8,
                                            paddingBottom: 4
                                        }}
                                    >
                                        {def.inputs.map(input => (
                                            <div 
                                                key={input.id} 
                                                className="relative flex items-center"
                                                style={{ height: LayoutConfig.ITEM_HEIGHT, marginBottom: LayoutConfig.GAP }}
                                            >
                                                {renderPort(node.id, input.id, 'input', input.color || getTypeColor(input.type))}
                                                <span className="text-[10px] text-gray-400 ml-2">{input.name}</span>
                                            </div>
                                        ))}
                                        
                                        {def.type === 'Float' && (
                                            <div style={{ height: LayoutConfig.ITEM_HEIGHT, marginBottom: LayoutConfig.GAP }} className="relative flex items-center">
                                                <input 
                                                    type="text" 
                                                    aria-label="Float value" 
                                                    title="Float value"
                                                    className="w-full h-full bg-black/40 text-xs text-white px-1 rounded border border-white/10"
                                                    value={node.data?.value || "0"}
                                                    onChange={(e) => setNodes(p => p.map(n => n.id===node.id ? {...n, data: {value: e.target.value}} : n))}
                                                    onMouseDown={e => e.stopPropagation()}
                                                />
                                            </div>
                                        )}

                                        {def.outputs.map(output => (
                                            <div 
                                                key={output.id} 
                                                className="relative flex items-center justify-end"
                                                style={{ height: LayoutConfig.ITEM_HEIGHT, marginBottom: LayoutConfig.GAP }}
                                            >
                                                <span className="text-[10px] text-gray-400 mr-2">{output.name}</span>
                                                {renderPort(node.id, output.id, 'output', output.color || getTypeColor(output.type))}
                                            </div>
                                        ))}
                                    </div>
                                </>
                             )}
                        </div>
                    );
                })}
            </div>
            
            {selectionBox && (
                <div 
                    className="absolute border border-accent bg-accent/20 pointer-events-none z-50"
                    style={{
                        left: Math.min(selectionBox.startX, selectionBox.currentX),
                        top: Math.min(selectionBox.startY, selectionBox.currentY),
                        width: Math.abs(selectionBox.currentX - selectionBox.startX),
                        height: Math.abs(selectionBox.currentY - selectionBox.startY)
                    }}
                />
            )}

            {contextMenu && contextMenu.visible && (
                <div 
                    className="fixed w-48 bg-[#252525] border border-black shadow-2xl rounded text-xs flex flex-col z-50 overflow-hidden"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <input 
                        autoFocus 
                        placeholder="Search..." 
                        aria-label="Search nodes"
                        title="Search nodes"
                        className="p-2 bg-[#1a1a1a] text-white outline-none border-b border-black/50" 
                        value={searchFilter} 
                        onChange={e => setSearchFilter(e.target.value)} 
                    />
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