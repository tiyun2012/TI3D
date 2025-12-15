
import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { GraphNode, GraphConnection } from '../types';
import { engineInstance } from '../services/engine';
import { NodeRegistry, getTypeColor } from '../services/NodeRegistry';
import { ShaderPreview } from './ShaderPreview';
import { Icon } from './Icon';
import { assetManager } from '../services/AssetManager';

// --- 1. Shared Layout Constants (Explicit Pixels) ---
const LayoutConfig = {
    GRID_SIZE: 20,
    NODE_WIDTH: 180,
    PREVIEW_NODE_WIDTH: 240, 
    REROUTE_SIZE: 12,
    HEADER_HEIGHT: 36, 
    ITEM_HEIGHT: 24,   
    PIN_RADIUS: 6,
    BORDER: 1,         
    GAP: 4,            
    PADDING_TOP: 8,    
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

        // Calculate dynamic height offsets for content between inputs and outputs
        let extraHeight = 0;
        if ((node.type === 'Float' || node.type === 'Vec3') && node.data) {
             const rowCount = Object.keys(node.data).length;
             // Height of rows + marginBottom of the wrapper
             extraHeight += rowCount * 20 + (rowCount * 4) + LayoutConfig.GAP; // Approx input height 20 + gap
        }
        if (node.type === 'ShaderOutput') {
             extraHeight += 200 + LayoutConfig.GAP;
        }

        let index = 0;
        if (type === 'output') {
            index += def.inputs.length;
            const outIdx = def.outputs.findIndex(p => p.id === pinId);
            index += outIdx !== -1 ? outIdx : 0;
        } else {
            const inIdx = def.inputs.findIndex(p => p.id === pinId);
            index += inIdx !== -1 ? inIdx : 0;
        }

        let yOffset = LayoutConfig.BORDER + LayoutConfig.HEADER_HEIGHT + LayoutConfig.PADDING_TOP + 
                       (index * (LayoutConfig.ITEM_HEIGHT + LayoutConfig.GAP)) + (LayoutConfig.ITEM_HEIGHT / 2);
        
        // Add extra offset only for outputs (as they appear after the dynamic content)
        if (type === 'output') {
            yOffset += extraHeight;
        }
        
        const width = node.type === 'ShaderOutput' ? LayoutConfig.PREVIEW_NODE_WIDTH : LayoutConfig.NODE_WIDTH;
        const xOffset = type === 'output' ? width : 0;
        return { x: node.position.x + xOffset, y: node.position.y + yOffset };
    },

    calculateCurve: (x1: number, y1: number, x2: number, y2: number) => {
        const dist = Math.abs(x1 - x2) * 0.4;
        const cX1 = x1 + Math.max(dist, 50);
        const cX2 = x2 - Math.max(dist, 50);
        return `M ${x1} ${y1} C ${cX1} ${y1} ${cX2} ${y2} ${x2} ${y2}`;
    },

    getBezierPoints: (x1: number, y1: number, x2: number, y2: number, steps: number = 10) => {
        const dist = Math.abs(x1 - x2) * 0.4;
        const cp1x = x1 + Math.max(dist, 50);
        const cp1y = y1;
        const cp2x = x2 - Math.max(dist, 50);
        const cp2y = y2;
        
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;
            
            const x = mt3 * x1 + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * x2;
            const y = mt3 * y1 + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * y2;
            points.push({ x, y });
        }
        return points;
    },

    // Standard Line Intersection
    lineIntersectsLine: (a1: {x:number, y:number}, a2: {x:number, y:number}, b1: {x:number, y:number}, b2: {x:number, y:number}) => {
        const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
        if (det === 0) return false;
        const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
        const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;
        return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
    },

    screenToWorld: (clientX: number, clientY: number, rect: DOMRect, transform: { x: number, y: number, k: number }) => {
        return {
            x: (clientX - rect.left - transform.x) / transform.k,
            y: (clientY - rect.top - transform.y) / transform.k
        };
    }
};

interface NodeGraphProps {
    materialId?: string | null;
}

export const NodeGraph: React.FC<NodeGraphProps> = ({ materialId }) => {
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [connections, setConnections] = useState<GraphConnection[]>([]);
    const [connecting, setConnecting] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number, dataType: string } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [searchFilter, setSearchFilter] = useState('');
    const [showGrid, setShowGrid] = useState(true);
    
    // Feature: Auto-connect when dropping on bg
    const [pendingConnection, setPendingConnection] = useState<{ nodeId: string, pinId: string, type: 'input'|'output' } | null>(null);
    
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    
    // Feature: Cut Tool
    const [cutLine, setCutLine] = useState<{ start: {x:number, y:number}, end: {x:number, y:number} } | null>(null);

    const transformRef = useRef({ x: 0, y: 0, k: 1 });
    const viewRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    const pathRefs = useRef<Map<string, SVGPathElement>>(new Map());
    const hoverPortRef = useRef<boolean>(false);
    
    const activeListenersRef = useRef<{ move?: (ev: MouseEvent) => void; up?: (ev: MouseEvent) => void }>({});

    // --- Loading Logic ---
    useEffect(() => {
        if (materialId) {
            const asset = assetManager.getAsset(materialId);
            if (asset && asset.type === 'MATERIAL') {
                setNodes(asset.data.nodes);
                setConnections(asset.data.connections);
                // Also trigger immediate compile
                engineInstance.compileGraph(asset.data.nodes, asset.data.connections);
            }
        } else {
            // Clear graph when no material is selected
            setNodes([]);
            setConnections([]);
        }
    }, [materialId]);

    const handleSave = () => {
        if (materialId) {
            const glsl = engineInstance.currentShaderSource;
            assetManager.saveMaterial(materialId, nodes, connections, glsl);
            alert(`Saved Material!`);
        }
    };

    // OPTIMIZATION: Debounce graph compilation
    useEffect(() => {
        if (!materialId) return; // Don't compile empty/invalid state
        const timeoutId = setTimeout(() => {
            engineInstance.compileGraph(nodes, connections);
        }, 150); 
        return () => clearTimeout(timeoutId);
    }, [nodes, connections, materialId]);

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
            // Only update background if grid is enabled
            if (showGrid) {
                containerRef.current.style.backgroundPosition = `${x}px ${y}px`;
                containerRef.current.style.backgroundSize = `${LayoutConfig.GRID_SIZE * k}px ${LayoutConfig.GRID_SIZE * k}px`;
                containerRef.current.style.backgroundImage = 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)';
            } else {
                containerRef.current.style.backgroundImage = 'none';
            }
        }
    }, [showGrid]);

    useLayoutEffect(() => {
        updateViewportStyle();
    }, [updateViewportStyle]);

    // Keyboard Shortcuts (Delete & Focus)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Delete Nodes
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeIds.size > 0) {
                    // Do not delete outputs usually, but for now allow everything
                    setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                    setConnections(prev => prev.filter(c => !selectedNodeIds.has(c.fromNode) && !selectedNodeIds.has(c.toNode)));
                    setSelectedNodeIds(new Set());
                }
            }
            // Focus Selection (F)
            if (e.key === 'f' || e.key === 'F') {
                const targets = nodes.filter(n => selectedNodeIds.has(n.id));
                const focusNodes = targets.length > 0 ? targets : nodes;
                
                if (focusNodes.length === 0) return;

                // Calculate bounds
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                focusNodes.forEach(n => {
                    const el = nodeRefs.current.get(n.id);
                    const w = el ? el.offsetWidth : LayoutConfig.NODE_WIDTH;
                    const h = el ? el.offsetHeight : 100;
                    minX = Math.min(minX, n.position.x);
                    minY = Math.min(minY, n.position.y);
                    maxX = Math.max(maxX, n.position.x + w);
                    maxY = Math.max(maxY, n.position.y + h);
                });
                
                const padding = 50;
                const width = (maxX - minX) + padding * 2;
                const height = (maxY - minY) + padding * 2;
                
                const containerW = containerRef.current?.clientWidth || 800;
                const containerH = containerRef.current?.clientHeight || 600;
                
                let k = Math.min(containerW / width, containerH / height);
                k = Math.min(Math.max(k, 0.2), 2.0); // Clamp scale
                
                const centerX = minX + (maxX - minX) / 2;
                const centerY = minY + (maxY - minY) / 2;
                
                const x = containerW / 2 - centerX * k;
                const y = containerH / 2 - centerY * k;
                
                transformRef.current = { x, y, k };
                updateViewportStyle();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nodes, selectedNodeIds, updateViewportStyle]);

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
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;

        // --- Right Click Handling ---
        if (e.button === 2) { 
            e.preventDefault();
            e.stopPropagation();

            // CTRL + RMB = Cut Tool
            if (e.ctrlKey) {
                cleanupListeners();
                const startX = e.clientX - rect.left;
                const startY = e.clientY - rect.top;
                
                // Convert to World for intersection logic later, but for visual line we use container-space (which is world * zoom + pan)
                // Actually easier to draw cut line in overlay (screen space)
                setCutLine({ start: {x: startX, y: startY}, end: {x: startX, y: startY} });

                const onMove = (ev: MouseEvent) => {
                    setCutLine(prev => prev ? { ...prev, end: { x: ev.clientX - rect.left, y: ev.clientY - rect.top } } : null);
                };

                const onUp = (ev: MouseEvent) => {
                    cleanupListeners();
                    
                    // Perform Cut Logic
                    // 1. Convert Cut Line to World Space
                    const t = transformRef.current;
                    const worldStart = { x: (startX - t.x) / t.k, y: (startY - t.y) / t.k };
                    const worldEnd = { x: (ev.clientX - rect.left - t.x) / t.k, y: (ev.clientY - rect.top - t.y) / t.k };
                    
                    setConnections(curr => curr.filter(conn => {
                        const fromNode = nodeMap.get(conn.fromNode);
                        const toNode = nodeMap.get(conn.toNode);
                        if (!fromNode || !toNode) return false; // Remove invalid

                        const p1 = GraphMath.getPinPosition(fromNode, conn.fromPin, 'output');
                        const p2 = GraphMath.getPinPosition(toNode, conn.toPin, 'input');
                        p1.x += LayoutConfig.WIRE_GAP;
                        p2.x -= LayoutConfig.WIRE_GAP;

                        // Check intersection with Bezier
                        const bezierPoints = GraphMath.getBezierPoints(p1.x, p1.y, p2.x, p2.y);
                        let intersected = false;
                        for(let i=0; i<bezierPoints.length-1; i++) {
                            if (GraphMath.lineIntersectsLine(worldStart, worldEnd, bezierPoints[i], bezierPoints[i+1])) {
                                intersected = true;
                                break;
                            }
                        }
                        return !intersected; // Keep if not intersected
                    }));

                    setCutLine(null);
                };

                activeListenersRef.current = { move: onMove, up: onUp };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
                return;
            }

            // Normal RMB = Context Menu
            // FIX: Use relative coordinates to avoid offsets when inside fixed containers with backdrop-filter
            setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
            setPendingConnection(null);
            return;
        }
        
        // Clear Context Menu on Left Click
        setContextMenu(null);

        // --- Middle Click / Alt+Click = Pan ---
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
            // --- Left Click = Selection Box ---
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
                     
                     // Convert selection box to world space for checking
                     const t = transformRef.current;
                     const wMinX = (minX - t.x) / t.k;
                     const wMaxX = (maxX - t.x) / t.k;
                     const wMinY = (minY - t.y) / t.k;
                     const wMaxY = (maxY - t.y) / t.k;

                     nodeRefs.current.forEach((el, id) => {
                         const node = nodeMap.get(id);
                         if (!node) return;
                         // Check intersection of Node Rect with Selection Rect in World Space
                         const nx = node.position.x;
                         const ny = node.position.y;
                         const nw = el.offsetWidth;
                         const nh = el.offsetHeight;
                         
                         if (wMinX < nx + nw && wMaxX > nx && wMinY < ny + nh && wMaxY > ny) {
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
    }, [cleanupListeners, updateViewportStyle, selectedNodeIds, nodeMap]);

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
        
        // Start Connecting State
        const connectionData = { nodeId, pinId, type, x: pos.x, y: pos.y, dataType };
        setConnecting(connectionData);

        const onMove = (ev: MouseEvent) => {
            const worldPos = GraphMath.screenToWorld(ev.clientX, ev.clientY, rect, transformRef.current);
            setConnecting(prev => prev ? { ...prev, x: worldPos.x, y: worldPos.y } : null);
        };
        
        const onUp = (ev: MouseEvent) => {
            cleanupListeners();
            setConnecting(null);
            
            // Workflow: Drop on background triggers Context Menu
            if (!hoverPortRef.current) {
                // FIX: Use relative coordinates
                setContextMenu({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, visible: true });
                setPendingConnection({ nodeId, pinId, type });
            }
        };

        activeListenersRef.current = { move: onMove, up: onUp };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [cleanupListeners, getPortType]);

    const handlePinUp = useCallback((e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        // Flag that we hit a port so global onUp doesn't trigger context menu
        hoverPortRef.current = true;
        
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
        
        // Exact position from contextMenu state (which is now local relative to container)
        const t = transformRef.current;
        const pos = {
            x: (contextMenu.x - t.x) / t.k,
            y: (contextMenu.y - t.y) / t.k
        };
        const newNodeId = crypto.randomUUID();
        
        // Ensure default data is present for nodes that require it for layout
        let initialData = {};
        if (type === 'Float') initialData = { value: '0' };
        if (type === 'Vec3') initialData = { x: '0', y: '0', z: '0' };

        const newNode: GraphNode = { id: newNodeId, type, position: pos, data: initialData };
        
        setNodes(p => [...p, newNode]);
        setSelectedNodeIds(new Set([newNodeId]));
        setContextMenu(null);
        setSearchFilter('');

        // Auto-connect if pending link
        if (pendingConnection) {
            const def = NodeRegistry[type];
            if (def) {
                // Determine opposite port type needed
                const targetType = pendingConnection.type === 'input' ? 'output' : 'input';
                const ports = targetType === 'input' ? def.inputs : def.outputs;
                
                // Find first compatible port
                const compatiblePort = ports.find(p => {
                    const typeA = getPortType(pendingConnection.nodeId, pendingConnection.pinId, pendingConnection.type);
                    return isCompatible(typeA, p.type);
                });

                if (compatiblePort) {
                    const source = pendingConnection.type === 'output' 
                        ? { nodeId: pendingConnection.nodeId, pinId: pendingConnection.pinId } 
                        : { nodeId: newNodeId, pinId: compatiblePort.id };
                        
                    const target = pendingConnection.type === 'output'
                        ? { nodeId: newNodeId, pinId: compatiblePort.id }
                        : { nodeId: pendingConnection.nodeId, pinId: pendingConnection.pinId };

                    setConnections(curr => [...curr, { 
                        id: crypto.randomUUID(), 
                        fromNode: source.nodeId, fromPin: source.pinId, 
                        toNode: target.nodeId, toPin: target.pinId 
                    }]);
                }
            }
            setPendingConnection(null);
        }
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
                onMouseEnter={() => { hoverPortRef.current = true; }}
                onMouseLeave={() => { hoverPortRef.current = false; }}
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

    if (!materialId) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#151515] text-text-secondary select-none">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Icon name="Workflow" size={32} className="opacity-50" />
                </div>
                <div className="text-sm font-medium">No Material Selected</div>
                <div className="text-xs opacity-50 mt-1">Double click a material in the Project Panel to edit.</div>
            </div>
        );
    }

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
            
            {/* Toolbar Overlay */}
            <div className="absolute top-2 left-2 z-50 flex gap-2">
                <button 
                    onClick={() => setShowGrid(!showGrid)} 
                    className={`p-1.5 rounded hover:bg-white/10 transition-colors ${showGrid ? 'text-white' : 'text-text-secondary opacity-50'}`}
                    title="Toggle Grid"
                >
                    <Icon name="Grid" size={16} />
                </button>
                
                <button 
                    onClick={handleSave} 
                    className="bg-accent/80 hover:bg-accent text-white px-3 py-1 rounded text-xs flex items-center gap-2 shadow-lg"
                    title="Save Material"
                >
                    <Icon name="Save" size={12} />
                    <span>Save</span>
                </button>
            </div>
            
            {/* Info Overlay */}
            {materialId && (
                <div className="absolute top-2 right-2 z-50 px-2 py-1 bg-black/50 text-white/50 text-[10px] rounded border border-white/5 pointer-events-none">
                    Editing: {assetManager.getAsset(materialId)?.name}
                </div>
            )}

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
                    const isShaderOutput = node.type === 'ShaderOutput';
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
                                width: isReroute ? LayoutConfig.REROUTE_SIZE : (isShaderOutput ? LayoutConfig.PREVIEW_NODE_WIDTH : LayoutConfig.NODE_WIDTH), 
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
                                        
                                        {(def.type === 'Float' || def.type === 'Vec3') && node.data && (
                                            <div style={{ marginBottom: LayoutConfig.GAP }} className="relative flex flex-col gap-1 px-1">
                                                {Object.entries(node.data).map(([key, val]) => (
                                                    <div key={key} className="flex items-center gap-1" style={{ height: 20, marginBottom: 4 }}>
                                                        <span className="text-[9px] text-gray-500 uppercase w-3">{key}</span>
                                                        <input 
                                                            type="text" 
                                                            aria-label={`${key} value`} 
                                                            className="w-full bg-black/40 text-[10px] text-white px-1 rounded border border-white/10 h-5"
                                                            value={val as string}
                                                            onChange={(e) => setNodes(p => p.map(n => n.id===node.id ? {...n, data: {...n.data, [key]: e.target.value}} : n))}
                                                            onMouseDown={e => e.stopPropagation()}
                                                        />
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                        
                                        {isShaderOutput && (
                                            <div style={{ height: 200, marginBottom: LayoutConfig.GAP }} className="relative border border-white/5 rounded overflow-hidden mt-2">
                                                <ShaderPreview minimal />
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
            
            {/* Selection Box */}
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
            
            {/* Cut Tool Line */}
            {cutLine && (
                <div className="absolute top-0 left-0 w-full h-full pointer-events-none z-50">
                    <svg className="w-full h-full">
                        <line 
                            x1={cutLine.start.x} y1={cutLine.start.y} 
                            x2={cutLine.end.x} y2={cutLine.end.y} 
                            stroke="red" strokeWidth="2" strokeDasharray="5,5" 
                        />
                    </svg>
                </div>
            )}

            {contextMenu && contextMenu.visible && (
                <div 
                    className="absolute w-48 bg-[#252525] border border-black shadow-2xl rounded text-xs flex flex-col z-[100] overflow-hidden"
                    style={{ left: contextMenu.x, top: contextMenu.y }}
                    onMouseDown={e => e.stopPropagation()}
                >
                    <div className="bg-[#1a1a1a] p-2 border-b border-black/50">
                        <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">
                            {pendingConnection ? 'Link New Node' : 'Add Node'}
                        </span>
                    </div>
                    <input 
                        autoFocus 
                        placeholder="Search..." 
                        aria-label="Search nodes"
                        title="Search nodes"
                        className="p-2 bg-[#1a1a1a] text-white outline-none border-b border-black/50" 
                        value={searchFilter} 
                        onChange={e => setSearchFilter(e.target.value)} 
                    />
                    <div className="max-h-64 overflow-y-auto custom-scrollbar">
                         {Object.values(NodeRegistry)
                            .filter(d => d.title.toLowerCase().includes(searchFilter.toLowerCase()))
                            .map(def => (
                             <button key={def.type} className="w-full text-left px-3 py-2 text-gray-300 hover:bg-accent hover:text-white flex items-center justify-between group" onClick={() => addNode(def.type)}>
                                 <span>{def.title}</span>
                                 <span className="text-[9px] text-gray-600 group-hover:text-white/70">{def.category}</span>
                             </button>
                         ))}
                    </div>
                </div>
            )}
        </div>
    );
};
