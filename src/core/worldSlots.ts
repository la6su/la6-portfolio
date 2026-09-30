// src/core/worldSlots.ts — Phase 3 canonical world-slot contract.
//
// The world retains the stable six-slot model described in
// docs/ARCHITECTURE.md ("Routes and world slots"). This module is the
// framework-neutral readonly tuple that owns the shared slot facts:
//
//   - the slot IDs in stable index order;
//   - each slot's story range (contiguous fifths of the story track; the
//     menu sheet pins to [5/5, 6/5] so it stays clamped-active at full
//     scroll — see SceneCoordinator.updateTransform's >= 1.0 special case);
//   - each slot's DOM section anchor;
//   - each slot's SplashCube face rotation (Y, radians).
//
// `WorldConfig` (scene phase configs) and `SplashCube` (face rotations) used
// to re-declare these facts; they now consume this tuple so a change to the
// slot model is a single-source change. Pure by design: no DOM, Three, DOM
// datasets or globals — unit-testable without a browser.
//
// Note the deliberate naming trap, documented in ARCHITECTURE.md: slot 0 is
// the runtime `lab` slot but publicly renders the Contact finale. The
// product role below keeps that fact explicit next to the ID.

type WorldSlotId = 'lab' | 'intro' | 'about' | 'works' | 'contact' | 'menu'

interface WorldSlotDef {
  /** Stable 0-based slot index. Never reordered; consumers index by this. */
  readonly index: number
  /** Canonical slot ID. Slot 0 is `lab` even though it publicly shows Contact. */
  readonly id: WorldSlotId
  /** Product role, per the ARCHITECTURE.md six-slot table. */
  readonly role: string
  /** Exclusive story track range [start, end) in fifths of the full track. */
  readonly range: readonly [number, number]
  /** DOM section anchor the slot maps to (data-section / data-page-section). */
  readonly domSection: string
  /** SplashCube Y rotation (radians) that presents this slot's face. */
  readonly faceRotation: number
}

const PI = Math.PI

/**
 * The canonical six slots in stable index order. This tuple is the single
 * source of truth; `WORLD_SLOT_IDS` and the lookup helpers derive from it.
 */
export const WORLD_SLOTS: readonly WorldSlotDef[] = [
  {
    index: 0,
    id: 'lab',
    role: 'Contact finale',
    range: [0, 1 / 5],
    domSection: 'lab',
    faceRotation: 0,
  },
  {
    index: 1,
    id: 'intro',
    role: 'Story frame 1',
    range: [1 / 5, 2 / 5],
    domSection: 'intro',
    faceRotation: -PI / 2,
  },
  {
    index: 2,
    id: 'about',
    role: 'Story frame 2',
    range: [2 / 5, 3 / 5],
    domSection: 'about',
    faceRotation: PI,
  },
  {
    index: 3,
    id: 'works',
    role: 'Story frame 3',
    range: [3 / 5, 4 / 5],
    domSection: 'works',
    faceRotation: PI / 2,
  },
  {
    index: 4,
    id: 'contact',
    role: 'Story frame 4',
    range: [4 / 5, 5 / 5],
    domSection: 'contact',
    // ±π/4 tilt (not a true top/bottom face) — known simplification,
    // matches the former SplashCube.FACE_ROTATIONS comment.
    faceRotation: -PI / 4,
  },
  {
    index: 5,
    id: 'menu',
    role: 'Navigation sheet',
    range: [5 / 5, 6 / 5],
    domSection: 'menu',
    faceRotation: PI / 4,
  },
] as const satisfies readonly WorldSlotDef[]

/** Slot count — consumers must not hard-code 6 anywhere else. */
export const WORLD_SLOT_COUNT = WORLD_SLOTS.length

const SLOT_BY_ID = new Map<WorldSlotId, WorldSlotDef>(WORLD_SLOTS.map((slot) => [slot.id, slot]))

/** Stable index of the works slot (home story frame 3 / standalone /works
 *  route). Exported once here — Experience and ExperienceUI used to declare
 *  identical module-local copies. */
export const WORKS_SLOT_INDEX = SLOT_BY_ID.get('works')!.index

/** Lookup by stable index; out-of-range indices are clamped to the ends. */
export function worldSlotAt(index: number): WorldSlotDef {
  const clamped = Math.max(0, Math.min(WORLD_SLOT_COUNT - 1, Math.trunc(index)))
  return WORLD_SLOTS[clamped]!
}

/**
 * Strict story slot index for a canonical slot ID: `undefined` for an ID the
 * slot model does not own (never a default). Accepts `string` so DOM dataset
 * values (`data-section` / `data-page-section` base IDs) can be passed
 * without a cast. This is the single place that turns a section identity into
 * its stable slot index, so consumers (e.g. `CinematicNav` navigation) derive
 * their index constants from the tuple instead of re-declaring `0/1/4/5`.
 */
export function worldSlotIndex(id: string): number | undefined {
  return SLOT_BY_ID.get(id as WorldSlotId)?.index
}
