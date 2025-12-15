
import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface DraggableWindowProps {
    id: string;
    title: string;
    onClose: () => void;
    onNest: () => void;
    children: React.ReactNode;
    width?: number;
    height?: number | string;
    icon?: string;
    initialPosition?: { x: number, y: number };
    className?: string;
    onMouseDown?: () => void;
}

export const DraggableWindow = ({ 
    id, title, onClose, onNest, children, width = 300, height = "auto", icon, 
    initialPosition, className = "", onMouseDown
}: DraggableWindowProps) => {
    
    // Default to center if no pos given, but try to stagger slightly based on ID length to avoid perfect overlap
    const [position, setPosition] = useState(initialPosition || {
        x: Math.max(50, window.innerWidth / 2 - width / 2 + (id.length * 10)),
        y: Math.max(50, window.innerHeight / 2 - 200 + (id.length * 10))
    });
    
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const windowRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!isDragging) return;
            
            // Allow dragging slightly offscreen but keep header visible
            const newX = e.clientX - dragOffset.current.x;
            const newY = Math.max(0, Math.min(window.innerHeight - 30, e.clientY - dragOffset.current.y));
            
            setPosition({ x: newX, y: newY });
        };

        const handleUp = () => {
            setIsDragging(false);
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMove);
            window.addEventListener('mouseup', handleUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [isDragging]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (onMouseDown) onMouseDown(); // Bring to front
        if (e.button !== 0) return;
        if ((e.target as HTMLElement).closest('button')) return; // Don't drag if clicking buttons
        
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    return (
        <div 
            ref={windowRef}
            className={`glass-panel flex flex-col overflow-hidden rounded-lg transition-transform duration-75 ${className}`}
            style={{ 
                left: position.x, 
                top: position.y, 
                width: width, 
                height: height === 'auto' ? undefined : height,
                maxHeight: '85vh',
                position: 'fixed'
            }}
            onMouseDown={onMouseDown}
        >
            {/* Header */}
            <div 
                className="h-8 px-3 flex justify-between items-center shrink-0 cursor-move select-none border-b border-white/5 bg-gradient-to-r from-white/10 to-transparent"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2 text-white/90">
                    {icon && <Icon name={icon as any} size={14} className="text-accent opacity-90" />}
                    <span className="text-xs font-bold uppercase tracking-wide opacity-90">{title}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button 
                        onClick={(e) => { e.stopPropagation(); onNest(); }} 
                        className="p-1.5 hover:bg-white/10 rounded text-text-secondary hover:text-accent transition-colors"
                        title="Nest to Side"
                    >
                        <Icon name="ArrowRightToLine" size={14}/>
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); onClose(); }} 
                        className="p-1.5 hover:bg-red-500/20 rounded text-text-secondary hover:text-red-400 transition-colors"
                        title="Close"
                    >
                        <Icon name="X" size={14}/>
                    </button>
                </div>
            </div>
            
            {/* Content */}
            <div className="flex-1 overflow-auto custom-scrollbar flex flex-col relative text-xs bg-black/20">
                {children}
            </div>
        </div>
    );
};
