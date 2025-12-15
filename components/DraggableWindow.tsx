import React, { useState, useEffect, useRef } from 'react';
import { Icon } from './Icon';

interface DraggableWindowProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
    width?: number;
    height?: number | string;
    icon?: string;
    className?: string;
}

export const DraggableWindow = ({ 
    title, onClose, children, width = 500, height = "auto", icon, className = "" 
}: DraggableWindowProps) => {
    // Initial Center Position
    const [position, setPosition] = useState({
        x: Math.max(0, window.innerWidth / 2 - width / 2),
        y: Math.max(0, window.innerHeight / 2 - 300) 
    });
    const [isDragging, setIsDragging] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const handleMove = (e: MouseEvent) => {
            if (!isDragging) return;
            setPosition({
                x: e.clientX - dragOffset.current.x,
                y: e.clientY - dragOffset.current.y
            });
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
        if (e.button !== 0) return;
        setIsDragging(true);
        dragOffset.current = {
            x: e.clientX - position.x,
            y: e.clientY - position.y
        };
    };

    return (
        <div 
            className={`fixed z-[100] bg-panel border border-white/20 rounded-lg shadow-2xl flex flex-col overflow-hidden backdrop-blur-sm ${className}`}
            style={{ 
                left: position.x, 
                top: position.y, 
                width: width, 
                height: height === 'auto' ? undefined : height,
                maxHeight: '85vh'
            }}
            onMouseDown={(e) => e.stopPropagation()} 
        >
            <div 
                className="bg-panel-header px-4 py-3 border-b border-white/10 flex justify-between items-center shrink-0 cursor-move select-none"
                onMouseDown={handleMouseDown}
            >
                <span className="font-bold text-sm text-white flex items-center gap-2 pointer-events-none">
                    {icon && <Icon name={icon as any} size={16} className="text-accent" />}
                    {title}
                </span>
                <button 
                    onClick={onClose} 
                    className="hover:text-white text-text-secondary"
                    title="Close"
                    aria-label="Close"
                >
                    <Icon name="X" size={16}/>
                </button>
            </div>
            
            <div className="flex-1 overflow-auto custom-scrollbar flex flex-col relative">
                {children}
            </div>
        </div>
    );
};