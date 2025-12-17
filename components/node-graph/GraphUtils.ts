
import { GraphNode } from '../../types';
import { NodeRegistry } from '../../services/NodeRegistry';
import { LayoutConfig } from './GraphConfig';

export const GraphUtils = {
    getPinPosition: (node: GraphNode, pinId: string, type: 'input' | 'output') => {
        if (node.type === 'Reroute') {
            const centerY = node.position.y + LayoutConfig.REROUTE_SIZE / 2;
            if (type === 'input') return { x: node.position.x, y: centerY }; 
            else return { x: node.position.x + LayoutConfig.REROUTE_SIZE, y: centerY };
        }

        const def = NodeRegistry[node.type];
        if (!def) return { x: node.position.x, y: node.position.y };

        // Calculate dynamic height offsets for content between inputs and outputs
        let extraHeight = 0;
        
        // 1. Inputs Controls (Float/Vec3)
        if ((node.type === 'Float' || node.type === 'Vec3') && node.data) {
             const rowCount = Object.keys(node.data).length;
             const rowHeight = 20;
             const rowMargin = 4;
             const flexGap = 4; // gap-1
             
             // Height = Rows * (H + MB) + (Rows-1)*Gap + ContainerMB
             extraHeight += rowCount * (rowHeight + rowMargin) + 
                            (rowCount > 0 ? (rowCount - 1) * flexGap : 0) + 
                            LayoutConfig.GAP;
        }
        
        // 2. Code Block (ForLoop/CustomExpression)
        if (node.type === 'ForLoop' || node.type === 'CustomExpression') {
            // Precise Calculation based on LayoutConfig Single Source of Truth
            // Structure: Label + Gap + Textarea + Gap + Footer + MarginBottom
            extraHeight += LayoutConfig.CODE_LABEL_HEIGHT + 
                           LayoutConfig.CODE_GAP + 
                           LayoutConfig.CODE_BLOCK_HEIGHT + 
                           LayoutConfig.CODE_GAP + 
                           LayoutConfig.CODE_FOOTER_HEIGHT + 
                           LayoutConfig.CODE_MARGIN_BOTTOM;
        }

        // 3. Shader Preview
        if (node.type === 'ShaderOutput') {
             // Height(200) + MT(8) + MB(4)
             extraHeight += 200 + 8 + LayoutConfig.GAP;
        }

        // 4. Texture Preview
        if (node.type === 'TextureSample') {
            extraHeight += LayoutConfig.TEXTURE_PREVIEW_HEIGHT + LayoutConfig.GAP;
        }

        let index = 0;
        if (type === 'output') {
            index += def.inputs.length;
            const outIdx = def.outputs.findIndex(p => p.id === pinId);
            index += outIdx !== -1 ? outIdx : 0;
        } else {
            const inIdx = def.inputs.findIndex(p => p.id === pinId);
            index += inIdx !== -1 ? inIdx : 0;
        }

        let yOffset = LayoutConfig.BORDER + LayoutConfig.HEADER_HEIGHT + LayoutConfig.PADDING_TOP + 
                       (index * (LayoutConfig.ITEM_HEIGHT + LayoutConfig.GAP)) + (LayoutConfig.ITEM_HEIGHT / 2);
        
        // If it's an output pin, push it down by the extra content height
        if (type === 'output') {
            yOffset += extraHeight;
        }
        
        const width = (node.type === 'ShaderOutput' || node.type === 'CustomExpression' || node.type === 'ForLoop') 
            ? (node.type === 'ShaderOutput' ? LayoutConfig.PREVIEW_NODE_WIDTH : LayoutConfig.CODE_NODE_WIDTH) 
            : LayoutConfig.NODE_WIDTH;
            
        const xOffset = type === 'output' ? width : 0;
        return { x: node.position.x + xOffset, y: node.position.y + yOffset };
    },

    calculateCurve: (x1: number, y1: number, x2: number, y2: number) => {
        const dist = Math.abs(x1 - x2) * 0.4;
        const cX1 = x1 + Math.max(dist, 50);
        const cX2 = x2 - Math.max(dist, 50);
        return `M ${x1} ${y1} C ${cX1} ${y1} ${cX2} ${y2} ${x2} ${y2}`;
    },

    getBezierPoints: (x1: number, y1: number, x2: number, y2: number, steps: number = 10) => {
        const dist = Math.abs(x1 - x2) * 0.4;
        const cp1x = x1 + Math.max(dist, 50);
        const cp1y = y1;
        const cp2x = x2 - Math.max(dist, 50);
        const cp2y = y2;
        
        const points = [];
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const mt = 1 - t;
            const mt2 = mt * mt;
            const mt3 = mt2 * mt;
            const t2 = t * t;
            const t3 = t2 * t;
            
            const x = mt3 * x1 + 3 * mt2 * t * cp1x + 3 * mt * t2 * cp2x + t3 * x2;
            const y = mt3 * y1 + 3 * mt2 * t * cp1y + 3 * mt * t2 * cp2y + t3 * y2;
            points.push({ x, y });
        }
        return points;
    },

    lineIntersectsLine: (a1: {x:number, y:number}, a2: {x:number, y:number}, b1: {x:number, y:number}, b2: {x:number, y:number}) => {
        const det = (a2.x - a1.x) * (b2.y - b1.y) - (b2.x - b1.x) * (a2.y - a1.y);
        if (det === 0) return false;
        const lambda = ((b2.y - b1.y) * (b2.x - a1.x) + (b1.x - b2.x) * (b2.y - a1.y)) / det;
        const gamma = ((a1.y - a2.y) * (b2.x - a1.x) + (a2.x - a1.x) * (b2.y - a1.y)) / det;
        return (0 < lambda && lambda < 1) && (0 < gamma && gamma < 1);
    },

    screenToWorld: (clientX: number, clientY: number, rect: DOMRect, transform: { x: number, y: number, k: number }) => {
        return {
            x: (clientX - rect.left - transform.x) / transform.k,
            y: (clientY - rect.top - transform.y) / transform.k
        };
    }
};
