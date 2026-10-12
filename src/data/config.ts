import type { Skin } from '../types'
/** Lab coat is free; the others are bought with coins on the server (see shared/rules SHOP). */
export const SKINS: Skin[] = [
  { name: 'Lab Coat', coat: 0xf2fbff, accent: 0x22e4ff, shopId: null },
  { name: 'Surgeon', coat: 0x38d6b4, accent: 0x0b7a66, shopId: 'skin_surgeon' },
  {
    name: 'Paramedic',
    coat: 0xff8a3d,
    accent: 0xffd24d,
    shopId: 'skin_paramedic'
  }
]
