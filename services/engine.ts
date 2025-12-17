
import { SoAEntitySystem } from './ecs/EntitySystem';
import { SceneGraph } from './SceneGraph';
import { PhysicsSystem } from './systems/PhysicsSystem';
import { HistorySystem } from './systems/HistorySystem';
import { WebGLRenderer, PostProcessConfig } from './renderers/WebGLRenderer';
import { DebugRenderer } from './renderers/DebugRenderer';
import { assetManager } from './AssetManager';
import { PerformanceMetrics, GraphNode, GraphConnection, Vector3, ComponentType, Asset } from '../types';
import { Mat4Utils, RayUtils, Vec3Utils } from './math';
import { compileShader } from './ShaderCompiler';
import { GridConfiguration } from '../contexts/EditorContext';
import { NodeRegistry } from './NodeRegistry';

export class Engine {
    ecs: SoAEntitySystem;
    sceneGraph: SceneGraph;
    physicsSystem: PhysicsSystem;
    historySystem: HistorySystem;
    renderer: WebGLRenderer;
    debugRenderer: DebugRenderer;
    
    metrics: PerformanceMetrics;
    
    isPlaying: boolean = false;
    renderMode: number = 0;
    
    selectedIndices: Set<number> = new Set();
    
    private listeners: (() => void)[] = [];
    currentShaderSource: string = '';

    // Camera State
    private currentViewProj: Float32Array | null = null;
    private currentCameraPos: {x:number, y:number, z:number} = {x:0,y:0,z:0};
    private currentWidth: number = 1;
    private currentHeight: number = 1;

    constructor() {
        this.ecs = new SoAEntitySystem();
        this.sceneGraph = new SceneGraph();
        this.sceneGraph.setContext(this.ecs);
        this.physicsSystem = new PhysicsSystem();
        this.historySystem = new HistorySystem();
        this.renderer = new WebGLRenderer();
        this.debugRenderer = new DebugRenderer();
        
        this.metrics = {
            fps: 0,
            frameTime: 0,
            drawCalls: 0,
            triangleCount: 0,
            entityCount: 0
        };

        // Create default scene
        setTimeout(() => {
            try {
                this.createEntityFromAsset('SM_Cube', { x: 0, y: 0, z: 0 });
                const light = this.ecs.createEntity('Directional Light');
                this.ecs.addComponent(light, ComponentType.LIGHT);
                this.ecs.store.setPosition(this.ecs.idToIndex.get(light)!, 5, 10, 5);
                this.ecs.store.setRotation(this.ecs.idToIndex.get(light)!, -0.5, 0.5, 0); 
                this.sceneGraph.registerEntity(light);
            } catch (e) {
                console.warn("Could not create default scene entities:", e);
            }
        }, 0);
    }

    initGL(canvas: HTMLCanvasElement) {
        this.renderer.init(canvas);
        this.debugRenderer.init(this.renderer.gl!);
    }

    resize(width: number, height: number) {
        this.renderer.resize(width, height);
    }

    start() { this.isPlaying = true; this.notifyUI(); }
    pause() { this.isPlaying = false; this.notifyUI(); }
    stop() { 
        this.isPlaying = false; 
        this.notifyUI(); 
    }

    tick(dt: number) {
        const start = performance.now();
        
        if (this.isPlaying) {
            this.physicsSystem.update(dt, this.ecs.store, this.ecs.idToIndex, this.sceneGraph);
        }

        const store = this.ecs.store;
        for(let i=0; i<this.ecs.count; i++) {
            if (store.isActive[i]) {
                const id = store.ids[i];
                const rigId = store.rigIndex[i];
                if (rigId > 0) {
                    const assetId = assetManager.getRigUUID(rigId);
                    if(assetId) this.executeAssetGraph(id, assetId);
                }
            }
        }

        this.sceneGraph.update();
        
        if (this.currentViewProj) {
             this.renderer.render(
                 this.ecs.store, 
                 this.ecs.count, 
                 this.selectedIndices, 
                 this.currentViewProj, 
                 this.currentWidth, 
                 this.currentHeight, 
                 this.currentCameraPos
             );
        }
        
        const end = performance.now();
        this.metrics.frameTime = end - start;
        this.metrics.fps = 1000 / (this.metrics.frameTime || 1);
        this.metrics.drawCalls = this.renderer.drawCalls;
        this.metrics.triangleCount = this.renderer.triangleCount;
        this.metrics.entityCount = this.ecs.count;
    }

    updateCamera(vpMatrix: Float32Array, eye: {x:number, y:number, z:number}, width: number, height: number) {
        this.currentViewProj = vpMatrix;
        this.currentCameraPos = eye;
        this.currentWidth = width;
        this.currentHeight = height;
    }

    setSelected(ids: string[]) {
        this.selectedIndices.clear();
        ids.forEach(id => {
            const idx = this.ecs.idToIndex.get(id);
            if (idx !== undefined) this.selectedIndices.add(idx);
        });
    }

    notifyUI() {
        this.listeners.forEach(l => l());
    }

    subscribe(cb: () => void) {
        this.listeners.push(cb);
        return () => { this.listeners = this.listeners.filter(l => l !== cb); };
    }

    /**
     * Uploads an asset's data to the GPU via the renderer.
     */
    registerAssetWithGPU(asset: Asset) {
        if (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH') {
            const internalId = assetManager.getMeshID(asset.id);
            if (internalId > 0) {
                this.renderer.registerMesh(internalId, asset.geometry);
            }
        }
    }

    createEntityFromAsset(assetId: string, position: {x:number, y:number, z:number}) {
        let asset = assetManager.getAsset(assetId);
        if (!asset) {
            asset = assetManager.getAllAssets().find(a => a.name === assetId) || undefined;
        }

        if (!asset) return;

        // Ensure renderer knows about this mesh (important for imported assets)
        this.registerAssetWithGPU(asset);

        const id = this.ecs.createEntity(asset.name);
        this.sceneGraph.registerEntity(id);
        const idx = this.ecs.idToIndex.get(id)!;
        
        this.ecs.store.setPosition(idx, position.x, position.y, position.z);

        if (asset.type === 'MESH' || asset.type === 'SKELETAL_MESH') {
            this.ecs.addComponent(id, ComponentType.MESH);
            this.ecs.store.meshType[idx] = assetManager.getMeshID(asset.id);
        }
        
        this.notifyUI();
        this.pushUndoState();
    }

    pushUndoState() {
        this.historySystem.pushState(this.ecs);
    }

    setRenderMode(modeId: number) {
        this.renderMode = modeId;
        this.renderer.renderMode = modeId;
    }

    toggleGrid() {
        this.renderer.showGrid = !this.renderer.showGrid;
    }

    syncTransforms() {
        this.sceneGraph.update();
    }

    selectEntityAt(mx: number, my: number, w: number, h: number): string | null {
        if (!this.currentViewProj) return null;
        
        const invVP = new Float32Array(16);
        if(!Mat4Utils.invert(this.currentViewProj, invVP)) return null;

        const ray = RayUtils.create();
        RayUtils.fromScreen(mx, my, w, h, invVP, ray);

        let closestDist = Infinity;
        let closestId: string | null = null;

        const store = this.ecs.store;
        
        for(let i=0; i<this.ecs.count; i++) {
            if(!store.isActive[i]) continue;
            const pos = { x: store.worldMatrix[i*16+12], y: store.worldMatrix[i*16+13], z: store.worldMatrix[i*16+14] };
            const maxScale = Math.max(store.scaleX[i], Math.max(store.scaleY[i], store.scaleZ[i]));
            const radius = 0.5 * maxScale; 

            const t = RayUtils.intersectSphere(ray, pos, radius);
            if (t !== null && t < closestDist) {
                closestDist = t;
                closestId = store.ids[i];
            }
        }

        return closestId;
    }
    
    selectEntitiesInRect(x: number, y: number, w: number, h: number): string[] {
        return [];
    }

    applyMaterialToSelected(assetId: string) {
        const matID = assetManager.getMaterialID(assetId);
        this.selectedIndices.forEach(idx => {
            this.ecs.store.materialIndex[idx] = matID;
        });
        this.notifyUI();
    }

    loadScene(json: string) {
        this.ecs.deserialize(json, this.sceneGraph);
        this.notifyUI();
    }

    saveScene() {
        return this.ecs.serialize();
    }

    compileGraph(nodes: GraphNode[], connections: GraphConnection[], assetId?: string) {
        if (assetId) {
            const res = compileShader(nodes, connections);
            if (typeof res !== 'string') {
                this.currentShaderSource = res.fs; 
                const matID = assetManager.getMaterialID(assetId);
                this.renderer.updateMaterial(matID, res);
            }
        }
    }

    executeAssetGraph(entityId: string, assetId: string) {
        const asset = assetManager.getAsset(assetId);
        if(!asset || (asset.type !== 'SCRIPT' && asset.type !== 'RIG')) return;
        
        const nodes = asset.data.nodes;
        const connections = asset.data.connections;
        const context = {
            ecs: this.ecs,
            sceneGraph: this.sceneGraph,
            entityId: entityId,
            time: performance.now() / 1000
        };

        const nodeMap = new Map(nodes.map(n => [n.id, n]));
        const computedValues = new Map<string, any>();

        const evaluatePin = (nodeId: string, pinId: string): any => {
            const key = `${nodeId}.${pinId}`;
            if(computedValues.has(key)) return computedValues.get(key);
            const conn = connections.find(c => c.toNode === nodeId && c.toPin === pinId);
            if(conn) {
                const val = evaluateNodeOutput(conn.fromNode, conn.fromPin);
                computedValues.set(key, val);
                return val;
            }
            const node = nodeMap.get(nodeId);
            if(node && node.data && node.data[pinId] !== undefined) {
                return node.data[pinId];
            }
            return undefined;
        };

        const evaluateNodeOutput = (nodeId: string, pinId: string): any => {
            const node = nodeMap.get(nodeId);
            if(!node) return null;
            const def = NodeRegistry[node.type];
            if(!def) return null;
            if(def.execute) {
                const inputs = def.inputs.map(inp => evaluatePin(nodeId, inp.id));
                const result = def.execute(inputs, node.data, context);
                if(result && typeof result === 'object' && pinId in result) {
                    return result[pinId];
                }
                if(def.outputs.length === 1) return result;
                return result; 
            }
            return null;
        };

        nodes.filter(n => n.type === 'RigOutput' || n.type === 'SetEntityTransform').forEach(n => {
            const def = NodeRegistry[n.type];
            if(def && def.inputs) {
                def.inputs.forEach(inp => evaluatePin(n.id, inp.id));
            }
            if(def && def.execute) {
                const inputs = def.inputs.map(inp => evaluatePin(n.id, inp.id));
                def.execute(inputs, n.data, context);
            }
        });
    }

    getPostProcessConfig(): PostProcessConfig {
        return this.renderer.ppConfig;
    }

    setPostProcessConfig(config: PostProcessConfig) {
        this.renderer.ppConfig = config;
    }

    setGridConfig(config: GridConfiguration) {
        this.renderer.gridOpacity = config.opacity;
        this.renderer.gridSize = config.size;
        this.renderer.gridFadeDistance = config.fadeDistance;
        const hex = config.color.replace('#','');
        const r = parseInt(hex.substring(0,2), 16)/255;
        const g = parseInt(hex.substring(2,4), 16)/255;
        const b = parseInt(hex.substring(4,6), 16)/255;
        this.renderer.gridColor = [r, g, b];
        this.renderer.gridExcludePP = config.excludeFromPostProcess;
    }
}

export const engineInstance = new Engine();
