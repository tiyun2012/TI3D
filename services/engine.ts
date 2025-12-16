
// services/engine.ts

import { Entity, ComponentType, GraphNode, GraphConnection, PerformanceMetrics } from '../types';
import { SceneGraph } from './SceneGraph';
import { Mat4, Mat4Utils, RayUtils, Vec3Utils, TMP_MAT4_1, TMP_MAT4_2 } from './math';
import { NodeRegistry, NodeDef } from './NodeRegistry';
import { DebugRenderer } from './renderers/DebugRenderer';
import { WebGLRenderer } from './renderers/WebGLRenderer';
import { SoAEntitySystem } from './ecs/EntitySystem';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { HistorySystem } from './systems/HistorySystem';
import { compileShader } from './ShaderCompiler';
import { assetManager } from './AssetManager';
import { MESH_TYPES } from './constants';

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
  debugRenderer: DebugRenderer; 
  physics: PhysicsSystem;
  history: HistorySystem;
  
  isPlaying: boolean = false;
  selectedIds: Set<string> = new Set();
  
  // OPTIMIZATION: Map string IDs to Dense Indices for rendering
  selectedIndices: Set<number> = new Set();

  private listeners: (() => void)[] = [];

  // Logic Graph State
  private executionList: ExecutionStep[] = [];
  private nodeResults = new Map<string, any>(); 
  
  // Shader Graph State
  currentShaderSource: string = '';

  // Performance
  metrics: PerformanceMetrics = { fps: 60, frameTime: 0, drawCalls: 0, triangleCount: 0, entityCount: 0 };
  private lastFrameTime = 0;
  private frameCount = 0;
  private lastFpsTime = 0;

  constructor() {
    this.ecs = new SoAEntitySystem();
    this.sceneGraph = new SceneGraph();
    this.sceneGraph.setContext(this.ecs); 
    
    this.renderer = new WebGLRenderer();
    this.debugRenderer = new DebugRenderer();
    this.physics = new PhysicsSystem();
    this.history = new HistorySystem();
    
    this.initDemoScene();
    this.pushUndoState();
  }
  
  pushUndoState() { this.history.pushState(this.ecs); }
  undo() { if(this.history.undo(this.ecs, this.sceneGraph)) this.notifyUI(); }
  redo() { if(this.history.redo(this.ecs, this.sceneGraph)) this.notifyUI(); }

  saveScene(): string { return this.ecs.serialize(); }
  loadScene(json: string) { this.ecs.deserialize(json, this.sceneGraph); this.notifyUI(); }

  initGL(canvas: HTMLCanvasElement) { 
      this.renderer.init(canvas); 
      if (this.renderer.gl) this.debugRenderer.init(this.renderer.gl);
      
      // Register dynamic assets from AssetManager into Renderer
      assetManager.getAllAssets().forEach(asset => {
          if (asset.type === 'MESH') {
              const id = assetManager.getMeshID(asset.id);
              this.renderer.registerMesh(id, asset.geometry);
          }
          // Restore material shaders if possible (needs asset data parsing on load)
          if (asset.type === 'MATERIAL') {
              // Re-compile shader for existing material assets
              const source = compileShader(asset.data.nodes, asset.data.connections);
              const matIntId = assetManager.getMaterialID(asset.id);
              if (matIntId && source) {
                  this.renderer.updateMaterial(matIntId, source);
              }
          }
      });
  }
  resize(width: number, height: number) { this.renderer.resize(width, height); }

  setSelected(ids: string[]) {
      // Optimization: Avoid update if selection hasn't changed
      if (ids.length === this.selectedIds.size) {
          let same = true;
          for (const id of ids) if (!this.selectedIds.has(id)) { same = false; break; }
          if (same) return;
      }

      this.selectedIds = new Set(ids);
      // OPTIMIZATION: Pre-calculate indices for the render loop
      this.selectedIndices.clear();
      ids.forEach(id => {
          const idx = this.ecs.idToIndex.get(id);
          if (idx !== undefined) this.selectedIndices.add(idx);
      });
      this.notifyUI();
  }
  
  toggleGrid() {
      this.renderer.showGrid = !this.renderer.showGrid;
      this.notifyUI();
  }

  // --- Material Management ---
  
  applyMaterialToSelected(materialAssetId: string) {
      if (this.selectedIds.size === 0) return;
      
      const matId = assetManager.getMaterialID(materialAssetId);
      if (!matId) return;

      this.pushUndoState();
      
      this.selectedIds.forEach(entityId => {
          const idx = this.ecs.idToIndex.get(entityId);
          if (idx !== undefined && this.ecs.store.isActive[idx]) {
              // Set Material Index in ECS
              this.ecs.store.materialIndex[idx] = matId;
          }
      });
      
      console.log(`[Engine] Applied Material ID ${matId} to ${this.selectedIds.size} entities.`);
      this.notifyUI();
  }

  compileGraph(nodes: GraphNode[], connections: GraphConnection[], materialId?: string) {
      // 1. Compile Logic (CPU)
      this.executionList = [];
      const nodeMap = new Map(nodes.map(n => [n.id, n]));
      const visited = new Set<string>();

      const visit = (nodeId: string) => {
          if (visited.has(nodeId)) return;
          const node = nodeMap.get(nodeId);
          if (!node) return;

          const inputConns = connections.filter(c => c.toNode === nodeId);
          for(const c of inputConns) visit(c.fromNode);

          visited.add(nodeId);

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

      for (const node of nodes) visit(node.id);
      
      // 2. Compile Shader (GPU)
      const shader = compileShader(nodes, connections);
      
      // Update Preview State
      if (shader !== this.currentShaderSource) {
          this.currentShaderSource = shader;
          this.notifyUI();
      }

      // 3. Update Renderer Material
      if (materialId) {
          const matIntId = assetManager.getMaterialID(materialId);
          if (matIntId) {
              this.renderer.updateMaterial(matIntId, shader);
          }
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
          // Rough approximation for selection
          if (meshType === MESH_TYPES['Sphere']) t = RayUtils.intersectSphere(localRay, {x:0, y:0, z:0}, 0.5);
          else t = RayUtils.intersectBox(localRay, {x:-0.5, y:-0.5, z:-0.5}, {x:0.5, y:0.5, z:0.5});

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
      const minX = Math.min(x, x + w), maxX = Math.max(x, x + w);
      const minY = Math.min(y, y + h), maxY = Math.max(y, y + h);

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
      this.pushUndoState();
      this.notifyUI();
      return this.ecs.createProxy(id, this.sceneGraph)!;
  }
  
  createEntityFromAsset(assetId: string, position?: {x:number,y:number,z:number}) {
      const asset = assetManager.getAsset(assetId);
      if (!asset) return;
      
      const meshId = assetManager.getMeshID(assetId);
      const e = this.createEntity(asset.name);
      e.components[ComponentType.MESH].meshType = 'Custom'; // Placeholder string, actually sets int
      
      // Manually set integer mesh type bypassing string lookup
      const idx = this.ecs.idToIndex.get(e.id);
      if (idx !== undefined) {
          this.ecs.store.meshType[idx] = meshId;
          this.ecs.store.textureIndex[idx] = 1; // Default Grid texture
          if(position) {
              this.ecs.store.setPosition(idx, position.x, position.y, position.z);
          }
      }
      this.notifyUI();
  }

  private initDemoScene() {
      const p = this.createEntity('Player Cube');
      p.components[ComponentType.MESH].meshType = 'Cube';
      p.components[ComponentType.MESH].color = '#3b82f6';
      p.components[ComponentType.MESH].textureIndex = 1;

      const s = this.createEntity('Orbiting Satellite');
      s.components[ComponentType.MESH].meshType = 'Sphere';
      s.components[ComponentType.MESH].color = '#ef4444';
      s.components[ComponentType.MESH].textureIndex = 2;
      s.components[ComponentType.TRANSFORM].position = {x: 3, y: 0, z: 0};
      s.components[ComponentType.TRANSFORM].scale = {x: 0.5, y: 0.5, z: 0.5};
      this.sceneGraph.attach(s.id, p.id);

      const f = this.createEntity('Floor');
      f.components[ComponentType.MESH].meshType = 'Plane';
      f.components[ComponentType.MESH].color = '#ffffff';
      f.components[ComponentType.MESH].textureIndex = 3;
      f.components[ComponentType.TRANSFORM].position = {x: 0, y: -2, z: 0};
      f.components[ComponentType.TRANSFORM].scale = {x: 10, y: 0.1, z: 10};

      const l = this.createEntity('Directional Light');
      l.components[ComponentType.LIGHT]!.intensity = 1.0;
  }

  syncTransforms() {
      this.sceneGraph.update();
  }

  tick(deltaTime: number) {
      const now = performance.now();
      
      this.frameCount++;
      if (now - this.lastFpsTime >= 1000) {
          this.metrics.fps = this.frameCount;
          this.frameCount = 0;
          this.lastFpsTime = now;
      }

      // 1. Physics
      if (this.isPlaying) {
          const sId = Array.from(this.ecs.idToIndex.entries()).find(x => this.ecs.store.names[x[1]] === 'Orbiting Satellite')?.[0];
          if (sId) {
              const idx = this.ecs.idToIndex.get(sId)!;
              this.ecs.store.setRotation(idx, this.ecs.store.rotX[idx], this.ecs.store.rotY[idx] + deltaTime * 2.0, this.ecs.store.rotZ[idx]);
          }
          this.physics.update(deltaTime, this.ecs.store, this.ecs.idToIndex, this.sceneGraph);
      }

      // 2. Scene Graph
      this.syncTransforms();
      
      // 3. Script / Logic
      this.debugRenderer.begin();
      this.nodeResults.clear();
      
      for(const step of this.executionList) {
          const inputs = step.inputs.map(link => {
              if (!link) return null;
              const res = this.nodeResults.get(link.nodeId);
              if (res && typeof res === 'object' && link.pinId in res && !ArrayBuffer.isView(res)) {
                  return res[link.pinId];
              }
              return res;
          });
          try {
             // Only execute nodes that have an execution function
             if (step.def.execute) {
                 const result = step.def.execute(inputs, step.data, this);
                 this.nodeResults.set(step.id, result);
             }
          } catch(e) { }
      }

      // 4. Rendering
      this.renderer.render(
          this.ecs.store, 
          this.ecs.count, 
          this.selectedIndices,
          this.viewProjectionMatrix,
          this.canvasWidth,
          this.canvasHeight
      );
      
      this.debugRenderer.render(this.viewProjectionMatrix);

      const end = performance.now();
      this.metrics.frameTime = end - now;
      this.metrics.drawCalls = this.renderer.drawCalls;
      this.metrics.triangleCount = this.renderer.triangleCount;
      this.metrics.entityCount = this.ecs.idToIndex.size;
  }
  
  start() { this.isPlaying = true; this.notifyUI(); }
  pause() { this.isPlaying = false; this.notifyUI(); }
  stop() { this.isPlaying = false; this.notifyUI(); }
  
  subscribe(cb: () => void) { 
      this.listeners.push(cb); 
      return () => { this.listeners = this.listeners.filter(c => c !== cb); };
  }
  
  notifyUI() { 
      this.syncTransforms();
      this.listeners.forEach(cb => cb()); 
  }
}

export const engineInstance = new Ti3DEngine();
