
import React, { useState, useContext } from 'react';
import { Icon } from './Icon';
import { assetManager } from '../services/AssetManager';
import { EditorContext } from '../contexts/EditorContext';
import { WindowManagerContext } from './WindowManager';

export const ProjectPanel: React.FC = () => {
    const [tab, setTab] = useState<'PROJECT' | 'CONSOLE'>('PROJECT');
    const [filter, setFilter] = useState<'ALL' | 'MESH' | 'MATERIAL'>('ALL');
    const [search, setSearch] = useState('');
    const [scale, setScale] = useState(40);
    const { setEditingMaterialId } = useContext(EditorContext)!;
    const wm = useContext(WindowManagerContext);

    const allAssets = assetManager.getAllAssets();
    const filteredAssets = allAssets.filter(a => {
        if (filter !== 'ALL' && a.type !== filter) return false;
        if (!a.name.toLowerCase().includes(search.toLowerCase())) return false;
        return true;
    });

    const handleDragStart = (e: React.DragEvent, assetId: string) => {
        e.dataTransfer.setData('application/ti3d-asset', assetId);
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleDoubleClick = (assetId: string) => {
        const asset = assetManager.getAsset(assetId);
        if (asset && asset.type === 'MATERIAL') {
            setEditingMaterialId(assetId);
            wm?.openWindow('graph');
        }
    };

    const createMaterial = () => {
        assetManager.createMaterial(`New Material ${Math.floor(Math.random() * 1000)}`);
        // Force refresh via local state toggle or specialized hook in future
        // For now, re-render happens naturally via parent or we can use a dummy state
        setSearch(s => s); // dummy refresh
    };

    return (
        <div className="h-full bg-panel flex flex-col font-sans border-t border-black/20">
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
                        <button 
                            onClick={createMaterial}
                            className="p-1 hover:bg-white/10 rounded text-accent"
                            title="Create Material"
                        >
                            <Icon name="PlusSquare" size={16} />
                        </button>
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
                <div className="bg-panel flex items-center gap-2 px-3 py-1.5 text-xs border-b border-black/10">
                    <button onClick={() => setFilter('ALL')} className={`hover:text-white ${filter === 'ALL' ? 'text-white font-bold' : 'text-text-secondary'}`}>All</button>
                    <span className="text-white/10">|</span>
                    <button onClick={() => setFilter('MESH')} className={`hover:text-white ${filter === 'MESH' ? 'text-white font-bold' : 'text-text-secondary'}`}>Meshes</button>
                    <span className="text-white/10">|</span>
                    <button onClick={() => setFilter('MATERIAL')} className={`hover:text-white ${filter === 'MATERIAL' ? 'text-white font-bold' : 'text-text-secondary'}`}>Materials</button>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-2 bg-[#1a1a1a]">
                {tab === 'PROJECT' && (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
                        {filteredAssets.map((asset) => {
                            const isMat = asset.type === 'MATERIAL';
                            return (
                                <div 
                                    key={asset.id} 
                                    className="flex flex-col items-center group cursor-pointer p-2 rounded-md hover:bg-white/10 transition-colors border border-transparent hover:border-white/5 active:bg-white/20"
                                    draggable={asset.type === 'MESH'} // Only drag meshes for now
                                    onDragStart={(e) => asset.type === 'MESH' && handleDragStart(e, asset.id)}
                                    onDoubleClick={() => handleDoubleClick(asset.id)}
                                >
                                    <div 
                                        className="flex items-center justify-center bg-black/20 rounded mb-2 shadow-inner"
                                        style={{ width: scale, height: scale }}
                                    >
                                        <Icon 
                                            name={isMat ? 'Palette' : 'Box'} 
                                            size={scale * 0.6} 
                                            className={`${isMat ? 'text-pink-500' : 'text-accent'} drop-shadow-md transition-transform group-hover:scale-110`} 
                                        />
                                    </div>
                                    <span className="text-[10px] text-text-secondary text-center w-full break-words leading-tight group-hover:text-white select-none">
                                        {asset.name}
                                    </span>
                                    <div className="text-[8px] text-text-secondary opacity-0 group-hover:opacity-50 mt-1 uppercase tracking-wider">
                                        {asset.type}
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
        </div>
    );
};
