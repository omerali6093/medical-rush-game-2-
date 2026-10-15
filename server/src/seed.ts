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

// 6 quizzes per 3-minute mission: every 30 seconds
const SIX_QUIZ_AT = [30, 60, 90, 120, 150, 175]

const MISSIONS = [
  // ── Bloodstream ────────────────────────────────────────────────────────────
  {
    key: 'bloodstream-1',
    world: 'Bloodstream',
    level: 1,
    title: 'First Dose',
    difficulty: 1,
    target: 200,
    description: 'Collect 200 medicines before time runs out.',
    reward: R(120, 30),
    quizSeconds: 12,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'bloodstream-2',
    world: 'Bloodstream',
    level: 2,
    title: 'Clot Control',
    difficulty: 1,
    target: 260,
    description: 'Collect 260 medicines through the narrowing vessel.',
    reward: R(150, 40),
    quizSeconds: 12,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'bloodstream-3',
    world: 'Bloodstream',
    level: 3,
    title: 'Immune Surge',
    difficulty: 2,
    target: 320,
    description: 'Push through the immune response and collect 320 medicines.',
    reward: R(180, 50),
    quizSeconds: 10,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'bloodstream-4',
    world: 'Bloodstream',
    level: 4,
    title: 'Pressure Point',
    difficulty: 2,
    target: 380,
    description: 'High pressure, fast flow: collect 380 medicines.',
    reward: R(220, 60),
    quizSeconds: 9,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'bloodstream-5',
    world: 'Bloodstream',
    level: 5,
    title: 'Sepsis Sprint',
    difficulty: 3,
    target: 440,
    description: 'The final sprint. Collect 440 medicines under pressure.',
    reward: R(260, 80),
    quizSeconds: 8,
    quizAt: SIX_QUIZ_AT
  },
  // ── Heart ──────────────────────────────────────────────────────────────────
  {
    key: 'heart-1',
    world: 'Heart',
    level: 6,
    title: 'Sinus Rhythm',
    difficulty: 1,
    target: 200,
    description: 'Navigate the cardiac chambers and collect 200 medicines.',
    reward: R(140, 35),
    quizSeconds: 12,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'heart-2',
    world: 'Heart',
    level: 7,
    title: 'Atrial Fibrillation',
    difficulty: 1,
    target: 260,
    description: 'Irregular beat, irregular obstacles. Collect 260 medicines.',
    reward: R(170, 45),
    quizSeconds: 12,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'heart-3',
    world: 'Heart',
    level: 8,
    title: 'Valvular Storm',
    difficulty: 2,
    target: 320,
    description: 'The valves are stenotic. Push through and collect 320 medicines.',
    reward: R(200, 55),
    quizSeconds: 10,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'heart-4',
    world: 'Heart',
    level: 9,
    title: 'Cardiac Arrest',
    difficulty: 2,
    target: 380,
    description: 'Resuscitate the myocardium. Collect 380 medicines against the clock.',
    reward: R(240, 65),
    quizSeconds: 9,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'heart-5',
    world: 'Heart',
    level: 10,
    title: 'Code Blue',
    difficulty: 3,
    target: 440,
    description: 'Maximum intensity. 440 medicines or the patient codes.',
    reward: R(280, 85),
    quizSeconds: 8,
    quizAt: SIX_QUIZ_AT
  },
  // ── Lungs ──────────────────────────────────────────────────────────────────
  {
    key: 'lungs-1',
    world: 'Lungs',
    level: 11,
    title: 'First Breath',
    difficulty: 1,
    target: 200,
    description: 'Run through the airways and collect 200 medicines.',
    reward: R(140, 35),
    quizSeconds: 12,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'lungs-2',
    world: 'Lungs',
    level: 12,
    title: 'Bronchospasm',
    difficulty: 1,
    target: 260,
    description: 'The bronchioles are tightening. Collect 260 medicines.',
    reward: R(170, 45),
    quizSeconds: 12,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'lungs-3',
    world: 'Lungs',
    level: 13,
    title: 'Hypoxic Drive',
    difficulty: 2,
    target: 320,
    description: 'Oxygen is dropping. Collect 320 medicines to keep the patient stable.',
    reward: R(200, 55),
    quizSeconds: 10,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'lungs-4',
    world: 'Lungs',
    level: 14,
    title: 'Pneumothorax',
    difficulty: 2,
    target: 380,
    description: 'A lung has collapsed. Race to collect 380 medicines.',
    reward: R(240, 65),
    quizSeconds: 9,
    quizAt: SIX_QUIZ_AT
  },
  {
    key: 'lungs-5',
    world: 'Lungs',
    level: 15,
    title: 'ARDS Protocol',
    difficulty: 3,
    target: 440,
    description: 'Acute respiratory distress. 440 medicines. Maximum speed.',
    reward: R(280, 85),
    quizSeconds: 8,
    quizAt: SIX_QUIZ_AT
  }
]

// SAMPLE educational content.
// Must be reviewed/approved by qualified medical reviewers before real use (see README).
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
  // ── Bloodstream / General ──────────────────────────────────────────────────
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
  ),

  // ── Cardiology D/F quizzes ─────────────────────────────────────────────────
  Q(
    'ECG shows narrow complex tachycardia at 160 bpm, regular rhythm, no P waves visible.',
    'What is the most likely diagnosis?',
    ['SVT (AVNRT)', 'Ventricular tachycardia', 'Sinus tachycardia'],
    0,
    'Regular narrow complex tachycardia without visible P waves is most likely SVT due to AVNRT.',
    1,
    ['cardiology'],
    { hr: 160, bp: '108/70', spo2: 97 }
  ),
  Q(
    'Patient with SVT not responding to Valsalva. IV access is available.',
    'Which drug is first-line?',
    ['Adenosine 6 mg IV rapid bolus', 'Amiodarone 300 mg IV over 20 min', 'Digoxin 0.5 mg IV'],
    0,
    'Adenosine is first-line for haemodynamically stable SVT — it transiently blocks the AV node.',
    1,
    ['cardiology'],
    { hr: 164, bp: '105/68', spo2: 96 }
  ),
  Q(
    'ECG: irregularly irregular rhythm, absent P waves, fibrillatory baseline.',
    'What rhythm is this?',
    ['Atrial fibrillation', 'Atrial flutter', 'Complete heart block'],
    0,
    'Irregularly irregular rhythm with no P waves and a fibrillatory baseline is classic AF.',
    1,
    ['cardiology'],
    { hr: 138, bp: '118/76', spo2: 95 }
  ),
  Q(
    'Patient with new onset AF, haemodynamically stable, onset confirmed within 48 hours.',
    'What is the preferred immediate management strategy?',
    ['DC cardioversion or pharmacological cardioversion', 'Rate control only with beta-blocker', 'Start long-term anticoagulation and reassess in 4 weeks'],
    0,
    'AF <48 h: cardioversion (electrical or pharmacological) is preferred to restore sinus rhythm safely without mandatory pre-cardioversion anticoagulation.',
    2,
    ['cardiology'],
    { hr: 122, bp: '126/80', spo2: 96 }
  ),
  Q(
    'Patient with AF and CHA2DS2-VASc score of 3.',
    'What is the recommended thromboprophylaxis?',
    ['Anticoagulation (DOAC preferred)', 'Aspirin alone', 'No treatment needed'],
    0,
    'A CHA2DS2-VASc score ≥2 (men) or ≥3 (women) indicates anticoagulation; DOACs are preferred over warfarin for non-valvular AF.',
    2,
    ['cardiology', 'pharmacology']
  ),
  Q(
    'A 70-year-old with an NSTEMI (troponin rising, no ST elevation) and ongoing chest pain.',
    'Which antiplatelet combination is standard initial therapy?',
    ['Aspirin + P2Y12 inhibitor (e.g. ticagrelor)', 'Aspirin alone', 'Clopidogrel alone'],
    0,
    'Dual antiplatelet therapy (DAPT) with aspirin and a P2Y12 inhibitor is the cornerstone of ACS management.',
    1,
    ['cardiology', 'pharmacology'],
    { hr: 96, bp: '148/88', spo2: 95 }
  ),
  Q(
    'Post-MI patient. Echocardiogram shows EF 35%.',
    'Which drug class has been shown to reduce mortality in this group?',
    ['ACE inhibitor or ARB', 'Calcium channel blocker', 'Digoxin'],
    0,
    'ACE inhibitors (and ARBs if intolerant) reduce mortality in post-MI patients with reduced EF by attenuating cardiac remodelling.',
    2,
    ['cardiology', 'pharmacology']
  ),
  Q(
    'Patient with STEMI presents to a hospital with no PCI capability. Door-to-balloon time will exceed 120 minutes.',
    'What is the appropriate reperfusion strategy?',
    ['Thrombolysis (fibrinolysis) within 30 minutes', 'Transfer for PCI regardless of delay', 'Medical management only'],
    0,
    'When PCI cannot be achieved within 120 minutes of first medical contact, fibrinolysis should be given within 30 minutes if no contraindications.',
    2,
    ['cardiology'],
    { hr: 108, bp: '92/62', spo2: 93 }
  ),
  Q(
    'Patient with heart failure (EF 30%) on optimal medical therapy. HR remains 78 bpm despite max beta-blocker.',
    'Which additional agent is indicated?',
    ['Ivabradine', 'Amiodarone', 'Digoxin'],
    0,
    'Ivabradine reduces heart rate by blocking I(f) channels in the SA node; it reduces HF hospitalisation in patients in sinus rhythm with HR ≥70 on max beta-blocker.',
    3,
    ['cardiology', 'pharmacology'],
    { hr: 78, bp: '110/70', spo2: 96 }
  ),
  Q(
    'Echocardiogram: calcified aortic valve, mean gradient 48 mmHg, AVA 0.7 cm², EF 58%. Patient is symptomatic.',
    'What is the diagnosis and next step?',
    ['Severe aortic stenosis — refer for valve replacement (TAVI or SAVR)', 'Mild aortic stenosis — annual follow-up', 'Aortic regurgitation — start ACE inhibitor'],
    0,
    'AVA <1.0 cm² and mean gradient >40 mmHg with symptoms = severe AS. Valve replacement is the definitive treatment.',
    2,
    ['cardiology'],
    { hr: 72, bp: '136/82', spo2: 97 }
  ),
  Q(
    'Patient on long-term amiodarone therapy develops new exertional dyspnoea and a restrictive pattern on PFTs.',
    'What is the most likely complication?',
    ['Amiodarone pulmonary toxicity', 'Cardiac tamponade', 'Pulmonary embolism'],
    0,
    'Amiodarone can cause pulmonary toxicity (pneumonitis/fibrosis); PFTs showing a restrictive pattern with reduced DLCO is a classic finding.',
    3,
    ['cardiology', 'pharmacology'],
    { hr: 74, bp: '128/80', spo2: 93 }
  ),
  Q(
    'ECG shows broad complex tachycardia at 180 bpm. Patient is haemodynamically unstable (BP 70/40).',
    'Immediate management?',
    ['Synchronised DC cardioversion', 'Adenosine 6 mg IV bolus', 'Amiodarone 300 mg over 60 min'],
    0,
    'Haemodynamically unstable broad complex tachycardia requires immediate synchronised cardioversion regardless of rhythm.',
    2,
    ['cardiology', 'emergency'],
    { hr: 182, bp: '70/40', spo2: 88 }
  ),
  Q(
    'Patient with known dilated cardiomyopathy (EF 28%) has a syncopal episode. 24-h Holter: non-sustained VT.',
    'Which intervention reduces risk of sudden cardiac death?',
    ['Implantable cardioverter-defibrillator (ICD)', 'Oral amiodarone prophylaxis', 'Beta-blocker dose increase only'],
    0,
    'ICD implantation is the evidence-based intervention for primary prevention of SCD in patients with EF ≤35% and NYHA II–III despite optimal medical therapy.',
    3,
    ['cardiology']
  ),

  // ── Pulmonology D/F quizzes ────────────────────────────────────────────────
  Q(
    'Patient with sudden onset pleuritic chest pain and dyspnoea. Wells score 6. D-dimer raised.',
    'What is the most likely diagnosis and next step?',
    ['Pulmonary embolism — CT pulmonary angiography (CTPA)', 'Pneumonia — start antibiotics', 'Pneumothorax — chest X-ray and aspiration'],
    0,
    'High Wells score + raised D-dimer = high probability PE. CTPA is the gold-standard confirmatory investigation.',
    1,
    ['pulmonology', 'emergency'],
    { hr: 118, bp: '100/68', spo2: 90 }
  ),
  Q(
    'Confirmed massive PE. Patient is haemodynamically unstable (BP 80/50, HR 130).',
    'Which treatment is indicated?',
    ['Systemic thrombolysis (alteplase)', 'Low-molecular-weight heparin (LMWH) alone', 'Oral rivaroxaban'],
    0,
    'Massive PE with haemodynamic instability is a life-threatening emergency; systemic thrombolysis is indicated if no contraindications.',
    2,
    ['pulmonology', 'emergency'],
    { hr: 130, bp: '80/50', spo2: 86 }
  ),
  Q(
    '45-year-old smoker with FEV1/FVC 0.62, FEV1 55% predicted. Symptoms: chronic cough, increasing breathlessness.',
    'What is the most likely diagnosis?',
    ['COPD (GOLD Stage II)', 'Asthma', 'Pulmonary fibrosis'],
    0,
    'Post-bronchodilator FEV1/FVC <0.7 confirms COPD. FEV1 50–79% = GOLD Stage II (moderate).',
    1,
    ['pulmonology']
  ),
  Q(
    'COPD patient with worsening breathlessness and purulent sputum. No fever. CXR: no consolidation.',
    'What is the first-line antibiotic for this infective exacerbation?',
    ['Amoxicillin or doxycycline', 'Piperacillin-tazobactam IV', 'Ciprofloxacin IV'],
    0,
    'Uncomplicated COPD exacerbation: amoxicillin or doxycycline (or clarithromycin if penicillin-allergic) are first-line oral antibiotics.',
    1,
    ['pulmonology', 'pharmacology'],
    { hr: 100, bp: '128/82', spo2: 90 }
  ),
  Q(
    'Acute severe asthma: PEFR 35% predicted, cannot complete sentences.',
    'Which inhaled drug is added if salbutamol alone is inadequate?',
    ['Ipratropium bromide', 'Salmeterol', 'Beclometasone'],
    0,
    'Ipratropium bromide (an anticholinergic) gives additive bronchodilation in acute severe asthma when combined with a SABA.',
    1,
    ['pulmonology', 'pharmacology'],
    { hr: 124, bp: '132/84', spo2: 91 }
  ),
  Q(
    'Patient with life-threatening asthma: SpO2 88%, silent chest, confusion.',
    'Which IV treatment is used alongside nebulised bronchodilators?',
    ['IV magnesium sulphate', 'IV aminophylline', 'IV hydrocortisone alone'],
    0,
    'IV magnesium sulphate causes bronchial smooth muscle relaxation and is recommended in life-threatening asthma unresponsive to initial treatment.',
    2,
    ['pulmonology', 'emergency'],
    { hr: 136, bp: '118/78', spo2: 88 }
  ),
  Q(
    '35-year-old with progressive exertional dyspnoea over 2 years. CXR: bilateral reticular shadowing. HRCT: honeycombing and traction bronchiectasis at the bases.',
    'What is the most likely diagnosis?',
    ['Idiopathic pulmonary fibrosis (IPF)', 'Sarcoidosis', 'Hypersensitivity pneumonitis'],
    0,
    'Basal honeycombing with traction bronchiectasis on HRCT is the UIP pattern and strongly suggests IPF.',
    2,
    ['pulmonology']
  ),
  Q(
    'Patient with suspected IPF confirmed on HRCT. No significant comorbidities.',
    'Which pharmacological therapy slows disease progression?',
    ['Nintedanib or pirfenidone', 'Systemic corticosteroids', 'N-acetylcysteine alone'],
    0,
    'Nintedanib and pirfenidone are anti-fibrotic agents that reduce the rate of FVC decline in IPF. Corticosteroids are not beneficial.',
    2,
    ['pulmonology', 'pharmacology']
  ),
  Q(
    'Young tall man, sudden sharp right-sided chest pain and dyspnoea. CXR: 35% right-sided pneumothorax. No tension signs.',
    'Appropriate management for this primary spontaneous pneumothorax?',
    ['Aspiration (needle) if symptomatic; chest drain if fails', 'Immediate intercostal drain without aspiration attempt', 'Observation only for 24 hours'],
    0,
    'BTS guidelines: symptomatic primary spontaneous pneumothorax >2 cm — aspirate first; insert chest drain only if aspiration fails.',
    2,
    ['pulmonology'],
    { hr: 98, bp: '122/78', spo2: 94 }
  ),
  Q(
    'Intubated ICU patient with PaO2/FiO2 ratio 140 (on FiO2 0.6). Bilateral infiltrates on CXR. No cardiac cause.',
    'What syndrome does this represent?',
    ['Moderate ARDS (Berlin criteria)', 'Type 1 respiratory failure only', 'Cardiogenic pulmonary oedema'],
    0,
    'Berlin criteria: PaO2/FiO2 100–200 = moderate ARDS. Bilateral infiltrates + no cardiac cause are required.',
    2,
    ['pulmonology', 'critical care'],
    { hr: 108, bp: '118/72', spo2: 88 }
  ),
  Q(
    'ARDS patient on lung-protective ventilation. FiO2 0.7, PEEP 12, plateau pressure 34 cmH2O.',
    'Which ventilation strategy has the best mortality evidence?',
    ['Low tidal volume ventilation (6 mL/kg IBW)', 'High tidal volume to maximise oxygenation', 'Pressure-controlled ventilation at any volume'],
    0,
    'The ARDSNet trial demonstrated that low tidal volumes (6 mL/kg IBW) with a plateau pressure ≤30 cmH2O reduce mortality in ARDS.',
    3,
    ['pulmonology', 'critical care']
  ),
  Q(
    'Patient with COPD and type 2 respiratory failure (pH 7.29, PaCO2 8.8 kPa, PaO2 6.1 kPa on 28% O2).',
    'What is the preferred ventilatory support?',
    ['Non-invasive ventilation (NIV/BiPAP)', 'High-flow nasal oxygen', 'Immediate intubation'],
    0,
    'NIV (BiPAP) is the first-line ventilatory support for acute hypercapnic respiratory failure in COPD; it reduces the need for intubation and mortality.',
    2,
    ['pulmonology', 'critical care'],
    { hr: 112, bp: '136/86', spo2: 82 }
  )
]

export async function seedAll () {
  for (const m of MISSIONS) {
    await Mission.updateOne(
      { key: m.key },
      {
        $setOnInsert: {
          key: m.key,
          world: m.world,
          level: m.level,
          title: m.title,
          difficulty: m.difficulty,
          description: m.description,
          reward: m.reward,
          quizSeconds: m.quizSeconds,
          quizAt: m.quizAt,
          objective: { type: 'collect', target: m.target },
          requireFinalQuiz: false
        }
      },
      { upsert: true }
    )
  }
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
