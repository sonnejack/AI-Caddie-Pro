import type { MaskBuffer, ClassId } from './maskBuffer';
import type { LatLon } from '@shared/types';
import { sampleClassFromMask } from './maskBuffer';

/**
 * Adapter to make MaskBuffer compatible with existing PaletteMask interface
 */
export class MaskBufferAdapter {
  constructor(private buffer: MaskBuffer) {}

  async ready() {
    // Buffer is already ready, no async loading needed
    return;
  }

  sample(ll: LatLon): ClassId {
    return sampleClassFromMask(ll.lon, ll.lat, this.buffer);
  }
}