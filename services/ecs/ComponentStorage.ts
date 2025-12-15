
// services/ecs/ComponentStorage.ts

import { INITIAL_CAPACITY } from '../constants';
import { Mat4Utils } from '../math';

export class ComponentStorage {
    capacity = INITIAL_CAPACITY;

    // --- Transform (Decomposed - Local) ---
    posX = new Float32Array(this.capacity);
    posY = new Float32Array(this.capacity);
    posZ = new Float32Array(this.capacity);
    
    rotX = new Float32Array(this.capacity);
    rotY = new Float32Array(this.capacity);
    rotZ = new Float32Array(this.capacity);
    
    scaleX = new Float32Array(this.capacity);
    scaleY = new Float32Array(this.capacity);
    scaleZ = new Float32Array(this.capacity);
    
    // 0=XYZ, 1=XZY, 2=YXZ, 3=YZX, 4=ZXY, 5=ZYX
    rotationOrder = new Uint8Array(this.capacity);

    // --- World Transform Cache (Contiguous for GPU) ---
    // 16 floats per entity. Computed by SceneGraph when dirty.
    worldMatrix = new Float32Array(this.capacity * 16);
    
    // Dirty Flags: 1 = Needs Update
    transformDirty = new Uint8Array(this.capacity);

    // --- Mesh & Rendering ---
    meshType = new Int32Array(this.capacity); 
    textureIndex = new Float32Array(this.capacity);
    colorR = new Float32Array(this.capacity);
    colorG = new Float32Array(this.capacity);
    colorB = new Float32Array(this.capacity);

    // --- Physics ---
    mass = new Float32Array(this.capacity);
    useGravity = new Uint8Array(this.capacity);

    // --- Metadata ---
    isActive = new Uint8Array(this.capacity);
    generation = new Uint32Array(this.capacity);
    
    names: string[] = new Array(this.capacity);
    ids: string[] = new Array(this.capacity);
    
    constructor() {
        this.scaleX.fill(1);
        this.scaleY.fill(1);
        this.scaleZ.fill(1);
        
        // Initialize world matrices to Identity
        for (let i = 0; i < this.capacity; i++) {
            const base = i * 16;
            this.worldMatrix[base] = 1;
            this.worldMatrix[base + 5] = 1;
            this.worldMatrix[base + 10] = 1;
            this.worldMatrix[base + 15] = 1;
        }
    }

    // --- High-Performance Setters ---
    // Automatically marks dirty for SceneGraph
    
    setPosition(index: number, x: number, y: number, z: number) {
        this.posX[index] = x; this.posY[index] = y; this.posZ[index] = z;
        this.transformDirty[index] = 1;
    }

    setRotation(index: number, x: number, y: number, z: number) {
        this.rotX[index] = x; this.rotY[index] = y; this.rotZ[index] = z;
        this.transformDirty[index] = 1;
    }

    setScale(index: number, x: number, y: number, z: number) {
        this.scaleX[index] = x; this.scaleY[index] = y; this.scaleZ[index] = z;
        this.transformDirty[index] = 1;
    }

    // Called by SceneGraph to update the cached World Matrix
    // Combines Local (from components) * Parent (passed in)
    updateWorldMatrix(index: number, parentMatrix: Float32Array | null) {
        const base = index * 16;
        const out = this.worldMatrix.subarray(base, base + 16);
        
        // 1. Compose Local Matrix directly into output buffer (avoid allocation)
        Mat4Utils.compose(
            this.posX[index], this.posY[index], this.posZ[index],
            this.rotX[index], this.rotY[index], this.rotZ[index],
            this.scaleX[index], this.scaleY[index], this.scaleZ[index],
            out
        );

        // 2. Multiply by Parent if exists
        if (parentMatrix) {
            Mat4Utils.multiply(parentMatrix, out, out);
        }
        
        this.transformDirty[index] = 0; // Clean
    }

    resize(newCapacity: number) {
        console.log(`[ECS] Resizing to ${newCapacity}`);
        
        const resizeFloat = (old: Float32Array) => { const n = new Float32Array(newCapacity); n.set(old); return n; };
        const resizeInt32 = (old: Int32Array) => { const n = new Int32Array(newCapacity); n.set(old); return n; };
        const resizeUint8 = (old: Uint8Array) => { const n = new Uint8Array(newCapacity); n.set(old); return n; };
        const resizeUint32 = (old: Uint32Array) => { const n = new Uint32Array(newCapacity); n.set(old); return n; };

        this.posX = resizeFloat(this.posX); this.posY = resizeFloat(this.posY); this.posZ = resizeFloat(this.posZ);
        this.rotX = resizeFloat(this.rotX); this.rotY = resizeFloat(this.rotY); this.rotZ = resizeFloat(this.rotZ);
        this.scaleX = resizeFloat(this.scaleX); this.scaleY = resizeFloat(this.scaleY); this.scaleZ = resizeFloat(this.scaleZ);
        this.rotationOrder = resizeUint8(this.rotationOrder);
        
        // Resize World Matrix Cache (stride 16)
        const newWM = new Float32Array(newCapacity * 16);
        newWM.set(this.worldMatrix);
        this.worldMatrix = newWM;
        
        this.transformDirty = resizeUint8(this.transformDirty);

        this.meshType = resizeInt32(this.meshType);
        this.textureIndex = resizeFloat(this.textureIndex);
        this.colorR = resizeFloat(this.colorR);
        this.colorG = resizeFloat(this.colorG);
        this.colorB = resizeFloat(this.colorB);
        
        this.mass = resizeFloat(this.mass);
        this.useGravity = resizeUint8(this.useGravity);
        
        this.isActive = resizeUint8(this.isActive);
        this.generation = resizeUint32(this.generation);
        
        const newNames = new Array(newCapacity);
        const newIds = new Array(newCapacity);
        for(let i=0; i<this.capacity; i++) {
            newNames[i] = this.names[i];
            newIds[i] = this.ids[i];
        }
        this.names = newNames;
        this.ids = newIds;

        this.capacity = newCapacity;
    }

    snapshot() {
        return {
            posX: new Float32Array(this.posX), posY: new Float32Array(this.posY), posZ: new Float32Array(this.posZ),
            rotX: new Float32Array(this.rotX), rotY: new Float32Array(this.rotY), rotZ: new Float32Array(this.rotZ),
            scaleX: new Float32Array(this.scaleX), scaleY: new Float32Array(this.scaleY), scaleZ: new Float32Array(this.scaleZ),
            rotationOrder: new Uint8Array(this.rotationOrder),
            // World Matrix is cache, no need to save, will recompute on load
            // Dirty flags can be reset to 1 on load
            meshType: new Int32Array(this.meshType),
            textureIndex: new Float32Array(this.textureIndex),
            colorR: new Float32Array(this.colorR), colorG: new Float32Array(this.colorG), colorB: new Float32Array(this.colorB),
            mass: new Float32Array(this.mass),
            useGravity: new Uint8Array(this.useGravity),
            isActive: new Uint8Array(this.isActive),
            generation: new Uint32Array(this.generation),
            names: [...this.names],
            ids: [...this.ids]
        };
    }
    
    restore(snap: any) {
        if (snap.posX.length > this.capacity) this.resize(snap.posX.length);
        
        this.posX.set(snap.posX); this.posY.set(snap.posY); this.posZ.set(snap.posZ);
        this.rotX.set(snap.rotX); this.rotY.set(snap.rotY); this.rotZ.set(snap.rotZ);
        this.scaleX.set(snap.scaleX); this.scaleY.set(snap.scaleY); this.scaleZ.set(snap.scaleZ);
        
        if (snap.rotationOrder) this.rotationOrder.set(snap.rotationOrder);

        this.meshType.set(snap.meshType);
        this.textureIndex.set(snap.textureIndex);
        this.colorR.set(snap.colorR); this.colorG.set(snap.colorG); this.colorB.set(snap.colorB);
        
        this.mass.set(snap.mass);
        this.useGravity.set(snap.useGravity);
        this.isActive.set(snap.isActive);
        this.generation.set(snap.generation);
        
        this.names = [...snap.names];
        this.ids = [...snap.ids];
        
        // Mark all dirty on load to ensure world matrices are rebuilt
        this.transformDirty.fill(1);
    }
}