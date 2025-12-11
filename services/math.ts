// Minimal 4x4 Matrix Math for High Performance
// Stored as Float32Array (column-major) for direct WebGL usage

export type Mat4 = Float32Array;
export type Vec3 = { x: number, y: number, z: number };

export const Vec3Utils = {
  create: (x=0, y=0, z=0): Vec3 => ({x,y,z}),
  add: (a: Vec3, b: Vec3): Vec3 => ({x: a.x + b.x, y: a.y + b.y, z: a.z + b.z}),
  subtract: (a: Vec3, b: Vec3): Vec3 => ({x: a.x - b.x, y: a.y - b.y, z: a.z - b.z}),
  scale: (v: Vec3, s: number): Vec3 => ({x: v.x * s, y: v.y * s, z: v.z * s}),
  length: (v: Vec3): number => Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z),
  normalize: (v: Vec3): Vec3 => {
    const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
    if(len === 0) return {x:0, y:0, z:0};
    return {x: v.x/len, y: v.y/len, z: v.z/len};
  },
  cross: (a: Vec3, b: Vec3): Vec3 => ({
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  }),
  dot: (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z,
};

export const Mat4Utils = {
  create: (): Mat4 => new Float32Array([
    1, 0, 0, 0,
    0, 1, 0, 0,
    0, 0, 1, 0,
    0, 0, 0, 1
  ]),

  copy: (out: Mat4, a: Mat4): Mat4 => {
    out.set(a);
    return out;
  },

  // Multiply two matrices: out = a * b
  // Optimized to avoid allocation if 'out' is provided
  multiply: (a: Mat4, b: Mat4, out?: Mat4): Mat4 => {
    const dest = out || new Float32Array(16);
    
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    dest[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    dest[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    dest[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    dest[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    dest[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    dest[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    dest[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    dest[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    dest[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    dest[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    dest[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    dest[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    dest[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    dest[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    dest[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    dest[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return dest;
  },

  // Create matrix from Translation, Rotation (Euler XYZ in radians), Scale
  // Writes to 'out' to avoid GC
  compose: (pos: Vec3, rot: Vec3, scale: Vec3, out?: Mat4): Mat4 => {
    const dest = out || new Float32Array(16);

    const x = rot.x, y = rot.y, z = rot.z;
    const sx = scale.x, sy = scale.y, sz = scale.z;

    const c1 = Math.cos(x), s1 = Math.sin(x);
    const c2 = Math.cos(y), s2 = Math.sin(y);
    const c3 = Math.cos(z), s3 = Math.sin(z);

    dest[0] = (c2 * c3) * sx;
    dest[1] = (c2 * s3) * sx;
    dest[2] = (-s2) * sx;
    dest[3] = 0;

    dest[4] = (s1 * s2 * c3 - c1 * s3) * sy;
    dest[5] = (s1 * s2 * s3 + c1 * c3) * sy;
    dest[6] = (s1 * c2) * sy;
    dest[7] = 0;

    dest[8] = (c1 * s2 * c3 + s1 * s3) * sz;
    dest[9] = (c1 * s2 * s3 - s1 * c3) * sz;
    dest[10] = (c1 * c2) * sz;
    dest[11] = 0;

    dest[12] = pos.x;
    dest[13] = pos.y;
    dest[14] = pos.z;
    dest[15] = 1;

    return dest;
  },

  getTranslation: (m: Mat4): Vec3 => {
    return { x: m[12], y: m[13], z: m[14] };
  },

  // LookAt Matrix (View Matrix)
  lookAt: (eye: Vec3, center: Vec3, up: Vec3): Mat4 => {
    const z = Vec3Utils.normalize(Vec3Utils.subtract(eye, center));
    const x = Vec3Utils.normalize(Vec3Utils.cross(up, z));
    const y = Vec3Utils.cross(z, x);

    return new Float32Array([
      x.x, y.x, z.x, 0,
      x.y, y.y, z.y, 0,
      x.z, y.z, z.z, 0,
      -Vec3Utils.dot(x, eye), -Vec3Utils.dot(y, eye), -Vec3Utils.dot(z, eye), 1
    ]);
  },

  // Perspective Projection Matrix
  perspective: (fovy: number, aspect: number, near: number, far: number): Mat4 => {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    
    return new Float32Array([
      f / aspect, 0, 0, 0,
      0, f, 0, 0,
      0, 0, (far + near) * nf, -1,
      0, 0, (2 * far * near) * nf, 0
    ]);
  },

  // Projects a 3D point to 2D Screen Space (NDC -> Screen)
  transformPoint: (v: Vec3, m: Mat4, width: number, height: number): { x: number, y: number, z: number, w: number } => {
    const x = v.x, y = v.y, z = v.z;
    const w = x * m[3] + y * m[7] + z * m[11] + m[15];
    const outX = x * m[0] + y * m[4] + z * m[8] + m[12];
    const outY = x * m[1] + y * m[5] + z * m[9] + m[13];
    const outZ = x * m[2] + y * m[6] + z * m[10] + m[14];

    // Perspective divide
    if (w === 0) return { x: 0, y: 0, z: 0, w: 0 };
    
    const ndcX = outX / w;
    const ndcY = outY / w;
    const ndcZ = outZ / w;

    return {
      x: (ndcX + 1) * width * 0.5,
      y: (1 - ndcY) * height * 0.5, // Invert Y for screen space
      z: ndcZ,
      w: w
    };
  }
};