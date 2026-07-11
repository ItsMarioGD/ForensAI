import { Vec3, Quat, Mat4 } from '../core/types';

export function vec3(x: number, y: number, z: number): Vec3 {
  return { x, y, z };
}

export function vec3Add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

export function vec3Sub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

export function vec3Scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s };
}

export function vec3Dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

export function vec3Cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

export function vec3Length(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

export function vec3LengthSq(v: Vec3): number {
  return v.x * v.x + v.y * v.y + v.z * v.z;
}

export function vec3Normalize(v: Vec3): Vec3 {
  const len = vec3Length(v);
  if (len < 0.00001) return { x: 0, y: 0, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function vec3Lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}

export function vec3Dist(a: Vec3, b: Vec3): number {
  return vec3Length(vec3Sub(a, b));
}

export function vec3Project(v: Vec3, onto: Vec3): Vec3 {
  const dot = vec3Dot(v, onto);
  const lenSq = vec3LengthSq(onto);
  if (lenSq < 0.00001) return { x: 0, y: 0, z: 0 };
  const s = dot / lenSq;
  return { x: onto.x * s, y: onto.y * s, z: onto.z * s };
}

export function vec3Reflect(v: Vec3, normal: Vec3): Vec3 {
  const dot = vec3Dot(v, normal);
  return { x: v.x - 2 * dot * normal.x, y: v.y - 2 * dot * normal.y, z: v.z - 2 * dot * normal.z };
}

export function quat(x: number, y: number, z: number, w: number): Quat {
  return { x, y, z, w };
}

export function quatIdentity(): Quat {
  return { x: 0, y: 0, z: 0, w: 1 };
}

export function quatMultiply(a: Quat, b: Quat): Quat {
  return {
    x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
    y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
    z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
    w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z,
  };
}

export function quatConjugate(q: Quat): Quat {
  return { x: -q.x, y: -q.y, z: -q.z, w: q.w };
}

export function quatNormalize(q: Quat): Quat {
  const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
  if (len < 0.00001) return quatIdentity();
  return { x: q.x / len, y: q.y / len, z: q.z / len, w: q.w / len };
}

export function quatFromAngleAxis(angle: number, axis: Vec3): Quat {
  const half = angle * 0.5;
  const s = Math.sin(half);
  const len = vec3Length(axis);
  if (len < 0.00001) return quatIdentity();
  return { x: (axis.x / len) * s, y: (axis.y / len) * s, z: (axis.z / len) * s, w: Math.cos(half) };
}

export function quatRotateVector(q: Quat, v: Vec3): Vec3 {
  const qv: Vec3 = { x: q.x, y: q.y, z: q.z };
  const uv = vec3Cross(qv, v);
  const uuv = vec3Cross(qv, uv);
  const s = q.w;
  return {
    x: v.x + 2 * (uv.x * s + uuv.x),
    y: v.y + 2 * (uv.y * s + uuv.y),
    z: v.z + 2 * (uv.z * s + uuv.z),
  };
}

export function quatSlerp(a: Quat, b: Quat, t: number): Quat {
  let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
  let qb = { ...b };

  if (dot < 0) {
    dot = -dot;
    qb = { x: -b.x, y: -b.y, z: -b.z, w: -b.w };
  }

  if (dot > 0.9995) {
    return quatNormalize({
      x: a.x + (qb.x - a.x) * t,
      y: a.y + (qb.y - a.y) * t,
      z: a.z + (qb.z - a.z) * t,
      w: a.w + (qb.w - a.w) * t,
    });
  }

  const theta = Math.acos(dot);
  const sinTheta = Math.sin(theta);
  const scaleA = Math.sin((1 - t) * theta) / sinTheta;
  const scaleB = Math.sin(t * theta) / sinTheta;

  return {
    x: a.x * scaleA + qb.x * scaleB,
    y: a.y * scaleA + qb.y * scaleB,
    z: a.z * scaleA + qb.z * scaleB,
    w: a.w * scaleA + qb.w * scaleB,
  };
}

export function mat4Identity(): Mat4 {
  const e = new Float32Array(16);
  e[0] = 1; e[5] = 1; e[10] = 1; e[15] = 1;
  return { elements: e };
}

export function mat4FromTransform(position: Vec3, rotation: Quat, scale: Vec3): Mat4 {
  const qx = rotation.x, qy = rotation.y, qz = rotation.z, qw = rotation.w;
  const sx = scale.x, sy = scale.y, sz = scale.z;
  const e = new Float32Array(16);

  e[0] = (1 - 2 * (qy * qy + qz * qz)) * sx;
  e[1] = (2 * (qx * qy + qw * qz)) * sx;
  e[2] = (2 * (qx * qz - qw * qy)) * sx;
  e[3] = 0;
  e[4] = (2 * (qx * qy - qw * qz)) * sy;
  e[5] = (1 - 2 * (qx * qx + qz * qz)) * sy;
  e[6] = (2 * (qy * qz + qw * qx)) * sy;
  e[7] = 0;
  e[8] = (2 * (qx * qz + qw * qy)) * sz;
  e[9] = (2 * (qy * qz - qw * qx)) * sz;
  e[10] = (1 - 2 * (qx * qx + qy * qy)) * sz;
  e[11] = 0;
  e[12] = position.x;
  e[13] = position.y;
  e[14] = position.z;
  e[15] = 1;

  return { elements: e };
}

export function mat4Multiply(a: Mat4, b: Mat4): Mat4 {
  const ae = a.elements, be = b.elements;
  const e = new Float32Array(16);

  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) {
        sum += ae[i * 4 + k] * be[k * 4 + j];
      }
      e[i * 4 + j] = sum;
    }
  }

  return { elements: e };
}

export function mat4Invert(m: Mat4): Mat4 | null {
  const e = m.elements;
  const a00 = e[0], a01 = e[1], a02 = e[2], a03 = e[3];
  const a10 = e[4], a11 = e[5], a12 = e[6], a13 = e[7];
  const a20 = e[8], a21 = e[9], a22 = e[10], a23 = e[11];
  const a30 = e[12], a31 = e[13], a32 = e[14], a33 = e[15];

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

  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (Math.abs(det) < 0.00001) return null;

  const inv = new Float32Array(16);
  inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) / det;
  inv[1] = (-a01 * b11 + a02 * b10 - a03 * b09) / det;
  inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) / det;
  inv[3] = (-a21 * b05 + a22 * b04 - a23 * b03) / det;
  inv[4] = (-a10 * b11 + a12 * b08 - a13 * b07) / det;
  inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) / det;
  inv[6] = (-a30 * b05 + a32 * b02 - a33 * b01) / det;
  inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) / det;
  inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) / det;
  inv[9] = (-a00 * b10 + a01 * b08 - a03 * b06) / det;
  inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) / det;
  inv[11] = (-a20 * b04 + a21 * b02 - a23 * b00) / det;
  inv[12] = (-a10 * b09 + a11 * b07 - a12 * b06) / det;
  inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) / det;
  inv[14] = (-a30 * b03 + a31 * b01 - a32 * b00) / det;
  inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) / det;

  return { elements: inv };
}

export function mat4TransformPoint(m: Mat4, v: Vec3): Vec3 {
  const e = m.elements;
  const x = v.x * e[0] + v.y * e[4] + v.z * e[8] + e[12];
  const y = v.x * e[1] + v.y * e[5] + v.z * e[9] + e[13];
  const z = v.x * e[2] + v.y * e[6] + v.z * e[10] + e[14];
  const w = v.x * e[3] + v.y * e[7] + v.z * e[11] + e[15];
  if (Math.abs(w) > 0.00001) {
    return { x: x / w, y: y / w, z: z / w };
  }
  return { x, y, z };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function degToRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

export function radToDeg(radians: number): number {
  return radians * (180 / Math.PI);
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

export function gaussianRandom(mean: number = 0, stdDev: number = 1): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return mean + stdDev * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function hermiteInterpolate(p0: number, p1: number, t0: number, t1: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  const h00 = 2 * t3 - 3 * t2 + 1;
  const h10 = t3 - 2 * t2 + t;
  const h01 = -2 * t3 + 3 * t2;
  const h11 = t3 - t2;
  return h00 * p0 + h10 * t0 + h01 * p1 + h11 * t1;
}