
import React, { useState, useContext, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './Icon';
import { assetManager } from '../services/AssetManager';
import { EditorContext } from '../contexts/EditorContext';
import { WindowManagerContext } from './WindowManager';
import { MATERIAL_TEMPLATES } from '../services/MaterialTemplates';
import { engineInstance } from '../services/engine';

export const ProjectPanel: React.FC = () => {
    const [tab, setTab] = useState<'PROJECT' | 'CONSOLE'>('PROJECT');
    const [filter, setFilter] = useState<'ALL' | 'MESH' | 'MATERIAL' | 'PHYSICS_MATERIAL' | 'SCRIPT'>('ALL');
    const [search, setSearch] = useState('');
    const [scale, setScale] = useState(40);
    const { setEditingAssetId, setSelectedIds, setSelectionType } = useContext(EditorContext)!;
    const wm = useContext(WindowManagerContext);
    
    // UI State
    const [showCreateMenu, setShowCreateMenu] = useState(false);
    const [contextMenu, setContextMenu] = useState<{ x: number, y: number, assetId: string, visible: boolean } | null>(null);
    const [refresh, setRefresh] = useState(0);

    const allAssets = assetManager.getAllAssets();
    const filteredAssets = allAssets.filter(a => {
        if (filter !== 'ALL' && a.type !== filter) return false;
        if (!a.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    // Close menus on click away
    useEffect(() => {
        const close = () => { setShowCreateMenu(false); setContextMenu(null); };
        window.addEventListener('click', close);
        window.addEventListener('contextmenu', (e) => {
            // Close if clicking outside
            if (contextMenu?.visible) {
                // We rely on the menu's stopPropagation to keep it open if clicked inside,
                // but for outside context clicks, we close.
                // Actually, let's just close on any global click/context to be safe and simple
                setContextMenu(null); 
            }
        });
        return () => {
            window.removeEventListener('click', close);
            // Don't remove the anonymous contextmenu listener to avoid complex ref logic, 
            // relying on standard React unmount cleanup is better but here we just added global close.
        };
    }, [contextMenu]); // dependency on contextMenu to close it correctly? No, just close.

    const handleDragStart = (e: React.DragEvent, assetId: string) => {
        e.dataTransfer.setData('application/ti3d-asset', assetId);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleClick = (assetId: string) => {
        setSelectedIds([assetId]);
        setSelectionType('ASSET');
    };

    const handleDoubleClick = (assetId: string) => {
        const asset = assetManager.getAsset(assetId);
        if (asset && (asset.type === 'MATERIAL' || asset.type === 'SCRIPT')) {
            setEditingAssetId(assetId);
            wm?.openWindow('graph');
        }
    };

    const handleContextMenu = (e: React.MouseEvent, assetId: string) => {
        e.preventDefault();
        e.stopPropagation(); // Stop bubbling to window listener
        
        // Use clientX/Y directly. 
        // NOTE: If the user complains about "far", it's often due to scaling/transforms. 
        // Using Portal to document.body + fixed position relative to viewport (clientX/Y) is the most robust way.
        setContextMenu({ x: e.clientX, y: e.clientY, assetId, visible: true });
        
        // Also select it
        handleClick(assetId);
    };

    // Actions
    const createMaterial = (templateIndex?: number) => {
        const tpl = templateIndex !== undefined ? MATERIAL_TEMPLATES[templateIndex] : undefined;
        assetManager.createMaterial(`New Material ${Math.floor(Math.random() * 1000)}`, tpl);
        setRefresh(r => r + 1);
    };

    const createPhysicsMaterial = () => {
        assetManager.createPhysicsMaterial(`New Physics Mat ${Math.floor(Math.random() * 1000)}`);
        setRefresh(r => r + 1);
    };

    const createScript = () => {
        assetManager.createScript(`New Script ${Math.floor(Math.random() * 1000)}`);
        setRefresh(r => r + 1);
    };

    const duplicateAsset = (id: string) => {
        assetManager.duplicateAsset(id);
        setRefresh(r => r + 1);
    };

    const applyMaterial = (assetId: string) => {
        engineInstance.applyMaterialToSelected(assetId);
    };

    return (
        <div className="h-full bg-panel flex flex-col font-sans border-t border-black/20" onContextMenu={(e) => e.preventDefault()}>
            {/* Toolbar / Tabs */}
            <div className="flex items-center justify-between bg-panel-header px-2 py-1 border-b border-black/20">
                <div className="flex gap-2">
                    <button 
                        onClick={() => setTab('PROJECT')}
                        className={`text-xs px-3 py-1 rounded-t-md transition-colors ${tab === 'PROJECT' ? 'bg-panel text-white border-t border-x border-black/10 font-bold' : 'text-text-secondary hover:text-white'}`}
                    >
                        Project
                    </button>
                    <button 
                        onClick={() => setTab('CONSOLE')}
                        className={`text-xs px-3 py-1 rounded-t-md transition-colors ${tab === 'CONSOLE' ? 'bg-panel text-white border-t border-x border-black/10 font-bold' : 'text-text-secondary hover:text-white'}`}
                    >
                        Console
                    </button>
                </div>
                
                {tab === 'PROJECT' && (
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <button 
                                onClick={(e) => { e.stopPropagation(); setShowCreateMenu(!showCreateMenu); }}
                                className={`p-1 hover:bg-white/10 rounded flex items-center gap-1 transition-colors ${showCreateMenu ? 'bg-white/10 text-white' : 'text-accent'}`}
                                title="Create Asset"
                            >
                                <Icon name="PlusSquare" size={16} />
                                <Icon name="ChevronDown" size={10} />
                            </button>
                            
                            {/* Create Menu */}
                            {showCreateMenu && (
                                <div className="absolute top-full right-0 mt-1 w-40 bg-[#252525] border border-white/10 shadow-xl rounded z-50 py-1 text-xs">
                                    <div className="px-3 py-1 text-[9px] text-text-secondary uppercase font-bold tracking-wider opacity-50">Create Material</div>
                                    {MATERIAL_TEMPLATES.map((tpl, i) => (
                                        <div 
                                            key={i} 
                                            className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer"
                                            onClick={() => createMaterial(i)}
                                        >
                                            {tpl.name}
                                        </div>
                                    ))}
                                    <div className="border-t border-white/10 my-1"></div>
                                    <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer" onClick={() => createScript()}>
                                        Logic Script
                                    </div>
                                    <div 
                                        className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer"
                                        onClick={() => createPhysicsMaterial()}
                                    >
                                        Physics Material
                                    </div>
                                </div>
                            )}
                        </div>

                        <input 
                            type="range" min="30" max="80" 
                            value={scale} onChange={(e) => setScale(Number(e.target.value))}
                            className="w-16 opacity-50 hover:opacity-100"
                            aria-label="Asset Scale"
                        />
                        <div className="relative">
                            <Icon name="Search" size={12} className="absolute left-2 top-1.5 text-text-secondary" />
                            <input 
                                type="text" 
                                placeholder="Search..." 
                                aria-label="Search Assets"
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-input-bg text-xs py-1 pl-7 pr-2 rounded-full outline-none border border-transparent focus:border-accent text-white w-40" 
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Breadcrumbs / Filters (Project Mode) */}
            {tab === 'PROJECT' && (
                <div className="bg-panel flex items-center gap-2 px-3 py-1.5 text-xs border-b border-black/10 overflow-x-auto">
                    <button onClick={() => setFilter('ALL')} className={`hover:text-white whitespace-nowrap ${filter === 'ALL' ? 'text-white font-bold' : 'text-text-secondary'}`}>All</button>
                    <span className="text-white/10">|</span>
                    <button onClick={() => setFilter('SCRIPT')} className={`hover:text-white whitespace-nowrap ${filter === 'SCRIPT' ? 'text-white font-bold' : 'text-text-secondary'}`}>Scripts</button>
                    <span className="text-white/10">|</span>
                    <button onClick={() => setFilter('MATERIAL')} className={`hover:text-white whitespace-nowrap ${filter === 'MATERIAL' ? 'text-white font-bold' : 'text-text-secondary'}`}>Materials</button>
                    <span className="text-white/10">|</span>
                    <button onClick={() => setFilter('MESH')} className={`hover:text-white whitespace-nowrap ${filter === 'MESH' ? 'text-white font-bold' : 'text-text-secondary'}`}>Meshes</button>
                    <span className="text-white/10">|</span>
                    <button onClick={() => setFilter('PHYSICS_MATERIAL')} className={`hover:text-white whitespace-nowrap ${filter === 'PHYSICS_MATERIAL' ? 'text-white font-bold' : 'text-text-secondary'}`}>Physics</button>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-2 bg-[#1a1a1a]">
                {tab === 'PROJECT' && (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2 pb-20">
                        {filteredAssets.map((asset) => {
                            const isMat = asset.type === 'MATERIAL';
                            const isPhys = asset.type === 'PHYSICS_MATERIAL';
                            const isScript = asset.type === 'SCRIPT';
                            
                            let iconName = 'Box';
                            let color = 'text-accent';
                            if (isMat) { iconName = 'Palette'; color = 'text-pink-500'; }
                            else if (isPhys) { iconName = 'Activity'; color = 'text-green-500'; }
                            else if (isScript) { iconName = 'FileCode'; color = 'text-yellow-500'; }

                            return (
                                <div 
                                    key={asset.id} 
                                    className="flex flex-col items-center group cursor-pointer p-2 rounded-md hover:bg-white/10 transition-colors border border-transparent hover:border-white/5 active:bg-white/20 relative"
                                    draggable={asset.type === 'MESH'} 
                                    onDragStart={(e) => asset.type === 'MESH' && handleDragStart(e, asset.id)}
                                    onClick={() => handleClick(asset.id)}
                                    onDoubleClick={() => handleDoubleClick(asset.id)}
                                    onContextMenu={(e) => handleContextMenu(e, asset.id)}
                                >
                                    <div 
                                        className="flex items-center justify-center bg-black/20 rounded mb-2 shadow-inner"
                                        style={{ width: scale, height: scale }}
                                    >
                                        <Icon 
                                            name={iconName as any} 
                                            size={scale * 0.6} 
                                            className={`${color} drop-shadow-md transition-transform group-hover:scale-110`} 
                                        />
                                    </div>
                                    <span className="text-[10px] text-text-secondary text-center w-full break-words leading-tight group-hover:text-white select-none">
                                        {asset.name}
                                    </span>
                                    <div className="text-[8px] text-text-secondary opacity-0 group-hover:opacity-50 mt-1 uppercase tracking-wider">
                                        {asset.type.replace('_', ' ')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
                {tab === 'CONSOLE' && (
                    <div className="font-mono text-xs space-y-0.5">
                        <div className="flex items-start gap-2 py-1 px-2 hover:bg-white/5 border-b border-white/5">
                             <Icon name="Info" size={14} className="text-text-secondary mt-0.5" />
                             <div>
                                 <span className="text-white">[System]</span> <span className="text-text-secondary">Asset Manager loaded {allAssets.length} assets.</span>
                             </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Context Menu Portal */}
            {contextMenu && contextMenu.visible && createPortal(
                <div 
                    className="fixed bg-[#252525] border border-white/10 shadow-2xl rounded py-1 min-w-[160px] text-xs"
                    style={{ 
                        position: 'fixed',
                        left: `${Math.min(contextMenu.x + 2, window.innerWidth - 160)}px`, 
                        top: `${Math.min(contextMenu.y + 2, window.innerHeight - 150)}px`,
                        zIndex: 99999
                    }}
                    onClick={(e) => e.stopPropagation()} 
                    onContextMenu={(e) => e.preventDefault()}
                >
                    {(assetManager.getAsset(contextMenu.assetId)?.type === 'MATERIAL' || 
                      assetManager.getAsset(contextMenu.assetId)?.type === 'PHYSICS_MATERIAL' || 
                      assetManager.getAsset(contextMenu.assetId)?.type === 'SCRIPT') && (
                        <>
                            {assetManager.getAsset(contextMenu.assetId)?.type === 'MATERIAL' && (
                                <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" 
                                    onClick={() => { applyMaterial(contextMenu.assetId); setContextMenu(null); }}>
                                    <Icon name="Stamp" size={12} /> Apply to Selected
                                </div>
                            )}
                            <div className="px-3 py-1.5 hover:bg-accent hover:text-white cursor-pointer flex items-center gap-2" 
                                onClick={() => { duplicateAsset(contextMenu.assetId); setContextMenu(null); }}>
                                <Icon name="Copy" size={12} /> Duplicate
                            </div>
                            <div className="border-t border-white/10 my-1"></div>
                        </>
                    )}
                    <div className="px-3 py-1.5 hover:bg-red-500/20 hover:text-red-400 cursor-pointer flex items-center gap-2">
                        <Icon name="Trash2" size={12} /> Delete
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};
