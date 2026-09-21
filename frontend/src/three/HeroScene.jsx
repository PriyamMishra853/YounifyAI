import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Edges, Environment, Lightformer, MeshTransmissionMaterial } from '@react-three/drei'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { heroState } from '../lib/motion'
import { MODALITIES, MODALITY_ORDER } from '@younifyai/shared'
import {
  createGlowTexture, createSheetTextures, createShardTextures,
  SHARD_ASPECT, SHEET_ASPECT, SHEET_KINDS,
} from './textures'

const { damp, lerp, clamp } = THREE.MathUtils
const rand = (a, b) => a + Math.random() * (b - a)

/**
 * Where the prism sits and how big it is, derived from the viewport so it
 * reflows on resize and never crowds the headline on narrow (4:3) screens.
 */
function useLayout() {
  const { viewport, size } = useThree()
  const mobile = size.width < 768
  return useMemo(() => {
    if (mobile) return { anchor: new THREE.Vector3(0, viewport.height * 0.22, 0), scale: 0.72 }
    const aspect = viewport.width / viewport.height
    const scale = clamp(viewport.width / 11.5, 0.68, 1)
    const x = viewport.width * (aspect < 1.5 ? 0.27 : 0.21)
    return { anchor: new THREE.Vector3(x, viewport.height * 0.06, 0), scale }
  }, [mobile, viewport.width, viewport.height])
}

/* -------------------------------------------------------------------- prism */

const BACKGROUND = new THREE.Color('#07182A')

function Prism({ anchor, scale, quality }) {
  const spin = useRef()
  const core = useRef()
  const glow = useMemo(() => createGlowTexture(), [])
  // triangular prism lying along the camera axis: the classic "light in, spectrum out" view
  const geometry = useMemo(() => {
    const g = new THREE.CylinderGeometry(1.25, 1.25, 1.5, 3, 1)
    g.rotateX(Math.PI / 2)
    return g
  }, [])

  useFrame((state, dt) => {
    const p = heroState.pointer
    const s = spin.current
    const t = state.clock.elapsedTime
    const kick = Math.min(Math.abs(heroState.velocity) * 0.02, 1.2)
    s.rotation.y = damp(s.rotation.y, p.x * 0.45 + Math.sin(t * 0.35) * 0.25 + heroState.progress * 0.9, 2.5, dt)
    s.rotation.x = damp(s.rotation.x, -p.y * 0.35 + Math.cos(t * 0.3) * 0.12, 2.5, dt)
    s.rotation.z += dt * (0.05 + kick)
    core.current.scale.setScalar(0.2 + Math.sin(t * 2.1) * 0.02 + heroState.progress * 0.08)
    core.current.rotation.x = t * 0.6
    core.current.rotation.y = t * 0.9
  })

  return (
    <group position={anchor} scale={scale}>
      <sprite scale={[5.5, 5.5, 1]} position={[0, 0, -2.5]}>
        <spriteMaterial map={glow} transparent opacity={0.7} depthWrite={false} blending={THREE.AdditiveBlending} />
      </sprite>
      <mesh ref={core}>
        <icosahedronGeometry args={[1, 0]} />
        <meshBasicMaterial color="#F4A900" toneMapped={false} />
      </mesh>
      <group ref={spin}>
        <mesh geometry={geometry}>
          <MeshTransmissionMaterial
            samples={quality === 'high' ? 8 : 4}
            resolution={quality === 'high' ? 768 : 384}
            backside={quality === 'high'}
            backsideThickness={0.3}
            thickness={0.55}
            roughness={0.02}
            ior={1.5}
            chromaticAberration={0.6}
            anisotropicBlur={0.1}
            distortion={0.15}
            distortionScale={0.3}
            temporalDistortion={0.05}
            attenuationDistance={8}
            attenuationColor="#ffffff"
            color="#eef4ff"
            background={BACKGROUND}
          />
          <Edges threshold={15} color="#F4A900" lineWidth={1.6} />
        </mesh>
      </group>
    </group>
  )
}

/* -------------------------------------------------------- input shards (in) */

function Shards({ anchor, count, reduced }) {
  const { viewport } = useThree()
  const textures = useMemo(() => createShardTextures(MODALITY_ORDER.map((k) => MODALITIES[k])), [])
  const meshes = useRef([])
  const vp = useRef(viewport)
  vp.current = viewport

  const shards = useMemo(() => {
    const spawn = (i, initial) => {
      const W = vp.current.width
      const H = vp.current.height
      const fromTop = Math.random() < 0.5
      return {
        i,
        mod: MODALITY_ORDER[i % MODALITY_ORDER.length],
        t: initial ? Math.random() * 0.9 : 0,
        speed: rand(0.045, 0.085),
        start: new THREE.Vector3(-W / 2 - rand(0.5, 3.5), rand(-H * 0.55, H * 0.6), rand(-5, -0.5)),
        ctrl: new THREE.Vector3(rand(-W * 0.25, W * 0.02), (fromTop ? 1 : -1) * rand(0.6, H * 0.45), rand(-2.5, 1)),
        spin: new THREE.Vector3(rand(-0.9, 0.9), rand(-1.2, 1.2), rand(-0.5, 0.5)),
        rot: new THREE.Euler(rand(-1, 1), rand(-1.2, 1.2), rand(-0.6, 0.6)),
        size: rand(0.5, 0.82),
        push: new THREE.Vector3(),
      }
    }
    const list = Array.from({ length: count }, (_, i) => spawn(i, true))
    list.respawn = (s) => Object.assign(s, spawn(s.i, false))
    return list
  }, [count])

  const tmp = useMemo(() => ({ p: new THREE.Vector3(), target: new THREE.Vector3(), cur: new THREE.Vector3() }), [])

  useFrame((state, delta) => {
    const dt = reduced ? 0 : Math.min(delta, 0.05)
    const boost = 1 + heroState.progress * 2.2 + Math.min(Math.abs(heroState.velocity) * 0.04, 2)
    const W = vp.current.width
    const H = vp.current.height
    const px = heroState.pointer.x * (W / 2)
    const py = heroState.pointer.y * (H / 2)
    for (const s of shards) {
      const mesh = meshes.current[s.i]
      if (!mesh) continue
      s.t += dt * s.speed * (0.55 + s.t * 1.4) * boost
      if (s.t >= 1) shards.respawn(s)
      const t = s.t
      const u = 1 - t
      // quadratic bezier: start → control → prism
      tmp.p.set(0, 0, 0)
        .addScaledVector(s.start, u * u)
        .addScaledVector(s.ctrl, 2 * u * t)
        .addScaledVector(anchor, t * t)
      // the cursor pushes shards aside (only before they are captured)
      const dx = tmp.p.x - px
      const dy = tmp.p.y - py
      const d = Math.hypot(dx, dy)
      const R = 1.9
      if (d < R && t < 0.8) tmp.target.set(dx / (d || 1), dy / (d || 1), 0).multiplyScalar((R - d) * 0.9)
      else tmp.target.set(0, 0, 0)
      s.push.lerp(tmp.target, 1 - Math.exp(-6 * Math.max(dt, 0.016)))
      mesh.position.copy(tmp.p).add(s.push)

      const grow = clamp(t / 0.07, 0, 1)
      const shrink = t > 0.74 ? clamp(1 - (t - 0.74) / 0.26, 0, 1) : 1
      mesh.scale.setScalar(s.size * grow * shrink + 0.0001)
      const settle = t > 0.6 ? (t - 0.6) / 0.4 : 0
      mesh.rotation.set(
        lerp(s.rot.x + state.clock.elapsedTime * s.spin.x * (reduced ? 0 : 1), 0, settle),
        lerp(s.rot.y + state.clock.elapsedTime * s.spin.y * (reduced ? 0 : 1), 0, settle),
        lerp(s.rot.z + state.clock.elapsedTime * s.spin.z * (reduced ? 0 : 1), 0, settle),
      )
      mesh.material.opacity = clamp(t / 0.05, 0, 1) * 0.95
    }
  })

  return shards.map((s) => (
    <mesh key={s.i} ref={(m) => { meshes.current[s.i] = m }} renderOrder={1}>
      <planeGeometry args={[SHARD_ASPECT, 1]} />
      <meshBasicMaterial map={textures[s.mod]} transparent side={THREE.DoubleSide} toneMapped={false} depthWrite={false} />
    </mesh>
  ))
}

/* ------------------------------------------------------ document sheets (out) */

function Sheets({ anchor, count = 8, reduced, mobile }) {
  const { viewport } = useThree()
  const textures = useMemo(() => createSheetTextures(), [])
  const meshes = useRef([])
  const clock = useRef(0)
  const tmp = useMemo(() => ({ a: new THREE.Vector3(), b: new THREE.Vector3(), c: new THREE.Vector3() }), [])

  useFrame((state, delta) => {
    const dt = reduced ? 0 : Math.min(delta, 0.05)
    clock.current += dt * (0.032 + heroState.progress * 0.05)
    const exitX = viewport.width / 2 + 2.2
    for (let i = 0; i < count; i++) {
      const m = meshes.current[i]
      if (!m) continue
      const t = (clock.current + i / count) % 1
      // phase 1 (0 → 0.16): printed out of the prism, turning from edge-on to face-on
      // phase 2 (0.16 → 1): glide right in an orderly line
      tmp.a.copy(anchor).add(tmp.c.set(0.2, -0.05, 0.2))
      tmp.b.set(anchor.x + (mobile ? 0.6 : 1.35), anchor.y - (mobile ? 1.9 : 0.45), 0.9)
      if (t < 0.16) {
        const k = t / 0.16
        const e = 1 - Math.pow(1 - k, 3)
        m.position.lerpVectors(tmp.a, tmp.b, e)
        m.rotation.set(-0.04, lerp(-1.5, -0.42, e), 0.02)
        m.scale.setScalar(lerp(0.15, 1, e))
      } else {
        const k = (t - 0.16) / 0.84
        m.position.set(
          lerp(tmp.b.x, exitX, k),
          tmp.b.y - k * (mobile ? 0.6 : 0.55),
          lerp(tmp.b.z, 1.4, k),
        )
        m.rotation.set(-0.04, -0.42, 0.02)
        m.scale.setScalar(1)
      }
      m.material.opacity = t < 0.04 ? t / 0.04 : 1
    }
  })

  const h = mobile ? 1.05 : 1.3
  return Array.from({ length: count }, (_, i) => (
    <mesh key={i} ref={(m) => { meshes.current[i] = m }} renderOrder={2}>
      <planeGeometry args={[h * SHEET_ASPECT, h]} />
      <meshBasicMaterial map={textures[SHEET_KINDS[i % SHEET_KINDS.length]]} transparent toneMapped={false} side={THREE.DoubleSide} />
    </mesh>
  ))
}

/* ------------------------------------------------------------- dust + rig */

function Dust({ count = 420 }) {
  const ref = useRef()
  const positions = useMemo(() => {
    const a = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      a[i * 3] = rand(-14, 14)
      a[i * 3 + 1] = rand(-8, 8)
      a[i * 3 + 2] = rand(-12, 2)
    }
    return a
  }, [count])
  useFrame((_, dt) => {
    ref.current.position.x = (ref.current.position.x + dt * 0.12) % 4
  })
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial size={0.035} color="#8FA3B8" transparent opacity={0.45} sizeAttenuation depthWrite={false} />
    </points>
  )
}

/** Pointer parallax at rest; as the hero is scrolled, the camera flies into the prism. */
function Rig({ anchor }) {
  const look = useMemo(() => new THREE.Vector3(), [])
  useFrame((state, dt) => {
    const p = heroState.pointer
    const pr = heroState.progress
    const e = pr * pr * (3 - 2 * pr) // smoothstep
    const cam = state.camera
    cam.position.x = damp(cam.position.x, p.x * 0.55 * (1 - e) + anchor.x * e * 0.9, 2.5, dt)
    cam.position.y = damp(cam.position.y, p.y * 0.35 * (1 - e) + anchor.y * e, 2.5, dt)
    cam.position.z = damp(cam.position.z, 10 - e * 5.4, 2.5, dt)
    look.set(anchor.x * e, anchor.y * e, 0)
    cam.lookAt(look)
  })
  return null
}

function Scene({ reduced, quality }) {
  const { size } = useThree()
  const mobile = size.width < 768
  const { anchor, scale } = useLayout()
  return (
    <>
      <color attach="background" args={['#07182A']} />
      <fog attach="fog" args={['#07182A', 9, 22]} />
      <Environment resolution={256} frames={1}>
        <Lightformer form="rect" intensity={3} position={[0, 4, 6]} scale={[10, 2, 1]} color="#ffffff" />
        <Lightformer form="rect" intensity={2.4} position={[-6, 0, 2]} rotation-y={Math.PI / 2} scale={[8, 3, 1]} color="#7aa2ff" />
        <Lightformer form="rect" intensity={3.2} position={[6, -1, 2]} rotation-y={-Math.PI / 2} scale={[8, 3, 1]} color="#F4A900" />
        <Lightformer form="ring" intensity={2} position={[0, 0, -6]} scale={4} color="#ffffff" />
      </Environment>
      <Dust count={mobile ? 180 : 420} />
      <Shards anchor={anchor} count={mobile ? 18 : 34} reduced={reduced} />
      <Prism anchor={anchor} scale={scale} quality={quality} />
      <Sheets anchor={anchor} count={mobile ? 5 : 8} reduced={reduced} mobile={mobile} />
      {!reduced && <Rig anchor={anchor} />}
    </>
  )
}

export default function HeroScene({ active = true, reduced = false }) {
  const quality = useMemo(() => {
    const cores = navigator.hardwareConcurrency || 4
    return window.innerWidth < 768 || cores <= 4 ? 'low' : 'high'
  }, [])

  // pointer is tracked even without the custom cursor (e.g. trackpads with reduced cursor)
  useEffect(() => {
    const onMove = (e) => {
      heroState.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      heroState.pointer.y = -((e.clientY / window.innerHeight) * 2 - 1)
    }
    window.addEventListener('pointermove', onMove, { passive: true })
    return () => window.removeEventListener('pointermove', onMove)
  }, [])

  return (
    <Canvas
      dpr={[1, quality === 'high' ? 1.75 : 1.25]}
      camera={{ position: [0, 0, 10], fov: 35, near: 0.1, far: 60 }}
      gl={{ antialias: true, powerPreference: 'high-performance', alpha: false }}
      frameloop={reduced ? 'demand' : active ? 'always' : 'never'}
      aria-hidden="true"
    >
      <Scene reduced={reduced} quality={quality} />
    </Canvas>
  )
}
