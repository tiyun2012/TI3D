// services/math.ts

export type Mat4 = Float32Array;
export type Vec3 = { x: number, y: number, z: number };

export interface Ray {
    origin: Vec3;
    direction: Vec3;
}

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
  
  transformMat4: (v: Vec3, m: Mat4, out: Vec3): Vec3 => {
    const x = v.x, y = v.y, z = v.z;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const s = w !== 0 ? 1.0 / w : 1.0;
    out.x = (m[0] * x + m[4] * y + m[8] * z + m[12]) * s;
    out.y = (m[1] * x + m[5] * y + m[9] * z + m[13]) * s;
    out.z = (m[2] * x + m[6] * y + m[10] * z + m[14]) * s;
    return out;
  },

  transformMat4Normal: (v: Vec3, m: Mat4, out: Vec3): Vec3 => {
    const x = v.x, y = v.y, z = v.z;
    out.x = m[0] * x + m[4] * y + m[8] * z;
    out.y = m[1] * x + m[5] * y + m[9] * z;
    out.z = m[2] * x + m[6] * y + m[10] * z;
    return out;
  }
};

export const RayUtils = {
  create: (): Ray => ({ origin: {x:0, y:0, z:0}, direction: {x:0, y:0, z:1} }),
  
  fromScreen: (x: number, y: number, width: number, height: number, invViewProj: Mat4, out: Ray) => {
    const ndcX = (x / width) * 2 - 1;
    const ndcY = 1 - (y / height) * 2;
    const start = { x: ndcX, y: ndcY, z: -1 };
    const end = { x: ndcX, y: ndcY, z: 1 };
    const worldStart = Vec3Utils.create();
    const worldEnd = Vec3Utils.create();
    Vec3Utils.transformMat4(start, invViewProj, worldStart);
    Vec3Utils.transformMat4(end, invViewProj, worldEnd);
    Vec3Utils.copy(out.origin, worldStart);
    Vec3Utils.subtract(worldEnd, worldStart, out.direction);
    Vec3Utils.normalize(out.direction, out.direction);
  },

  intersectSphere: (ray: Ray, center: Vec3, radius: number): number | null => {
    const ocX = ray.origin.x - center.x;
    const ocY = ray.origin.y - center.y;
    const ocZ = ray.origin.z - center.z;
    const a = Vec3Utils.dot(ray.direction, ray.direction);
    const b = 2.0 * (ocX * ray.direction.x + ocY * ray.direction.y + ocZ * ray.direction.z);
    const c = (ocX*ocX + ocY*ocY + ocZ*ocZ) - radius*radius;
    const discriminant = b*b - 4*a*c;
    if (discriminant < 0) return null;
    const t1 = (-b - Math.sqrt(discriminant)) / (2.0*a);
    if (t1 > 0) return t1;
    const t2 = (-b + Math.sqrt(discriminant)) / (2.0*a);
    return t2 > 0 ? t2 : null;
  },

  intersectBox: (ray: Ray, min: Vec3, max: Vec3): number | null => {
    let tmin = (min.x - ray.origin.x) / ray.direction.x;
    let tmax = (max.x - ray.origin.x) / ray.direction.x;
    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];
    let tymin = (min.y - ray.origin.y) / ray.direction.y;
    let tymax = (max.y - ray.origin.y) / ray.direction.y;
    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];
    if ((tmin > tymax) || (tymin > tmax)) return null;
    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;
    let tzmin = (min.z - ray.origin.z) / ray.direction.z;
    let tzmax = (max.z - ray.origin.z) / ray.direction.z;
    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];
    if ((tmin > tzmax) || (tzmin > tmax)) return null;
    if (tzmin > tmin) tmin = tzmin;
    if (tzmax < tmax) tmax = tzmax;
    if (tmax < 0) return null;
    return tmin > 0 ? tmin : tmax;
  }
};

export const Mat4Utils = {
  create: (): Mat4 => new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1]),

  copy: (out: Mat4, a: Mat4): Mat4 => {
    out.set(a);
    return out;
  },

  identity: (out: Mat4): Mat4 => {
    out.fill(0);
    out[0]=1; out[5]=1; out[10]=1; out[15]=1;
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
    if (!det) return null;
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

      if (Math.abs(eyex - centerx) < 1e-6 &&
          Math.abs(eyey - centery) < 1e-6 &&
          Math.abs(eyez - centerz) < 1e-6) {
        return Mat4Utils.identity(out);
      }

      let z0 = eyex - centerx, z1 = eyey - centery, z2 = eyez - centerz;
      let len = 1 / Math.sqrt(z0 * z0 + z1 * z1 + z2 * z2);
      z0 *= len; z1 *= len; z2 *= len;

      let x0 = upy * z2 - upz * z1, x1 = upz * z0 - upx * z2, x2 = upx * z1 - upy * z0;
      len = Math.sqrt(x0 * x0 + x1 * x1 + x2 * x2);
      if (!len) { x0 = 0; x1 = 0; x2 = 0; }
      else { len = 1 / len; x0 *= len; x1 *= len; x2 *= len; }

      let y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
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

  // --- NEW UTILS FOR NODES ---

  translation: (x: number, y: number, z: number, out: Mat4): Mat4 => {
    Mat4Utils.identity(out);
    out[12] = x; out[13] = y; out[14] = z;
    return out;
  },

  rotation: (x: number, y: number, z: number, out: Mat4): Mat4 => {
    const cx = Math.cos(x), sx = Math.sin(x);
    const cy = Math.cos(y), sy = Math.sin(y);
    const cz = Math.cos(z), sz = Math.sin(z);
    
    out[0] = cy * cz;
    out[1] = cz * sx * sy - cx * sz;
    out[2] = cx * cz * sy + sx * sz;
    out[3] = 0;
    out[4] = cy * sz;
    out[5] = cx * cz + sx * sy * sz;
    out[6] = -cz * sx + cx * sy * sz;
    out[7] = 0;
    out[8] = -sy;
    out[9] = cy * sx;
    out[10] = cx * cy;
    out[11] = 0;
    out[12] = 0; out[13] = 0; out[14] = 0; out[15] = 1;
    return out;
  },

  scaling: (x: number, y: number, z: number, out: Mat4): Mat4 => {
    Mat4Utils.identity(out);
    out[0] = x; out[5] = y; out[10] = z;
    return out;
  },

  lerp: (a: Mat4, b: Mat4, t: number, out: Mat4): Mat4 => {
    for (let i = 0; i < 16; i++) out[i] = a[i] + (b[i] - a[i]) * t;
    return out;
  },

  orthographic: (left: number, right: number, bottom: number, top: number, near: number, far: number, out: Mat4): Mat4 => {
    const lr = 1 / (left - right);
    const bt = 1 / (bottom - top);
    const nf = 1 / (near - far);
    out.fill(0);
    out[0] = -2 * lr;
    out[5] = -2 * bt;
    out[10] = 2 * nf;
    out[12] = (left + right) * lr;
    out[13] = (top + bottom) * bt;
    out[14] = (far + near) * nf;
    out[15] = 1;
    return out;
  },

  getTranslation: (mat: Mat4, out: Vec3): Vec3 => {
    out.x = mat[12]; out.y = mat[13]; out.z = mat[14];
    return out;
  },

  getScale: (mat: Mat4, out: Vec3): Vec3 => {
    out.x = Math.sqrt(mat[0]*mat[0] + mat[1]*mat[1] + mat[2]*mat[2]);
    out.y = Math.sqrt(mat[4]*mat[4] + mat[5]*mat[5] + mat[6]*mat[6]);
    out.z = Math.sqrt(mat[8]*mat[8] + mat[9]*mat[9] + mat[10]*mat[10]);
    return out;
  },

  getRotation: (mat: Mat4, out: Vec3): Vec3 => {
    const sy = Math.sqrt(mat[0]*mat[0] + mat[4]*mat[4]);
    if (sy > 1e-6) {
      out.x = Math.atan2(mat[9], mat[10]);
      out.y = Math.atan2(-mat[8], sy);
      out.z = Math.atan2(mat[4], mat[0]);
    } else {
      out.x = Math.atan2(-mat[6], mat[5]);
      out.y = Math.atan2(-mat[8], sy);
      out.z = 0;
    }
    return out;
  },

  // --- ADDED FUNCTION TO FIX ERROR ---
  transformPoint: (v: Vec3, m: Mat4, width: number, height: number) => {
    const x = v.x, y = v.y, z = v.z;
    
    // 1. Multiply by Matrix (ViewProjection)
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    const projX = m[0] * x + m[4] * y + m[8] * z + m[12];
    const projY = m[1] * x + m[5] * y + m[9] * z + m[13];
    const projZ = m[2] * x + m[6] * y + m[10] * z + m[14];

    // 2. Perspective Divide & Viewport Map
    const s = w !== 0 ? 1.0 / w : 1.0;
    // We return 'w' so the caller can check if the point is behind the camera (w <= 0)
    return {
        x: (projX * s) * 0.5 * width + 0.5 * width,
        y: -(projY * s) * 0.5 * height + 0.5 * height, // Flip Y for DOM coordinates
        z: projZ * s,
        w: w
    };
  }
};