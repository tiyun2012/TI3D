
import React, { useState, useCallback, useMemo } from 'react';
import { DraggableWindow } from './DraggableWindow';
import { Icon } from './Icon';

export interface WindowItem {
    id: string;
    title: string;
    icon: string;
    content: React.ReactNode;
    width?: number;
    height?: number | string;
    initialPosition?: { x: number, y: number };
    isOpen: boolean;
    isNested: boolean;
    zIndex: number;
}

interface WindowManagerContextType {
    openWindow: (id: string) => void;
    closeWindow: (id: string) => void;
    toggleWindow: (id: string) => void;
    registerWindow: (config: Omit<WindowItem, 'isOpen' | 'isNested' | 'zIndex'>) => void;
    bringToFront: (id: string) => void;
}

export const WindowManagerContext = React.createContext<WindowManagerContextType | null>(null);

export const WindowManager: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [windows, setWindows] = useState<Record<string, WindowItem>>({});
    const [maxZ, setMaxZ] = useState(100);

    const registerWindow = useCallback((config: Omit<WindowItem, 'isOpen' | 'isNested' | 'zIndex'>) => {
        setWindows(prev => {
            if (prev[config.id]) return prev;
            return {
                ...prev,
                [config.id]: { ...config, isOpen: false, isNested: false, zIndex: 100 }
            };
        });
    }, []);

    const bringToFront = useCallback((id: string) => {
        setMaxZ(prev => {
            const nextZ = prev + 1;
            setWindows(curr => ({
                ...curr,
                [id]: { ...curr[id], zIndex: nextZ }
            }));
            return nextZ;
        });
    }, []);

    const openWindow = useCallback((id: string) => {
        setWindows(prev => {
            if(!prev[id]) return prev;
            // Also bring to front when opening
            return { ...prev, [id]: { ...prev[id], isOpen: true, isNested: false } };
        });
        bringToFront(id);
    }, [bringToFront]);

    const closeWindow = useCallback((id: string) => {
        setWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], isOpen: false } } : prev);
    }, []);

    const toggleWindow = useCallback((id: string) => {
        setWindows(prev => {
            const win = prev[id];
            if (!win) return prev;
            const newState = !win.isOpen;
            if (newState) {
                // If opening, bring to front
                setTimeout(() => bringToFront(id), 0);
            }
            return { ...prev, [id]: { ...win, isOpen: newState, isNested: false } };
        });
    }, [bringToFront]);

    const nestWindow = useCallback((id: string) => {
        setWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], isNested: true } } : prev);
    }, []);

    const restoreWindow = useCallback((id: string) => {
        setWindows(prev => prev[id] ? { ...prev, [id]: { ...prev[id], isNested: false, isOpen: true } } : prev);
        bringToFront(id);
    }, [bringToFront]);

    const activeWindows = useMemo(() => Object.values(windows).filter(w => w.isOpen && !w.isNested), [windows]);
    const nestedWindows = useMemo(() => Object.values(windows).filter(w => w.isOpen && w.isNested), [windows]);

    return (
        <WindowManagerContext.Provider value={{ openWindow, closeWindow, toggleWindow, registerWindow, bringToFront }}>
            {children}

            {/* Floating Windows Layer */}
            {activeWindows.map(win => (
                <div key={win.id} style={{ zIndex: win.zIndex, position: 'fixed', pointerEvents: 'none' }}>
                    <DraggableWindow
                        id={win.id}
                        title={win.title}
                        icon={win.icon}
                        width={win.width}
                        height={win.height}
                        initialPosition={win.initialPosition}
                        onClose={() => closeWindow(win.id)}
                        onNest={() => nestWindow(win.id)}
                        className="pointer-events-auto" // Re-enable pointer events for the window itself
                        onMouseDown={() => bringToFront(win.id)}
                    >
                        {win.content}
                    </DraggableWindow>
                </div>
            ))}

            {/* Side Dock Rail */}
            {nestedWindows.length > 0 && (
                <div className="fixed right-0 top-1/2 -translate-y-1/2 z-[9999] flex flex-col gap-2 p-1 bg-[#101010]/90 backdrop-blur border-l border-t border-b border-white/10 rounded-l-xl shadow-[0_0_20px_rgba(0,0,0,0.5)] transition-all">
                    <div className="text-[9px] text-center text-text-secondary font-bold uppercase tracking-wider writing-vertical-lr py-2 opacity-50 select-none">
                        Dock
                    </div>
                    {nestedWindows.map(win => (
                        <div key={win.id} className="relative group">
                            <button
                                onClick={() => restoreWindow(win.id)}
                                className="w-10 h-10 flex items-center justify-center rounded-lg bg-white/5 hover:bg-accent text-text-secondary hover:text-white transition-all border border-transparent hover:border-white/20 active:scale-95"
                                title={`Restore ${win.title}`}
                            >
                                <Icon name={win.icon as any} size={20} strokeWidth={1.5} />
                            </button>
                            {/* Tooltip */}
                            <div className="absolute right-full top-1/2 -translate-y-1/2 mr-3 px-3 py-1.5 bg-[#202020] border border-white/10 text-white text-xs font-medium rounded-md opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl z-50">
                                {win.title}
                                <div className="absolute top-1/2 right-[-4px] -translate-y-1/2 w-2 h-2 bg-[#202020] border-t border-r border-white/10 rotate-45"></div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </WindowManagerContext.Provider>
    );
};
