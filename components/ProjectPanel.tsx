import React, { useState } from 'react';
import { Icon } from './Icon';

export const ProjectPanel: React.FC = () => {
    const [tab, setTab] = useState<'PROJECT' | 'CONSOLE'>('PROJECT');
    const [search, setSearch] = useState('');
    const [scale, setScale] = useState(40);

    const assets = [
        { name: 'Scripts', type: 'folder' },
        { name: 'Materials', type: 'folder' },
        { name: 'Prefabs', type: 'folder' },
        { name: 'Player.ts', type: 'code' },
        { name: 'GameManager.ts', type: 'code' },
        { name: 'Main.scene', type: 'scene' },
        { name: 'Enemy.prefab', type: 'prefab' },
        { name: 'Wood.mat', type: 'material' },
        { name: 'Jump.wav', type: 'audio' },
    ];

    const getIcon = (type: string) => {
        switch(type) {
            case 'folder': return { name: 'Folder', color: 'text-yellow-500' };
            case 'code': return { name: 'FileCode', color: 'text-blue-400' };
            case 'scene': return { name: 'Box', color: 'text-gray-300' };
            case 'prefab': return { name: 'Box', color: 'text-blue-300' };
            case 'material': return { name: 'Palette', color: 'text-pink-400' };
            case 'audio': return { name: 'Music', color: 'text-orange-400' };
            default: return { name: 'File', color: 'text-gray-400' };
        }
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
                        <input 
                            type="range" min="30" max="60" 
                            value={scale} onChange={(e) => setScale(Number(e.target.value))}
                            className="w-16 opacity-50 hover:opacity-100" 
                        />
                        <div className="relative">
                            <Icon name="Search" size={12} className="absolute left-2 top-1.5 text-text-secondary" />
                            <input 
                                type="text" 
                                placeholder="Search assets..." 
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="bg-input-bg text-xs py-1 pl-7 pr-2 rounded-full outline-none border border-transparent focus:border-accent text-white w-40" 
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Breadcrumbs (Project Mode) */}
            {tab === 'PROJECT' && (
                <div className="bg-panel flex items-center gap-2 px-3 py-1.5 text-xs border-b border-black/10">
                    <Icon name="HardDrive" size={12} className="text-text-secondary" />
                    <span className="text-text-secondary hover:text-white cursor-pointer">Assets</span>
                    <Icon name="ChevronRight" size={12} className="text-text-secondary" />
                    <span className="text-white font-medium cursor-pointer">Scenes</span>
                </div>
            )}

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-2 bg-[#1a1a1a]">
                {tab === 'PROJECT' && (
                    <div className="grid grid-cols-[repeat(auto-fill,minmax(80px,1fr))] gap-2">
                        {assets
                          .filter(a => a.name.toLowerCase().includes(search.toLowerCase()))
                          .map((asset, i) => {
                            const icon = getIcon(asset.type);
                            return (
                                <div key={i} className="flex flex-col items-center group cursor-pointer p-2 rounded-md hover:bg-white/10 transition-colors border border-transparent hover:border-white/5">
                                    <Icon 
                                        name={icon.name as any} 
                                        size={scale} 
                                        className={`${icon.color} drop-shadow-md transition-transform group-hover:scale-110`} 
                                    />
                                    <span className="text-[10px] text-text-secondary mt-2 text-center w-full break-words leading-tight group-hover:text-white">
                                        {asset.name}
                                    </span>
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
                                 <span className="text-white">[System]</span> <span className="text-text-secondary">Engine initialized in 240ms</span>
                                 <div className="text-[10px] text-gray-600">Core.ts:42</div>
                             </div>
                        </div>
                        <div className="flex items-start gap-2 py-1 px-2 hover:bg-white/5 border-b border-white/5 bg-yellow-900/10">
                             <Icon name="AlertTriangle" size={14} className="text-yellow-500 mt-0.5" />
                             <div>
                                 <span className="text-white">[Warning]</span> <span className="text-yellow-100">Mesh 'Sphere' has no material assigned. Using default.</span>
                                 <div className="text-[10px] text-gray-500">MeshRenderer.ts:105</div>
                             </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};