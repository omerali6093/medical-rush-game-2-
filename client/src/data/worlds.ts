import type { WorldInfo } from '../types'

export type WorldId = 'Bloodstream' | 'Heart' | 'Lungs'

export const WORLDS: WorldInfo[] = [
  {
    name: 'Bloodstream',
    icon: '🩸',
    gradient: 'linear-gradient(135deg,#7a0f2a,#ff3d6e)',
    specialty: 'Hematology',
    level: 1
  },
  {
    name: 'Heart',
    icon: '🫀',
    gradient: 'linear-gradient(135deg,#5a0a2a,#c2185b)',
    specialty: 'Cardiology',
    level: 2
  },
  {
    name: 'Lungs',
    icon: '🫁',
    gradient: 'linear-gradient(135deg,#1a3a6a,#4aa3ff)',
    specialty: 'Pulmonology',
    level: 3
  }
]

export const ZONES: Record<WorldId, string[]> = {
  Bloodstream: [
    'VENA CAVA',
    'RIGHT ATRIUM',
    'HEART VALVE',
    'PULMONARY ARTERY',
    'CAPILLARY BED',
    'ALVEOLI'
  ],
  Heart: [
    'SINOATRIAL NODE',
    'RIGHT ATRIUM',
    'TRICUSPID VALVE',
    'RIGHT VENTRICLE',
    'AORTIC VALVE',
    'LEFT VENTRICLE'
  ],
  Lungs: [
    'TRACHEA',
    'PRIMARY BRONCHUS',
    'SECONDARY BRONCHUS',
    'BRONCHIOLES',
    'ALVEOLAR DUCT',
    'ALVEOLAR SAC'
  ]
}
