import bcrypt from 'bcryptjs'
import { config } from './config'
import { Mission, QuizQuestion, User, PlayerProgress } from './models'
import { connectDb, disconnectDb } from './db'

const R = (xp: number, coins: number) => ({
  xp,
  coins,
  quizXp: 40,
  maxXp: 600,
  maxCoins: 200
})
const MISSIONS = [
  {
    key: 'bloodstream-1',
    level: 1,
    title: 'First Dose',
    difficulty: 1,
    target: 200,
    description: 'Collect 200 medicines before time runs out.',
    reward: R(120, 30),
    quizSeconds: 12
  },
  {
    key: 'bloodstream-2',
    level: 2,
    title: 'Clot Control',
    difficulty: 1,
    target: 260,
    description: 'Collect 260 medicines through the narrowing vessel.',
    reward: R(150, 40),
    quizSeconds: 12
  },
  {
    key: 'bloodstream-3',
    level: 3,
    title: 'Immune Surge',
    difficulty: 2,
    target: 320,
    description: 'Push through the immune response and collect 320 medicines.',
    reward: R(180, 50),
    quizSeconds: 10
  },
  {
    key: 'bloodstream-4',
    level: 4,
    title: 'Pressure Point',
    difficulty: 2,
    target: 380,
    description: 'High pressure, fast flow: collect 380 medicines.',
    reward: R(220, 60),
    quizSeconds: 9
  },
  {
    key: 'bloodstream-5',
    level: 5,
    title: 'Sepsis Sprint',
    difficulty: 3,
    target: 440,
    description: 'The final sprint. Collect 440 medicines under pressure.',
    reward: R(260, 80),
    quizSeconds: 8
  }
]

// SAMPLE educational content. Must be reviewed/approved by qualified medical reviewers before real use (see README).
const Q = (
  scenario: string,
  question: string,
  options: string[],
  correctIndex: number,
  explanation: string,
  difficulty: number,
  topics: string[],
  vitals?: any
) => ({
  scenario,
  question,
  options,
  correctIndex,
  explanation,
  difficulty,
  topics,
  vitals
})
const QUESTIONS = [
  Q(
    '58-year-old man, crushing chest pain radiating to the left arm, sweating. ECG: ST elevation.',
    'Which immediate drug should be given?',
    ['Chewed aspirin', 'Oral paracetamol', 'Salbutamol inhaler'],
    0,
    'Antiplatelet therapy (aspirin) is first-line in suspected STEMI.',
    1,
    ['cardiology'],
    { hr: 112, bp: '90/60', spo2: 94 }
  ),
  Q(
    '24-year-old develops stridor, facial swelling and hypotension after a wasp sting.',
    'First-line treatment?',
    ['Oral prednisolone', 'IM adrenaline', 'IV antihistamine'],
    1,
    'IM adrenaline is the first-line, life-saving treatment in anaphylaxis.',
    1,
    ['emergency', 'allergy'],
    { hr: 128, bp: '70/40', spo2: 88 }
  ),
  Q(
    'Unresponsive patient, respiratory rate 6/min, pinpoint pupils.',
    'Best antidote?',
    ['Flumazenil', 'Atropine', 'Naloxone'],
    2,
    'Naloxone reverses opioid-induced respiratory depression.',
    1,
    ['toxicology'],
    { hr: 48, bp: '100/60', spo2: 82 }
  ),
  Q(
    'Known type 1 diabetic found confused and sweaty. Glucose 1.8 mmol/L, IV access available.',
    'Best immediate treatment?',
    ['IV dextrose', 'Subcutaneous insulin', 'Oral metformin'],
    0,
    'Severe hypoglycaemia needs IV glucose (or IM glucagon without access).',
    1,
    ['endocrine'],
    { hr: 118, bp: '110/70', spo2: 96 }
  ),
  Q(
    '30-year-old with wheeze and breathlessness during an acute asthma exacerbation.',
    'Which drug gives the fastest bronchodilation?',
    ['Salbutamol (inhaled)', 'Montelukast (oral)', 'Beclometasone (inhaled)'],
    0,
    'Short-acting beta-2 agonists such as salbutamol give rapid bronchodilation in acute asthma.',
    1,
    ['respiratory'],
    { hr: 110, bp: '125/80', spo2: 92 }
  ),
  Q(
    'Adult presents 2 hours after a large paracetamol overdose.',
    'Which antidote is used?',
    ['N-acetylcysteine', 'Flumazenil', 'Vitamin K'],
    0,
    'N-acetylcysteine replenishes glutathione and prevents paracetamol hepatotoxicity.',
    1,
    ['toxicology'],
    { hr: 92, bp: '118/74', spo2: 98 }
  ),
  Q(
    'Patient on warfarin with a raised INR and minor bleeding needs reversal of the anticoagulant effect.',
    'Which agent reverses warfarin?',
    ['Protamine sulfate', 'Vitamin K', 'Naloxone'],
    1,
    'Vitamin K restores clotting factor synthesis (prothrombin complex concentrate is used for urgent major bleeding).',
    1,
    ['haematology', 'pharmacology']
  ),
  Q(
    'Patient on unfractionated heparin develops major bleeding.',
    'Which drug reverses heparin?',
    ['Vitamin K', 'Protamine sulfate', 'Tranexamic acid'],
    1,
    'Protamine sulfate binds and neutralises heparin.',
    2,
    ['haematology', 'pharmacology']
  ),
  Q(
    'Elderly patient on digoxin: nausea, visual disturbance and ventricular arrhythmia, digoxin level markedly raised.',
    'Specific treatment for severe digoxin toxicity?',
    ['Digoxin-specific antibody fragments', 'Atropine', 'Calcium gluconate'],
    0,
    'Digoxin-specific Fab fragments bind digoxin and are the specific antidote for life-threatening toxicity.',
    2,
    ['toxicology', 'cardiology'],
    { hr: 38, bp: '95/60', spo2: 95 }
  ),
  Q(
    'Farmer exposed to pesticide: salivation, lacrimation, bradycardia, small pupils.',
    'Which drug counters the muscarinic effects?',
    ['Neostigmine', 'Atropine', 'Physostigmine'],
    1,
    'Atropine blocks muscarinic effects of organophosphate poisoning (pralidoxime is added for the nicotinic effects).',
    2,
    ['toxicology'],
    { hr: 46, bp: '100/60', spo2: 90 }
  ),
  Q(
    'Adult in continuous generalised seizure for more than 5 minutes.',
    'Which is the first-line drug class?',
    [
      'IV benzodiazepine (e.g. lorazepam)',
      'Oral carbamazepine',
      'Oral paracetamol'
    ],
    0,
    'A benzodiazepine is first-line for status epilepticus.',
    2,
    ['neurology', 'emergency'],
    { hr: 130, bp: '150/90', spo2: 91 }
  ),
  Q(
    'Patient with beta-blocker overdose: bradycardia and hypotension unresponsive to atropine.',
    'Which agent is used for severe beta-blocker poisoning?',
    ['Glucagon', 'Digoxin', 'Flumazenil'],
    0,
    'Glucagon increases cAMP independently of beta-receptors and can reverse beta-blocker toxicity.',
    3,
    ['toxicology', 'cardiology'],
    { hr: 42, bp: '80/50', spo2: 94 }
  ),
  Q(
    'Patient with visual disturbance and severe metabolic acidosis after ingesting windscreen wash.',
    'Which antidote blocks alcohol dehydrogenase?',
    ['Fomepizole', 'N-acetylcysteine', 'Naloxone'],
    0,
    'Fomepizole inhibits alcohol dehydrogenase, preventing toxic methanol/ethylene glycol metabolites.',
    3,
    ['toxicology'],
    { hr: 108, bp: '112/70', spo2: 96 }
  ),
  Q(
    'A patient started on a new antihypertensive develops a persistent dry cough.',
    'Which drug class most commonly causes this?',
    ['ACE inhibitors', 'Beta-blockers', 'Statins'],
    0,
    'ACE inhibitors raise bradykinin, causing a persistent dry cough in some patients.',
    3,
    ['pharmacology', 'cardiology']
  ),
  Q(
    'Patient with hyperkalaemia (K+ 7.2 mmol/L) and peaked T waves on ECG.',
    'First treatment to protect the heart?',
    ['IV calcium', 'Oral furosemide', 'IV potassium'],
    0,
    'IV calcium stabilises the cardiac membrane; insulin-glucose then shifts potassium into cells.',
    3,
    ['emergency', 'renal'],
    { hr: 54, bp: '130/80', spo2: 97 }
  )
]

export async function seedAll () {
  for (const m of MISSIONS)
    await Mission.updateOne(
      { key: m.key },
      {
        $setOnInsert: {
          ...m,
          objective: { type: 'collect', target: m.target },
          target: undefined,
          quizAt: [60, 120, 180],
          world: 'Bloodstream'
        }
      },
      { upsert: true }
    )
  for (const q of QUESTIONS)
    await QuizQuestion.updateOne(
      { scenario: q.scenario },
      { $setOnInsert: { ...q, status: 'approved', sampleContent: true } },
      { upsert: true }
    )
  if (
    config.adminEmail &&
    config.adminPassword &&
    !(await User.findOne({ email: config.adminEmail.toLowerCase() }))
  ) {
    const u: any = await User.create({
      email: config.adminEmail,
      passwordHash: await bcrypt.hash(config.adminPassword, 11),
      displayName: 'Admin',
      displayNameLower: 'admin',
      role: 'admin',
      profession: 'other'
    })
    await PlayerProgress.create({ user: u._id })
    console.log(`Bootstrap admin created: ${config.adminEmail}`)
  }
}

if (require.main === module)
  connectDb()
    .then(seedAll)
    .then(() => {
      console.log('Seeded.')
      return disconnectDb()
    })
    .catch(e => {
      console.error(e)
      process.exit(1)
    })
