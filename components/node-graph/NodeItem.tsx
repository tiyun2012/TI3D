
import React, { memo } from 'react';
import { GraphNode } from '../../types';
import { NodeRegistry, getTypeColor } from '../../services/NodeRegistry';
import { LayoutConfig } from './GraphConfig';
import { ShaderPreview } from '../ShaderPreview';

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

export const NodeItem = memo(({ 
    node, selected, connecting, 
    onMouseDown, onPinDown, onPinUp, onPinEnter, onPinLeave, onDataChange 
}: NodeItemProps) => {
    
    const def = NodeRegistry[node.type];
    if (!def) return null;

    const isReroute = node.type === 'Reroute';
    const isShaderOutput = node.type === 'ShaderOutput';
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

    return (
        <div
            className={`absolute flex flex-col pointer-events-auto transition-shadow hover:shadow-2xl 
                ${isReroute ? '' : `rounded-md shadow-xl border bg-[#1e1e1e] ${borderStyle}`}`}
            style={{ 
                transform: `translate(${node.position.x}px, ${node.position.y}px)`,
                width: isReroute ? LayoutConfig.REROUTE_SIZE : (isShaderOutput ? LayoutConfig.PREVIEW_NODE_WIDTH : LayoutConfig.NODE_WIDTH), 
                height: isReroute ? LayoutConfig.REROUTE_SIZE : 'auto'
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
