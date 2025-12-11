
import { Entity, ComponentType } from '../types';
import { Mat4, Mat4Utils } from './math';

export class SceneNode {
  entityId: string;
  parentId: string | null = null;
  childrenIds: string[] = [];
  
  // Cache matrices - Memory is allocated once
  localMatrix: Mat4 = Mat4Utils.create();
  worldMatrix: Mat4 = Mat4Utils.create();
  
  isDirty: boolean = true;

  constructor(entityId: string) {
    this.entityId = entityId;
  }
}

export class SceneGraph {
  // Map entity ID to Node
  private nodes: Map<string, SceneNode> = new Map();
  private rootIds: Set<string> = new Set();

  constructor() {}

  registerEntity(entityId: string) {
    if (!this.nodes.has(entityId)) {
      const node = new SceneNode(entityId);
      this.nodes.set(entityId, node);
      this.rootIds.add(entityId);
    }
  }

  attach(childId: string, parentId: string | null) {
    const childNode = this.nodes.get(childId);
    if (!childNode) return;

    if (childNode.parentId) {
      const oldParent = this.nodes.get(childNode.parentId);
      if (oldParent) {
        oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== childId);
      }
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
    
    // Hierarchy change requires update
    this.setDirty(childId);
  }

  setDirty(entityId: string) {
    const node = this.nodes.get(entityId);
    if (node && !node.isDirty) {
      node.isDirty = true;
      // Propagate dirty to children
      for(const childId of node.childrenIds) {
          this.setDirty(childId);
      }
    }
  }

  getRootIds(): string[] {
    return Array.from(this.rootIds);
  }

  getChildren(entityId: string): string[] {
    return this.nodes.get(entityId)?.childrenIds || [];
  }

  getWorldMatrix(entityId: string): Mat4 | null {
    return this.nodes.get(entityId)?.worldMatrix || null;
  }

  getWorldPosition(entityId: string): { x: number, y: number, z: number } {
    const mat = this.getWorldMatrix(entityId);
    if (!mat) return { x: 0, y: 0, z: 0 };
    return Mat4Utils.getTranslation(mat);
  }

  /**
   * Recalculates world matrices for the graph.
   * Only updates nodes marked as dirty.
   * @param getTransformData callback to retrieve raw transform data (x,y,z, rx,ry,rz, sx,sy,sz)
   */
  update(getTransformData: (id: string) => Float32Array | null) {
    this.rootIds.forEach(rootId => {
      this.updateNodeRecursive(rootId, getTransformData, null, false);
    });
  }

  private updateNodeRecursive(
      nodeId: string, 
      getTransformData: (id: string) => Float32Array | null, 
      parentWorldMatrix: Mat4 | null,
      parentDirty: boolean
  ) {
    const node = this.nodes.get(nodeId);
    if (!node) return;

    const shouldUpdate = node.isDirty || parentDirty;

    if (shouldUpdate) {
        // 1. Calculate Local Matrix
        const data = getTransformData(nodeId);
        if (data) {
            // data is [px, py, pz, rx, ry, rz, sx, sy, sz]
            Mat4Utils.compose(
                data[0], data[1], data[2], 
                data[3], data[4], data[5], 
                data[6], data[7], data[8], 
                node.localMatrix
            );
        }

        // 2. Calculate World Matrix
        if (parentWorldMatrix) {
             Mat4Utils.multiply(parentWorldMatrix, node.localMatrix, node.worldMatrix);
        } else {
             Mat4Utils.copy(node.worldMatrix, node.localMatrix);
        }
        
        node.isDirty = false;
    }

    // 3. Process Children (Propagate dirty state if we updated)
    const children = node.childrenIds;
    for (let i = 0; i < children.length; i++) {
        this.updateNodeRecursive(children[i], getTransformData, node.worldMatrix, shouldUpdate);
    }
  }
}
