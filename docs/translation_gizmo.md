Markdown

# Translation Gizmo Architecture

## Overview
The `TranslationGizmo` handles the visual representation and interaction logic for moving entities in 3D space. It uses a hybrid rendering approach: calculating 3D geometry (axes, arrowheads) and projecting it into a 2D SVG overlay for high performance and crisp UI rendering.

## Architecture & Module Interaction

### 1. Component Hierarchy
* **`SceneView`** (Container)
    * Calculates the `vpMatrix` (View-Projection Matrix) and `viewport` dimensions.
    * Renders the `Gizmo` wrapper component.
* **`Gizmo`** (Switcher)
    * Determines which tool is active (`MOVE`, `ROTATE`, `SCALE`).
    * Calculates the **`GizmoBasis`** (Origin, X/Y/Z Axes, Scale) from the Entity's World Matrix.
    * Instantiates `TranslationGizmo` when the tool is `'MOVE'`.
* **`TranslationGizmo`** (Implementation)
    * Renders the interactive SVG elements (Arrows, Planes, Center Handle).
    * Handles mouse events and updates ECS data.

### 2. Data Flow Diagram

```mermaid
graph TD
    A[SceneGraph] -->|World Matrix| B(Gizmo Wrapper)
    C[EditorContext] -->|GizmoConfig| B
    B -->|GizmoBasis| D[TranslationGizmo]
    
    D -->|Render| E[SVG Overlay]
    E -->|MouseDown| D
    
    D -->|Update Position| F[Entity Component Storage]
    F -->|notifyUI| G[Engine Instance]
    G -->|Re-render| A
Class & Data Structures
GizmoBasis (from GizmoUtils.ts)
Derived in the parent Gizmo.tsx and passed down. This isolates the math of "where is the object" from the drawing logic.

origin: Vector3 - The world position of the entity.

xAxis, yAxis, zAxis: Vector3 - Normalized direction vectors for the local coordinate system.

cameraPosition: Vector3 - Used for calculating distance scaling and opacity fading.

dragState (Local State)
Maintains the context of an active drag operation.

axis: 'X' | 'Y' | 'Z' | 'XY' ... - The constrained axis of movement.

startPos: Vector3 - The entity's position when the drag started.

screenAxis: {x, y} - The 2D projected vector of the 3D axis on screen (used for calculating mouse delta projection).

Interaction Logic
1. Visibility & Fading
To prevent visual clutter and "gimbal lock" confusion, axes fade out when they point directly at the camera.

Function: GizmoMath.getAxisOpacity(axisVec, cameraPos, origin)

Logic: Calculates the Dot Product between the Axis Vector and View Vector. If dot > 0.9 (nearly parallel), opacity is reduced.

2. Dragging (Mouse Move)
The gizmo listens to global window events during a drag.

Axis Move: Projects the mouse delta (dx, dy) onto the screenAxis vector.

Plane Move: Adds the raw mouse delta to the two corresponding axes.

View Move (Center Handle): Moves the object parallel to the camera's view plane using a calculated cameraBasis.

Distance Factor: Movement is scaled by the distance from the camera to keep dragging feeling 1:1 with the mouse cursor regardless of how far away the object is.

TypeScript

const factor = distance * 0.002;
const moveAmount = projectedDelta * factor;
Customization (GizmoConfig)
Developers can customize the gizmo via EditorContext. Key properties used by TranslationGizmo:

translationShape: 'CONE' | 'CUBE' | 'TETRAHEDRON' | 'RHOMBUS' - Changes the 3D mesh generated for arrowheads.

arrowSize: Scales the arrowhead mesh.

arrowOffset: Adjusts how far the arrowhead sits from the origin.

axisHoverColor / axisPressColor: Interaction feedback colors.