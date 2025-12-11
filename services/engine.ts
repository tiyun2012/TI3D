
/**
 * High Performance WebGL Engine Core
 * Features: Data-Oriented ECS (SoA), Geometry Instancing, Dirty Flags, Texture Arrays, Save/Load, Undo/Redo, Debug Graph
 */

import { Entity, ComponentType, GraphNode, GraphConnection, PerformanceMetrics } from '../types';
import { SceneGraph } from './SceneGraph';
import { Mat4, Mat4Utils, RayUtils, Vec3Utils, TMP_MAT4_1, TMP_MAT4_2 } from './math';
import { NodeRegistry, NodeDef } from './NodeRegistry';
import { DebugRenderer } from './renderers/DebugRenderer';
import { WebGLRenderer } from './renderers/WebGLRenderer';
import { SoAEntitySystem } from './ecs/EntitySystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { HistorySystem } from './systems/HistorySystem';

interface ExecutionStep {
    id: string;
    def: NodeDef;
    inputs: Array<{ nodeId: string, pinId: string } | null>;
    data: any;
}

export class Ti3DEngine {
  ecs: SoAEntitySystem;
  sceneGraph: SceneGraph;
  renderer: WebGLRenderer;
  debugRenderer: DebugRenderer; // New Debug Renderer
  physics: PhysicsSystem;
  history: HistorySystem;
  
  isPlaying: boolean = false;
  selectedIds: Set<string> = new Set();
  private listeners: (() => void)[] = [];

  // Logic Graph State
  private executionList: ExecutionStep[] = [];
  private nodeResults = new Map<string, any>(); 

  private tempTransformData = new Float32Array(9);
  
  // Performance
  metrics: PerformanceMetrics = { fps: 60, frameTime: 0, drawCalls: 0, triangleCount: 0, entityCount: 0 };
  private lastFrameTime = 0;
  private frameCount = 0;
  private lastFpsTime = 0;

  constructor() {
    this.ecs = new SoAEntitySystem();
    this.sceneGraph = new SceneGraph();
    this.renderer = new WebGLRenderer();
    this.debugRenderer = new DebugRenderer();
    this.physics = new PhysicsSystem();
    this.history = new HistorySystem();
    this.initDemoScene();
    
    // Initial Snapshot
    this.pushUndoState();
  }
  
  // Undo/Redo Public API
  pushUndoState() {
      this.history.pushState(this.ecs);
  }
  
  undo() {
      if(this.history.undo(this.ecs, this.sceneGraph)) this.notifyUI();
  }
  
  redo() {
      if(this.history.redo(this.ecs, this.sceneGraph)) this.notifyUI();
  }

  // Save/Load Public API
  saveScene(): string {
      return this.ecs.serialize();
  }
  
  loadScene(json: string) {
      this.ecs.deserialize(json, this.sceneGraph);
      this.notifyUI();
  }

  initGL(canvas: HTMLCanvasElement) { 
      this.renderer.init(canvas); 
      this.debugRenderer.init(this.renderer.gl!);
  }
  resize(width: number, height: number) { this.renderer.resize(width, height); }

  setSelected(ids: string[]) {
      this.selectedIds = new Set(ids);
      this.notifyUI();
  }
  
  toggleGrid() {
      this.renderer.showGrid = !this.renderer.showGrid;
      this.notifyUI();
  }

  // Logic Graph "Compiler" - Topological Sort
  compileGraph(nodes: GraphNode[], connections: GraphConnection[]) {
      this.executionList = [];
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const visited = new Set<string>();

      // Recursive Visit (Post-order traversal)
      const visit = (nodeId: string) => {
          if (visited.has(nodeId)) return;
          
          const node = nodeMap.get(nodeId);
          if (!node) return;

          // 1. Visit Inputs first
          const inputConns = connections.filter(c => c.toNode === nodeId);
          for(const c of inputConns) {
              visit(c.fromNode);
          }

          visited.add(nodeId);

          // 2. Add to Execution List
          const def = NodeRegistry[node.type];
          if (def) {
              const inputs = def.inputs.map(inputDef => {
                  const conn = connections.find(c => c.toNode === nodeId && c.toPin === inputDef.id);
                  return conn ? { nodeId: conn.fromNode, pinId: conn.fromPin } : null;
              });

              this.executionList.push({
                  id: nodeId,
                  def,
                  inputs,
                  data: node.data
              });
          }
      };

      // Compile: Start from every node to ensure disconnected graphs run
      for (const node of nodes) {
          visit(node.id);
      }
  }

  viewProjectionMatrix = Mat4Utils.create();
  private canvasWidth = 1;
  private canvasHeight = 1;

  updateCamera(vpMatrix: Mat4, w: number, h: number) {
      Mat4Utils.copy(this.viewProjectionMatrix, vpMatrix);
      this.canvasWidth = w;
      this.canvasHeight = h;
  }

  selectEntityAt(x: number, y: number, width: number, height: number): string | null {
      if (!Mat4Utils.invert(this.viewProjectionMatrix, TMP_MAT4_1)) return null;
      const ray = RayUtils.create();
      RayUtils.fromScreen(x, y, width, height, TMP_MAT4_1, ray);

      let closestId: string | null = null;
      let minDist = Infinity;
      const localRay = RayUtils.create();
      const invWorld = TMP_MAT4_2;

      for (const [id, index] of this.ecs.idToIndex) {
          if (!this.ecs.store.isActive[index]) continue;
          const meshType = this.ecs.store.meshType[index];
          if (meshType === 0) continue; 

          const worldMatrix = this.sceneGraph.getWorldMatrix(id);
          if (!worldMatrix) continue;

          if (!Mat4Utils.invert(worldMatrix, invWorld)) continue;

          Vec3Utils.transformMat4(ray.origin, invWorld, localRay.origin);
          Vec3Utils.transformMat4Normal(ray.direction, invWorld, localRay.direction);

          let t: number | null = null;
          if (meshType === 2) { 
              t = RayUtils.intersectSphere(localRay, {x:0, y:0, z:0}, 0.5);
          } else {
              t = RayUtils.intersectBox(localRay, {x:-0.5, y:-0.5, z:-0.5}, {x:0.5, y:0.5, z:0.5});
          }

          if (t !== null && t > 0) {
              if (t < minDist) {
                  minDist = t;
                  closestId = id;
              }
          }
      }
      return closestId;
  }

  selectEntitiesInRect(x: number, y: number, w: number, h: number): string[] {
      const results: string[] = [];
      const minX = Math.min(x, x + w);
      const maxX = Math.max(x, x + w);
      const minY = Math.min(y, y + h);
      const maxY = Math.max(y, y + h);

      for (const [id, index] of this.ecs.idToIndex) {
          if (!this.ecs.store.isActive[index]) continue;
          if (this.ecs.store.meshType[index] === 0) continue;
          const worldPos = this.sceneGraph.getWorldPosition(id);
          const screenPos = Mat4Utils.transformPoint(worldPos, this.viewProjectionMatrix, this.canvasWidth, this.canvasHeight);
          
          if (screenPos.w <= 0) continue;
          if (screenPos.x >= minX && screenPos.x <= maxX &&
              screenPos.y >= minY && screenPos.y <= maxY) {
              results.push(id);
          }
      }
      return results;
  }

  createEntity(name: string): Entity {
      const id = this.ecs.createEntity(name);
      this.sceneGraph.registerEntity(id);
      this.pushUndoState(); // Capture creation
      this.notifyUI();
      return this.ecs.createProxy(id, this.sceneGraph)!;
  }

  private initDemoScene() {
      const p = this.createEntity('Player Cube');
      p.components[ComponentType.MESH].meshType = 'Cube';
      p.components[ComponentType.MESH].color = '#3b82f6';
      p.components[ComponentType.MESH].textureIndex = 1; // Grid

      const s = this.createEntity('Orbiting Satellite');
      s.components[ComponentType.MESH].meshType = 'Sphere';
      s.components[ComponentType.MESH].color = '#ef4444';
      s.components[ComponentType.MESH].textureIndex = 2; // Noise
      s.components[ComponentType.TRANSFORM].position = {x: 3, y: 0, z: 0};
      s.components[ComponentType.TRANSFORM].scale = {x: 0.5, y: 0.5, z: 0.5};
      this.sceneGraph.attach(s.id, p.id);

      const f = this.createEntity('Floor');
      f.components[ComponentType.MESH].meshType = 'Plane';
      f.components[ComponentType.MESH].color = '#ffffff';
      f.components[ComponentType.MESH].textureIndex = 3; // Bricks
      f.components[ComponentType.TRANSFORM].position = {x: 0, y: -2, z: 0};
      f.components[ComponentType.TRANSFORM].scale = {x: 10, y: 0.1, z: 10};

      const l = this.createEntity('Directional Light');
      l.components[ComponentType.LIGHT]!.intensity = 1.0;
  }

  syncTransforms() {
      this.sceneGraph.update((id) => {
          const idx = this.ecs.getEntityIndex(id);
          if (idx === undefined || !this.ecs.store.isActive[idx]) return null;
          const s = this.ecs.store;
          const t = this.tempTransformData;
          t[0] = s.posX[idx]; t[1] = s.posY[idx]; t[2] = s.posZ[idx];
          t[3] = s.rotX[idx]; t[4] = s.rotY[idx]; t[5] = s.rotZ[idx];
          t[6] = s.scaleX[idx]; t[7] = s.scaleY[idx]; t[8] = s.scaleZ[idx];
          return t;
      });
  }

  tick(deltaTime: number) {
      const now = performance.now();
      
      // FPS Calculation
      this.frameCount++;
      if (now - this.lastFpsTime >= 1000) {
          this.metrics.fps = this.frameCount;
          this.frameCount = 0;
          this.lastFpsTime = now;
      }

      if (this.isPlaying) {
          // simple animation
          const sId = Array.from(this.ecs.idToIndex.entries()).find(x => this.ecs.store.names[x[1]] === 'Orbiting Satellite')?.[0];
          if (sId) {
              const idx = this.ecs.idToIndex.get(sId)!;
              this.ecs.store.rotY[idx] += deltaTime * 2.0;
              this.sceneGraph.setDirty(sId);
          }
          
          this.physics.update(deltaTime, this.ecs.store, this.ecs.idToIndex, this.sceneGraph);
      }

      this.syncTransforms();
      
      // --- Logic Graph Execution (Compiled) ---
      this.debugRenderer.begin();
      this.nodeResults.clear();
      
      for(const step of this.executionList) {
          const inputs = step.inputs.map(link => {
              if (!link) return null;
              const res = this.nodeResults.get(link.nodeId);
              // If result is object and has key matching pinId, use that
              if (res && typeof res === 'object' && link.pinId in res && !ArrayBuffer.isView(res)) {
                  return res[link.pinId];
              }
              // Fallback for simple single-output nodes
              return res;
          });
          
          try {
             const result = step.def.execute(inputs, step.data, this);
             this.nodeResults.set(step.id, result);
          } catch(e) {
              // Suppress execution errors for smoother editing
          }
      }

      this.renderer.render(
          this.ecs.store, 
          this.ecs.idToIndex, 
          this.sceneGraph, 
          this.viewProjectionMatrix, 
          this.selectedIds
      );
      
      // Render Debug Layer
      this.debugRenderer.render(this.viewProjectionMatrix);

      // Metrics Update
      const end = performance.now();
      this.metrics.frameTime = end - now;
      this.metrics.drawCalls = this.renderer.drawCalls;
      this.metrics.triangleCount = this.renderer.triangleCount;
      this.metrics.entityCount = this.ecs.idToIndex.size; // Active proxies might be less, but tracking map size
  }
  
  start() { this.isPlaying = true; this.notifyUI(); }
  pause() { this.isPlaying = false; this.notifyUI(); }
  stop() { this.isPlaying = false; this.notifyUI(); }
  
  subscribe(cb: () => void) { this.listeners.push(cb); return () => this.listeners = this.listeners.filter(c => c !== cb); }
  
  notifyUI() { 
      this.syncTransforms();
      this.listeners.forEach(cb => cb()); 
  }
}

export const engineInstance = new Ti3DEngine();
