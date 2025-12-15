
// services/SceneGraph.ts

import { Mat4Utils } from './math';
import type { SoAEntitySystem } from './ecs/EntitySystem';

export class SceneNode {
  entityId: string;
  parentId: string | null = null;
  childrenIds: string[] = [];
  constructor(entityId: string) { this.entityId = entityId; }
}

export class SceneGraph {
  private nodes: Map<string, SceneNode> = new Map();
  private rootIds: Set<string> = new Set();
  private ecs: SoAEntitySystem | null = null;

  registerEntity(entityId: string) {
    if (!this.nodes.has(entityId)) {
      this.nodes.set(entityId, new SceneNode(entityId));
      this.rootIds.add(entityId);
    }
  }

  setContext(ecs: SoAEntitySystem) { this.ecs = ecs; }

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
    const idx = this.ecs.idToIndex.get(entityId);
    if (idx !== undefined) this.ecs.store.transformDirty[idx] = 1;

    // Iterative dirty propagation (Stack)
    const stack = [entityId];
    while(stack.length > 0) {
        const currId = stack.pop()!;
        const node = this.nodes.get(currId);
        if (node) {
            for (const childId of node.childrenIds) {
                const cIdx = this.ecs.idToIndex.get(childId);
                if (cIdx !== undefined) this.ecs.store.transformDirty[cIdx] = 1;
                stack.push(childId);
            }
        }
    }
  }

  getRootIds() { return Array.from(this.rootIds); }
  getChildren(entityId: string) { return this.nodes.get(entityId)?.childrenIds || []; }
  getParentId(entityId: string) { return this.nodes.get(entityId)?.parentId || null; }

  getWorldMatrix(entityId: string): Float32Array | null {
    if (!this.ecs) return null;
    const idx = this.ecs.idToIndex.get(entityId);
    if (idx === undefined) return null;
    const store = this.ecs.store;

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

  // OPTIMIZATION: Iterative Update
  update() {
    if (!this.ecs) return;
    const store = this.ecs.store;
    const idToIndex = this.ecs.idToIndex;

    // Stack holds: [EntityID, ParentMatrix, ParentDirtyFlag]
    const stack: Array<{id: string, mat: Float32Array | null, pDirty: boolean}> = [];
    
    this.rootIds.forEach(id => stack.push({ id, mat: null, pDirty: false }));

    while(stack.length > 0) {
        const { id, mat, pDirty } = stack.pop()!;
        const idx = idToIndex.get(id);
        
        if (idx === undefined) continue;

        const isDirty = store.transformDirty[idx] === 1 || pDirty;
        if (isDirty) {
            store.updateWorldMatrix(idx, mat);
        }

        const myWorldMatrix = store.worldMatrix.subarray(idx*16, idx*16+16);
        const node = this.nodes.get(id);
        
        if (node) {
            for (let i = node.childrenIds.length - 1; i >= 0; i--) {
                stack.push({
                    id: node.childrenIds[i],
                    mat: myWorldMatrix,
                    pDirty: isDirty
                });
            }
        }
    }
  }
}