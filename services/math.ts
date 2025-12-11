
// Minimal 4x4 Matrix Math for High Performance
// Stored as Float32Array (column-major) for direct WebGL usage

export type Mat4 = Float32Array;
export type Vec3 = { x: number, y: number, z: number };

// Global scratchpads to minimize GC during intermediate calculations
export const TMP_MAT4_1 = new Float32Array(16);
export const TMP_MAT4_2 = new Float32Array(16);
export const TMP_VEC3_1 = { x: 0, y: 0, z: 0 };
export const TMP_VEC3_2 = { x: 0, y: 0, z: 0 };

export const Vec3Utils = {
  create: (x=0, y=0, z=0): Vec3 => ({x,y,z}),
  copy: (out: Vec3, a: Vec3): Vec3 => { out.x = a.x; out.y = a.y; out.z = a.z; return out; },
  add: (a: Vec3, b: Vec3, out: Vec3): Vec3 => { out.x = a.x + b.x; out.y = a.y + b.y; out.z = a.z + b.z; return out; },
  subtract: (a: Vec3, b: Vec3, out: Vec3): Vec3 => { out.x = a.x - b.x; out.y = a.y - b.y; out.z = a.z - b.z; return out; },
  scale: (v: Vec3, s: number, out: Vec3): Vec3 => { out.x = v.x * s; out.y = v.y * s; out.z = v.z * s; return out; },
  length: (v: Vec3): number => Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z),
  normalize: (v: Vec3, out: Vec3): Vec3 => {
    const len = Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
    if(len === 0) { out.x=0; out.y=0; out.z=0; return out; }
    out.x = v.x/len; out.y = v.y/len; out.z = v.z/len;
    return out;
  },
  cross: (a: Vec3, b: Vec3, out: Vec3): Vec3 => {
    const ax = a.x, ay = a.y, az = a.z;
    const bx = b.x, by = b.y, bz = b.z;
    out.x = ay * bz - az * by;
    out.y = az * bx - ax * bz;
    out.z = ax * by - ay * bx;
    return out;
  },
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

  identity: (out: Mat4): Mat4 => {
    out.fill(0);
    out[0] = 1; out[5] = 1; out[10] = 1; out[15] = 1;
    return out;
  },

  multiply: (a: Mat4, b: Mat4, out: Mat4): Mat4 => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    let b0 = b[0], b1 = b[1], b2 = b[2], b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
  },

  compose: (posX: number, posY: number, posZ: number, rotX: number, rotY: number, rotZ: number, scaleX: number, scaleY: number, scaleZ: number, out: Mat4): Mat4 => {
    const c1 = Math.cos(rotX), s1 = Math.sin(rotX);
    const c2 = Math.cos(rotY), s2 = Math.sin(rotY);
    const c3 = Math.cos(rotZ), s3 = Math.sin(rotZ);

    out[0] = (c2 * c3) * scaleX;
    out[1] = (c2 * s3) * scaleX;
    out[2] = (-s2) * scaleX;
    out[3] = 0;

    out[4] = (s1 * s2 * c3 - c1 * s3) * scaleY;
    out[5] = (s1 * s2 * s3 + c1 * c3) * scaleY;
    out[6] = (s1 * c2) * scaleY;
    out[7] = 0;

    out[8] = (c1 * s2 * c3 + s1 * s3) * scaleZ;
    out[9] = (c1 * s2 * s3 - s1 * c3) * scaleZ;
    out[10] = (c1 * c2) * scaleZ;
    out[11] = 0;

    out[12] = posX;
    out[13] = posY;
    out[14] = posZ;
    out[15] = 1;

    return out;
  },

  getTranslation: (m: Mat4): Vec3 => {
    return { x: m[12], y: m[13], z: m[14] };
  },

  lookAt: (eye: Vec3, center: Vec3, up: Vec3, out: Mat4): Mat4 => {
    const z = TMP_VEC3_1; // Borrow global scratch
    Vec3Utils.subtract(eye, center, z);
    Vec3Utils.normalize(z, z);

    const x = TMP_VEC3_2; // Borrow global scratch
    Vec3Utils.cross(up, z, x);
    Vec3Utils.normalize(x, x);

    const y = { x: 0, y: 0, z: 0 }; // Need local or 3rd scratch.
    // Optimization: Just inline cross product for Y
    y.x = z.y * x.z - z.z * x.y;
    y.y = z.z * x.x - z.x * x.z;
    y.z = z.x * x.y - z.y * x.x;

    out[0] = x.x; out[1] = y.x; out[2] = z.x; out[3] = 0;
    out[4] = x.y; out[5] = y.y; out[6] = z.y; out[7] = 0;
    out[8] = x.z; out[9] = y.z; out[10] = z.z; out[11] = 0;
    out[12] = -Vec3Utils.dot(x, eye);
    out[13] = -Vec3Utils.dot(y, eye);
    out[14] = -Vec3Utils.dot(z, eye);
    out[15] = 1;
    return out;
  },

  perspective: (fovy: number, aspect: number, near: number, far: number, out: Mat4): Mat4 => {
    const f = 1.0 / Math.tan(fovy / 2);
    const nf = 1 / (near - far);
    
    out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
    out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
    out[8] = 0; out[9] = 0; out[10] = (far + near) * nf; out[11] = -1;
    out[12] = 0; out[13] = 0; out[14] = (2 * far * near) * nf; out[15] = 0;
    return out;
  },

  transformPoint: (v: Vec3, m: Mat4, width: number, height: number): { x: number, y: number, z: number, w: number } => {
    const x = v.x, y = v.y, z = v.z;
    const w = x * m[3] + y * m[7] + z * m[11] + m[15];
    const outX = x * m[0] + y * m[4] + z * m[8] + m[12];
    const outY = x * m[1] + y * m[5] + z * m[9] + m[13];
    const outZ = x * m[2] + y * m[6] + z * m[10] + m[14];

    if (w === 0) return { x: 0, y: 0, z: 0, w: 0 };
    
    const ndcX = outX / w;
    const ndcY = outY / w;
    const ndcZ = outZ / w;

    return {
      x: (ndcX + 1) * width * 0.5,
      y: (1 - ndcY) * height * 0.5,
      z: ndcZ,
      w: w
    };
  }
};
