
import { LogicalMesh } from '../types';

export const MeshTopologyUtils = {
    /**
     * Finds the edge loop starting from a given edge in a logical mesh.
     * Only works on quads for standard strip walking.
     */
    getEdgeLoop: (mesh: LogicalMesh, startVertexA: number, startVertexB: number): [number, number][] => {
        const loop: [number, number][] = [[startVertexA, startVertexB]];
        const visitedFaces = new Set<number>();
        
        let currentA = startVertexA;
        let currentB = startVertexB;
        
        // Walk in one direction
        let next = MeshTopologyUtils.walkLoop(mesh, currentA, currentB, visitedFaces);
        while (next) {
            loop.push([next.a, next.b]);
            currentA = next.a;
            currentB = next.b;
            next = MeshTopologyUtils.walkLoop(mesh, currentA, currentB, visitedFaces);
        }
        
        // Reset and walk in the other direction if needed (for open strips)
        // For simplicity in this High Performance Edition, we return the primary strip
        return loop;
    },

    // Fix for line 30: Removed 'private' modifier from object literal property
    walkLoop: (mesh: LogicalMesh, vA: number, vB: number, visited: Set<number>) => {
        // Find face sharing vA, vB
        const facesA = mesh.vertexToFaces.get(vA) || [];
        const facesB = mesh.vertexToFaces.get(vB) || [];
        
        const sharedFaceIdx = facesA.find(fIdx => !visited.has(fIdx) && facesB.includes(fIdx));
        if (sharedFaceIdx === undefined) return null;
        
        const face = mesh.faces[sharedFaceIdx];
        if (face.length !== 4) return null; // Only quads for simple loops
        
        visited.add(sharedFaceIdx);
        
        // Find positions of vA, vB in the face
        const idxA = face.indexOf(vA);
        const idxB = face.indexOf(vB);
        
        // Opposite edge in a quad [0,1,2,3] for edge (0,1) is (3,2)
        // Offset is usually +2 for vertices
        const nextA = face[(idxA + 2) % 4];
        const nextB = face[(idxB + 2) % 4];
        
        return { a: nextA, b: nextB };
    }
};
