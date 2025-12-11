
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

  invert: (a: Mat4, out: Mat4): Mat4 | null => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];

    const b00 = a00 * a11 - a01 * a10;
    const b01 = a00 * a12 - a02 * a10;
    const b02 = a00 * a13 - a03 * a10;
    const b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11;
    const b05 = a02 * a13 - a03 * a12;
    const b06 = a20 * a31 - a21 * a30;
    const b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30;
    const b09 = a21 * a32 - a22 * a31;
    const b10 = a21 * a33 - a23 * a31;
    const b11 = a22 * a33 - a23 * a32;

    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;

    if (!det) {
      return null;
    }
    det = 1.0 / det;

    out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det;
    out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det;
    out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det;
    out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det;
    out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det;
    out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det;
    out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det;
    out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det;
    out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;

    return out;
  },

  lookAt: (eye: Vec3, center: Vec3, up: Vec3, out: Mat4): Mat4 => {
      const eyex = eye.x, eyey = eye.y, eyez = eye.z;
      const upx = up.x, upy = up.y, upz = up.z;
      const centerx = center.x, centery = center.y, centerz = center.z;

      if (Math.abs(eyex - centerx) < 0.000001 &&
          Math.abs(eyey - centery) < 0.000001 &&
          Math.abs(eyez - centerz) < 0.000001) {
        return Mat4Utils.identity(out);
      }

      let z0 = eyex - centerx;
      let z1 = eyey - centery;
      let z2 = eyez - centerz;
      let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
      z0 *= len; z1 *= len; z2 *= len;

      let x0 = upy * z2 - upz * z1;
      let x1 = upz * z0 - upx * z2;
      let x2 = upx * z1 - upy * z0;
      len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
      if (!len) { x0 = 0; x1 = 0; x2 = 0; }
      else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }

      let y0 = z1 * x2 - z2 * x1;
      let y1 = z2 * x0 - z0 * x2;
      let y2 = z0 * x1 - z1 * x0;
      len = Math.sqrt(y0 * y0 + y1 * y1 + y2 * y2);
      if (!len) { y0 = 0; y1 = 0; y2 = 0; }
      else { len = 1 / len; y0 *= len; y1 *= len; y2 *= len; }

      out[0] = x0; out[1] = y0; out[2] = z0; out[3] = 0;
      out[4] = x1; out[5] = y1; out[6] = z1; out[7] = 0;
      out[8] = x2; out[9] = y2; out[10] = z2; out[11] = 0;
      out[12] = -(x0 * eyex + x1 * eyey + x2 * eyez);
      out[13] = -(y0 * eyex + y1 * eyey + y2 * eyez);
      out[14] = -(z0 * eyex + z1 * eyey + z2 * eyez);
      out[15] = 1;

      return out;
  },

  perspective: (fovy: number, aspect: number, near: number, far: number, out: Mat4): Mat4 => {
      const f = 1.0 / Math.tan(fovy / 2);
      out[0] = f / aspect; out[1] = 0; out[2] = 0; out[3] = 0;
      out[4] = 0; out[5] = f; out[6] = 0; out[7] = 0;
      out[8] = 0; out[9] = 0; out[11] = -1; out[15] = 0;
      if (far != null && far !== Infinity) {
          const nf = 1 / (near - far);
          out[10] = (far + near) * nf;
          out[14] = (2 * far * near) * nf;
      } else {
          out[10] = -1;
          out[14] = -2 * near;
      }
      return out;
  },

  getTranslation: (mat: Mat4): Vec3 => {
      return { x: mat[12], y: mat[13], z: mat[14] };
  },
  
  // Creates matrix from Translate, Euler XYZ Rotate, Scale
  compose: (
      tx: number, ty: number, tz: number,
      rx: number, ry: number, rz: number,
      sx: number, sy: number, sz: number,
      out: Mat4
  ): Mat4 => {
      const cx = Math.cos(rx), sx_val = Math.sin(rx);
      const cy = Math.cos(ry), sy_val = Math.sin(ry);
      const cz = Math.cos(rz), sz_val = Math.sin(rz);

      const m00 = cy * cz;
      const m01 = cz * sx_val * sy_val - cx * sz_val;
      const m02 = cx * cz * sy_val + sx_val * sz_val;
      const m10 = cy * sz_val;
      const m11 = cx * cz + sx_val * sy_val * sz_val;
      const m12 = -cz * sx_val + cx * sy_val * sz_val;
      const m20 = -sy_val;
      const m21 = cy * sx_val;
      const m22 = cx * cy;

      out[0] = m00 * sx; out[1] = m10 * sx; out[2] = m20 * sx; out[3] = 0;
      out[4] = m01 * sy; out[5] = m11 * sy; out[6] = m21 * sy; out[7] = 0;
      out[8] = m02 * sz; out[9] = m12 * sz; out[10] = m22 * sz; out[11] = 0;
      out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
      return out;
  },

  // Transforms a point by matrix and projects to screen coordinates
  transformPoint: (v: {x:number, y:number, z:number}, m: Mat4, width: number, height: number) => {
      const x = v.x, y = v.y, z = v.z;
      const w = m[3] * x + m[7] * y + m[11] * z + m[15];
      const resX = m[0] * x + m[4] * y + m[8] * z + m[12];
      const resY = m[1] * x + m[5] * y + m[9] * z + m[13];
      const resZ = m[2] * x + m[6] * y + m[10] * z + m[14];

      const ndcX = resX / w;
      const ndcY = resY / w;
      
      const screenX = (ndcX + 1) * 0.5 * width;
      const screenY = (1 - ndcY) * 0.5 * height;

      return { x: screenX, y: screenY, z: resZ, w: w };
  }
};
