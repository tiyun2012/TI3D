
import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { GraphNode, GraphConnection } from '../types';
import { engineInstance } from '../services/engine';
import { NodeRegistry, getTypeColor } from '../services/NodeRegistry';
import { Icon } from './Icon';
import { assetManager } from '../services/AssetManager';

// Modular imports
import { LayoutConfig } from './node-graph/GraphConfig';
import { GraphUtils } from './node-graph/GraphUtils';
import { useGraphHistory } from './node-graph/useGraphHistory';
import { NodeItem } from './node-graph/NodeItem';
import { ConnectionLine } from './node-graph/ConnectionLine';

interface NodeGraphProps {
    assetId?: string | null;
}

export const NodeGraph: React.FC<NodeGraphProps> = ({ assetId }) => {
    const [nodes, setNodes] = useState<GraphNode[]>([]);
    const [connections, setConnections] = useState<GraphConnection[]>([]);
    
    // History Hook
    const { pushSnapshot, undo, redo } = useGraphHistory(nodes, connections, setNodes, setConnections);

    const [connecting, setConnecting] = useState<{ nodeId: string, pinId: string, type: 'input'|'output', x: number, y: number, dataType: string } | null>(null);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, visible: boolean } | null>(null);
    const [searchFilter, setSearchFilter] = useState('');
    const [showGrid, setShowGrid] = useState(true);
    const [pendingConnection, setPendingConnection] = useState<{ nodeId: string, pinId: string, type: 'input'|'output' } | null>(null);
    
    const [selectedNodeIds, setSelectedNodeIds] = useState<Set<string>>(new Set());
    const [selectionBox, setSelectionBox] = useState<{ startX: number, startY: number, currentX: number, currentY: number } | null>(null);
    const [cutLine, setCutLine] = useState<{ start: {x:number, y:number}, end: {x:number, y:number} } | null>(null);

    // Compile State
    const [compileStatus, setCompileStatus] = useState<'IDLE' | 'COMPILING' | 'READY'>('READY');

    // Clipboard (In-memory)
    const clipboard = useRef<{ nodes: GraphNode[], connections: GraphConnection[] } | null>(null);

    const transformRef = useRef({ x: 0, y: 0, k: 1 });
    const viewRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const nodeRefs = useRef<Map<string, HTMLDivElement>>(new Map());
    
    const hoverPortRef = useRef<boolean>(false);
    const activeListenersRef = useRef<{ move?: (ev: MouseEvent) => void; up?: (ev: MouseEvent) => void; cleanup?: () => void }>({});

    // --- Loading Logic ---
    useEffect(() => {
        if (assetId) {
            const asset = assetManager.getAsset(assetId);
            if (asset && (asset.type === 'MATERIAL' || asset.type === 'SCRIPT')) {
                setNodes(asset.data.nodes);
                setConnections(asset.data.connections);
                // Initial compile on load
                if (asset.type === 'MATERIAL') {
                    engineInstance.compileGraph(asset.data.nodes, asset.data.connections, assetId);
                } else {
                    engineInstance.compileGraph(asset.data.nodes, asset.data.connections); // Logic only
                }
            }
        } else {
            setNodes([]);
            setConnections([]);
        }
    }, [assetId]);

    const handleSave = () => {
        if (assetId) {
            const asset = assetManager.getAsset(assetId);
            if (asset?.type === 'MATERIAL') {
                const glsl = engineInstance.currentShaderSource;
                assetManager.saveMaterial(assetId, nodes, connections, glsl);
                alert(`Saved Material!`);
            } else if (asset?.type === 'SCRIPT') {
                assetManager.saveScript(assetId, nodes, connections);
                alert(`Saved Script!`);
            }
        }
    };

    const triggerCompile = useCallback(() => {
        if (!assetId) return;
        const asset = assetManager.getAsset(assetId);
        if (!asset) return;

        setCompileStatus('COMPILING');
        // Small delay to show visual feedback
        setTimeout(() => {
            if (asset.type === 'MATERIAL') {
                engineInstance.compileGraph(nodes, connections, assetId);
            } else {
                engineInstance.compileGraph(nodes, connections); // Logic
            }
            setCompileStatus('READY');
        }, 100);
    }, [nodes, connections, assetId]);

    // OPTIMIZATION: Debounce graph compilation
    useEffect(() => {
        if (!assetId) return;
        const asset = assetManager.getAsset(assetId);
        if (!asset) return;

        setCompileStatus('COMPILING');
        const timeoutId = setTimeout(() => {
            if (asset.type === 'MATERIAL') {
                engineInstance.compileGraph(nodes, connections, assetId);
            } else {
                // For scripts, we compile logic which updates execution list instantly
                engineInstance.compileGraph(nodes, connections);
            }
            setCompileStatus('READY');
        }, 500); // Slightly longer debounce to reduce flicker
        return () => clearTimeout(timeoutId);
    }, [nodes, connections, assetId]);

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

    // --- Interaction Handlers ---

    const handleCopy = useCallback(() => {
        if (selectedNodeIds.size === 0) return;
        const nodesToCopy = nodes.filter(n => selectedNodeIds.has(n.id));
        // Only copy connections that are fully internal to the selection
        const connectionsToCopy = connections.filter(c => selectedNodeIds.has(c.fromNode) && selectedNodeIds.has(c.toNode));
        
        clipboard.current = {
            nodes: nodesToCopy,
            connections: connectionsToCopy
        };
        console.log("Copied", clipboard.current);
    }, [nodes, connections, selectedNodeIds]);

    const handlePaste = useCallback(() => {
        if (!clipboard.current || !containerRef.current) return;
        
        const pasteData = clipboard.current;
        pushSnapshot(nodes, connections);

        // Generate new IDs and Map
        const idMap = new Map<string, string>();
        
        const newNodes = pasteData.nodes.map(n => {
            const newId = crypto.randomUUID();
            idMap.set(n.id, newId);
            return {
                ...n,
                id: newId,
                // Offset position slightly so it doesn't overlap perfectly
                position: { x: n.position.x + 20, y: n.position.y + 20 }
            };
        });

        const newConnections = pasteData.connections.map(c => ({
            id: crypto.randomUUID(),
            fromNode: idMap.get(c.fromNode)!,
            fromPin: c.fromPin,
            toNode: idMap.get(c.toNode)!,
            toPin: c.toPin
        }));

        setNodes(prev => [...prev, ...newNodes]);
        setConnections(prev => [...prev, ...newConnections]);
        
        // Select pasted
        setSelectedNodeIds(new Set(newNodes.map(n => n.id)));
    }, [nodes, connections, pushSnapshot]);

    // Keyboard Shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Delete
            if (e.key === 'Delete' || e.key === 'Backspace') {
                if (selectedNodeIds.size > 0 && !e.target?.['tagName']?.match(/INPUT|TEXTAREA/)) {
                    pushSnapshot(nodes, connections);
                    setNodes(prev => prev.filter(n => !selectedNodeIds.has(n.id)));
                    setConnections(prev => prev.filter(c => !selectedNodeIds.has(c.fromNode) && !selectedNodeIds.has(c.toNode)));
                    setSelectedNodeIds(new Set());
                }
            }
            // Focus
            if (e.key === 'f' || e.key === 'F') {
                const targets = nodes.filter(n => selectedNodeIds.has(n.id));
                const focusNodes = targets.length > 0 ? targets : nodes;
                if (focusNodes.length === 0) return;

                // Simple BBox calc logic (could be moved to utils)
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                focusNodes.forEach(n => {
                    minX = Math.min(minX, n.position.x);
                    minY = Math.min(minY, n.position.y);
                    maxX = Math.max(maxX, n.position.x + LayoutConfig.NODE_WIDTH);
                    maxY = Math.max(maxY, n.position.y + 100);
                });
                
                const padding = 50;
                const width = (maxX - minX) + padding * 2;
                const height = (maxY - minY) + padding * 2;
                const containerW = containerRef.current?.clientWidth || 800;
                const containerH = containerRef.current?.clientHeight || 600;
                
                let k = Math.min(containerW / width, containerH / height);
                k = Math.min(Math.max(k, 0.2), 2.0); 
                
                const centerX = minX + (maxX - minX) / 2;
                const centerY = minY + (maxY - minY) / 2;
                
                transformRef.current = { 
                    x: containerW / 2 - centerX * k, 
                    y: containerH / 2 - centerY * k, 
                    k 
                };
                updateViewportStyle();
            }
            // Undo/Redo
            if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
                e.preventDefault();
                if (e.shiftKey) redo(nodes, connections);
                else undo(nodes, connections);
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'y') {
                e.preventDefault();
                redo(nodes, connections);
            }
            // Copy/Paste
            if ((e.metaKey || e.ctrlKey) && e.key === 'c') {
                handleCopy();
            }
            if ((e.metaKey || e.ctrlKey) && e.key === 'v') {
                handlePaste();
            }
        };
        
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [nodes, connections, selectedNodeIds, pushSnapshot, undo, redo, handleCopy, handlePaste, updateViewportStyle]);

    const cleanupListeners = useCallback(() => {
        if (activeListenersRef.current.move) window.removeEventListener('mousemove', activeListenersRef.current.move);
        if (activeListenersRef.current.up) window.removeEventListener('mouseup', activeListenersRef.current.up);
        if (activeListenersRef.current.cleanup) activeListenersRef.current.cleanup();
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

        setContextMenu(null);

        // --- 1. ZOOM (Alt + Right Click) ---
        if (e.altKey && e.button === 2) {
            e.preventDefault();
            e.stopPropagation();
            cleanupListeners();

            const startMouseX = e.clientX;
            const startMouseY = e.clientY;
            const startK = transformRef.current.k;
            const startT = { ...transformRef.current };
            
            // Pivot point in world space (under mouse)
            const pivotX = (e.clientX - rect.left - startT.x) / startK;
            const pivotY = (e.clientY - rect.top - startT.y) / startK;

            let frameId = 0;

            const onMove = (ev: MouseEvent) => {
                cancelAnimationFrame(frameId);
                frameId = requestAnimationFrame(() => {
                    const dx = ev.clientX - startMouseX;
                    const dy = ev.clientY - startMouseY;
                    
                    // Drag Right/Up to Zoom In
                    const delta = dx - dy;
                    const zoomFactor = Math.exp(delta * 0.005);
                    const newK = Math.min(Math.max(startK * zoomFactor, 0.2), 3.0);

                    // Re-calculate Translation to keep pivot stable around mouse
                    const newX = (e.clientX - rect.left) - (pivotX * newK);
                    const newY = (e.clientY - rect.top) - (pivotY * newK);

                    transformRef.current = { x: newX, y: newY, k: newK };
                    updateViewportStyle();
                });
            };

            const onUp = () => { cancelAnimationFrame(frameId); cleanupListeners(); };
            const cleanup = () => cancelAnimationFrame(frameId);

            activeListenersRef.current = { move: onMove, up: onUp, cleanup };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            return;
        }

        // --- 2. PAN (Middle Click OR Alt + Left Click) ---
        if (e.button === 1 || (e.altKey && e.button === 0)) {
            e.preventDefault();
            e.stopPropagation();
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

            const onUp = () => { cancelAnimationFrame(frameId); cleanupListeners(); };
            const cleanup = () => cancelAnimationFrame(frameId);

            activeListenersRef.current = { move: onMove, up: onUp, cleanup };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            return;
        }

        // --- 3. CONTEXT / CUT (Right Click) ---
        // Only if Alt is NOT pressed
        if (e.button === 2 && !e.altKey) { 
            e.preventDefault();
            e.stopPropagation();

            if (e.ctrlKey) {
                // Cut Tool
                cleanupListeners();
                const startX = e.clientX - rect.left;
                const startY = e.clientY - rect.top;
                
                setCutLine({ start: {x: startX, y: startY}, end: {x: startX, y: startY} });

                const onMove = (ev: MouseEvent) => {
                    setCutLine(prev => prev ? { ...prev, end: { x: ev.clientX - rect.left, y: ev.clientY - rect.top } } : null);
                };

                const onUp = (ev: MouseEvent) => {
                    cleanupListeners(); 
                    setCutLine(null); 
                    
                    const t = transformRef.current;
                    const worldStart = { x: (startX - t.x) / t.k, y: (startY - t.y) / t.k };
                    const worldEnd = { x: (ev.clientX - rect.left - t.x) / t.k, y: (ev.clientY - rect.top - t.y) / t.k };
                    
                    // Only modify if something changes
                    const newConnections = connections.filter(conn => {
                        const fromNode = nodeMap.get(conn.fromNode);
                        const toNode = nodeMap.get(conn.toNode);
                        if (!fromNode || !toNode) return false;

                        const p1 = GraphUtils.getPinPosition(fromNode, conn.fromPin, 'output');
                        const p2 = GraphUtils.getPinPosition(toNode, conn.toPin, 'input');
                        p1.x += LayoutConfig.WIRE_GAP;
                        p2.x -= LayoutConfig.WIRE_GAP;

                        const bezierPoints = GraphUtils.getBezierPoints(p1.x, p1.y, p2.x, p2.y);
                        let intersected = false;
                        for(let i=0; i<bezierPoints.length-1; i++) {
                            if (GraphUtils.lineIntersectsLine(worldStart, worldEnd, bezierPoints[i], bezierPoints[i+1])) {
                                intersected = true; break;
                            }
                        }
                        return !intersected;
                    });

                    if (newConnections.length !== connections.length) {
                        pushSnapshot(nodes, connections);
                        setConnections(newConnections);
                    }
                };

                const cleanup = () => setCutLine(null);
                activeListenersRef.current = { move: onMove, up: onUp, cleanup };
                window.addEventListener('mousemove', onMove);
                window.addEventListener('mouseup', onUp);
                return;
            }

            setContextMenu({ x: e.clientX - rect.left, y: e.clientY - rect.top, visible: true });
            setPendingConnection(null);
            return;
        }
        
        // --- 4. BOX SELECT (Left Click) ---
        // Only if Alt is NOT pressed
        if (e.button === 0 && !e.altKey) {
            if (!e.shiftKey && !e.ctrlKey) {
                setSelectedNodeIds(new Set());
            }
            cleanupListeners();

            const borderLeft = containerRef.current?.clientLeft || 0;
            const borderTop = containerRef.current?.clientTop || 0;
            const startX = e.clientX - rect.left - borderLeft;
            const startY = e.clientY - rect.top - borderTop;
            
            setSelectionBox({ startX, startY, currentX: startX, currentY: startY });

            let frameId = 0;

            const onMove = (ev: MouseEvent) => {
                const currentX = ev.clientX - rect.left - borderLeft;
                const currentY = ev.clientY - rect.top - borderTop;
                setSelectionBox(prev => prev ? { ...prev, currentX, currentY } : null);

                cancelAnimationFrame(frameId);
                frameId = requestAnimationFrame(() => {
                     const minX = Math.min(startX, currentX), maxX = Math.max(startX, currentX);
                     const minY = Math.min(startY, currentY), maxY = Math.max(startY, currentY);
                     const newSelected = new Set(e.shiftKey || e.ctrlKey ? selectedNodeIds : []);
                     
                     const t = transformRef.current;
                     const wMinX = (minX - t.x) / t.k, wMaxX = (maxX - t.x) / t.k;
                     const wMinY = (minY - t.y) / t.k, wMaxY = (maxY - t.y) / t.k;

                     nodeRefs.current.forEach((wrapperEl, id) => {
                         const node = nodeMap.get(id);
                         if (!node) return;
                         
                         // Get the inner NodeItem element which has the correct width/height
                         const nodeEl = wrapperEl.firstElementChild as HTMLElement;
                         if (!nodeEl) return;

                         const nx = node.position.x, ny = node.position.y;
                         const nw = nodeEl.offsetWidth, nh = nodeEl.offsetHeight;
                         
                         // Check overlap (AABB Intersection)
                         if (wMinX < nx + nw && wMaxX > nx && wMinY < ny + nh && wMaxY > ny) {
                             newSelected.add(id);
                         }
                     });
                     setSelectedNodeIds(newSelected);
                });
            };

            const onUp = () => { cancelAnimationFrame(frameId); cleanupListeners(); setSelectionBox(null); };
            const cleanup = () => { cancelAnimationFrame(frameId); setSelectionBox(null); };
            
            activeListenersRef.current = { move: onMove, up: onUp, cleanup };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
        }
    }, [cleanupListeners, updateViewportStyle, selectedNodeIds, nodeMap, connections, nodes, pushSnapshot]);

    const handleNodeDragStart = useCallback((e: React.MouseEvent, node: GraphNode) => {
        // ALLOW BUBBLING IF ALT PRESSED (For Camera Navigation)
        if (e.altKey) return; 

        e.stopPropagation();
        if (e.button !== 0) return;
        
        cleanupListeners();

        pushSnapshot(nodes, connections);

        let currentSelection = new Set(selectedNodeIds);
        if (!currentSelection.has(node.id)) {
            if (!e.shiftKey && !e.ctrlKey) currentSelection = new Set([node.id]);
            else currentSelection.add(node.id);
            setSelectedNodeIds(currentSelection);
        }

        const startMouse = { x: e.clientX, y: e.clientY };
        const k = transformRef.current.k;
        const startPositions = new Map<string, {x: number, y: number}>();
        
        // Only iterate nodes once
        nodes.forEach(n => {
            if (currentSelection.has(n.id)) startPositions.set(n.id, { ...n.position });
        });

        let frameId = 0;

        const onMove = (ev: MouseEvent) => {
            cancelAnimationFrame(frameId);
            frameId = requestAnimationFrame(() => {
                const dx = (ev.clientX - startMouse.x) / k;
                const dy = (ev.clientY - startMouse.y) / k;

                setNodes(prev => prev.map(n => {
                    if (startPositions.has(n.id)) {
                        const s = startPositions.get(n.id)!;
                        return { ...n, position: { x: s.x + dx, y: s.y + dy } };
                    }
                    return n;
                }));
            });
        };

        const onUp = () => { cancelAnimationFrame(frameId); cleanupListeners(); };
        const cleanup = () => cancelAnimationFrame(frameId);

        activeListenersRef.current = { move: onMove, up: onUp, cleanup };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [nodes, connections, cleanupListeners, selectedNodeIds, pushSnapshot]);

    const handlePinDown = useCallback((e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        // ALLOW BUBBLING IF ALT PRESSED (For Camera Navigation)
        if (e.altKey) return;

        e.stopPropagation(); e.preventDefault();
        if (e.button !== 0) return;
        
        cleanupListeners();
        const rect = containerRef.current?.getBoundingClientRect();
        if(!rect) return;
        
        const startMouse = { x: e.clientX, y: e.clientY };
        const pos = GraphUtils.screenToWorld(e.clientX, e.clientY, rect, transformRef.current);
        const dataType = getPortType(nodeId, pinId, type);
        
        setConnecting({ nodeId, pinId, type, x: pos.x, y: pos.y, dataType });

        const onMove = (ev: MouseEvent) => {
            const worldPos = GraphUtils.screenToWorld(ev.clientX, ev.clientY, rect, transformRef.current);
            setConnecting(prev => prev ? { ...prev, x: worldPos.x, y: worldPos.y } : null);
        };
        
        const onUp = (ev: MouseEvent) => {
            cleanupListeners();
            setConnecting(null);
            
            const dist = Math.sqrt(Math.pow(ev.clientX - startMouse.x, 2) + Math.pow(ev.clientY - startMouse.y, 2));
            if (!hoverPortRef.current && dist > 10) {
                setContextMenu({ x: ev.clientX - rect.left, y: ev.clientY - rect.top, visible: true });
                setPendingConnection({ nodeId, pinId, type });
            }
        };
        
        const cleanup = () => setConnecting(null);
        activeListenersRef.current = { move: onMove, up: onUp, cleanup };
        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onUp);
    }, [cleanupListeners, getPortType]);

    const handlePinUp = useCallback((e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => {
        e.stopPropagation();
        hoverPortRef.current = true;
        
        setConnecting(prev => {
            if (prev && prev.nodeId !== nodeId && prev.type !== type) {
                const source = prev.type === 'output' ? prev : { nodeId, pinId };
                const target = prev.type === 'input' ? prev : { nodeId, pinId };
                
                const sourceType = getPortType(source.nodeId, source.pinId, 'output');
                const targetType = getPortType(target.nodeId, target.pinId, 'input');
                
                if (!isCompatible(sourceType, targetType)) return null;
                if (source.nodeId === target.nodeId) return null;

                // Push history before connecting
                pushSnapshot(nodes, connections);

                setConnections(curr => {
                    // Check duplicate
                    const exists = curr.some(c => c.fromNode === source.nodeId && c.fromPin === source.pinId && c.toNode === target.nodeId && c.toPin === target.pinId);
                    if (exists) return curr;

                    // Remove existing input if any
                    const clean = curr.filter(c => !(c.toNode === target.nodeId && c.toPin === target.pinId));
                    return [...clean, { id: crypto.randomUUID(), fromNode: source.nodeId, fromPin: source.pinId, toNode: target.nodeId, toPin: target.pinId }];
                });
            }
            return null;
        });
    }, [getPortType, isCompatible, nodes, connections, pushSnapshot]);

    const addNode = (type: string) => {
        if(!contextMenu || !containerRef.current) return;
        
        pushSnapshot(nodes, connections);

        const t = transformRef.current;
        const pos = {
            x: (contextMenu.x - t.x) / t.k,
            y: (contextMenu.y - t.y) / t.k
        };
        const newNodeId = crypto.randomUUID();
        
        let initialData = {};
        if (type === 'Float') initialData = { value: '0' };
        if (type === 'Vec3') initialData = { x: '0', y: '0', z: '0' };

        const newNode: GraphNode = { id: newNodeId, type, position: pos, data: initialData };
        
        setNodes(p => [...p, newNode]);
        setSelectedNodeIds(new Set([newNodeId]));
        setContextMenu(null);
        setSearchFilter('');

        if (pendingConnection) {
            const def = NodeRegistry[type];
            if (def) {
                const targetType = pendingConnection.type === 'input' ? 'output' : 'input';
                const ports = targetType === 'input' ? def.inputs : def.outputs;
                
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

    const handleNodeDataChange = useCallback((nodeId: string, key: string, value: string) => {
        setNodes(prev => prev.map(n => n.id === nodeId ? {...n, data: {...n.data, [key]: value}} : n));
    }, []);

    // Memoized Wires for performance
    const renderedWires = useMemo(() => {
        return connections.map(c => {
            const fromNode = nodeMap.get(c.fromNode);
            const toNode = nodeMap.get(c.toNode);
            return <ConnectionLine key={c.id} connection={c} fromNode={fromNode} toNode={toNode} />;
        });
    }, [connections, nodeMap]);

    if (!assetId) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center bg-[#151515] text-text-secondary select-none">
                <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                    <Icon name="Workflow" size={32} className="opacity-50" />
                </div>
                <div className="text-sm font-medium">No Asset Selected</div>
                <div className="text-xs opacity-50 mt-1">Double click a material or script in the Project Panel to edit.</div>
            </div>
        );
    }

    return (
        <div 
            ref={containerRef}
            className="w-full h-full bg-[#111] overflow-hidden relative select-none outline-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onContextMenu={e => e.preventDefault()}
            tabIndex={0} // Allow focus for keyboard shortcuts
        >
             <div className="absolute inset-0 pointer-events-none opacity-20"
                style={{ backgroundImage: 'linear-gradient(#333 1px, transparent 1px), linear-gradient(90deg, #333 1px, transparent 1px)' }}
            />
            
            <div className="absolute top-2 left-2 z-50 flex gap-2 items-center">
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
                    title="Save Asset"
                >
                    <Icon name="Save" size={12} />
                    <span>Save</span>
                </button>

                <div className="h-4 w-px bg-white/10 mx-2"></div>

                <div className="flex items-center gap-2 bg-black/40 rounded-full px-3 py-1 border border-white/5">
                    {/* Status Dot */}
                    <div className={`w-2 h-2 rounded-full ${compileStatus === 'COMPILING' ? 'bg-yellow-500 animate-pulse' : 'bg-emerald-500'}`}></div>
                    
                    {/* Status Text */}
                    <span className="text-[10px] text-text-secondary font-mono uppercase tracking-wider">
                        {compileStatus === 'COMPILING' ? 'Compiling...' : 'Ready'}
                    </span>

                    {/* Manual Compile Button */}
                    <button 
                        onClick={triggerCompile}
                        className="ml-2 hover:text-white text-text-secondary"
                        title="Force Compile"
                    >
                        <Icon name="RefreshCw" size={12} className={compileStatus === 'COMPILING' ? 'animate-spin' : ''} />
                    </button>
                </div>
                
                {/* Help hint */}
                <div className="flex items-center gap-2 ml-4 text-[10px] text-text-secondary opacity-50">
                    <span>Pan: Alt+LMB / MMB</span>
                    <span>Zoom: Alt+RMB / Wheel</span>
                    <span>Copy: Ctrl+C</span>
                </div>
            </div>
            
            {assetId && (
                <div className="absolute top-2 right-2 z-50 px-2 py-1 bg-black/50 text-white/50 text-[10px] rounded border border-white/5 pointer-events-none">
                    Editing: {assetManager.getAsset(assetId)?.name}
                </div>
            )}

            <div ref={viewRef} className="w-full h-full origin-top-left will-change-transform" style={{ transform: `translate3d(0px, 0px, 0) scale(1)` }}>
                <svg className="absolute top-0 left-0 overflow-visible pointer-events-none w-1 h-1">
                    {renderedWires}
                    {connecting && (() => {
                         const node = nodeMap.get(connecting.nodeId);
                         if(!node) return null;
                         const pinPos = GraphUtils.getPinPosition(node, connecting.pinId, connecting.type);
                         
                         if (connecting.type === 'output') pinPos.x += LayoutConfig.WIRE_GAP;
                         else pinPos.x -= LayoutConfig.WIRE_GAP;

                         const p2 = { x: connecting.x, y: connecting.y };
                         const start = connecting.type === 'output' ? pinPos : p2;
                         const end = connecting.type === 'output' ? p2 : pinPos;
                         
                         const color = getTypeColor(connecting.dataType as any);
                         return <path d={GraphUtils.calculateCurve(start.x, start.y, end.x, end.y)} stroke={color} strokeWidth="2" strokeDasharray="5,5" fill="none" />;
                    })()}
                </svg>

                {nodes.map(node => (
                    <div 
                        key={node.id} 
                        ref={el => { if(el) nodeRefs.current.set(node.id, el) }}
                        className="absolute pointer-events-none" // Wrapper to position ref, child handles events
                    >
                        <NodeItem 
                            node={node}
                            selected={selectedNodeIds.has(node.id)}
                            connecting={connecting}
                            onMouseDown={handleNodeDragStart}
                            onPinDown={handlePinDown}
                            onPinUp={handlePinUp}
                            onPinEnter={() => { hoverPortRef.current = true; }}
                            onPinLeave={() => { hoverPortRef.current = false; }}
                            onDataChange={handleNodeDataChange}
                        />
                    </div>
                ))}
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
