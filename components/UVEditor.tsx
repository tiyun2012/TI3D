
import React, { useRef, useEffect, useState, useContext, useLayoutEffect } from 'react';
import { EditorContext } from '../contexts/EditorContext';
import { assetManager } from '../services/AssetManager';
import { engineInstance } from '../services/engine';
import { Icon } from './Icon';
import { StaticMeshAsset, SkeletalMeshAsset } from '../types';

export const UVEditor: React.FC = () => {
    const ctx = useContext(EditorContext);
    const selectedAssetIds = ctx?.selectedAssetIds || [];
    const selectedEntityIds = ctx?.selectedIds || [];
    
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    
    // Viewport State
    const [transform, setTransform] = useState({ x: 50, y: 50, k: 300 }); 
    const [selectedVertex, setSelectedVertex] = useState<number>(-1);
    const [isDragging, setIsDragging] = useState(false);
    
    // Resize Trigger
    const [viewportSize, setViewportSize] = useState({ w: 1, h: 1 });

    // Selection State
    const [editingAsset, setEditingAsset] = useState<StaticMeshAsset | SkeletalMeshAsset | null>(null);
    const [uvBuffer, setUvBuffer] = useState<Float32Array | null>(null);

    // 1. Resolve Selection Strategy
    useEffect(() => {
        let asset: StaticMeshAsset | SkeletalMeshAsset | null = null;

        // A. Explicit Asset Selection (Project Panel)
        if (selectedAssetIds.length > 0) {
            const a = assetManager.getAsset(selectedAssetIds[0]);
            if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) {
                asset = a as StaticMeshAsset;
            }
        } 
        // B. Fallback: Entity Selection (Scene View)
        else if (selectedEntityIds.length > 0) {
            const entityId = selectedEntityIds[0];
            const idx = engineInstance.ecs.idToIndex.get(entityId);
            if (idx !== undefined) {
                const meshIntId = engineInstance.ecs.store.meshType[idx];
                if (meshIntId > 0) {
                    // Look up Asset UUID from Internal Mesh ID
                    const uuid = assetManager.meshIntToUuid.get(meshIntId);
                    if (uuid) {
                        const a = assetManager.getAsset(uuid);
                        if (a && (a.type === 'MESH' || a.type === 'SKELETAL_MESH')) {
                            asset = a as StaticMeshAsset;
                        }
                    }
                }
            }
        }

        // Only update if asset changed to prevent reset of pan/zoom
        if (asset && asset.id !== editingAsset?.id) {
            setEditingAsset(asset);
            setUvBuffer(new Float32Array(asset.geometry.uvs));
            // Auto-center view could go here
        } else if (!asset) {
            setEditingAsset(null);
            setUvBuffer(null);
        }
    }, [selectedAssetIds, selectedEntityIds, editingAsset?.id]);

    // 2. Resize Observer to handle window resizing
    useLayoutEffect(() => {
        if (!containerRef.current) return;
        const observer = new ResizeObserver(entries => {
            const { width, height } = entries[0].contentRect;
            if (width > 0 && height > 0) {
                setViewportSize({ w: width, h: height });
            }
        });
        observer.observe(containerRef.current);
        return () => observer.disconnect();
    }, []);

    // 3. Render Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        
        // Sync resolution
        if (canvas.width !== viewportSize.w || canvas.height !== viewportSize.h) {
            canvas.width = viewportSize.w;
            canvas.height = viewportSize.h;
        }

        const ctx2d = canvas.getContext('2d');
        if (!ctx2d) return;

        // Clear
        ctx2d.fillStyle = '#151515';
        ctx2d.fillRect(0, 0, canvas.width, canvas.height);

        // Empty State
        if (!editingAsset || !uvBuffer) {
            ctx2d.fillStyle = '#444';
            ctx2d.font = '12px Inter, sans-serif';
            ctx2d.textAlign = 'center';
            ctx2d.fillText("No Mesh Selected", canvas.width/2, canvas.height/2);
            ctx2d.font = '10px Inter, sans-serif';
            ctx2d.fillStyle = '#333';
            ctx2d.fillText("Select a Mesh in Scene or Project", canvas.width/2, canvas.height/2 + 15);
            return;
        }

        const { x, y, k } = transform;
        const toX = (u: number) => x + u * k;
        // UV V=0 is bottom, V=1 is top. Canvas Y=0 is top.
        // ScreenY = OffsetY + (1.0 - V) * Scale
        const toY = (v: number) => y + (1 - v) * k;

        // Grid Background (0..1 UV Space)
        ctx2d.strokeStyle = '#333';
        ctx2d.lineWidth = 2;
        ctx2d.strokeRect(toX(0), toY(1), k, k); // Main 0-1 box
        
        // Subgrid
        ctx2d.beginPath();
        ctx2d.lineWidth = 1;
        ctx2d.strokeStyle = '#252525';
        for(let i=1; i<10; i++) {
            const t = i/10;
            ctx2d.moveTo(toX(t), toY(0)); ctx2d.lineTo(toX(t), toY(1));
            ctx2d.moveTo(toX(0), toY(t)); ctx2d.lineTo(toX(1), toY(t));
        }
        ctx2d.stroke();

        // Mesh Edges
        ctx2d.beginPath();
        ctx2d.strokeStyle = '#4f80f8';
        ctx2d.lineWidth = 1;
        const idx = editingAsset.geometry.indices;
        // Check buffers exist
        if (idx && uvBuffer.length > 0) {
            for(let i=0; i<idx.length; i+=3) {
                const i1 = idx[i], i2 = idx[i+1], i3 = idx[i+2];
                // Safety check indices
                if (i1*2+1 >= uvBuffer.length) continue;

                const u1 = uvBuffer[i1*2], v1 = uvBuffer[i1*2+1];
                const u2 = uvBuffer[i2*2], v2 = uvBuffer[i2*2+1];
                const u3 = uvBuffer[i3*2], v3 = uvBuffer[i3*2+1];
                
                ctx2d.moveTo(toX(u1), toY(v1));
                ctx2d.lineTo(toX(u2), toY(v2));
                ctx2d.lineTo(toX(u3), toY(v3));
                ctx2d.lineTo(toX(u1), toY(v1));
            }
        }
        ctx2d.stroke();

        // Vertices
        ctx2d.fillStyle = '#aaa';
        const pSize = 4;
        for(let i=0; i<uvBuffer.length/2; i++) {
            if (i === selectedVertex) continue;
            ctx2d.fillRect(toX(uvBuffer[i*2]) - pSize/2, toY(uvBuffer[i*2+1]) - pSize/2, pSize, pSize);
        }

        // Selected Vertex Highlight
        if (selectedVertex !== -1 && selectedVertex * 2 < uvBuffer.length) {
            ctx2d.fillStyle = '#fbbf24';
            const sx = toX(uvBuffer[selectedVertex*2]);
            const sy = toY(uvBuffer[selectedVertex*2+1]);
            ctx2d.fillRect(sx - 5, sy - 5, 10, 10);
            
            // Coordinate Label
            ctx2d.fillStyle = 'white';
            ctx2d.font = '10px monospace';
            ctx2d.textAlign = 'left';
            const label = `UV: ${uvBuffer[selectedVertex*2].toFixed(3)}, ${uvBuffer[selectedVertex*2+1].toFixed(3)}`;
            ctx2d.fillText(label, sx + 12, sy + 4);
        }

    }, [editingAsset, uvBuffer, transform, selectedVertex, viewportSize]);

    // --- Interactions ---

    const handleWheel = (e: React.WheelEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        
        const zoomIntensity = 0.1;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const zoomFactor = Math.exp(wheel * zoomIntensity);
        
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        const newK = Math.max(10, transform.k * zoomFactor); // Min zoom limit
        
        // Zoom towards mouse pointer
        // worldX = (mouseX - transform.x) / transform.k
        // newTransformX = mouseX - worldX * newK
        const wx = (mouseX - transform.x) / transform.k;
        const wy = (mouseY - transform.y) / transform.k;
        
        setTransform({
            x: mouseX - wx * newK,
            y: mouseY - wy * newK,
            k: newK
        });
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        if (e.button === 1 || e.altKey) {
            setIsDragging(true);
            return;
        }

        if (e.button === 0 && uvBuffer) {
            // Hit Test Vertices
            let closest = -1;
            let minDst = 10; // Pixel threshold

            for (let i = 0; i < uvBuffer.length / 2; i++) {
                const px = transform.x + uvBuffer[i*2] * transform.k;
                const py = transform.y + (1 - uvBuffer[i*2+1]) * transform.k;
                const dst = Math.sqrt((mx - px)**2 + (my - py)**2);
                if (dst < minDst) {
                    minDst = dst;
                    closest = i;
                }
            }

            setSelectedVertex(closest);
            if (closest !== -1) {
                setIsDragging(true);
            }
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging) return;
        
        if (e.buttons === 4 || e.altKey) {
            // Pan
            setTransform(prev => ({
                ...prev,
                x: prev.x + e.movementX,
                y: prev.y + e.movementY
            }));
        } else if (selectedVertex !== -1 && uvBuffer) {
            // Move Vertex (UV Space)
            // mx = x + u * k => u = (mx - x) / k
            // my = y + (1-v) * k => (my - y)/k = 1 - v => v = 1 - (my - y)/k
            const rect = containerRef.current!.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            
            const u = (mx - transform.x) / transform.k;
            const v = 1 - (my - transform.y) / transform.k;
            
            // Update Buffer (Clamped 0-1 usually, but leaving free for tiling)
            const newBuf = new Float32Array(uvBuffer);
            newBuf[selectedVertex * 2] = u;
            newBuf[selectedVertex * 2 + 1] = v;
            setUvBuffer(newBuf);
        }
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    const saveChanges = () => {
        if (editingAsset && uvBuffer) {
            // 1. Update Asset Data
            editingAsset.geometry.uvs = new Float32Array(uvBuffer);
            
            // 2. Re-upload to GPU
            const internalId = assetManager.getMeshID(editingAsset.id);
            if (internalId > 0) {
                engineInstance.renderer.registerMesh(internalId, editingAsset.geometry);
                // 3. Force Render
                engineInstance.tick(0);
            }
            alert('UVs Updated');
        }
    };

    return (
        <div className="w-full h-full flex flex-col bg-[#1a1a1a]">
            {/* Toolbar */}
            <div className="h-8 bg-panel-header border-b border-white/5 flex items-center px-2 justify-between shrink-0">
                <div className="flex items-center gap-2 text-xs text-text-secondary">
                    <Icon name="Box" size={12} />
                    {editingAsset ? (
                        <>
                            <span className="font-bold text-white">{editingAsset.name}</span>
                            <span className="opacity-50 border-l border-white/10 pl-2 ml-2">{uvBuffer ? uvBuffer.length / 2 : 0} Verts</span>
                        </>
                    ) : (
                        <span>No Mesh</span>
                    )}
                </div>
                {editingAsset && (
                    <button 
                        onClick={saveChanges} 
                        className="flex items-center gap-1 bg-accent hover:bg-accent-hover text-white text-[10px] px-2 py-1 rounded transition-colors"
                        title="Save UV Changes to Asset"
                    >
                        <Icon name="Save" size={10} /> Apply
                    </button>
                )}
            </div>
            
            {/* Canvas Container */}
            <div 
                ref={containerRef} 
                className="flex-1 relative overflow-hidden cursor-crosshair bg-[#151515]"
                onWheel={handleWheel}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
            >
                <canvas ref={canvasRef} className="block" />
                
                {/* Help Overlay */}
                <div className="absolute bottom-2 left-2 text-[9px] text-text-secondary opacity-50 pointer-events-none select-none bg-black/50 px-2 py-1 rounded">
                    Pan: Alt+Drag / MMB • Zoom: Wheel • Select/Move: LMB
                </div>
            </div>
        </div>
    );
};
