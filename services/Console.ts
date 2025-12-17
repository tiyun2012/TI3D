
export type LogType = 'info' | 'warn' | 'error' | 'success';

export interface LogEntry {
    id: string;
    type: LogType;
    message: string;
    timestamp: number;
    count: number;
}

class ConsoleService {
    private logs: LogEntry[] = [];
    private listeners: (() => void)[] = [];
    private maxLogs = 500;

    log(message: string, type: LogType = 'info') {
        const last = this.logs[this.logs.length - 1];
        // Group identical consecutive logs
        if (last && last.message === message && last.type === type) {
            last.count++;
            last.timestamp = Date.now();
        } else {
            this.logs.push({
                id: crypto.randomUUID(),
                type,
                message,
                timestamp: Date.now(),
                count: 1
            });
        }

        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        
        this.notify();
    }

    info(msg: string) { this.log(msg, 'info'); }
    warn(msg: string) { this.log(msg, 'warn'); }
    error(msg: string) { this.log(msg, 'error'); }
    success(msg: string) { this.log(msg, 'success'); }

    clear() {
        this.logs = [];
        this.notify();
    }

    getLogs() {
        return this.logs;
    }

    subscribe(cb: () => void) {
        this.listeners.push(cb);
        return () => {
            this.listeners = this.listeners.filter(l => l !== cb);
        };
    }

    private notify() {
        this.listeners.forEach(cb => cb());
    }
}

export const consoleService = new ConsoleService();
