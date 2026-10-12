import type { WorldInfo } from '../types'
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
  },
  {
    name: 'Brain',
    icon: '🧠',
    gradient: 'linear-gradient(135deg,#3a1a6a,#b04dff)',
    specialty: 'Neurology',
    level: 4
  },
  {
    name: 'Bones',
    icon: '🦴',
    gradient: 'linear-gradient(135deg,#4a4a5a,#d8d8e8)',
    specialty: 'Orthopaedics',
    level: 5
  },
  {
    name: 'Cells',
    icon: '🧬',
    gradient: 'linear-gradient(135deg,#0a4a4a,#22e4ff)',
    specialty: 'Cell Biology',
    level: 6
  }
]
export const ZONES = [
  'VENA CAVA',
  'RIGHT ATRIUM',
  'HEART VALVE',
  'PULMONARY ARTERY',
  'CAPILLARY BED',
  'ALVEOLI'
]
