
import { SoAEntitySystem } from './ecs/EntitySystem';
import { SceneGraph } from './SceneGraph';
import { WebGLRenderer, PostProcessConfig } from './renderers/WebGLRenderer';
import { DebugRenderer } from './renderers/DebugRenderer';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { HistorySystem } from './systems/HistorySystem';
import { assetManager } from './AssetManager';
import { PerformanceMetrics, GraphNode, GraphConnection, ComponentType } from '../types';
import { compileShader } from './ShaderCompiler';
import { NodeRegistry } from './NodeRegistry';
import { GridConfiguration } from '../contexts/EditorContext';
import { Mat4Utils } from './math';

export class EngineService {
    ecs: SoAEntitySystem;
    sceneGraph: SceneGraph;
    renderer: WebGLRenderer;
    debugRenderer: DebugRenderer;
    physicsSystem: PhysicsSystem;
    historySystem: HistorySystem;
    
    metrics: PerformanceMetrics = {
        fps: 0, frameTime: 0, drawCalls: 0, triangleCount: 0, entityCount: 0
    };
    
    isPlaying = false;
    renderMode = 0;
    currentShaderSource = '';
    
    private canvas: HTMLCanvasElement | null = null;
    private listeners: (() => void)[] = [];
    private selectedIds: string[] = [];
    
    // Graph Execution
    private executionList: { id: string, def: any, inputs: any[], data: any }[] = [];

    // Helper fields to store camera state from SceneView
    private _vpMatrix: Float32Array = new Float32Array(16);
    private _camPos: {x:number, y:number, z:number} = {x:0, y:0, z:0};
    private _width = 1;
    private _height = 1;

    constructor() {
        this.ecs = new SoAEntitySystem();
        this.sceneGraph = new SceneGraph();
        this.renderer = new WebGLRenderer();
        this.debugRenderer = new DebugRenderer();
        this.physicsSystem = new PhysicsSystem();
        this.historySystem = new HistorySystem();
        
        this.sceneGraph.setContext(this.ecs);
    }

    initGL(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        this.renderer.init(canvas);
        this.debugRenderer.init(this.renderer.gl!);
    }

    resize(width: number, height: number) {
        this.renderer.resize(width, height);
    }

    subscribe(listener: () => void) {
        this.listeners.push(listener);
        return () => {
            this.listeners = this.listeners.filter(l => l !== listener);
        };
    }

    notifyUI() {
        this.listeners.forEach(l => l());
    }

    start() { this.isPlaying = true; this.notifyUI(); }
    pause() { this.isPlaying = false; this.notifyUI(); }
    stop() { 
        this.isPlaying = false; 
        this.notifyUI(); 
    }

    setSelected(ids: string[]) {
        this.selectedIds = ids;
        this.notifyUI();
    }

    updateCamera(vp: Float32Array, camPos: {x:number, y:number, z:number}, w: number, h: number) {
        this._vpMatrix = vp;
        this._camPos = camPos;
        this._width = w;
        this._height = h;
        
        // Trigger Render if not playing (game loop handles render when playing)
        if (!this.isPlaying) {
            this.renderFrame();
        }
    }

    renderFrame() {
        if (!this.canvas) return;
        const selectedIndices = new Set<number>();
        this.selectedIds.forEach(id => {
            const idx = this.ecs.getEntityIndex(id);
            if (idx !== undefined) selectedIndices.add(idx);
        });
        
        this.renderer.render(
            this.ecs.store, 
            this.ecs.count, 
            selectedIndices, 
            this._vpMatrix, 
            this._width, 
            this._height, 
            this._camPos
        );
    }

    tick(dt: number) {
        const start = performance.now();
        
        if (this.isPlaying) {
            this.physicsSystem.update(dt, this.ecs.store, this.ecs.idToIndex, this.sceneGraph);
            // Execute Scripts (Not implemented in this demo)
        }

        this.sceneGraph.update();
        
        this.renderFrame();
        
        // Metrics
        const end = performance.now();
        this.metrics.frameTime = end - start;
        this.metrics.fps = 1000 / (this.metrics.frameTime || 1);
        this.metrics.drawCalls = this.renderer.drawCalls;
        this.metrics.triangleCount = this.renderer.triangleCount;
        this.metrics.entityCount = this.ecs.count;
    }

    selectEntityAt(x: number, y: number, w: number, h: number): string | null {
        if (!this._vpMatrix) return null;
        
        let closestDist = Infinity;
        let closestId: string | null = null;
        
        this.ecs.idToIndex.forEach((idx, id) => {
            if (!this.ecs.store.isActive[idx]) return;
            
            // Get World Pos
            const wmIndex = idx * 16;
            const px = this.ecs.store.worldMatrix[wmIndex + 12];
            const py = this.ecs.store.worldMatrix[wmIndex + 13];
            const pz = this.ecs.store.worldMatrix[wmIndex + 14];
            
            // Project
            const coord = Mat4Utils.transformPoint({x:px, y:py, z:pz}, this._vpMatrix, w, h);
            
            if (coord.w > 0) { // In front of camera
                const dx = coord.x - x;
                const dy = coord.y - y;
                const d = Math.sqrt(dx*dx + dy*dy);
                
                // Simple radius check (30px threshold)
                if (d < 30 && d < closestDist) {
                    closestDist = d;
                    closestId = id;
                }
            }
        });
        
        return closestId;
    }
    
    selectEntitiesInRect(x: number, y: number, w: number, h: number): string[] {
        if (!this._vpMatrix) return [];
        const ids: string[] = [];
        const x1 = Math.min(x, x + w);
        const x2 = Math.max(x, x + w);
        const y1 = Math.min(y, y + h);
        const y2 = Math.max(y, y + h);

        this.ecs.idToIndex.forEach((idx, id) => {
            if (!this.ecs.store.isActive[idx]) return;
            const wmIndex = idx * 16;
            const px = this.ecs.store.worldMatrix[wmIndex + 12];
            const py = this.ecs.store.worldMatrix[wmIndex + 13];
            const pz = this.ecs.store.worldMatrix[wmIndex + 14];
            const coord = Mat4Utils.transformPoint({x:px, y:py, z:pz}, this._vpMatrix, this._width, this._height);
            
            if (coord.w > 0 && coord.x >= x1 && coord.x <= x2 && coord.y >= y1 && coord.y <= y2) {
                ids.push(id);
            }
        });
        return ids;
    }

    createEntityFromAsset(assetId: string, position: {x:number, y:number, z:number}) {
        const asset = assetManager.getAsset(assetId);
        if (!asset) return;
        
        this.pushUndoState();
        const id = this.ecs.createEntity(asset.name);
        
        // Add Transform
        const transform = this.ecs.createProxy(id, this.sceneGraph)?.components[ComponentType.TRANSFORM];
        if(transform) transform.position = position;

        if (asset.type === 'MESH') {
            this.ecs.addComponent(id, ComponentType.MESH);
            const mesh = this.ecs.createProxy(id, this.sceneGraph)?.components[ComponentType.MESH];
            if(mesh) {
                if (asset.name.includes('Cube')) mesh.meshType = 'Cube';
                else if (asset.name.includes('Sphere')) mesh.meshType = 'Sphere';
                else if (asset.name.includes('Plane')) mesh.meshType = 'Plane';
                else mesh.meshType = 'Cube'; // Default
            }
        } else if (asset.type === 'MATERIAL') {
            const sphereId = this.ecs.createEntity(asset.name);
            const t = this.ecs.createProxy(sphereId, this.sceneGraph)?.components[ComponentType.TRANSFORM];
            if(t) t.position = position;
            this.ecs.addComponent(sphereId, ComponentType.MESH);
            const m = this.ecs.createProxy(sphereId, this.sceneGraph)?.components[ComponentType.MESH];
            if(m) {
                m.meshType = 'Sphere';
                m.materialId = assetId;
            }
        }
        
        this.notifyUI();
    }

    pushUndoState() {
        this.historySystem.pushState(this.ecs);
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

          // Visit inputs first (Dependency resolution - Left to Right)
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

      // OPTIMIZATION: Sort nodes by Y position to enforce "Upper to Lower" execution flow
      // for independent logic branches (like Sequence outputs).
      const sortedNodes = [...nodes].sort((a, b) => a.position.y - b.position.y);

      for (const node of sortedNodes) visit(node.id);
      
      // 2. Compile Shader (GPU)
      const compiled = compileShader(nodes, connections);
      
      if (typeof compiled === 'object') {
          // Update Preview State (Use fragment shader source for now)
          if (compiled.fs !== this.currentShaderSource) {
              this.currentShaderSource = compiled.fs;
              this.notifyUI();
          }

          // 3. Update Renderer Material
          if (materialId) {
              const matIntId = assetManager.getMaterialID(materialId);
              if (matIntId) {
                  this.renderer.updateMaterial(matIntId, compiled);
              }
          }
      }
    }

    toggleGrid() {
        this.renderer.showGrid = !this.renderer.showGrid;
        this.renderFrame();
    }

    setRenderMode(mode: number) {
        this.renderer.renderMode = mode;
        this.renderFrame();
    }

    applyMaterialToSelected(assetId: string) {
        this.selectedIds.forEach(id => {
            const proxy = this.ecs.createProxy(id, this.sceneGraph);
            if (proxy && proxy.components.Mesh) {
                proxy.components.Mesh.materialId = assetId;
            }
        });
        this.notifyUI();
    }

    saveScene() {
        return this.ecs.serialize();
    }

    loadScene(json: string) {
        this.ecs.deserialize(json, this.sceneGraph);
        this.notifyUI();
    }

    getPostProcessConfig() { return this.renderer.ppConfig; }
    setPostProcessConfig(config: PostProcessConfig) { 
        this.renderer.ppConfig = config;
        this.renderFrame();
    }

    setGridConfig(config: GridConfiguration) {
        this.renderer.gridOpacity = config.opacity;
        this.renderer.gridSize = config.size;
        this.renderer.gridFadeDistance = config.fadeDistance;
        // hex string to float array
        const r = parseInt(config.color.slice(1,3), 16)/255;
        const g = parseInt(config.color.slice(3,5), 16)/255;
        const b = parseInt(config.color.slice(5,7), 16)/255;
        this.renderer.gridColor = [r,g,b];
        this.renderer.gridExcludePP = config.excludeFromPostProcess;
        this.renderer.showGrid = config.visible;
        this.renderFrame();
    }

    syncTransforms() {
        this.sceneGraph.update();
    }
}

export const engineInstance = new EngineService();