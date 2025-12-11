import { Entity, ComponentType } from '../types';
import { Mat4, Mat4Utils } from './math';

export class SceneNode {
  entityId: string;
  parentId: string | null = null;
  childrenIds: string[] = [];
  
  // Cache matrices - Memory is allocated once
  localMatrix: Mat4 = Mat4Utils.create();
  worldMatrix: Mat4 = Mat4Utils.create();
  
  constructor(entityId: string) {
    this.entityId = entityId;
  }
}

export class SceneGraph {
  // Map entity ID to Node
  private nodes: Map<string, SceneNode> = new Map();
  // Keep track of root nodes (nodes without parents) for iteration
  private rootIds: Set<string> = new Set();

  constructor() {}

  registerEntity(entityId: string) {
    if (!this.nodes.has(entityId)) {
      const node = new SceneNode(entityId);
      this.nodes.set(entityId, node);
      this.rootIds.add(entityId);
    }
  }

  /**
   * Parents childEntity to parentEntity.
   * If parentId is null, child becomes a root node.
   */
  attach(childId: string, parentId: string | null) {
    const childNode = this.nodes.get(childId);
    if (!childNode) return;

    // 1. Detach from old parent
    if (childNode.parentId) {
      const oldParent = this.nodes.get(childNode.parentId);
      if (oldParent) {
        oldParent.childrenIds = oldParent.childrenIds.filter(id => id !== childId);
      }
    } else {
      // Was a root node, remove from roots
      this.rootIds.delete(childId);
    }

    // 2. Attach to new parent
    if (parentId) {
      const newParent = this.nodes.get(parentId);
      if (newParent) {
        childNode.parentId = parentId;
        newParent.childrenIds.push(childId);
        // Ensure child is NOT in rootIds (it has a parent now)
        this.rootIds.delete(childId);
      } else {
        console.warn(`Parent ${parentId} not found, attaching ${childId} to root.`);
        childNode.parentId = null;
        this.rootIds.add(childId);
      }
    } else {
      // Set as root
      childNode.parentId = null;
      this.rootIds.add(childId);
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
   * Recalculates world matrices for the entire graph.
   * Should be called once per frame before rendering.
   */
  update(entities: Map<string, Entity>) {
    // Iterate over all roots and traverse down
    this.rootIds.forEach(rootId => {
      this.updateNodeRecursive(rootId, entities, null);
    });
  }

  private updateNodeRecursive(nodeId: string, entities: Map<string, Entity>, parentWorldMatrix: Mat4 | null) {
    const node = this.nodes.get(nodeId);
    // Use unsafe access for speed, assuming sync
    const entity = entities.get(nodeId);
    
    if (!node || !entity) return;

    // 1. Calculate Local Matrix from ECS Transform Component
    // Writes directly into node.localMatrix to avoid GC
    const transform = entity.components[ComponentType.TRANSFORM];
    if (transform) {
      Mat4Utils.compose(
        transform.position,
        transform.rotation,
        transform.scale,
        node.localMatrix
      );
    }

    // 2. Calculate World Matrix
    // Writes directly into node.worldMatrix
    if (parentWorldMatrix) {
      // World = ParentWorld * Local
      Mat4Utils.multiply(parentWorldMatrix, node.localMatrix, node.worldMatrix);
    } else {
      // No parent, World = Local
      Mat4Utils.copy(node.worldMatrix, node.localMatrix);
    }

    // 3. Process Children
    const children = node.childrenIds;
    for (let i = 0; i < children.length; i++) {
        this.updateNodeRecursive(children[i], entities, node.worldMatrix);
    }
  }
}