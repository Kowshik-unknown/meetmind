"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { signal } from "@/lib/signal";

// Ashima 3D simplex noise
const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 permute(vec4 x){return mod289(((x*34.0)+1.0)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0);
  const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy));
  vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz);
  vec3 l=1.0-g;
  vec3 i1=min(g.xyz,l.zxy);
  vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx;
  vec3 x2=x0-i2+C.yyy;
  vec3 x3=x0-D.yyy;
  i=mod289(i);
  vec4 p=permute(permute(permute(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857;
  vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z);
  vec4 x_=floor(j*ns.z);
  vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy;
  vec4 y=y_*ns.x+ns.yyyy;
  vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy);
  vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0;
  vec4 s1=floor(b1)*2.0+1.0;
  vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;
  vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x);
  vec3 p1=vec3(a0.zw,h.y);
  vec3 p2=vec3(a1.xy,h.z);
  vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0);
  m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}
`;

// Shared palette: cyan → violet → magenta; "thinking" pushes toward magenta/amber.
const PALETTE = /* glsl */ `
uniform float uThink;
vec3 palette(float t){
  vec3 cyan=vec3(0.37,0.91,1.0);
  vec3 violet=vec3(0.55,0.48,1.0);
  vec3 magenta=vec3(1.0,0.37,0.82);
  vec3 amber=vec3(1.0,0.77,0.42);
  vec3 c=mix(cyan,violet,smoothstep(0.0,0.5,t));
  c=mix(c,magenta,smoothstep(0.5,1.0,t));
  vec3 hot=mix(magenta,amber,t);
  return mix(c,hot,uThink*0.75);
}
`;

type Uniforms = {
  uTime: { value: number };
  uLevel: { value: number };
  uThink: { value: number };
  uFlash: { value: number };
  uPixelRatio: { value: number };
};

function fibonacciSphere(n: number, r: number) {
  const pos = new Float32Array(n * 3);
  const rnd = new Float32Array(n);
  const golden = Math.PI * (3 - Math.sqrt(5));
  for (let i = 0; i < n; i++) {
    const y = 1 - (i / (n - 1)) * 2;
    const rad = Math.sqrt(1 - y * y);
    const th = golden * i;
    pos.set([Math.cos(th) * rad * r, y * r, Math.sin(th) * rad * r], i * 3);
    rnd[i] = Math.random();
  }
  return { pos, rnd };
}

function buildSynapses(nodes: number, maxDist: number, maxEdges: number) {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i < nodes; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(2.1 + Math.random() * 1.5);
    pts.push(v);
  }
  const pos: number[] = [];
  const t: number[] = [];
  const seed: number[] = [];
  let edges = 0;
  for (let i = 0; i < nodes && edges < maxEdges; i++) {
    for (let j = i + 1; j < nodes && edges < maxEdges; j++) {
      if (pts[i].distanceTo(pts[j]) < maxDist) {
        pos.push(pts[i].x, pts[i].y, pts[i].z, pts[j].x, pts[j].y, pts[j].z);
        t.push(0, 1);
        const s = Math.random();
        seed.push(s, s);
        edges++;
      }
    }
  }
  const nodePos = new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z]));
  return {
    lines: { pos: new Float32Array(pos), t: new Float32Array(t), seed: new Float32Array(seed) },
    nodePos,
  };
}

function useSceneUniforms(): Uniforms {
  return useMemo(
    () => ({
      uTime: { value: 0 },
      uLevel: { value: 0 },
      uThink: { value: 0 },
      uFlash: { value: 0 },
      uPixelRatio: { value: 1 },
    }),
    [],
  );
}

function ParticleSphere({ u }: { u: Uniforms }) {
  const { geometry, material } = useMemo(() => {
    const { pos, rnd } = fibonacciSphere(3200, 2.15);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aRnd", new THREE.BufferAttribute(rnd, 1));
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uLevel, uFlash, uPixelRatio;
        attribute float aRnd;
        varying float vN;
        varying float vA;
        ${NOISE}
        void main(){
          vec3 n = normalize(position);
          float t = uTime * 0.18;
          float nz = snoise(n * 1.35 + vec3(t, t * 0.7, -t));
          float fine = snoise(n * 4.0 - vec3(t * 2.0));
          float amp = 0.22 + uLevel * 0.95 + uFlash * 0.25;
          vec3 p = position + n * (nz * amp + fine * 0.05 * (1.0 + uLevel * 3.0));
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float size = (1.6 + aRnd * 2.6) * (1.0 + uLevel * 1.4 + uFlash * 0.6);
          gl_PointSize = size * uPixelRatio * (6.0 / -mv.z);
          vN = nz * 0.5 + 0.5;
          // twinkle
          vA = 0.35 + 0.65 * (0.5 + 0.5 * sin(uTime * (0.6 + aRnd * 2.0) + aRnd * 40.0));
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vN;
        varying float vA;
        uniform float uFlash;
        ${PALETTE}
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          a *= a;
          vec3 c = palette(vN) * (1.0 + uFlash * 0.8);
          gl_FragColor = vec4(c, a * vA * 0.85);
        }
      `,
    });
    return { geometry: g, material: m };
  }, [u]);
  return <points geometry={geometry} material={material} />;
}

function Synapses({ u }: { u: Uniforms }) {
  const { lineGeo, lineMat, nodeGeo, nodeMat } = useMemo(() => {
    const { lines, nodePos } = buildSynapses(240, 1.05, 900);
    const lg = new THREE.BufferGeometry();
    lg.setAttribute("position", new THREE.BufferAttribute(lines.pos, 3));
    lg.setAttribute("aT", new THREE.BufferAttribute(lines.t, 1));
    lg.setAttribute("aSeed", new THREE.BufferAttribute(lines.seed, 1));
    const lm = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        attribute float aT;
        attribute float aSeed;
        varying float vT;
        varying float vSeed;
        varying float vDepth;
        void main(){
          vT = aT; vSeed = aSeed;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vDepth = smoothstep(-12.0, -4.0, mv.z);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uTime, uLevel, uFlash;
        varying float vT;
        varying float vSeed;
        varying float vDepth;
        ${PALETTE}
        void main(){
          float speed = 0.18 + vSeed * 0.35 + uLevel * 0.8 + uThink * 0.6;
          float head = fract(uTime * speed + vSeed * 7.0);
          float pulse = smoothstep(0.14, 0.0, abs(vT - head)) * step(0.55, fract(vSeed * 13.7));
          float base = 0.045 + uLevel * 0.08 + uThink * 0.05;
          float a = (base + pulse * (0.75 + uLevel)) * vDepth + uFlash * 0.12;
          gl_FragColor = vec4(palette(fract(vSeed + vT * 0.3)), a);
        }
      `,
    });

    const ng = new THREE.BufferGeometry();
    ng.setAttribute("position", new THREE.BufferAttribute(nodePos, 3));
    const nm = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uLevel, uPixelRatio;
        varying float vK;
        void main(){
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          vK = fract(sin(dot(position.xy, vec2(12.9898, 78.233))) * 43758.5453);
          float beat = 0.6 + 0.4 * sin(uTime * 2.0 + vK * 30.0);
          gl_PointSize = (5.0 + uLevel * 10.0) * beat * uPixelRatio * (6.0 / -mv.z);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vK;
        ${PALETTE}
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float core = smoothstep(0.18, 0.0, d);
          float halo = smoothstep(0.5, 0.0, d) * 0.35;
          gl_FragColor = vec4(palette(vK), core + halo);
        }
      `,
    });
    return { lineGeo: lg, lineMat: lm, nodeGeo: ng, nodeMat: nm };
  }, [u]);

  return (
    <>
      <lineSegments geometry={lineGeo} material={lineMat} />
      <points geometry={nodeGeo} material={nodeMat} />
    </>
  );
}

function Core({ u }: { u: Uniforms }) {
  const ref = useRef<THREE.Mesh>(null);
  const { geometry, material } = useMemo(() => {
    const g = new THREE.IcosahedronGeometry(0.85, 24);
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uLevel, uThink;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vNz;
        ${NOISE}
        void main(){
          float t = uTime * (0.35 + uThink * 0.8);
          float nz = snoise(normal * 1.8 + t);
          vec3 p = position + normal * nz * (0.12 + uLevel * 0.45);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vNormal = normalize(normalMatrix * normal);
          vView = normalize(-mv.xyz);
          vNz = nz;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uLevel, uFlash;
        varying vec3 vNormal;
        varying vec3 vView;
        varying float vNz;
        ${PALETTE}
        void main(){
          float fres = pow(1.0 - max(dot(vNormal, vView), 0.0), 2.2);
          vec3 c = palette(0.5 + vNz * 0.5);
          float a = fres * (0.75 + uLevel * 0.8 + uFlash * 0.6) + 0.04;
          gl_FragColor = vec4(c * (1.2 + uThink * 0.6), a);
        }
      `,
    });
    return { geometry: g, material: m };
  }, [u]);
  return <mesh ref={ref} geometry={geometry} material={material} />;
}

function Dust({ u }: { u: Uniforms }) {
  const { geometry, material } = useMemo(() => {
    const n = 1400;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos.set([(Math.random() - 0.5) * 30, (Math.random() - 0.5) * 20, -Math.random() * 18 + 2], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: u,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uPixelRatio;
        varying float vA;
        void main(){
          vec3 p = position;
          float k = fract(sin(dot(position.xz, vec2(12.98, 78.23))) * 43758.5);
          p.y = mod(p.y + uTime * (0.05 + k * 0.12) + 10.0, 20.0) - 10.0;
          p.x += sin(uTime * 0.2 + k * 20.0) * 0.3;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          gl_PointSize = (1.0 + k * 2.0) * uPixelRatio * (8.0 / -mv.z);
          vA = 0.25 + 0.5 * k;
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vA;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          gl_FragColor = vec4(0.7, 0.75, 1.0, smoothstep(0.5, 0.0, d) * vA);
        }
      `,
    });
    return { geometry: g, material: m };
  }, [u]);
  return <points geometry={geometry} material={material} />;
}

function Scene() {
  const u = useSceneUniforms();
  const brain = useRef<THREE.Group>(null);
  const { camera, gl } = useThree();
  const smooth = useRef({ level: 0, think: 0, flash: 0, pulse: 0, scroll: 0, mx: 0, my: 0 });

  useFrame((state, dt) => {
    const s = smooth.current;
    const d = Math.min(dt, 0.05);
    const k = (rate: number) => 1 - Math.exp(-rate * d);

    s.level += (signal.level - s.level) * k(signal.level > s.level ? 18 : 4);
    s.think += (signal.thinking - s.think) * k(2.5);
    if (signal.pulse !== s.pulse) {
      s.pulse = signal.pulse;
      s.flash = 1;
    }
    s.flash *= Math.exp(-3.2 * d);

    const scroll = typeof window !== "undefined" ? Math.min(1, window.scrollY / window.innerHeight) : 0;
    s.scroll += (scroll - s.scroll) * k(5);
    s.mx += (state.pointer.x - s.mx) * k(2);
    s.my += (state.pointer.y - s.my) * k(2);

    u.uTime.value += d;
    u.uLevel.value = s.level;
    u.uThink.value = s.think;
    u.uFlash.value = s.flash;
    u.uPixelRatio.value = gl.getPixelRatio();

    if (brain.current) {
      const g = brain.current;
      g.rotation.y += d * (0.06 + s.level * 0.5 + s.think * 0.45);
      g.rotation.x = Math.sin(u.uTime.value * 0.1) * 0.15 + s.my * 0.25;
      g.rotation.z = s.mx * -0.12;
      // On scroll the brain recedes up-right so the workspace stays readable.
      g.position.set(s.scroll * 1.8, s.scroll * 0.9, -s.scroll * 2.5);
      g.scale.setScalar(1 + s.level * 0.12 + s.flash * 0.04);
    }

    camera.position.x = s.mx * 0.6;
    camera.position.y = s.my * 0.4;
    camera.lookAt(0, 0, 0);
  });

  return (
    <>
      <group ref={brain}>
        <Core u={u} />
        <ParticleSphere u={u} />
        <Synapses u={u} />
      </group>
      <Dust u={u} />
    </>
  );
}

export default function NeuralBackground() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0" aria-hidden>
      {/* aurora wash behind the canvas */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,rgba(91,77,255,0.22),transparent_70%),radial-gradient(40%_40%_at_85%_10%,rgba(255,79,196,0.14),transparent_70%),radial-gradient(45%_45%_at_10%_90%,rgba(94,231,255,0.12),transparent_70%)]" />
      <Canvas
        dpr={[1, 1.75]}
        camera={{ position: [0, 0, 7.2], fov: 50 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        eventSource={typeof document !== "undefined" ? document.body : undefined}
        eventPrefix="client"
      >
        <Scene />
      </Canvas>
      {/* vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_40%,transparent_55%,rgba(4,5,13,0.9))]" />
    </div>
  );
}
