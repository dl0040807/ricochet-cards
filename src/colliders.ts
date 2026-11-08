import {
  Box3,
  BoxGeometry,
  MeshBasicMaterial,
  Object3D,
  Mesh,
  PhysicsBody,
  PhysicsShape,
  PhysicsState,
  Vector3,
  XRMesh,
  XRPlane,
  createSystem,
} from '@iwsdk/core';

// How many real-room surfaces became colliders. throw.ts falls back to table mode when 0.
export const scan = { colliders: 0, proxies: [] as Object3D[] }; // proxies: invisible boxes for pinch-to-place raycasts

const HARD_PLANE = new Set(['wall', 'ceiling', 'floor', 'table', 'desk', 'door', 'screen', 'shelf', 'storage']);
const THICK = 0.1; // thick box so a fast card can't tunnel through a zero-thickness plane
const box = new Box3();
const size = new Vector3();
const center = new Vector3();

export class SceneColliderSystem extends createSystem({
  planes: { required: [XRPlane] },
  meshes: { required: [XRMesh] },
}) {
  init() {
    this.cleanupFuncs.push(
      this.queries.planes.subscribe('qualify', (e) => {
        const label = (e.getValue(XRPlane, '_plane') as { semanticLabel?: string } | undefined)?.semanticLabel ?? '';
        if (label && !HARD_PLANE.has(label)) return;
        const m = e.object3D as Mesh;
        box.setFromObject(m); // world box of the polygon
        box.getSize(size);
        // thin axis = plane normal in world space; fatten it
        const thin = size.x < size.y && size.x < size.z ? 'x' : size.y < size.z ? 'y' : 'z';
        size[thin] = THICK;
        this.addStatic(e, [size.x, size.y, size.z], box.getCenter(center));
      }),
      this.queries.meshes.subscribe('qualify', (e) => {
        if (!e.getValue(XRMesh, 'isBounded3D')) return; // ponytail: full room mesh (TriMesh) only if boxes are too rough
        const label = e.getValue(XRMesh, 'semanticLabel') as string;
        if (/sofa|couch|bed|cushion/i.test(label)) return; // soft furniture: skip (absorb rule comes later)
        const m = e.object3D as Mesh;
        box.setFromObject(m);
        box.getSize(size);
        this.addStatic(e, [size.x, size.y, size.z], box.getCenter(center));
      }),
    );
  }

  private addStatic(e: any, dims: [number, number, number], worldCenter: Vector3) {
    // The shape is centered on the object origin; recenter the object on the box.
    e.object3D.position.copy(worldCenter);
    e.object3D.quaternion.identity(); // dims are an axis-aligned world box
    e.addComponent(PhysicsShape, { shape: 'Box', dimensions: dims, restitution: 0.85, friction: 0.3 });
    e.addComponent(PhysicsBody, { state: PhysicsState.Static });
    scan.colliders++;
    const proxy = new Mesh(new BoxGeometry(...dims), new MeshBasicMaterial());
    proxy.visible = false; // Raycaster still hits invisible meshes
    proxy.position.copy(worldCenter);
    this.world.scene.add(proxy);
    scan.proxies.push(proxy);
  }
}
