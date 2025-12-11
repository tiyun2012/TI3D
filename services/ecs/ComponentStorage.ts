
import { INITIAL_CAPACITY } from '../constants';

// Stores Component Data in flat arrays for cache locality
export class ComponentStorage {
    capacity = INITIAL_CAPACITY;

    // Transform
    posX = new Float32Array(this.capacity);
    posY = new Float32Array(this.capacity);
    posZ = new Float32Array(this.capacity);
    rotX = new Float32Array(this.capacity);
    rotY = new Float32Array(this.capacity);
    rotZ = new Float32Array(this.capacity);
    scaleX = new Float32Array(this.capacity);
    scaleY = new Float32Array(this.capacity);
    scaleZ = new Float32Array(this.capacity);

    // Mesh
    meshType = new Int32Array(this.capacity); // 0=None, 1=Cube, 2=Sphere, 3=Plane
    textureIndex = new Float32Array(this.capacity); // New: Texture ID
    colorR = new Float32Array(this.capacity);
    colorG = new Float32Array(this.capacity);
    colorB = new Float32Array(this.capacity);

    // Physics
    mass = new Float32Array(this.capacity);
    useGravity = new Uint8Array(this.capacity);

    // Metadata
    isActive = new Uint8Array(this.capacity);
    generation = new Uint32Array(this.capacity);
    
    // Auxiliary (Strings are not TypedArrays, handled separately in serialization)
    names: string[] = new Array(this.capacity);
    ids: string[] = new Array(this.capacity);
    
    constructor() {
        this.scaleX.fill(1);
        this.scaleY.fill(1);
        this.scaleZ.fill(1);
    }

    resize(newCapacity: number) {
        console.log(`[ECS] Resizing storage from ${this.capacity} to ${newCapacity}`);
        
        const resizeFloat = (old: Float32Array) => { const n = new Float32Array(newCapacity); n.set(old); return n; };
        const resizeInt32 = (old: Int32Array) => { const n = new Int32Array(newCapacity); n.set(old); return n; };
        const resizeUint8 = (old: Uint8Array) => { const n = new Uint8Array(newCapacity); n.set(old); return n; };
        const resizeUint32 = (old: Uint32Array) => { const n = new Uint32Array(newCapacity); n.set(old); return n; };

        this.posX = resizeFloat(this.posX);
        this.posY = resizeFloat(this.posY);
        this.posZ = resizeFloat(this.posZ);
        this.rotX = resizeFloat(this.rotX);
        this.rotY = resizeFloat(this.rotY);
        this.rotZ = resizeFloat(this.rotZ);
        this.scaleX = resizeFloat(this.scaleX);
        this.scaleY = resizeFloat(this.scaleY);
        this.scaleZ = resizeFloat(this.scaleZ);
        
        this.meshType = resizeInt32(this.meshType);
        this.textureIndex = resizeFloat(this.textureIndex);
        this.colorR = resizeFloat(this.colorR);
        this.colorG = resizeFloat(this.colorG);
        this.colorB = resizeFloat(this.colorB);
        
        this.mass = resizeFloat(this.mass);
        this.useGravity = resizeUint8(this.useGravity);
        
        this.isActive = resizeUint8(this.isActive);
        this.generation = resizeUint32(this.generation);
        
        // Resize Arrays
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

    // Create a deep copy of the current state
    snapshot() {
        // Simplified snapshot for current capacity to avoid massive JSONs
        // In production, we'd only snapshot active entities
        return {
            posX: new Float32Array(this.posX),
            posY: new Float32Array(this.posY),
            posZ: new Float32Array(this.posZ),
            rotX: new Float32Array(this.rotX),
            rotY: new Float32Array(this.rotY),
            rotZ: new Float32Array(this.rotZ),
            scaleX: new Float32Array(this.scaleX),
            scaleY: new Float32Array(this.scaleY),
            scaleZ: new Float32Array(this.scaleZ),
            
            meshType: new Int32Array(this.meshType),
            textureIndex: new Float32Array(this.textureIndex),
            colorR: new Float32Array(this.colorR),
            colorG: new Float32Array(this.colorG),
            colorB: new Float32Array(this.colorB),
            
            mass: new Float32Array(this.mass),
            useGravity: new Uint8Array(this.useGravity),
            isActive: new Uint8Array(this.isActive),
            generation: new Uint32Array(this.generation),
            
            names: [...this.names],
            ids: [...this.ids]
        };
    }
    
    restore(snap: any) {
        if (snap.posX.length > this.capacity) {
            this.resize(snap.posX.length);
        }
        
        this.posX.set(snap.posX);
        this.posY.set(snap.posY);
        this.posZ.set(snap.posZ);
        this.rotX.set(snap.rotX);
        this.rotY.set(snap.rotY);
        this.rotZ.set(snap.rotZ);
        this.scaleX.set(snap.scaleX);
        this.scaleY.set(snap.scaleY);
        this.scaleZ.set(snap.scaleZ);
        
        this.meshType.set(snap.meshType);
        this.textureIndex.set(snap.textureIndex);
        this.colorR.set(snap.colorR);
        this.colorG.set(snap.colorG);
        this.colorB.set(snap.colorB);
        
        this.mass.set(snap.mass);
        this.useGravity.set(snap.useGravity);
        this.isActive.set(snap.isActive);
        this.generation.set(snap.generation);
        
        this.names = [...snap.names];
        this.ids = [...snap.ids];
    }
}
