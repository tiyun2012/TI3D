import React, { memo, useRef } from 'react';
import { GraphNode, TextureAsset } from '../../types';
import { NodeRegistry, getTypeColor } from '../../services/NodeRegistry';
import { LayoutConfig } from './GraphConfig';
import { ShaderPreview } from '../ShaderPreview';
import { assetManager } from '../../services/AssetManager';
import { Icon } from '../Icon';

interface NodeItemProps {
    node: GraphNode;
    selected: boolean;
    // We pass connecting info to determine port highlights efficiently
    connecting: { nodeId: string; pinId: string; type: 'input'|'output'; dataType: string } | null;
    onMouseDown: (e: React.MouseEvent, node: GraphNode) => void;
    onPinDown: (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => void;
    onPinUp: (e: React.MouseEvent, nodeId: string, pinId: string, type: 'input'|'output') => void;
    onPinEnter: () => void;
    onPinLeave: () => void;
    onDataChange: (nodeId: string, key: string, value: string) => void;
}

const getTexturePreviewStyle = (id: string, assets: TextureAsset[]): React.CSSProperties => {
    const num = parseFloat(id);
    
    // Check if it's a custom asset
    if (num >= 4) {
        const asset = assets.find(a => a.layerIndex === num);
        if (asset) {
            return {
                backgroundImage: `url(${asset.source})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center'
            };
        }
    }

    if (num === 1) { // Grid (UV Checkerboard)
        return {
            backgroundColor: '#ffffff',
            backgroundImage: `linear-gradient(45deg, #ccc 25%, transparent 25%), 
                              linear-gradient(-45deg, #ccc 25%, transparent 25%), 
                              linear-gradient(45deg, transparent 75%, #ccc 75%), 
                              linear-gradient(-45deg, transparent 75%, #ccc 75%)`,
            backgroundSize: '25% 25%', // Scales to fit 4x4 tiles in the viewport
            backgroundPosition: '0 0, 0 12.5%, 12.5% -12.5%, -12.5% 0px' 
        };
    }
    if (num === 2) { // Noise (Full Scale)
        return {
            backgroundColor: '#808080',
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='1'/%3E%3C/svg%3E")`,
            backgroundSize: '100% 100%' // Fit exactly to square
        };
    }
    if (num === 3) { // Brick (Tiled UV)
        return {
            backgroundColor: '#8B4513',
            backgroundImage: `linear-gradient(335deg, rgba(255,255,255,0.1) 23px, transparent 23px),
                              linear-gradient(155deg, rgba(255,255,255,0.1) 23px, transparent 23px),
                              linear-gradient(335deg, rgba(255,255,255,0.1) 23px, transparent 23px),
                              linear-gradient(155deg, rgba(255,255,255,0.1) 23px, transparent 23px)`,
            backgroundSize: '50% 50%', // 2x2 Bricks in UV space
            backgroundPosition: '0px 2px, 4px 35px, 29px 31px, 34px 6px'
        };
    }
    return { backgroundColor: '#ffffff' }; // Default White
};

export const NodeItem = memo(({ 
    node, selected, connecting, 
    onMouseDown, onPinDown, onPinUp, onPinEnter, onPinLeave, onDataChange 
}: NodeItemProps) => {
    
    const def = NodeRegistry[node.type];
    const fileInputRef = useRef<HTMLInputElement>(null);
    if (!def) return null;

    const isReroute = node.type === 'Reroute';
    const isShaderOutput = node.type === 'ShaderOutput';
    const isCustomCode = node.type === 'CustomExpression';
    const isForLoop = node.type === 'ForLoop';
    const isStaticMesh = node.type === 'StaticMesh';
    const isTextureSample = node.type === 'TextureSample';
    
    const borderStyle = selected ? 'ring-1 ring-accent border-accent' : 'border-white/10';

    const renderPort = (pinId: string, type: 'input'|'output', color?: string, portType?: string) => {
        let isActive = false;
        let isCompatiblePort = false;

        // Check compatibility if dragging
        if (connecting && connecting.nodeId !== node.id && connecting.type !== type) {
            // Simple compatibility check (should ideally match logic in main graph)
            const myType = portType || 'any';
            if (connecting.dataType === 'any' || myType === 'any' || connecting.dataType === myType) {
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
                onMouseDown={(e) => onPinDown(e, node.id, pinId, type)}
                onMouseUp={(e) => onPinUp(e, node.id, pinId, type)}
                onMouseEnter={onPinEnter}
                onMouseLeave={onPinLeave}
                title={portType}
            />
        );
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const reader = new FileReader();
            reader.onload = (ev) => {
                const result = ev.target?.result as string;
                const asset = assetManager.createTexture(file.name, result);
                onDataChange(node.id, 'textureId', asset.layerIndex.toString());
            };
            reader.readAsDataURL(file);
        }
    };

    let nodeWidth = LayoutConfig.NODE_WIDTH;
    if (isReroute) nodeWidth = LayoutConfig.REROUTE_SIZE;
    else if (isShaderOutput) nodeWidth = LayoutConfig.PREVIEW_NODE_WIDTH;
    else if (isCustomCode || isForLoop) nodeWidth = LayoutConfig.CODE_NODE_WIDTH;

    let nodeHeight: number | string = 'auto';
    if (isReroute) nodeHeight = LayoutConfig.REROUTE_SIZE;

    // Fetch custom textures for dropdown
    const customTextures = assetManager.getAssetsByType('TEXTURE') as TextureAsset[];

    return (
        <div
            className={`absolute flex flex-col pointer-events-auto transition-shadow hover:shadow-2xl 
                ${isReroute ? '' : `rounded-md shadow-xl border bg-[#1e1e1e] ${borderStyle}`}`}
            style={{ 
                transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                width: nodeWidth, 
                height: nodeHeight
            }}
        >
             {isReroute ? (
                <div className={`relative w-full h-full rounded-full cursor-move border ${selected ? 'bg-white border-accent' : 'bg-gray-400 hover:bg-white border-black'}`}
                    onMouseDown={(e) => onMouseDown(e, node)}
                >
                    {renderPort('in', 'input')}
                    {renderPort('out', 'output')}
                </div>
             ) : (
                <>
                    <div 
                        className={`px-3 flex items-center justify-between border-b border-white/5 rounded-t-md cursor-grab active:cursor-grabbing ${selected ? 'bg-accent/20' : 'bg-white/5'}`}
                        style={{ height: LayoutConfig.HEADER_HEIGHT }}
                        onMouseDown={(e) => onMouseDown(e, node)}
                    >
                        <span className={`text-xs font-bold ${selected ? 'text-white' : 'text-gray-200'}`}>{def.title}</span>
                        {isTextureSample && (
                            <button 
                                className="text-white/50 hover:text-white" 
                                title="Upload Texture" 
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <Icon name="Upload" size={12} />
                            </button>
                        )}
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
                                {renderPort(input.id, 'input', input.color || getTypeColor(input.type), input.type)}
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
                                            className="w-full bg-black/40 text-[10px] text-white px-1 rounded border border-white/10 h-5 focus:border-accent outline-none"
                                            value={val as string}
                                            onChange={(e) => onDataChange(node.id, key, e.target.value)}
                                            onMouseDown={e => e.stopPropagation()}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}

                        {isStaticMesh && (
                            <div style={{ marginBottom: LayoutConfig.GAP }} className="px-1">
                                <span className="text-[9px] text-gray-500 uppercase mb-1 block">Asset</span>
                                <select
                                    className="w-full bg-black/40 text-[10px] text-white px-1 rounded border border-white/10 h-5 focus:border-accent outline-none"
                                    value={node.data?.assetId || ''}
                                    onChange={(e) => onDataChange(node.id, 'assetId', e.target.value)}
                                    onMouseDown={e => e.stopPropagation()}
                                    aria-label="Select Mesh Asset"
                                >
                                    <option value="">Select Mesh...</option>
                                    {assetManager.getAssetsByType('MESH').map(m => (
                                        <option key={m.id} value={m.id}>{m.name}</option>
                                    ))}
                                </select>
                            </div>
                        )}

                        {isTextureSample && (
                            <div style={{ marginBottom: LayoutConfig.GAP }} className="px-1">
                                <input 
                                    type="file" 
                                    ref={fileInputRef} 
                                    className="hidden" 
                                    accept="image/*" 
                                    onChange={handleFileUpload}
                                    aria-label="Upload Texture File" 
                                />
                                <span className="text-[9px] text-gray-500 uppercase mb-1 block">Texture</span>
                                <select
                                    className="w-full bg-black/40 text-[10px] text-white px-1 rounded border border-white/10 h-5 focus:border-accent outline-none"
                                    value={node.data?.textureId || '0'}
                                    onChange={(e) => onDataChange(node.id, 'textureId', e.target.value)}
                                    onMouseDown={e => e.stopPropagation()}
                                    aria-label="Select Texture Pattern"
                                >
                                    <option value="0">White (Default)</option>
                                    <option value="1">Grid Pattern</option>
                                    <option value="2">Noise Texture</option>
                                    <option value="3">Brick Texture</option>
                                    {customTextures.map(tex => (
                                        <option key={tex.id} value={tex.layerIndex}>{tex.name}</option>
                                    ))}
                                </select>
                                <div 
                                    className="mt-2 w-full rounded border border-white/10 overflow-hidden relative shadow-inner aspect-square" 
                                    style={{ height: LayoutConfig.TEXTURE_PREVIEW_HEIGHT, ...getTexturePreviewStyle(node.data?.textureId || '0', customTextures) }}
                                >
                                    {/* UV 0-1 Indicator Overlay */}
                                    <div className="absolute inset-0 border border-white/5 opacity-50"></div>
                                </div>
                            </div>
                        )}
                        
                        {(isCustomCode || isForLoop) && (
                            // Enforce strict heights using constants
                            <div 
                                className="flex flex-col px-1" 
                                style={{ 
                                    gap: LayoutConfig.CODE_GAP, 
                                    marginBottom: LayoutConfig.CODE_MARGIN_BOTTOM 
                                }}
                            >
                                <span className="text-[9px] text-gray-500 uppercase flex items-center" style={{ height: LayoutConfig.CODE_LABEL_HEIGHT }}>
                                    {isForLoop ? 'Loop Body (GLSL)' : 'GLSL Code Body'}
                                </span>
                                <textarea
                                    className="w-full bg-black/40 text-[10px] font-mono text-gray-300 p-2 rounded border border-white/10 focus:border-accent outline-none resize-none custom-scrollbar"
                                    style={{ height: LayoutConfig.CODE_BLOCK_HEIGHT }}
                                    value={node.data?.code || ''}
                                    placeholder={isForLoop 
                                        ? "acc += a + vec3(sin(index + time));" 
                                        : "result = b * sin(a + time);"
                                    }
                                    onChange={(e) => onDataChange(node.id, 'code', e.target.value)}
                                    onMouseDown={e => e.stopPropagation()}
                                    spellCheck={false}
                                />
                                <div className="text-[8px] text-gray-500 flex items-center" style={{ height: LayoutConfig.CODE_FOOTER_HEIGHT }}>
                                    {isForLoop 
                                        ? <span>Vars: <code>acc, index, a, b, time</code></span> 
                                        : <span>Return: <code>vec3 result</code></span>
                                    }
                                </div>
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
                                {renderPort(output.id, 'output', output.color || getTypeColor(output.type), output.type)}
                            </div>
                        ))}
                    </div>
                </>
             )}
        </div>
    );
}, (prev, next) => {
    // Custom comparison for performance
    // Only re-render if data, selection, position, or relevant connecting state changes
    if (prev.node !== next.node) return false;
    if (prev.selected !== next.selected) return false;
    
    // If we are connecting, or were connecting, we might need update to show/hide highlights
    const prevConnecting = prev.connecting;
    const nextConnecting = next.connecting;
    
    // If state changed from null to obj or obj to null, re-render
    if (!!prevConnecting !== !!nextConnecting) return false;
    
    // If both are objects, check if type changed (which affects compatibility highlight)
    if (prevConnecting && nextConnecting) {
        if (prevConnecting.dataType !== nextConnecting.dataType) return false;
        if (prevConnecting.nodeId !== nextConnecting.nodeId) return false; // To prevent self-connect highlight issues
    }

    return true;
});