
import { StaticMeshAsset, MaterialAsset, PhysicsMaterialAsset, GraphNode, GraphConnection, Asset } from '../types';
import { MaterialTemplate, MATERIAL_TEMPLATES } from './MaterialTemplates';

class AssetManagerService {
    assets = new Map<string, Asset>();
    
    // Maps internal integer ID (for ECS/Renderer) to Asset UUID
    meshIntToUuid = new Map<number, string>();
    meshUuidToInt = new Map<string, number>();
    
    matIntToUuid = new Map<number, string>();
    matUuidToInt = new Map<string, number>();
    
    physMatIntToUuid = new Map<number, string>();
    physMatUuidToInt = new Map<string, number>();

    private nextMeshIntId = 100; 
    private nextMatIntId = 1; 
    private nextPhysMatIntId = 1;

    constructor() {
        this.registerDefaultAssets();
        this.createMaterial('Standard', MATERIAL_TEMPLATES[1]);
        this.createDefaultPhysicsMaterials();
    }

    registerAsset(asset: Asset): number {
        this.assets.set(asset.id, asset);
        
        if (asset.type === 'MESH') {
            if (this.meshUuidToInt.has(asset.id)) return this.meshUuidToInt.get(asset.id)!;
            const intId = this.nextMeshIntId++;
            this.meshIntToUuid.set(intId, asset.id);
            this.meshUuidToInt.set(asset.id, intId);
            return intId;
        } else if (asset.type === 'MATERIAL') {
            if (this.matUuidToInt.has(asset.id)) return this.matUuidToInt.get(asset.id)!;
            const intId = this.nextMatIntId++;
            this.matIntToUuid.set(intId, asset.id);
            this.matUuidToInt.set(asset.id, intId);
            return intId;
        } else if (asset.type === 'PHYSICS_MATERIAL') {
            if (this.physMatUuidToInt.has(asset.id)) return this.physMatUuidToInt.get(asset.id)!;
            const intId = this.nextPhysMatIntId++;
            this.physMatIntToUuid.set(intId, asset.id);
            this.physMatUuidToInt.set(asset.id, intId);
            return intId;
        }
        return 0;
    }

    getAsset(id: string) {
        return this.assets.get(id);
    }

    getMeshID(uuid: string): number { return this.meshUuidToInt.get(uuid) || 0; }
    getMaterialID(uuid: string): number { return this.matUuidToInt.get(uuid) || 0; }
    getMaterialUUID(intId: number): string | undefined { return this.matIntToUuid.get(intId); } // Added helper
    getPhysicsMaterialID(uuid: string): number { return this.physMatUuidToInt.get(uuid) || 0; }
    
    getPhysicsMaterialUUID(intId: number): string | undefined { return this.physMatIntToUuid.get(intId); }

    getAllAssets() {
        return Array.from(this.assets.values());
    }
    
    getAssetsByType(type: Asset['type']) {
        return Array.from(this.assets.values()).filter(a => a.type === type);
    }

    // --- Material Management ---

    createMaterial(name: string, template?: MaterialTemplate): MaterialAsset {
        const id = crypto.randomUUID();
        const base = template || MATERIAL_TEMPLATES[0];
        
        const nodes = JSON.parse(JSON.stringify(base.nodes));
        const connections = JSON.parse(JSON.stringify(base.connections));

        const mat: MaterialAsset = {
            id,
            name,
            type: 'MATERIAL',
            data: { nodes, connections, glsl: '' }
        };
        this.registerAsset(mat);
        return mat;
    }

    createPhysicsMaterial(name: string, data?: PhysicsMaterialAsset['data']): PhysicsMaterialAsset {
        const id = crypto.randomUUID();
        const asset: PhysicsMaterialAsset = {
            id,
            name,
            type: 'PHYSICS_MATERIAL',
            data: data || { staticFriction: 0.6, dynamicFriction: 0.6, bounciness: 0.0, density: 1.0 }
        };
        this.registerAsset(asset);
        return asset;
    }

    duplicateMaterial(sourceId: string): Asset | null {
        const source = this.assets.get(sourceId);
        if (!source) return null;

        if (source.type === 'MATERIAL') {
            const newMat = this.createMaterial(`${source.name} (Clone)`);
            newMat.data = JSON.parse(JSON.stringify(source.data));
            return newMat;
        } else if (source.type === 'PHYSICS_MATERIAL') {
            const newMat = this.createPhysicsMaterial(`${source.name} (Clone)`, JSON.parse(JSON.stringify(source.data)));
            return newMat;
        }
        return null;
    }

    saveMaterial(id: string, nodes: GraphNode[], connections: GraphConnection[], glsl: string) {
        const asset = this.assets.get(id);
        if (asset && asset.type === 'MATERIAL') {
            asset.data = { nodes, connections, glsl };
            console.log(`[AssetManager] Saved Material: ${asset.name}`);
        }
    }
    
    updatePhysicsMaterial(id: string, data: Partial<PhysicsMaterialAsset['data']>) {
        const asset = this.assets.get(id);
        if (asset && asset.type === 'PHYSICS_MATERIAL') {
            asset.data = { ...asset.data, ...data };
        }
    }

    private createDefaultPhysicsMaterials() {
        this.createPhysicsMaterial("Concrete", { staticFriction: 0.8, dynamicFriction: 0.6, bounciness: 0.1, density: 2400 });
        this.createPhysicsMaterial("Ice", { staticFriction: 0.1, dynamicFriction: 0.05, bounciness: 0.05, density: 900 });
        this.createPhysicsMaterial("Rubber", { staticFriction: 0.9, dynamicFriction: 0.8, bounciness: 0.8, density: 1100 });
        this.createPhysicsMaterial("Bouncy Ball", { staticFriction: 0.5, dynamicFriction: 0.5, bounciness: 0.95, density: 100 });
    }

    private registerDefaultAssets() {
        // Primitives registration (omitted for brevity, same as before)
        this.registerAsset(this.createPrimitive('Cylinder', (segs) => {
            const v=[], n=[], u=[], idx=[];
            const segments = 24; const radius = 0.5; const height = 1.0; const halfH = height/2;
            for(let i=0; i<=segments; i++) {
                const theta = (i/segments) * Math.PI * 2; const x = Math.cos(theta) * radius; const z = Math.sin(theta) * radius;
                v.push(x, halfH, z); n.push(x, 0, z); u.push(i/segments, 0); v.push(x, -halfH, z); n.push(x, 0, z); u.push(i/segments, 1);
            }
            for(let i=0; i<segments; i++) { const base = i*2; idx.push(base, base+1, base+2, base+1, base+3, base+2); }
            return { v, n, u, idx };
        }));
        this.registerAsset(this.createPrimitive('Cone', () => {
            const v=[], n=[], u=[], idx=[];
            const segments = 24; const radius = 0.5; const height = 1.0; const halfH = height/2;
            v.push(0, halfH, 0); n.push(0, 1, 0); u.push(0.5, 0); 
            for(let i=0; i<=segments; i++) {
                const theta = (i/segments) * Math.PI * 2; const x = Math.cos(theta) * radius; const z = Math.sin(theta) * radius;
                v.push(x, -halfH, z); n.push(x, 0.5, z); u.push(i/segments, 1);
            }
            for(let i=1; i<=segments; i++) idx.push(0, i, i+1);
            return { v, n, u, idx };
        }));
        this.registerAsset(this.createPrimitive('Sphere', () => {
            const radius = 0.5; const latBands = 24; const longBands = 24; const v=[], n=[], u=[], idx=[];
            for (let lat = 0; lat <= latBands; lat++) {
                const theta = lat * Math.PI / latBands; const sinTheta = Math.sin(theta); const cosTheta = Math.cos(theta);
                for (let lon = 0; lon <= longBands; lon++) {
                    const phi = lon * 2 * Math.PI / longBands; const sinPhi = Math.sin(phi); const cosPhi = Math.cos(phi);
                    const x = cosPhi * sinTheta; const y = cosTheta; const z = sinPhi * sinTheta;
                    n.push(x, y, z); u.push(1 - (lon / longBands), 1 - (lat / latBands)); v.push(x * radius, y * radius, z * radius);
                }
            }
            for (let lat = 0; lat < latBands; lat++) {
                for (let lon = 0; lon < longBands; lon++) {
                    const first = (lat * (longBands + 1)) + lon; const second = first + longBands + 1;
                    idx.push(first, second, first + 1, second, second + 1, first + 1);
                }
            }
            return { v, n, u, idx };
        }));
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
