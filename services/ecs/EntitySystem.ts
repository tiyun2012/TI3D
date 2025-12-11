
import { ComponentStorage } from './ComponentStorage';
import { MESH_NAMES, MESH_TYPES } from '../constants';
import { SceneGraph } from '../SceneGraph';
import { ComponentType, Entity } from '../../types';
import type { HistorySystem } from '../systems/HistorySystem';

export class SoAEntitySystem {
    store = new ComponentStorage();
    count = 0;
    freeIndices: number[] = [];
    
    // Map string UUID to SoA Index
    idToIndex = new Map<string, number>();

    createEntity(name: string): string {
        let index: number;
        if (this.freeIndices.length > 0) {
            index = this.freeIndices.pop()!;
        } else {
            if (this.count >= this.store.capacity) {
                this.store.resize(this.store.capacity * 2);
            }
            index = this.count++;
        }
        
        const id = crypto.randomUUID();
        this.store.isActive[index] = 1;
        this.store.generation[index]++;
        this.store.names[index] = name;
        this.store.ids[index] = id;
        
        // Defaults
        this.store.posX[index] = 0; this.store.posY[index] = 0; this.store.posZ[index] = 0;
        this.store.rotX[index] = 0; this.store.rotY[index] = 0; this.store.rotZ[index] = 0;
        this.store.scaleX[index] = 1; this.store.scaleY[index] = 1; this.store.scaleZ[index] = 1;
        this.store.meshType[index] = 0;
        this.store.textureIndex[index] = 0;
        this.store.colorR[index] = 1; this.store.colorG[index] = 1; this.store.colorB[index] = 1;
        
        this.idToIndex.set(id, index);
        return id;
    }

    getEntityIndex(id: string): number | undefined {
        return this.idToIndex.get(id);
    }

    createProxy(id: string, sceneGraph: SceneGraph, history?: HistorySystem): Entity | null {
        const index = this.idToIndex.get(id);
        if (index === undefined || this.store.isActive[index] === 0) return null;
        
        const store = this.store;
        const setDirty = () => {
            sceneGraph.setDirty(id);
        };
        
        return {
            id,
            get name() { return store.names[index]; },
            set name(v) { store.names[index] = v; },
            get isActive() { return !!store.isActive[index]; },
            set isActive(v) { store.isActive[index] = v ? 1 : 0; },
            components: {
                [ComponentType.TRANSFORM]: {
                    type: ComponentType.TRANSFORM,
                    get position() { 
                        return { 
                            get x() { return store.posX[index]; }, set x(v) { store.posX[index] = v; setDirty(); },
                            get y() { return store.posY[index]; }, set y(v) { store.posY[index] = v; setDirty(); },
                            get z() { return store.posZ[index]; }, set z(v) { store.posZ[index] = v; setDirty(); }
                        };
                    },
                    set position(v: any) { 
                        store.posX[index] = v.x; store.posY[index] = v.y; store.posZ[index] = v.z; 
                        setDirty();
                    },
                    get rotation() {
                         return { 
                            get x() { return store.rotX[index]; }, set x(v) { store.rotX[index] = v; setDirty(); },
                            get y() { return store.rotY[index]; }, set y(v) { store.rotY[index] = v; setDirty(); },
                            get z() { return store.rotZ[index]; }, set z(v) { store.rotZ[index] = v; setDirty(); }
                        };
                    },
                    set rotation(v: any) {
                        store.rotX[index] = v.x; store.rotY[index] = v.y; store.rotZ[index] = v.z;
                        setDirty();
                    },
                    get scale() {
                        return { 
                            get x() { return store.scaleX[index]; }, set x(v) { store.scaleX[index] = v; setDirty(); },
                            get y() { return store.scaleY[index]; }, set y(v) { store.scaleY[index] = v; setDirty(); },
                            get z() { return store.scaleZ[index]; }, set z(v) { store.scaleZ[index] = v; setDirty(); }
                        };
                    },
                    set scale(v: any) {
                        store.scaleX[index] = v.x; store.scaleY[index] = v.y; store.scaleZ[index] = v.z;
                        setDirty();
                    }
                } as any,
                
                [ComponentType.MESH]: {
                    type: ComponentType.MESH,
                    get meshType() { return MESH_NAMES[store.meshType[index]]; },
                    set meshType(v: string) { store.meshType[index] = MESH_TYPES[v] || 0; },
                    get textureIndex() { return store.textureIndex[index]; },
                    set textureIndex(v: number) { store.textureIndex[index] = v; },
                    get color() { 
                        const r = Math.floor(store.colorR[index] * 255);
                        const g = Math.floor(store.colorG[index] * 255);
                        const b = Math.floor(store.colorB[index] * 255);
                        return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
                    },
                    set color(v: string) {
                        const bigint = parseInt(v.slice(1), 16);
                        store.colorR[index] = ((bigint >> 16) & 255) / 255;
                        store.colorG[index] = ((bigint >> 8) & 255) / 255;
                        store.colorB[index] = (bigint & 255) / 255;
                    }
                } as any,

                [ComponentType.PHYSICS]: {
                    type: ComponentType.PHYSICS,
                    get mass() { return store.mass[index]; },
                    set mass(v: number) { store.mass[index] = v; },
                    get useGravity() { return !!store.useGravity[index]; },
                    set useGravity(v: boolean) { store.useGravity[index] = v ? 1 : 0; }
                } as any,

                [ComponentType.LIGHT]: { type: ComponentType.LIGHT, intensity: 1, color: '#ffffff' },
                [ComponentType.SCRIPT]: { type: ComponentType.SCRIPT }
            }
        };
    }

    getAllProxies(sceneGraph: SceneGraph): Entity[] {
        const entities: Entity[] = [];
        this.idToIndex.forEach((index, id) => {
            if (this.store.isActive[index]) {
                 const proxy = this.createProxy(id, sceneGraph);
                 if (proxy) entities.push(proxy);
            }
        });
        return entities;
    }

    // --- Save / Load ---

    serialize(): string {
        const data = {
            count: this.count,
            capacity: this.store.capacity,
            freeIndices: this.freeIndices,
            idMap: Array.from(this.idToIndex.entries()),
            // Convert typed arrays to standard arrays for JSON
            store: {
                posX: Array.from(this.store.posX.subarray(0, this.count + 1)),
                posY: Array.from(this.store.posY.subarray(0, this.count + 1)),
                posZ: Array.from(this.store.posZ.subarray(0, this.count + 1)),
                rotX: Array.from(this.store.rotX.subarray(0, this.count + 1)),
                rotY: Array.from(this.store.rotY.subarray(0, this.count + 1)),
                rotZ: Array.from(this.store.rotZ.subarray(0, this.count + 1)),
                scaleX: Array.from(this.store.scaleX.subarray(0, this.count + 1)),
                scaleY: Array.from(this.store.scaleY.subarray(0, this.count + 1)),
                scaleZ: Array.from(this.store.scaleZ.subarray(0, this.count + 1)),
                meshType: Array.from(this.store.meshType.subarray(0, this.count + 1)),
                textureIndex: Array.from(this.store.textureIndex.subarray(0, this.count + 1)),
                colorR: Array.from(this.store.colorR.subarray(0, this.count + 1)),
                colorG: Array.from(this.store.colorG.subarray(0, this.count + 1)),
                colorB: Array.from(this.store.colorB.subarray(0, this.count + 1)),
                isActive: Array.from(this.store.isActive.subarray(0, this.count + 1)),
                names: this.store.names.slice(0, this.count + 1),
                ids: this.store.ids.slice(0, this.count + 1)
            }
        };
        return JSON.stringify(data);
    }

    deserialize(json: string, sceneGraph: SceneGraph) {
        try {
            const data = JSON.parse(json);
            if (data.capacity && data.capacity > this.store.capacity) {
                this.store.resize(data.capacity);
            }
            this.count = data.count;
            this.freeIndices = data.freeIndices;
            this.idToIndex = new Map(data.idMap);
            
            // Helper to fill
            const fill = (arr: any, source: any[]) => {
                for(let i=0; i<source.length; i++) arr[i] = source[i];
            };

            fill(this.store.posX, data.store.posX);
            fill(this.store.posY, data.store.posY);
            fill(this.store.posZ, data.store.posZ);
            fill(this.store.rotX, data.store.rotX);
            fill(this.store.rotY, data.store.rotY);
            fill(this.store.rotZ, data.store.rotZ);
            fill(this.store.scaleX, data.store.scaleX);
            fill(this.store.scaleY, data.store.scaleY);
            fill(this.store.scaleZ, data.store.scaleZ);
            fill(this.store.meshType, data.store.meshType);
            fill(this.store.textureIndex, data.store.textureIndex);
            fill(this.store.colorR, data.store.colorR);
            fill(this.store.colorG, data.store.colorG);
            fill(this.store.colorB, data.store.colorB);
            fill(this.store.isActive, data.store.isActive);
            
            // this.store.names = new Array(this.store.capacity);
            fill(this.store.names, data.store.names);
            
            // this.store.ids = new Array(this.store.capacity);
            fill(this.store.ids, data.store.ids);

            this.idToIndex.forEach((idx, id) => {
                if (this.store.isActive[idx]) sceneGraph.registerEntity(id);
                sceneGraph.setDirty(id);
            });

        } catch (e) {
            console.error("Failed to load scene", e);
        }
    }
}
