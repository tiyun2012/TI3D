
import { StaticMeshAsset, MaterialAsset, GraphNode, GraphConnection } from '../types';

class AssetManagerService {
    assets = new Map<string, StaticMeshAsset | MaterialAsset>();
    
    // Maps internal integer ID (for ECS/Renderer) to Asset UUID
    meshIntToUuid = new Map<number, string>();
    meshUuidToInt = new Map<string, number>();
    
    private nextMeshIntId = 100; // Start custom meshes from 100 to leave room for primitives

    constructor() {
        this.registerDefaultAssets();
        this.createDefaultMaterial();
    }

    registerAsset(asset: StaticMeshAsset | MaterialAsset): number {
        this.assets.set(asset.id, asset);
        
        if (asset.type === 'MESH') {
            if (this.meshUuidToInt.has(asset.id)) return this.meshUuidToInt.get(asset.id)!;
            const intId = this.nextMeshIntId++;
            this.meshIntToUuid.set(intId, asset.id);
            this.meshUuidToInt.set(asset.id, intId);
            return intId;
        }
        return 0;
    }

    getAsset(id: string) {
        return this.assets.get(id);
    }

    getMeshID(uuid: string): number {
        return this.meshUuidToInt.get(uuid) || 0;
    }

    getAllAssets() {
        return Array.from(this.assets.values());
    }
    
    getAssetsByType(type: 'MESH' | 'MATERIAL') {
        return Array.from(this.assets.values()).filter(a => a.type === type);
    }

    // --- Material Management ---

    createMaterial(name: string): MaterialAsset {
        const id = crypto.randomUUID();
        const mat: MaterialAsset = {
            id,
            name,
            type: 'MATERIAL',
            data: {
                nodes: [
                    { id: 'out', type: 'ShaderOutput', position: { x: 800, y: 200 } }
                ],
                connections: [],
                glsl: ''
            }
        };
        this.registerAsset(mat);
        return mat;
    }

    saveMaterial(id: string, nodes: GraphNode[], connections: GraphConnection[], glsl: string) {
        const asset = this.assets.get(id);
        if (asset && asset.type === 'MATERIAL') {
            asset.data = { nodes, connections, glsl };
            console.log(`[AssetManager] Saved Material: ${asset.name}`);
        }
    }

    private createDefaultMaterial() {
        // Create a basic demo material
        const mat = this.createMaterial('New Material');
        // We leave it empty (just output) for now, user can edit it.
    }

    private registerDefaultAssets() {
        // 1. Cylinder
        this.registerAsset(this.createPrimitive('Cylinder', (segs) => {
            const v=[], n=[], u=[], idx=[];
            const segments = 24;
            const radius = 0.5;
            const height = 1.0;
            const halfH = height/2;

            // Side
            for(let i=0; i<=segments; i++) {
                const theta = (i/segments) * Math.PI * 2;
                const x = Math.cos(theta) * radius;
                const z = Math.sin(theta) * radius;
                v.push(x, halfH, z); n.push(x, 0, z); u.push(i/segments, 0);
                v.push(x, -halfH, z); n.push(x, 0, z); u.push(i/segments, 1);
            }
            
            for(let i=0; i<segments; i++) {
                const base = i*2;
                idx.push(base, base+1, base+2);
                idx.push(base+1, base+3, base+2);
            }
            return { v, n, u, idx };
        }));

        // 2. Cone
        this.registerAsset(this.createPrimitive('Cone', () => {
            const v=[], n=[], u=[], idx=[];
            const segments = 24;
            const radius = 0.5;
            const height = 1.0;
            const halfH = height/2;
            v.push(0, halfH, 0); n.push(0, 1, 0); u.push(0.5, 0); 
            for(let i=0; i<=segments; i++) {
                const theta = (i/segments) * Math.PI * 2;
                const x = Math.cos(theta) * radius;
                const z = Math.sin(theta) * radius;
                v.push(x, -halfH, z); n.push(x, 0.5, z); u.push(i/segments, 1);
            }
            for(let i=1; i<=segments; i++) idx.push(0, i, i+1);
            return { v, n, u, idx };
        }));

        // 3. Sphere
        this.registerAsset(this.createPrimitive('Sphere', () => {
            const radius = 0.5;
            const latBands = 24;
            const longBands = 24;
            const v=[], n=[], u=[], idx=[];
            for (let lat = 0; lat <= latBands; lat++) {
                const theta = lat * Math.PI / latBands;
                const sinTheta = Math.sin(theta);
                const cosTheta = Math.cos(theta);
                for (let lon = 0; lon <= longBands; lon++) {
                    const phi = lon * 2 * Math.PI / longBands;
                    const sinPhi = Math.sin(phi);
                    const cosPhi = Math.cos(phi);
                    const x = cosPhi * sinTheta;
                    const y = cosTheta;
                    const z = sinPhi * sinTheta;
                    n.push(x, y, z);
                    u.push(1 - (lon / longBands), 1 - (lat / latBands));
                    v.push(x * radius, y * radius, z * radius);
                }
            }
            for (let lat = 0; lat < latBands; lat++) {
                for (let lon = 0; lon < longBands; lon++) {
                    const first = (lat * (longBands + 1)) + lon;
                    const second = first + longBands + 1;
                    idx.push(first, second, first + 1);
                    idx.push(second, second + 1, first + 1);
                }
            }
            return { v, n, u, idx };
        }));

        // 4. Cube
        this.registerAsset(this.createPrimitive('Cube', () => {
            const v = [ -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5, 0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5,0.5,-0.5, 0.5,0.5,-0.5, -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5, -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, 0.5,0.5,0.5, -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5 ];
            const n = [ 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, 1,0,0, 1,0,0, 1,0,0, 1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0 ];
            const u = [ 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1 ];
            const idx = [ 0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11, 12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23 ];
            return { v, n, u, idx };
        }));
    }

    private createPrimitive(name: string, generator: (segs: number) => any): StaticMeshAsset {
        const { v, n, u, idx } = generator(24);
        return {
            id: crypto.randomUUID(),
            name: `SM_${name}`,
            type: 'MESH',
            geometry: {
                vertices: new Float32Array(v),
                normals: new Float32Array(n),
                uvs: new Float32Array(u),
                indices: new Uint16Array(idx)
            }
        };
    }
}

export const assetManager = new AssetManagerService();
