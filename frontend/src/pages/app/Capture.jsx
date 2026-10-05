import { useEffect, useRef, useState } from 'react'
import { useNavigate, useOutletContext, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { ArrowRight, FileUp, Link2, Mic, Play, Square, Trash2, Type } from 'lucide-react'
import { MODALITIES, modalityOf } from '@younifyai/shared'
import { api } from '../../lib/api'
import { bytes } from '../../lib/format'
import { ModalityChip } from '../../components/Brand'
import { PageHeader, Spinner, UsageMeter } from '../../components/ui'

const ACCEPT = {
  voice: 'audio/*,.m4a,.mp3,.wav,.ogg,.webm',
  video: 'video/*,.mp4,.mov,.mkv',
  image: 'image/*,.heic',
  text: '.txt,.md,text/plain',
  docs: '.pdf,.docx,.pptx,.csv',
}
const MAX_BYTES = 500 * 1024 * 1024

/* ------------------------------------------------------------ recorder */

function useRecorder(onFile) {
  const [state, setState] = useState('idle') // idle | recording | denied
  const [seconds, setSeconds] = useState(0)
  const [level, setLevel] = useState(0)
  const rec = useRef(null)
  const cleanup = useRef(() => {})

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : ''
      const r = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
      const chunks = []
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data)
      r.onstop = () => {
        const blob = new Blob(chunks, { type: r.mimeType || 'audio/webm' })
        const stamp = new Date().toTimeString().slice(0, 5).replace(':', '')
        onFile(new File([blob], `recording_${stamp}.webm`, { type: blob.type }))
      }
      // live input level for the meter
      const ctx = new AudioContext()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      ctx.createMediaStreamSource(stream).connect(analyser)
      const buf = new Uint8Array(analyser.frequencyBinCount)
      let raf
      const t0 = Date.now()
      const loop = () => {
        analyser.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(peak / 128)
        setSeconds(Math.floor((Date.now() - t0) / 1000))
        raf = requestAnimationFrame(loop)
      }
      loop()
      cleanup.current = () => {
        cancelAnimationFrame(raf)
        stream.getTracks().forEach((t) => t.stop())
        ctx.close()
      }
      r.start()
      rec.current = r
      setState('recording')
    } catch {
      setState('denied')
    }
  }
  const stop = () => {
    rec.current?.stop()
    cleanup.current()
    setState('idle')
    setSeconds(0)
    setLevel(0)
  }
  useEffect(() => () => cleanup.current(), [])
  return { state, seconds, level, start, stop }
}

/* ---------------------------------------------------------------- page */

export default function Capture() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { usage, refreshUsage } = useOutletContext()
  const [templates, setTemplates] = useState(null)
  const [templateId, setTemplateId] = useState(params.get('template') || 'lecture_notes')
  const [inputs, setInputs] = useState([]) // { key, kind, file? , text?, name }
  const [paste, setPaste] = useState('')
  const [showPaste, setShowPaste] = useState(false)
  const [link, setLink] = useState({ open: false, url: '', busy: false, error: null })
  const [instructions, setInstructions] = useState('')
  const [dragging, setDragging] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const fileRef = useRef(null)

  useEffect(() => {
    document.title = 'New capture · YounifyAI'
    api.listTemplates().then(setTemplates).catch(setError)
  }, [])

  const template = templates?.find((t) => t.id === templateId)
  const accept = (template?.accepts || Object.keys(ACCEPT)).map((k) => ACCEPT[k]).join(',')

  const addFiles = (list) => {
    const next = []
    for (const file of list) {
      const kind = modalityOf(file)
      if (file.size > MAX_BYTES) { toast.error(`${file.name} is larger than 500 MB.`); continue }
      if (template && !template.accepts.includes(kind)) { toast.error(`${template.name} does not take ${MODALITIES[kind].label.toLowerCase()} files.`); continue }
      next.push({ key: `${file.name}-${file.size}-${Math.random()}`, kind, file, name: file.name, size: file.size })
    }
    setInputs((cur) => [...cur, ...next])
  }
  const recorder = useRecorder((file) => addFiles([file]))

  /** Look the video up first, so the person sees what will be captured. */
  const addLink = async () => {
    const url = link.url.trim()
    if (!url) return
    setLink((l) => ({ ...l, busy: true, error: null }))
    try {
      const video = await api.previewLink(url)
      if (template && !template.accepts.includes('video')) throw new Error(`${template.name} does not take video.`)
      setInputs((cur) => [...cur, {
        key: `link-${video.id}-${Date.now()}`, kind: 'video', url: video.url, title: video.title,
        name: video.title, size: 0, video,
      }])
      setLink({ open: false, url: '', busy: false, error: null })
    } catch (e) {
      setLink((l) => ({ ...l, busy: false, error: e.message }))
    }
  }

  const addPaste = () => {
    if (!paste.trim()) return
    setInputs((cur) => [...cur, { key: `text-${Date.now()}`, kind: 'text', text: paste, name: `pasted_text_${cur.filter((i) => i.kind === 'text').length + 1}.txt`, size: paste.length }])
    setPaste('')
    setShowPaste(false)
  }

  const submit = async () => {
    setBusy(true)
    setError(null)
    try {
      const pending = paste.trim() ? [{ kind: 'text', text: paste, name: 'pasted_text.txt' }] : []
      const job = await api.createJob({
        templateId,
        instructions,
        inputs: [
          ...inputs.map((i) => {
            if (i.url) return { kind: 'video', url: i.url, title: i.title }
            if (i.kind === 'text' && i.text) return { kind: 'text', text: i.text, name: i.name }
            return { kind: i.kind, file: i.file }
          }),
          ...pending,
        ],
      })
      refreshUsage()
      navigate(`/app/jobs/${job.id}`)
    } catch (e) {
      setError(e)
      setBusy(false)
    }
  }

  const hasInput = inputs.length > 0 || paste.trim() || instructions.trim()
  const limitReached = usage && !usage.unlimited && usage.used >= usage.limit

  return (
    <div>
      <PageHeader eyebrow="New capture" title="What are we documenting?" description="Pick a template, add what you have, and YounifyAI drafts the document for you to review." />

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-10">
          {/* step 1 */}
          <fieldset>
            <legend className="flex items-center gap-3 font-display text-lg font-semibold tracking-tight">
              <span className="mono grid h-6 w-6 place-items-center rounded-full bg-ink text-[0.65rem] text-paper">1</span>
              Template
            </legend>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {!templates && [0, 1, 2, 3].map((i) => <div key={i} className="skeleton h-24" />)}
              {templates?.map((t) => (
                <label key={t.id} className={`card flex cursor-pointer gap-3 p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-amber ${templateId === t.id ? 'border-ink ring-1 ring-ink' : 'hover:border-mist'}`}>
                  <input type="radio" name="template" value={t.id} checked={templateId === t.id} onChange={() => setTemplateId(t.id)} className="sr-only" />
                  <span className={`mt-1 grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${templateId === t.id ? 'border-ink' : 'border-mist'}`}>
                    {templateId === t.id && <span className="h-1.5 w-1.5 rounded-full bg-ink" />}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-semibold">{t.name}</span>
                    <span className="mt-0.5 block text-[0.85rem] text-slate">{t.flow || t.description}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* step 2 */}
          <fieldset>
            <legend className="flex items-center gap-3 font-display text-lg font-semibold tracking-tight">
              <span className="mono grid h-6 w-6 place-items-center rounded-full bg-ink text-[0.65rem] text-paper">2</span>
              Inputs
            </legend>
            <div
              onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { e.preventDefault(); setDragging(false); addFiles(e.dataTransfer.files) }}
              className={`mt-4 rounded-2xl border-2 border-dashed p-8 text-center transition-colors ${dragging ? 'border-amber bg-amber/10' : 'border-fog bg-card'}`}
            >
              <FileUp size={28} className="mx-auto text-slate" aria-hidden="true" />
              <p className="mt-3 font-semibold">Drop files here</p>
              <p className="mt-1 text-[0.88rem] text-slate">
                {template ? template.accepts.map((k) => MODALITIES[k].label.toLowerCase()).join(', ') : 'video, voice, images, text, documents'} · up to 500 MB each
              </p>
              {template?.accepts.includes('video') && (
                <p className="mt-1 flex items-center justify-center gap-1.5 text-[0.85rem] font-medium text-amber-ink">
                  <Play size={13} aria-hidden="true" />Or paste a YouTube lecture link below
                </p>
              )}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => fileRef.current?.click()} className="btn btn-ink btn-sm"><FileUp size={16} aria-hidden="true" />Choose files</button>
                {recorder.state === 'recording' ? (
                  <button type="button" onClick={recorder.stop} className="btn btn-sm bg-m-voice text-white">
                    <Square size={14} aria-hidden="true" />Stop · {String(Math.floor(recorder.seconds / 60)).padStart(1, '0')}:{String(recorder.seconds % 60).padStart(2, '0')}
                    <span className="ml-1 h-3 w-10 overflow-hidden rounded-full bg-white/25" aria-hidden="true"><span className="block h-full bg-white" style={{ width: `${Math.min(100, recorder.level * 180)}%` }} /></span>
                  </button>
                ) : (
                  <button type="button" onClick={recorder.start} disabled={template && !template.accepts.includes('voice')} className="btn btn-line btn-sm"><Mic size={16} aria-hidden="true" />Record voice</button>
                )}
                <button type="button" onClick={() => setShowPaste((s) => !s)} disabled={template && !template.accepts.includes('text')} className="btn btn-line btn-sm" aria-expanded={showPaste}><Type size={16} aria-hidden="true" />Paste text</button>
                <button type="button" onClick={() => setLink((l) => ({ ...l, open: !l.open, error: null }))} disabled={template && !template.accepts.includes('video')} className="btn btn-line btn-sm" aria-expanded={link.open}><Link2 size={16} aria-hidden="true" />YouTube link</button>
              </div>
              {recorder.state === 'denied' && <p className="mt-3 text-[0.85rem] text-bad">Microphone access was blocked. Allow it in the browser’s site settings, or upload a recording instead.</p>}
              <input ref={fileRef} type="file" multiple accept={accept} className="sr-only" onChange={(e) => { addFiles(e.target.files); e.target.value = '' }} />
            </div>

            {link.open && (
              <div className="animate-rise mt-4">
                <label htmlFor="yt" className="field-label">YouTube video link</label>
                <div className="flex flex-wrap gap-2">
                  <input
                    id="yt"
                    type="url"
                    inputMode="url"
                    className="input h-11 min-w-[16rem] flex-1"
                    value={link.url}
                    placeholder="https://www.youtube.com/watch?v=..."
                    aria-invalid={!!link.error}
                    onChange={(e) => setLink((l) => ({ ...l, url: e.target.value }))}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addLink() } }}
                  />
                  <button type="button" className="btn btn-ink" onClick={addLink} disabled={link.busy || !link.url.trim()}>
                    {link.busy ? <><Spinner size={14} />Looking it up…</> : 'Add video'}
                  </button>
                </div>
                {link.error && <p role="alert" className="mt-2 text-[0.85rem] text-bad">{link.error}</p>}
                <p className="mt-2 text-[0.82rem] text-slate">YounifyAI reads the lecture’s captions. Videos without captions need the recording as a file.</p>
              </div>
            )}

            {showPaste && (
              <div className="animate-rise mt-4">
                <label htmlFor="paste" className="field-label">Text, chat export or transcript</label>
                <textarea id="paste" rows={6} className="input" value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={template?.id === 'voice_bill' ? 'do kilo basmati chawal, ek litre sarson ka tel, paanch biscuit packet' : template?.id === 'meeting_report' ? 'Meera: Stock-outs hit rice twice this week.\nRavi: I will update the stock sheet by Friday.' : 'Paste lecture notes, a transcript, or a chat…'} />
                <div className="mt-2 flex justify-end gap-2">
                  <button type="button" className="btn btn-line btn-sm" onClick={() => { setShowPaste(false); setPaste('') }}>Cancel</button>
                  <button type="button" className="btn btn-ink btn-sm" onClick={addPaste} disabled={!paste.trim()}>Add text</button>
                </div>
              </div>
            )}

            {inputs.length > 0 && (
              <ul className="mt-4 space-y-2" aria-label="Added inputs">
                {inputs.map((i) => (
                  <li key={i.key} className="card flex items-center gap-3 px-4 py-3">
                    {i.video ? (
                      <img src={i.video.thumbnail} alt="" className="h-10 w-16 shrink-0 rounded-md object-cover" />
                    ) : (
                      <ModalityChip kind={i.kind} tone="paper" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.name}</span>
                      {i.video && (
                        <span className="mono block truncate text-[0.68rem] text-slate">
                          {i.video.channel} · {Math.round(i.video.durationSeconds / 60)} min · {i.video.hasCaptions ? 'captions available' : 'no captions'}
                        </span>
                      )}
                    </span>
                    <span className="mono text-[0.7rem] text-slate">{i.video ? 'YouTube' : i.kind === 'text' ? `${i.size} chars` : bytes(i.size)}</span>
                    <button type="button" onClick={() => setInputs((cur) => cur.filter((x) => x.key !== i.key))} className="grid h-8 w-8 place-items-center rounded-lg text-slate hover:bg-paper hover:text-bad" aria-label={`Remove ${i.name}`}>
                      <Trash2 size={16} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </fieldset>

          {/* step 3 */}
          <fieldset>
            <legend className="flex items-center gap-3 font-display text-lg font-semibold tracking-tight">
              <span className="mono grid h-6 w-6 place-items-center rounded-full bg-ink text-[0.65rem] text-paper">3</span>
              Instructions <span className="text-[0.85rem] font-normal text-slate">(optional)</span>
            </legend>
            <textarea rows={3} className="input mt-4" value={instructions} onChange={(e) => setInstructions(e.target.value)} placeholder="For example: focus on the derivations, or: the customer is Sharma ji" aria-label="Instructions" />
          </fieldset>
        </div>

        <aside className="lg:sticky lg:top-8 lg:self-start">
          <div className="card p-5">
            <p className="eyebrow text-slate">Summary</p>
            <dl className="mt-4 space-y-3 text-[0.9rem]">
              <div className="flex justify-between gap-4"><dt className="text-slate">Template</dt><dd className="text-right font-semibold">{template?.name || '…'}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate">Inputs</dt><dd className="font-semibold">{inputs.length + (paste.trim() ? 1 : 0)}</dd></div>
              <div className="flex justify-between gap-4"><dt className="text-slate">Fields to fill</dt><dd className="font-semibold">{template?.fields.length ?? '…'}</dd></div>
            </dl>
            <div className="mt-5 border-t border-fog pt-5"><UsageMeter usage={usage} /></div>
            {error && <p role="alert" className="mt-4 rounded-xl bg-bad/10 px-3 py-2.5 text-[0.85rem] text-bad">{error.message}</p>}
            <button type="button" onClick={submit} disabled={busy || !hasInput || !template || limitReached} className="btn btn-amber mt-5 h-12 w-full text-base">
              {busy ? <><Spinner /> Starting…</> : <>Generate document <ArrowRight size={18} aria-hidden="true" /></>}
            </button>
            <p className="mt-3 text-center text-[0.78rem] text-slate">
              {limitReached ? 'You have reached today’s limit.' : 'Uses one document from today’s allowance.'}
            </p>
          </div>
        </aside>
      </div>
    </div>
  )
}
