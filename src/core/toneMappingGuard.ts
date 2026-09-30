import * as THREE from 'three'

interface ToneMappingOwner {
  toneMapping: THREE.ToneMapping
}

/** Run a renderer-native graph operation with tone mapping disabled safely. */
export function withNoToneMapping<T>(renderer: ToneMappingOwner, operation: () => T): T {
  const previous = renderer.toneMapping
  renderer.toneMapping = THREE.NoToneMapping
  try {
    return operation()
  } finally {
    renderer.toneMapping = previous
  }
}
