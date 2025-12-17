
import { StaticMeshAsset, SkeletalMeshAsset, MaterialAsset, PhysicsMaterialAsset, ScriptAsset, RigAsset, TextureAsset, GraphNode, GraphConnection, Asset } from '../types';
import { MaterialTemplate, MATERIAL_TEMPLATES } from './MaterialTemplates';
import { MESH_TYPES } from './constants';
import { engineInstance } from './engine';

export interface RigTemplate {
    name: string;
    description: string;
    nodes: GraphNode[];
    connections: GraphConnection[];
}

export const RIG_TEMPLATES: RigTemplate[] = [
    {
        name: 'Locomotion IK Logic',
        description: 'Basic two-bone IK setup for leg movement.',
        nodes: [
            { id: 'time', type: 'Time', position: { x: 50, y: 50 } },
            { id: 'speed', type: 'Float', position: { x: 50, y: 150 }, data: { value: '3.0' } },
            { id: 'mul_t', type: 'Multiply', position: { x: 250, y: 100 } },
            { id: 'sin', type: 'Sine', position: { x: 400, y: 100 } },
            { id: 'zero', type: 'Float', position: { x: 400, y: 200 }, data: { value: '0.0' } },
            { id: 'gt', type: 'GreaterThan', position: { x: 550, y: 150 } },
            { id: 'in', type: 'RigInput', position: { x: 50, y: 400 } },
            { id: 'branch', type: 'Branch', position: { x: 750, y: 300 } },
            { id: 'target', type: 'Vec3', position: { x: 750, y: 500 }, data: { x: '0.2', y: '0.5', z: '0.0' } },
            { id: 'ik', type: 'TwoBoneIK', position: { x: 950, y: 450 }, data: { root: 'Thigh_L', mid: 'Calf_L', eff: 'Foot_L' } },
            { id: 'out', type: 'RigOutput', position: { x: 1200, y: 350 } }
        ],
        connections: [
            { id: 'l1', fromNode: 'time', fromPin: 'out', toNode: 'mul_t', toPin: 'a' },
            { id: 'l2', fromNode: 'speed', fromPin: 'out', toNode: 'mul_t', toPin: 'b' },
            { id: 'l3', fromNode: 'mul_t', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            { id: 'l4', fromNode: 'sin', fromPin: 'out', toNode: 'gt', toPin: 'a' },
            { id: 'l5', fromNode: 'zero', fromPin: 'out', toNode: 'gt', toPin: 'b' },
            { id: 'f1', fromNode: 'gt', fromPin: 'out', toNode: 'branch', toPin: 'condition' },
            { id: 'f2', fromNode: 'in', fromPin: 'pose', toNode: 'branch', toPin: 'false' },
            { id: 'f3', fromNode: 'in', fromPin: 'pose', toNode: 'ik', toPin: 'pose' },
            { id: 'f4', fromNode: 'target', fromPin: 'out', toNode: 'ik', toPin: 'target' },
            { id: 'f5', fromNode: 'ik', fromPin: 'outPose', toNode: 'branch', toPin: 'true' },
            { id: 'f6', fromNode: 'branch', fromPin: 'out', toNode: 'out', toPin: 'pose' }
        ]
    }
];

class AssetManagerService {
    assets = new Map<string, Asset>();
    
    meshIntToUuid = new Map<number, string>();
    meshUuidToInt = new Map<string, number>();
    matIntToUuid = new Map<number, string>();
    matUuidToInt = new Map<string, number>();
    physMatIntToUuid = new Map<number, string>();
    physMatUuidToInt = new Map<string, number>();
    rigIntToUuid = new Map<number, string>();
    rigUuidToInt = new Map<string, number>();

    private nextMeshIntId = 100; 
    private nextMatIntId = 1; 
    private nextPhysMatIntId = 1;
    private nextRigIntId = 1;
    private nextTextureLayerId = 4; 

    constructor() {
        this.registerDefaultAssets();
        this.createMaterial('Standard', MATERIAL_TEMPLATES[1]);
        this.createDefaultPhysicsMaterials();
        this.createScript('New Visual Script');
        this.createRig('Locomotion IK Logic', RIG_TEMPLATES[0]);
    }

    registerAsset(asset: Asset, forcedIntId?: number): number {
        this.assets.set(asset.id, asset);
        
        if (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH') {
            if (this.meshUuidToInt.has(asset.id)) return this.meshUuidToInt.get(asset.id)!;
            const intId = forcedIntId || this.nextMeshIntId++;
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
        } else if (asset.type === 'RIG') {
            if (this.rigUuidToInt.has(asset.id)) return this.rigUuidToInt.get(asset.id)!;
            const intId = this.nextRigIntId++;
            this.rigIntToUuid.set(intId, asset.id);
            this.rigUuidToInt.set(asset.id, intId);
            return intId;
        }
        return 0;
    }

    getAsset(id: string) {
        return this.assets.get(id);
    }

    getMeshID(uuid: string): number { return this.meshUuidToInt.get(uuid) || 0; }
    getMaterialID(uuid: string): number { return this.matUuidToInt.get(uuid) || 0; }
    getMaterialUUID(intId: number): string | undefined { return this.matIntToUuid.get(intId); } 
    getPhysicsMaterialID(uuid: string): number { return this.physMatUuidToInt.get(uuid) || 0; }
    getPhysicsMaterialUUID(intId: number): string | undefined { return this.physMatIntToUuid.get(intId); }
    getRigID(uuid: string): number { return this.rigUuidToInt.get(uuid) || 0; }
    getRigUUID(intId: number): string | undefined { return this.rigIntToUuid.get(intId); }

    getAllAssets() {
        return Array.from(this.assets.values());
    }
    
    getAssetsByType(type: Asset['type']) {
        return Array.from(this.assets.values()).filter(a => a.type === type);
    }

    createTexture(name: string, source: string): TextureAsset {
        const id = crypto.randomUUID();
        const layerIndex = this.nextTextureLayerId;
        this.nextTextureLayerId = 4 + ((this.nextTextureLayerId - 3) % 12); 
        const asset: TextureAsset = { id, name, type: 'TEXTURE', source, layerIndex };
        this.registerAsset(asset);
        const img = new Image();
        img.onload = () => { if (engineInstance?.renderer) engineInstance.renderer.uploadTexture(asset.layerIndex, img); };
        img.src = asset.source;
        return asset;
    }

    createMaterial(name: string, template?: MaterialTemplate): MaterialAsset {
        const id = crypto.randomUUID();
        const base = template || MATERIAL_TEMPLATES[0];
        const mat: MaterialAsset = {
            id, name, type: 'MATERIAL',
            data: { nodes: JSON.parse(JSON.stringify(base.nodes)), connections: JSON.parse(JSON.stringify(base.connections)), glsl: '' }
        };
        this.registerAsset(mat);
        return mat;
    }

    createPhysicsMaterial(name: string, data?: PhysicsMaterialAsset['data']): PhysicsMaterialAsset {
        const id = crypto.randomUUID();
        const asset: PhysicsMaterialAsset = { id, name, type: 'PHYSICS_MATERIAL', data: data || { staticFriction: 0.6, dynamicFriction: 0.6, bounciness: 0.0, density: 1.0 } };
        this.registerAsset(asset);
        return asset;
    }

    createScript(name: string): ScriptAsset {
        const id = crypto.randomUUID();
        const nodes: GraphNode[] = [
            { id: 'time', type: 'Time', position: { x: 50, y: 150 } },
            { id: 'sin', type: 'Sine', position: { x: 250, y: 150 } },
            { id: 'mul', type: 'Multiply', position: { x: 450, y: 150 } },
            { id: 'val', type: 'Float', position: { x: 250, y: 250 }, data: { value: '2.0' } }
        ];
        const connections: GraphConnection[] = [
            { id: 'c1', fromNode: 'time', fromPin: 'out', toNode: 'sin', toPin: 'in' },
            { id: 'c2', fromNode: 'sin', fromPin: 'out', toNode: 'mul', toPin: 'a' },
            { id: 'c3', fromNode: 'val', fromPin: 'out', toNode: 'mul', toPin: 'b' }
        ];
        const asset: ScriptAsset = { id, name, type: 'SCRIPT', data: { nodes, connections } };
        this.registerAsset(asset);
        return asset;
    }

    createRig(name: string, template?: RigTemplate): RigAsset {
        const id = crypto.randomUUID();
        const base = template || RIG_TEMPLATES[0];
        const asset: RigAsset = { id, name, type: 'RIG', data: { nodes: JSON.parse(JSON.stringify(base.nodes)), connections: JSON.parse(JSON.stringify(base.connections)) } };
        this.registerAsset(asset);
        return asset;
    }

    async importFile(fileName: string, content: string | ArrayBuffer, type: 'MESH' | 'SKELETAL_MESH'): Promise<Asset> {
        const id = crypto.randomUUID();
        const name = fileName.split('.')[0] || 'Imported_Mesh';
        let geometry = { v: [] as number[], n: [] as number[], u: [] as number[], idx: [] as number[] };

        const ext = fileName.toLowerCase();

        if (ext.endsWith('.obj')) {
            geometry = this.parseOBJ(typeof content === 'string' ? content : new TextDecoder().decode(content));
        } else if (ext.endsWith('.glb')) {
            geometry = this.parseGLB(content instanceof ArrayBuffer ? content : new ArrayBuffer(0));
        } else if (ext.endsWith('.fbx')) {
            geometry = await this.parseFBX(content);
        } else {
            console.warn("Unsupported format. Using fallback cylinder.");
            geometry = this.generateCylinder(24);
        }

        if (geometry.v.length === 0) {
            console.error("Parser failed to find valid geometry. Using fallback.");
            geometry = this.generateCylinder(24);
        }

        const asset: StaticMeshAsset = {
            id, name, type: 'MESH',
            geometry: {
                vertices: new Float32Array(geometry.v),
                normals: new Float32Array(geometry.n),
                uvs: new Float32Array(geometry.u),
                indices: new Uint16Array(geometry.idx)
            }
        };
        
        if (type === 'SKELETAL_MESH') {
             const skel: SkeletalMeshAsset = {
                 ...asset, type: 'SKELETAL_MESH',
                 geometry: {
                     ...asset.geometry,
                     jointIndices: new Float32Array((geometry.v.length / 3) * 4).fill(0),
                     jointWeights: new Float32Array((geometry.v.length / 3) * 4).fill(0).map((_, i) => i % 4 === 0 ? 1 : 0)
                 },
                 skeleton: { bones: [{ name: 'Root', parentIndex: -1, bindPose: new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]) }] }
             };
             this.registerAsset(skel);
             return skel;
        }

        this.registerAsset(asset);
        return asset;
    }

    private parseOBJ(text: string) {
        const positions: number[][] = [];
        const normals: number[][] = [];
        const uvs: number[][] = [];
        const finalV: number[] = [];
        const finalN: number[] = [];
        const finalU: number[] = [];
        const finalIdx: number[] = [];
        const cache = new Map<string, number>();
        let nextIdx = 0;
        const lines = text.split('\n');
        for (let line of lines) {
            line = line.trim();
            if (line.startsWith('#') || line.length === 0) continue;
            const parts = line.split(/\s+/);
            const type = parts[0];
            if (type === 'v') positions.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
            else if (type === 'vn') normals.push([parseFloat(parts[1]), parseFloat(parts[2]), parseFloat(parts[3])]);
            else if (type === 'vt') uvs.push([parseFloat(parts[1]), parseFloat(parts[2])]);
            else if (type === 'f') {
                const poly = parts.slice(1);
                const resolveIndex = (indexStr: string, arrayLength: number) => {
                    if (!indexStr) return 0;
                    const idx = parseInt(indexStr);
                    return idx < 0 ? arrayLength + idx : idx - 1;
                };
                for (let i = 1; i < poly.length - 1; i++) {
                    const triIndices = [poly[0], poly[i], poly[i+1]];
                    for (const vertStr of triIndices) {
                        if (cache.has(vertStr)) {
                            finalIdx.push(cache.get(vertStr)!);
                        } else {
                            const subParts = vertStr.split('/');
                            const vI = resolveIndex(subParts[0], positions.length);
                            const tI = subParts.length > 1 ? resolveIndex(subParts[1], uvs.length) : -1;
                            const nI = subParts.length > 2 ? resolveIndex(subParts[2], normals.length) : -1;
                            const pos = positions[vI] || [0,0,0];
                            const uv = (tI !== -1 && uvs[tI]) ? uvs[tI] : [0,0];
                            const norm = (nI !== -1 && normals[nI]) ? normals[nI] : [0,1,0];
                            finalV.push(...pos); finalN.push(...norm); finalU.push(...uv);
                            cache.set(vertStr, nextIdx); finalIdx.push(nextIdx++);
                        }
                    }
                }
            }
        }
        this.generateMissingNormals(finalV, finalN, finalIdx);
        return { v: finalV, n: finalN, u: finalU, idx: finalIdx };
    }

    private async parseFBX(content: string | ArrayBuffer) {
        if (content instanceof ArrayBuffer) {
            const header = new Uint8Array(content.slice(0, 18));
            const headerStr = new TextDecoder().decode(header);
            if (headerStr.includes("Kaydara FBX Binary")) {
                return await this.parseFBXBinary(content);
            }
            return this.parseFBXASCII(new TextDecoder().decode(content));
        }
        return this.parseFBXASCII(content);
    }

    private async inflate(data: Uint8Array): Promise<Uint8Array> {
        // High-performance browser native decompression
        const ds = new DecompressionStream('deflate');
        const writer = ds.writable.getWriter();
        writer.write(data);
        writer.close();
        const reader = ds.readable.getReader();
        const chunks = [];
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            chunks.push(value);
        }
        const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(totalLength);
        let offset = 0;
        for (const chunk of chunks) {
            result.set(chunk, offset);
            offset += chunk.length;
        }
        return result;
    }

    private async parseFBXBinary(buffer: ArrayBuffer) {
        console.log("Starting Binary FBX Import (Async/Decompression Ready)...");
        const view = new DataView(buffer);
        let offset = 27; 
        const version = view.getUint32(23, true);
        
        let finalV: number[] = [];
        let finalIdx: number[] = [];

        // Helper to read property arrays (handles compression)
        const readArrayProp = async (typeCode: string) => {
            const arrLen = view.getUint32(offset, true);
            const encoding = view.getUint32(offset + 4, true);
            const compLen = view.getUint32(offset + 8, true);
            offset += 12;

            let data: Uint8Array;
            if (encoding === 0) {
                const byteLen = arrLen * (typeCode === 'd' || typeCode === 'l' ? 8 : (typeCode === 'i' || typeCode === 'f' ? 4 : 1));
                data = new Uint8Array(buffer.slice(offset, offset + byteLen));
                offset += byteLen;
            } else {
                // Handle FBX Compression using browser native DecompressionStream
                const compressed = new Uint8Array(buffer.slice(offset, offset + compLen));
                data = await this.inflate(compressed);
                offset += compLen;
            }

            if (typeCode === 'd') return Array.from(new Float64Array(data.buffer));
            if (typeCode === 'f') return Array.from(new Float32Array(data.buffer));
            if (typeCode === 'i') return Array.from(new Int32Array(data.buffer));
            return [];
        };

        const readNode = async (): Promise<any> => {
            if (offset >= buffer.byteLength) return null;

            const is75 = version >= 7500;
            const endOffset = is75 ? Number(view.getBigUint64(offset, true)) : view.getUint32(offset, true);
            const numProps = is75 ? Number(view.getBigUint64(offset + 8, true)) : view.getUint32(offset + 4, true);
            const nameLen = view.getUint8(offset + (is75 ? 24 : 12));
            const headerSize = (is75 ? 25 : 13);
            
            if (endOffset === 0) {
                offset += headerSize;
                return null;
            }

            const name = new TextDecoder().decode(new Uint8Array(buffer, offset + headerSize, nameLen));
            offset += headerSize + nameLen;

            const props: any[] = [];
            for (let i = 0; i < numProps; i++) {
                const typeCode = String.fromCharCode(view.getUint8(offset));
                offset++;
                if ('dfilb'.includes(typeCode)) {
                    props.push(await readArrayProp(typeCode));
                } else if (typeCode === 'D') { props.push(view.getFloat64(offset, true)); offset += 8; }
                else if (typeCode === 'F') { props.push(view.getFloat32(offset, true)); offset += 4; }
                else if (typeCode === 'I') { props.push(view.getInt32(offset, true)); offset += 4; }
                else if (typeCode === 'L') { props.push(Number(view.getBigInt64(offset, true))); offset += 8; }
                else if (typeCode === 'Y') { props.push(view.getInt16(offset, true)); offset += 2; }
                else if (typeCode === 'C') { props.push(view.getUint8(offset) !== 0); offset += 1; }
                else if (typeCode === 'S' || typeCode === 'R') {
                    const len = view.getUint32(offset, true);
                    offset += 4;
                    const d = new Uint8Array(buffer, offset, len);
                    props.push(typeCode === 'S' ? new TextDecoder().decode(d) : d);
                    offset += len;
                }
            }

            while (offset < endOffset) {
                const child = await readNode();
                if (!child) break;
                if (child.name === 'Vertices') finalV = child.props[0];
                if (child.name === 'PolygonVertexIndex') finalIdx = child.props[0];
                // Support multiple meshes by grabbing the first one with data if we haven't yet
                if (finalV.length > 0 && finalIdx.length > 0) break;
            }
            
            offset = endOffset;
            return { name, props };
        };

        try {
            while (offset < buffer.byteLength - 160) {
                const node = await readNode();
                if (!node) break;
            }
        } catch (e) {
            console.error("Binary FBX Parse Failed", e);
        }

        if (finalV.length > 0) {
            const scaledV = finalV.map(v => v * 0.01);
            const triangulatedIdx: number[] = [];
            let polygon: number[] = [];
            for (let rawIdx of finalIdx) {
                let isEnd = false;
                if (rawIdx < 0) { rawIdx = (rawIdx ^ -1); isEnd = true; }
                polygon.push(rawIdx);
                if (isEnd) {
                    for (let i = 1; i < polygon.length - 1; i++) triangulatedIdx.push(polygon[0], polygon[i], polygon[i+1]);
                    polygon = [];
                }
            }
            const finalN = new Array(scaledV.length).fill(0);
            const finalU = new Array((scaledV.length / 3) * 2).fill(0);
            this.generateMissingNormals(scaledV, finalN, triangulatedIdx);
            return { v: scaledV, n: finalN, u: finalU, idx: triangulatedIdx };
        }

        console.error("Binary FBX: Still no valid mesh geometry found. The file structure might be unsupported.");
        return this.generateCylinder(24);
    }

    private parseFBXASCII(text: string) {
        const finalV: number[] = [];
        const finalN: number[] = [];
        const finalU: number[] = [];
        const finalIdx: number[] = [];
        try {
            const vMatch = text.match(/Vertices:\s*\*(\d+)\s*{([^}]*)}/);
            const iMatch = text.match(/PolygonVertexIndex:\s*\*(\d+)\s*{([^}]*)}/);
            if (vMatch && iMatch) {
                const verts = vMatch[2].split(',').map(s => parseFloat(s.trim()) * 0.01);
                const indices = iMatch[2].split(',').map(s => parseInt(s.trim()));
                let polygon: number[] = [];
                for (let rawIdx of indices) {
                    let isEnd = false;
                    if (rawIdx < 0) { rawIdx = (rawIdx ^ -1); isEnd = true; }
                    polygon.push(rawIdx);
                    if (isEnd) {
                        for (let i = 1; i < polygon.length - 1; i++) finalIdx.push(polygon[0], polygon[i], polygon[i+1]);
                        polygon = [];
                    }
                }
                finalV.push(...verts);
                finalN.push(...new Array(verts.length).fill(0));
                finalU.push(...new Array((verts.length / 3) * 2).fill(0));
                this.generateMissingNormals(finalV, finalN, finalIdx);
                return { v: finalV, n: finalN, u: finalU, idx: finalIdx };
            }
        } catch (e) { console.error("FBX ASCII Parser failed", e); }
        return this.generateCylinder(24);
    }

    private generateMissingNormals(v: number[], n: number[], idx: number[]) {
        if (v.length > 0) {
            for (let i = 0; i < idx.length; i += 3) {
                const i1 = idx[i] * 3, i2 = idx[i+1] * 3, i3 = idx[i+2] * 3;
                const v1 = [v[i2] - v[i1], v[i2+1] - v[i1+1], v[i2+2] - v[i1+2]];
                const v2 = [v[i3] - v[i1], v[i3+1] - v[i1+1], v[i3+2] - v[i1+2]];
                const nx = v1[1] * v2[2] - v1[2] * v2[1];
                const ny = v1[2] * v2[0] - v1[0] * v2[2];
                const nz = v1[0] * v2[1] - v1[1] * v2[0];
                const l = Math.sqrt(nx*nx + ny*ny + nz*nz) || 1;
                [idx[i], idx[i+1], idx[i+2]].forEach(vIdx => {
                    n[vIdx*3] = nx/l; n[vIdx*3+1] = ny/l; n[vIdx*3+2] = nz/l;
                });
            }
        }
    }

    private parseGLB(buffer: ArrayBuffer) {
        const view = new DataView(buffer);
        if (view.getUint32(0, true) !== 0x46546C67) return { v: [], n: [], u: [], idx: [] };
        return this.generateCylinder(32);
    }

    duplicateAsset(sourceId: string): Asset | null {
        const source = this.assets.get(sourceId);
        if (!source) return null;
        const newId = crypto.randomUUID();
        const clone = JSON.parse(JSON.stringify(source));
        clone.id = newId; clone.name = `${source.name} (Clone)`;
        this.registerAsset(clone);
        return clone;
    }

    saveMaterial(id: string, nodes: GraphNode[], connections: GraphConnection[], glsl: string) {
        const asset = this.assets.get(id);
        if (asset && asset.type === 'MATERIAL') asset.data = { nodes, connections, glsl };
    }

    saveScript(id: string, nodes: GraphNode[], connections: GraphConnection[]) {
        const asset = this.assets.get(id);
        if (asset && (asset.type === 'SCRIPT' || asset.type === 'RIG')) asset.data = { nodes, connections };
    }
    
    updatePhysicsMaterial(id: string, data: Partial<PhysicsMaterialAsset['data']>) {
        const asset = this.assets.get(id);
        if (asset && asset.type === 'PHYSICS_MATERIAL') asset.data = { ...asset.data, ...data };
    }

    private createDefaultPhysicsMaterials() {
        this.createPhysicsMaterial("Concrete", { staticFriction: 0.8, dynamicFriction: 0.6, bounciness: 0.1, density: 2400 });
        this.createPhysicsMaterial("Ice", { staticFriction: 0.1, dynamicFriction: 0.05, bounciness: 0.05, density: 900 });
    }

    private registerDefaultAssets() {
        this.registerAsset(this.createPrimitive('Cube', () => {
            const v = [ -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,0.5,0.5, -0.5,0.5,0.5, 0.5,-0.5,-0.5, -0.5,-0.5,-0.5, -0.5,0.5,-0.5, 0.5,0.5,-0.5, -0.5,0.5,0.5, 0.5,0.5,0.5, 0.5,0.5,-0.5, -0.5,0.5,-0.5, -0.5,-0.5,-0.5, 0.5,-0.5,-0.5, 0.5,-0.5,0.5, -0.5,-0.5,0.5, 0.5,-0.5,0.5, 0.5,-0.5,-0.5, 0.5,0.5,-0.5, 0.5,0.5,0.5, -0.5,-0.5,-0.5, -0.5,-0.5,0.5, -0.5,0.5,0.5, -0.5,0.5,-0.5 ];
            const n = [ 0,0,1, 0,0,1, 0,0,1, 0,0,1, 0,0,-1, 0,0,-1, 0,0,-1, 0,0,-1, 0,1,0, 0,1,0, 0,1,0, 0,1,0, 0,-1,0, 0,-1,0, 0,-1,0, 0,-1,0, 1,0,0, 1,0,0, 1,0,0, 1,0,0, -1,0,0, -1,0,0, -1,0,0, -1,0,0 ];
            const u = [ 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1, 0,0, 1,0, 1,1, 0,1 ];
            const idx = [ 0,1,2, 0,2,3, 4,5,6, 4,6,7, 8,9,10, 8,10,11, 12,13,14, 12,14,15, 16,17,18, 16,18,19, 20,21,22, 20,22,23 ];
            return { v, n, u, idx };
        }), MESH_TYPES['Cube']);
        this.registerAsset(this.createPrimitive('Plane', () => ({ v: [-0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5], n: [0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0], u: [0, 0, 1, 0, 1, 1, 0, 1], idx: [0, 1, 2, 0, 2, 3] })), MESH_TYPES['Plane']);
    }

    private generateCylinder(segments: number) {
        const v=[], n=[], u=[], idx=[];
        const radius = 0.5; const height = 1.0; const halfH = height/2;
        for(let i=0; i<=segments; i++) {
            const theta = (i/segments) * Math.PI * 2; const x = Math.cos(theta) * radius; const z = Math.sin(theta) * radius;
            v.push(x, halfH, z); n.push(x, 0, z); u.push(i/segments, 0); v.push(x, -halfH, z); n.push(x, 0, z); u.push(i/segments, 1);
        }
        for(let i=0; i<segments; i++) { const base = i*2; idx.push(base, base+1, base+2, base+1, base+3, base+2); }
        return { v, n, u, idx };
    }

    private createPrimitive(name: string, generator: () => any): StaticMeshAsset {
        const { v, n, u, idx } = generator();
        return { id: crypto.randomUUID(), name: `SM_${name}`, type: 'MESH', geometry: { vertices: new Float32Array(v), normals: new Float32Array(n), uvs: new Float32Array(u), indices: new Uint16Array(idx) } };
    }
}

export const assetManager = new AssetManagerService();
