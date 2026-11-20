import { useId, useRef, useState } from 'react';
import { Icon } from './Icons.tsx';

export type ResumeInput =
  | { kind: 'pdf'; name: string; size: number; bytes: ArrayBuffer; url: string }
  | { kind: 'text'; text: string };

interface Props {
  initialResume: ResumeInput | null;
  initialJd: string;
  onResume: (r: ResumeInput | null) => void;
  onSubmit: (r: ResumeInput, jd: string) => void;
}

const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function InputScreen({ initialResume, initialJd, onResume, onSubmit }: Props) {
  const [resume, setResumeState] = useState<ResumeInput | null>(initialResume);
  const [jd, setJd] = useState(initialJd);
  const [pasteMode, setPasteMode] = useState(initialResume?.kind === 'text');
  const [pasted, setPasted] = useState(initialResume?.kind === 'text' ? initialResume.text : '');
  const [error, setError] = useState('');
  const [drag, setDrag] = useState(false);
  const [loadingSample, setLoadingSample] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const jdFileRef = useRef<HTMLInputElement>(null);
  const ids = { resume: useId(), jd: useId(), jdHelp: useId(), err: useId() };

  const setResume = (r: ResumeInput | null) => { setResumeState(r); onResume(r); };

  async function takeFile(f: File | undefined) {
    setError('');
    if (!f) return;
    const isPdf = f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf');
    if (!isPdf) return setError('Please choose a PDF file. Word documents can be saved as PDF with File → Save as → PDF.');
    if (f.size > 10 * 1024 * 1024) return setError('This PDF is larger than 10 MB. Export a smaller copy and try again.');
    const bytes = await f.arrayBuffer();
    setResume({ kind: 'pdf', name: f.name, size: f.size, bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) });
  }

  async function takeJdFile(f: File | undefined) {
    if (!f) return;
    if (!/\.txt$/i.test(f.name) && f.type !== 'text/plain') return setError('Upload the job description as a .txt file, or paste it.');
    setJd(await f.text());
  }

  async function trySample() {
    setError('');
    setLoadingSample(true);
    try {
      const [pdf, text] = await Promise.all([fetch('/samples/sample-resume.pdf'), fetch('/samples/sample-jd.txt')]);
      if (!pdf.ok || !text.ok) throw new Error();
      const bytes = await pdf.arrayBuffer();
      const r: ResumeInput = { kind: 'pdf', name: 'sample-resume.pdf', size: bytes.byteLength, bytes, url: URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' })) };
      const jdText = await text.text();
      setResume(r);
      setPasteMode(false);
      setJd(jdText);
      onSubmit(r, jdText);
    } catch {
      setError('The sample files could not be loaded. Check that the server is running.');
    } finally {
      setLoadingSample(false);
    }
  }

  const effective: ResumeInput | null = pasteMode ? (pasted.trim() ? { kind: 'text', text: pasted } : null) : resume?.kind === 'pdf' ? resume : null;
  const ready = !!effective && jd.trim().length > 0;

  return (
    <div className="mx-auto max-w-6xl px-5 sm:px-8 pt-10 sm:pt-14">
      <div className="max-w-3xl">
        <p className="eyebrow">Placement prep</p>
        <h1 className="font-serif text-3xl sm:text-[2.6rem] leading-tight mt-2 text-balance">
          See which job requirements your resume already proves, and which it doesn’t yet.
        </h1>
        <p className="mt-4 text-ink-2 max-w-2xl">
          Upload your resume and paste a job description. Every result links to the exact line of the JD and the place in your resume it came from. Then you get a two-week plan for the top three gaps.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn btn-line" onClick={trySample} disabled={loadingSample}>
            <Icon name="spark" /> {loadingSample ? 'Loading sample…' : 'Try a sample'}
          </button>
          <span className="text-sm text-ink-3">Runs the whole flow with a sample resume and JD.</span>
        </div>
      </div>

      <div className="mt-10 grid md:grid-cols-2 gap-10 md:gap-0 border-t rule">
        {/* Step 1 */}
        <section aria-labelledby={ids.resume} className="pt-6 md:pr-10 md:border-r rule">
          <p className="eyebrow">Step 1</p>
          <h2 id={ids.resume} className="font-serif text-2xl mt-1">Your resume</h2>
          {!pasteMode ? (
            <>
              <div
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); takeFile(e.dataTransfer.files[0]); }}
                className={`mt-4 rounded-lg border border-dashed px-5 py-8 text-center transition-colors ${drag ? 'border-ink bg-paper-2' : 'rule bg-paper'}`}
              >
                {resume?.kind === 'pdf' ? (
                  <div className="flex flex-col items-center gap-2">
                    <Icon name="file" className="w-6 h-6 text-ink-2" />
                    <p className="font-semibold break-all">{resume.name}</p>
                    <p className="text-sm text-ink-3">{kb(resume.size)} · PDF</p>
                    <div className="flex gap-4 text-sm mt-1">
                      <a className="link" href={resume.url} target="_blank" rel="noreferrer">Preview original</a>
                      <button className="link" onClick={() => fileRef.current?.click()}>Replace</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <Icon name="upload" className="w-6 h-6 text-ink-2" />
                    <p>Drag your resume PDF here, or</p>
                    <button className="btn btn-ink" onClick={() => fileRef.current?.click()}>Choose PDF</button>
                    <p className="text-xs text-ink-3">Two-column layouts, tables and scanned pages are fine. Up to 10 MB.</p>
                  </div>
                )}
                <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="sr-only" aria-label="Choose resume PDF" onChange={(e) => takeFile(e.target.files?.[0])} />
              </div>
              <button className="mt-3 text-sm link text-ink-2" onClick={() => setPasteMode(true)}>No PDF? Paste your resume text instead</button>
            </>
          ) : (
            <>
              <label htmlFor="resume-text" className="block mt-4 text-sm text-ink-2">Paste the full text of your resume, including projects and internships.</label>
              <textarea id="resume-text" value={pasted} onChange={(e) => setPasted(e.target.value)} rows={12}
                className="mt-2 w-full rounded-lg border rule bg-white/60 p-3 font-mono text-sm leading-relaxed focus:border-ink" />
              <button className="mt-3 text-sm link text-ink-2" onClick={() => setPasteMode(false)}>Upload a PDF instead</button>
            </>
          )}
        </section>

        {/* Step 2 */}
        <section aria-labelledby={ids.jd} className="pt-6 md:pl-10">
          <p className="eyebrow">Step 2</p>
          <h2 id={ids.jd} className="font-serif text-2xl mt-1">The job description</h2>
          <label htmlFor="jd-text" className="sr-only">Job description text</label>
          <textarea id="jd-text" value={jd} onChange={(e) => setJd(e.target.value)} rows={12} aria-describedby={ids.jdHelp}
            placeholder={'Paste the JD exactly as posted, for example:\n\nRequirements:\n• Experience with React.js or Vue is required.\n• Docker is required for packaging services.'}
            className="mt-4 w-full rounded-lg border rule bg-white/60 p-3 text-sm leading-relaxed focus:border-ink placeholder:text-ink-3/70" />
          <div id={ids.jdHelp} className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm text-ink-3">
            <span>Line breaks are kept, so evidence can point to exact lines.</span>
            <button className="link text-ink-2" onClick={() => jdFileRef.current?.click()}>Upload .txt</button>
            <input ref={jdFileRef} type="file" accept=".txt,text/plain" className="sr-only" aria-label="Upload job description text file" onChange={(e) => takeJdFile(e.target.files?.[0])} />
          </div>
        </section>
      </div>

      <div className="mt-10 border-t rule pt-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
        <p className="text-sm text-ink-3 max-w-xl">
          Your PDF is read on this server for this request only and is never saved. The comparison and plan are computed in your browser.
        </p>
        <button className="btn btn-ink self-start sm:self-auto" disabled={!ready} onClick={() => effective && onSubmit(effective, jd)}>
          Analyse resume <Icon name="arrow" />
        </button>
      </div>
      {error && <p id={ids.err} role="alert" className="mt-4 text-ember text-sm flex gap-2"><Icon name="alert" /> {error}</p>}
      {!ready && <p className="mt-2 text-xs text-ink-3 sm:text-right">{!effective ? 'Add your resume' : 'Add the job description'} to continue.</p>}
    </div>
  );
}
