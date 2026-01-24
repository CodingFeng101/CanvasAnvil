import React, { useEffect, useMemo, useRef } from "react"
import * as THREE from "three"
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js"
import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js"
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js"

export function Cad3DPreview({
  svg,
  depth = 240,
  meshUrl,
  sectionCut = true,
}: {
  svg?: string
  depth?: number
  meshUrl?: string
  sectionCut?: boolean
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null)
  const sceneRef = useRef<THREE.Scene | null>(null)
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const meshGroupRef = useRef<THREE.Group | null>(null)
  const rafRef = useRef<number | null>(null)

  const parsedSvg = useMemo(() => {
    if (!svg) return null
    try {
      const loader = new SVGLoader();
      return loader.parse(svg);
    } catch (e) {
      console.error("SVG Parse Error", e);
      return null
    }
  }, [svg])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const scene = new THREE.Scene()
    scene.background = new THREE.Color(0xf7f7f8)
    sceneRef.current = scene

    const camera = new THREE.PerspectiveCamera(
      45,
      container.clientWidth / container.clientHeight,
      0.1,
      10000
    )
    camera.position.set(0, 200, 400)
    cameraRef.current = camera

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setPixelRatio(window.devicePixelRatio || 1)
    renderer.setSize(container.clientWidth, container.clientHeight)
    renderer.localClippingEnabled = true
    rendererRef.current = renderer
    container.appendChild(renderer.domElement)

    const controls = new OrbitControls(camera, renderer.domElement)
    controls.enableDamping = true
    controls.dampingFactor = 0.08
    controlsRef.current = controls

    const ambient = new THREE.AmbientLight(0xffffff, 0.75)
    scene.add(ambient)
    const dir = new THREE.DirectionalLight(0xffffff, 0.85)
    dir.position.set(200, 400, 300)
    scene.add(dir)

    const grid = new THREE.GridHelper(800, 40, 0xd1d5db, 0xe5e7eb)
    grid.position.y = -1
    scene.add(grid)

    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      rafRef.current = requestAnimationFrame(animate)
    }
    animate()

    const onResize = () => {
      const c = containerRef.current
      const r = rendererRef.current
      const cam = cameraRef.current
      if (!c || !r || !cam) return
      cam.aspect = c.clientWidth / c.clientHeight
      cam.updateProjectionMatrix()
      r.setSize(c.clientWidth, c.clientHeight)
    }

    window.addEventListener("resize", onResize)

    return () => {
      window.removeEventListener("resize", onResize)
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      controls.dispose()
      renderer.dispose()
      if (renderer.domElement.parentElement === container) {
        container.removeChild(renderer.domElement)
      }
      scene.clear()
      rendererRef.current = null
      sceneRef.current = null
      cameraRef.current = null
      controlsRef.current = null
      meshGroupRef.current = null
    }
  }, [])

  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return

    if (meshGroupRef.current) {
      scene.remove(meshGroupRef.current)
      meshGroupRef.current.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if ((mesh as any).geometry) (mesh as any).geometry.dispose?.()
        if ((mesh as any).material) {
          const mat = (mesh as any).material
          if (Array.isArray(mat)) mat.forEach((m) => m.dispose?.())
          else mat.dispose?.()
        }
      })
      meshGroupRef.current = null
    }

    const clippingPlane = sectionCut ? new THREE.Plane(new THREE.Vector3(1, 0, 0), 0) : null

    const centerAndFrame = (group: THREE.Group) => {
      const box = new THREE.Box3().setFromObject(group)
      const size = new THREE.Vector3()
      box.getSize(size)
      const center = new THREE.Vector3()
      box.getCenter(center)
      group.position.x -= center.x
      group.position.z -= center.z

      const camera = cameraRef.current
      const controls = controlsRef.current
      if (camera && controls) {
        const maxDim = Math.max(size.x, size.y, size.z, 1)
        camera.position.set(0, maxDim * 0.9, maxDim * 1.4)
        controls.target.set(0, 0, 0)
        controls.update()
      }
    }

    if (meshUrl) {
      const loader = new STLLoader()
      let canceled = false
      loader.load(
        meshUrl,
        (geometry) => {
          if (canceled) return
          geometry.computeVertexNormals()
          geometry.computeBoundingBox()
          const material = new THREE.MeshBasicMaterial({
            color: 0xe5e7eb,
            transparent: true,
            opacity: 0.18,
            side: THREE.DoubleSide,
            depthWrite: false,
            clippingPlanes: clippingPlane ? [clippingPlane] : undefined,
          })
          const mesh = new THREE.Mesh(geometry, material)
          mesh.rotation.x = -Math.PI / 2

          const edgesGeom = new THREE.EdgesGeometry(geometry, 18)
          const edgesMat = new THREE.LineBasicMaterial({
            color: 0x111827,
            transparent: true,
            opacity: 0.75,
            clippingPlanes: clippingPlane ? [clippingPlane] : undefined,
          })
          const edges = new THREE.LineSegments(edgesGeom, edgesMat)
          edges.rotation.x = -Math.PI / 2

          const group = new THREE.Group()
          group.add(mesh)
          group.add(edges)
          scene.add(group)
          meshGroupRef.current = group
          centerAndFrame(group)
        },
        undefined,
        (error) => {
          if (canceled) return
          console.error("STL Load Error", error)
        }
      )
      return () => {
        canceled = true
      }
    }

    if (!parsedSvg) return

    const group = new THREE.Group()
    group.rotation.x = -Math.PI / 2

    const paths = parsedSvg.paths || []
    
    paths.forEach((path, i) => {
        const fillColor = path.userData?.style?.fill;
        const strokeColor = path.userData?.style?.stroke;

        // 1. Handle Fills (Extruded Meshes)
        if (fillColor !== undefined && fillColor !== 'none') {
             const shapes = SVGLoader.createShapes(path);
             shapes.forEach(shape => {
                 const geom = new THREE.ExtrudeGeometry(shape, { depth: depth, bevelEnabled: false });
                 // Center geometry locally if needed, but here we want absolute positioning relative to group
                 // geom.center() // Do NOT center individual parts, or they lose relative position
                 
                 const mat = new THREE.MeshBasicMaterial({ 
                     color: 0xd1d5db,
                     transparent: true,
                     opacity: 0.22,
                     side: THREE.DoubleSide,
                     depthWrite: false,
                     clippingPlanes: clippingPlane ? [clippingPlane] : undefined,
                 });
                 const mesh = new THREE.Mesh(geom, mat);
                 // Add small Z offset to prevent z-fighting and allow "painters algorithm" in 3D height
                 mesh.position.z = i * 0.1; 
                 group.add(mesh);
             });
        }

        // 2. Handle Strokes (Lines/Walls)
        if (strokeColor !== undefined && strokeColor !== 'none') {
             const shapes = SVGLoader.createShapes(path);
             // If createShapes returns empty for strokes, we can manually render lines
             // But usually for CAD, strokes might define walls. 
             // Let's render them as thick lines (using Tubes or just Lines) slightly above the floor
             
             path.subPaths.forEach(subPath => {
                 const points = subPath.getPoints();
                 const geometry = new THREE.BufferGeometry().setFromPoints(points);
                 const material = new THREE.LineBasicMaterial({ 
                     color: strokeColor === '#000000' ? 0x333333 : strokeColor,
                     linewidth: 2,
                     clippingPlanes: clippingPlane ? [clippingPlane] : undefined,
                 });
                 
                 const line = new THREE.Line(geometry, material);
                 // Lift lines slightly above the extruded floor (assuming floor is at z=0 to z=depth)
                 // If floor is extruded by 'depth', we want lines on top surface
                 line.position.z = depth + 0.5 + (i * 0.01);
                 group.add(line);
             });
        }
    });

    scene.add(group)
    meshGroupRef.current = group
    centerAndFrame(group)
  }, [parsedSvg, depth, meshUrl, sectionCut])

  return <div ref={containerRef} className="w-full h-full" />
}
