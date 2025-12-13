// services/SceneGraph.ts

import { Mat4Utils } from './math';
import type { SoAEntitySystem } from './ecs/EntitySystem'; // Type-only import is safe

export class SceneNode {
  entityId: string;
  parentId: string | null = null;
  childrenIds: string[] = [];
  
  constructor(entityId: string) {
    this.entityId = entityId;
  }
}

export class SceneGraph {
  private nodes: Map<string, SceneNode> = new Map();
  private rootIds: Set<string> = new Set();
  
  // Dependency Injection: No longer imports global engineInstance
  private ecs: SoAEntitySystem | null = null;

  registerEntity(entityId: string) {
    if (!this.nodes.has(entityId)) {
      this.nodes.set(entityId, new SceneNode(entityId));
      this.rootIds.add(entityId);
    }
  }

  // Call this immediately after creating SceneGraph
  setContext(ecs: SoAEntitySystem) {
      this.ecs = ecs;
  }

  attach(childId: string, parentId: string | null) {
    const childNode = this.nodes.get(childId);
    if (!childNode) return;

    if (childNode.parentId) {
      const oldParent = this.nodes.get(childNode.parentId);
      if (oldParent) oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== childId);
    } else {
      this.rootIds.delete(childId);
    }

    if (parentId) {
      const newParent = this.nodes.get(parentId);
      if (newParent) {
        childNode.parentId = parentId;
        newParent.childrenIds.push(childId);
        this.rootIds.delete(childId);
      } else {
        childNode.parentId = null;
        this.rootIds.add(childId);
      }
    } else {
      childNode.parentId = null;
      this.rootIds.add(childId);
    }
    
    this.setDirty(childId);
  }

  setDirty(entityId: string) {
    if (!this.ecs) return;

    // 1. Mark self dirty in ECS
    const idx = this.ecs.idToIndex.get(entityId);
    if (idx !== undefined) {
        this.ecs.store.transformDirty[idx] = 1;
    }

    // 2. Propagate to children
    const node = this.nodes.get(entityId);
    if (node) {
        for (const childId of node.childrenIds) {
            this.setDirty(childId);
        }
    }
  }

  getRootIds() { return Array.from(this.rootIds); }
  getChildren(entityId: string) { return this.nodes.get(entityId)?.childrenIds || []; }

  getWorldMatrix(entityId: string): Float32Array | null {
    if (!this.ecs) return null;

    const idx = this.ecs.idToIndex.get(entityId);
    if (idx === undefined) return null;
    
    const store = this.ecs.store;
    
    // Check dirty state directly from store
    if (store.transformDirty[idx]) {
        const node = this.nodes.get(entityId);
        const parentMat = (node && node.parentId) ? this.getWorldMatrix(node.parentId) : null;
        store.updateWorldMatrix(idx, parentMat);
    }

    const start = idx * 16;
    return store.worldMatrix.subarray(start, start + 16);
  }

  getWorldPosition(entityId: string) {
      const m = this.getWorldMatrix(entityId);
      if(!m) return {x:0,y:0,z:0};
      return { x: m[12], y: m[13], z: m[14] };
  }

  update() {
    if (!this.ecs) return;
    const store = this.ecs.store;
    const idToIndex = this.ecs.idToIndex; // Store ref to map
    
    const processNode = (id: string, parentMatrix: Float32Array | null, parentDirty: boolean) => {
        const idx = idToIndex.get(id);
        if (idx === undefined) return;

        const isDirty = store.transformDirty[idx] === 1 || parentDirty;

        if (isDirty) {
            store.updateWorldMatrix(idx, parentMatrix);
        }

        const myWorldMatrix = store.worldMatrix.subarray(idx*16, idx*16+16);
        
        const node = this.nodes.get(id);
        if (node) {
            for (const childId of node.childrenIds) {
                processNode(childId, myWorldMatrix, isDirty);
            }
        }
    };

    this.rootIds.forEach(rootId => processNode(rootId, null, false));
  }
}