
export const INITIAL_CAPACITY = 10000;
export const MESH_TYPES: Record<string, number> = { 'None': 0, 'Cube': 1, 'Sphere': 2, 'Plane': 3 };
export const MESH_NAMES: Record<number, string> = { 0: 'None', 1: 'Cube', 2: 'Sphere', 3: 'Plane' };

export const ROTATION_ORDERS: string[] = ['XYZ', 'XZY', 'YXZ', 'YZX', 'ZXY', 'ZYX'];
export const ROTATION_ORDER_MAP: Record<string, number> = { 
    'XYZ': 0, 'XZY': 1, 'YXZ': 2, 'YZX': 3, 'ZXY': 4, 'ZYX': 5 
};
export const ROTATION_ORDER_ZY_MAP: Record<number, string> = { 
    0: 'XYZ', 1: 'XZY', 2: 'YXZ', 3: 'YZX', 4: 'ZXY', 5: 'ZYX' 
};