// Domain catalog shared by the UI and the mock API.
// Single source of truth: imported by the frontend and the backend.

export const MODALITIES = {
  voice: { key: 'voice', label: 'Voice', color: 'var(--color-m-voice)', hex: '#7056C8', engine: 'Speech to text' },
  video: { key: 'video', label: 'Video', color: 'var(--color-m-video)', hex: '#D95A5A', engine: 'Audio + vision' },
  image: { key: 'image', label: 'Image', color: 'var(--color-m-image)', hex: '#1F9D76', engine: 'OCR + vision' },
  text: { key: 'text', label: 'Text', color: 'var(--color-m-text)', hex: '#2D6CDF', engine: 'Language model' },
  docs: { key: 'docs', label: 'Docs', color: 'var(--color-m-docs)', hex: '#F4A900', engine: 'Document parser' },
}
export const MODALITY_ORDER = ['voice', 'video', 'image', 'text', 'docs']

/** Map a File (or mime/extension) to a modality key. */
export function modalityOf(fileOrType) {
  const type = typeof fileOrType === 'string' ? fileOrType : fileOrType?.type || ''
  const name = typeof fileOrType === 'string' ? fileOrType : fileOrType?.name || ''
  if (type.startsWith('audio/') || /\.(mp3|m4a|wav|ogg|webm|aac|flac)$/i.test(name)) return 'voice'
  if (type.startsWith('video/') || /\.(mp4|mov|mkv|avi)$/i.test(name)) return 'video'
  if (type.startsWith('image/') || /\.(png|jpe?g|webp|heic|gif)$/i.test(name)) return 'image'
  if (type === 'text/plain' || /\.(txt|md)$/i.test(name)) return 'text'
  return 'docs'
}

export const PIPELINE_STAGES = [
  { key: 'capture', label: 'Capture', detail: 'Video, voice, image, text, docs' },
  { key: 'extract', label: 'Extract', detail: 'Speech to text, OCR, vision, parsing' },
  { key: 'normalize', label: 'Normalize', detail: 'Clean, segment, classify' },
  { key: 'retrieve', label: 'Retrieve', detail: 'Your templates and reference material' },
  { key: 'generate', label: 'Generate', detail: 'Language model + template schema' },
  { key: 'validate', label: 'Validate', detail: 'Rules, then your review' },
  { key: 'deliver', label: 'Deliver', detail: 'PDF, DOCX, JSON, share' },
]

/*
 * Template field types understood by the editor, the generator and the validator:
 *   text | longtext | number | money | date | list (of strings) | table (rows of columns)
 */
export const SYSTEM_TEMPLATES = [
  {
    id: 'lecture_notes',
    name: 'Lecture Notes',
    vertical: 'Education',
    stage: 'mvp',
    flow: 'Lecture → Notes',
    description: 'Topic-wise notes, key concepts, a summary and revision questions from a lecture video, screenshots or slides.',
    accepts: ['video', 'image', 'voice', 'docs', 'text'],
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'course', label: 'Course', type: 'text' },
      { key: 'date', label: 'Lecture date', type: 'date' },
      { key: 'summary', label: 'Summary', type: 'longtext', required: true },
      { key: 'key_points', label: 'Key points', type: 'list' },
      {
        key: 'concepts', label: 'Key concepts', type: 'table',
        columns: [{ key: 'term', label: 'Term', type: 'text' }, { key: 'definition', label: 'Definition', type: 'longtext' }],
      },
      { key: 'questions', label: 'Revision questions', type: 'list' },
    ],
  },
  {
    id: 'meeting_report',
    name: 'Meeting Report',
    vertical: 'Business ops',
    stage: 'mvp',
    flow: 'Messages → Report',
    description: 'Voice updates, chat exports and notes become a report with decisions, owners and due dates.',
    accepts: ['voice', 'text', 'image', 'docs', 'video'],
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'attendees', label: 'Attendees', type: 'list' },
      { key: 'summary', label: 'Summary', type: 'longtext', required: true },
      { key: 'decisions', label: 'Decisions', type: 'list' },
      {
        key: 'action_items', label: 'Action items', type: 'table',
        columns: [
          { key: 'task', label: 'Task', type: 'text' },
          { key: 'owner', label: 'Owner', type: 'text' },
          { key: 'due', label: 'Due', type: 'date' },
        ],
      },
      { key: 'risks', label: 'Risks and blockers', type: 'list' },
    ],
  },
  {
    id: 'journey_diary',
    name: 'Journey Diary',
    vertical: 'Personal',
    stage: 'expansion',
    flow: 'Photos → Diary',
    description: 'Photos and voice notes become a dated diary entry with the moments in order.',
    accepts: ['image', 'voice', 'text', 'video'],
    fields: [
      { key: 'title', label: 'Title', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'place', label: 'Place', type: 'text' },
      { key: 'entry', label: 'Entry', type: 'longtext', required: true },
      {
        key: 'moments', label: 'Moments', type: 'table',
        columns: [{ key: 'time', label: 'Time', type: 'text' }, { key: 'moment', label: 'Moment', type: 'text' }],
      },
      { key: 'tags', label: 'Tags', type: 'list' },
    ],
  },
  {
    id: 'voice_bill',
    name: 'Voice Bill',
    vertical: 'Retail',
    stage: 'expansion',
    flow: 'Voice → Bill',
    description: 'A spoken item list becomes a draft bill priced from your own price list.',
    accepts: ['voice', 'text', 'image'],
    fields: [
      { key: 'bill_no', label: 'Bill number', type: 'text', required: true },
      { key: 'date', label: 'Date', type: 'date', required: true },
      { key: 'customer', label: 'Customer', type: 'text' },
      {
        key: 'items', label: 'Items', type: 'table', required: true,
        columns: [
          { key: 'item', label: 'Item', type: 'text' },
          { key: 'qty', label: 'Qty', type: 'number' },
          { key: 'unit', label: 'Unit', type: 'text' },
          { key: 'rate', label: 'Rate', type: 'money' },
          { key: 'amount', label: 'Amount', type: 'money' },
        ],
      },
      { key: 'subtotal', label: 'Subtotal', type: 'money' },
      { key: 'tax', label: 'Tax', type: 'money' },
      { key: 'total', label: 'Total', type: 'money', required: true },
      { key: 'notes', label: 'Notes', type: 'longtext' },
    ],
  },
]

export const PLANS = [
  {
    id: 'free', name: 'Free', price: 0, period: null, tasksPerDay: 5,
    limits: { sources: 3, storageMb: 500, historyDays: 30, exports: ['pdf', 'md'], customTemplates: false, members: false },
    blurb: 'For trying it on your next lecture.',
    features: ['5 documents a day', 'All five input types', 'The four starter templates', '30 days of history', 'PDF and Markdown export'],
  },
  {
    id: 'premium', name: 'Premium', price: 299, period: 'month', tasksPerDay: 50,
    limits: { sources: 20, storageMb: 5120, historyDays: null, exports: ['pdf', 'docx', 'json', 'md'], customTemplates: false, members: false },
    blurb: 'For students and freelancers who document every day.',
    features: ['50 documents a day', 'Up to 20 reference sources', 'PDF, DOCX and JSON export', '5 GB of storage', 'Unlimited history'],
  },
  {
    id: 'pro', name: 'Pro', price: 2999, period: 'month', tasksPerDay: 500, unlimited: true,
    limits: { sources: null, storageMb: 51200, historyDays: null, exports: ['pdf', 'docx', 'json', 'md'], customTemplates: true, members: true },
    blurb: 'For teams whose documentation is a workflow.',
    features: ['Unlimited documents*', 'Custom templates', 'Workspace members and roles', 'Reference material per template', 'Audit trail export'],
  },
]

export const ROLES = {
  owner: { label: 'Owner', can: 'Everything, including plan and members' },
  editor: { label: 'Editor', can: 'Capture, edit and approve documents' },
  viewer: { label: 'Viewer', can: 'Read and export documents' },
}

export const planById = (id) => PLANS.find((p) => p.id === id) || PLANS[0]

export const templateById = (id, custom = []) =>
  SYSTEM_TEMPLATES.find((t) => t.id === id) || custom.find((t) => t.id === id)
