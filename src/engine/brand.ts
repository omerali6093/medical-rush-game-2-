import * as THREE from 'three'
import type { Brand } from '../api/types'

/** Materials for sponsored collectibles: a coin with the company's approved logo on both faces. */
export interface BrandAssets {
  sideMat: THREE.MeshStandardMaterial
  capMat: THREE.MeshBasicMaterial
}

export function makeBrandAssets (b: Brand): BrandAssets {
  const c = document.createElement('canvas')
  c.width = c.height = 128
  const g = c.getContext('2d')!
  const paint = (img?: HTMLImageElement) => {
    g.clearRect(0, 0, 128, 128)
    g.fillStyle = b.color
    g.beginPath()
    g.arc(64, 64, 64, 0, Math.PI * 2)
    g.fill()
    g.fillStyle = '#ffffff'
    g.beginPath()
    g.arc(64, 64, 52, 0, Math.PI * 2)
    g.fill()
    if (img) {
      const r = Math.min(80 / img.width, 80 / img.height)
      g.drawImage(
        img,
        64 - (img.width * r) / 2,
        64 - (img.height * r) / 2,
        img.width * r,
        img.height * r
      )
    } else {
      g.fillStyle = b.color
      g.font = 'bold 56px system-ui'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(b.sponsor.charAt(0).toUpperCase(), 64, 68)
    }
  }
  paint()
  const tex = new THREE.CanvasTexture(c)
  if (b.logoUrl) {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      paint(img)
      tex.needsUpdate = true
    }
    img.src = b.logoUrl
  }
  return {
    sideMat: new THREE.MeshStandardMaterial({
      color: b.color,
      emissive: b.color,
      emissiveIntensity: 0.4
    }),
    capMat: new THREE.MeshBasicMaterial({ map: tex })
  }
}
