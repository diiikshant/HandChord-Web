import { useState } from 'react'
import type { ProjectManager, ProjectManagerSnapshot } from '../projects/ProjectManager.ts'

type PendingAction = { kind: 'new' } | { kind: 'open'; projectId: string } | null
type Props = { manager: ProjectManager; project: ProjectManagerSnapshot }

function size(value: number | null) { return value === null ? 'Unavailable' : value < 1024 * 1024 ? `${Math.round(value / 1024)} KB` : `${(value / (1024 * 1024)).toFixed(1)} MB` }
function date(value: number | null) { return value === null ? 'Never' : new Date(value).toLocaleString() }

/** A compact local-only project library; it deliberately does not own composition audio. */
export function ProjectLibrary({ manager, project }: Props) {
  const [showLibrary, setShowLibrary] = useState(false)
  const [pending, setPending] = useState<PendingAction>(null)
  const [message, setMessage] = useState<string | null>(null)
  const busy = ['saving', 'opening', 'duplicating', 'deleting'].includes(project.saveState)
  const run = async (work: () => Promise<void>) => { try { await work(); setMessage(null) } catch { /* ProjectManager publishes the recovery error. */ } }
  const askName = (title: string, initial: string) => { const name = window.prompt(title, initial); return name === null ? null : name }
  const completePending = async (choice: 'save' | 'discard' | 'cancel') => {
    const action = pending; setPending(null)
    if (!action || choice === 'cancel') return
    if (choice === 'save') {
      const name = project.currentProject?.name ?? askName('Project name', 'Untitled Project')
      if (!name) return
      await manager.save(name)
      if (manager.getSnapshot().saveState !== 'saved') return
    }
    if (action.kind === 'new') manager.newProject()
    else await run(() => manager.open(action.projectId))
  }
  const requestTransition = (action: NonNullable<PendingAction>) => { if (project.dirty) setPending(action); else if (action.kind === 'new') manager.newProject(); else void run(() => manager.open(action.projectId)) }

  return <section className="project-library-panel reverb-panel" aria-labelledby="project-library-title">
    <div className="gesture-audio-heading"><div><p className="eyebrow">Local project management</p><h2 id="project-library-title">Projects</h2></div><span className={`audio-status ${project.dirty ? 'audio-suspended' : 'audio-ready'}`}>{busy ? project.saveState : project.dirty ? 'Unsaved changes' : 'Saved'}</span></div>
    <p className="gesture-audio-message">Projects and composition audio stay only in this browser. They are not uploaded or shared, and clearing browser data can remove them.</p>
    {project.error && <p className="audio-error" aria-live="polite">{project.error}</p>}
    {project.warning && <p className="audio-message">{project.warning}</p>}
    {message && <p className="audio-message">{message}</p>}
    <div className="chord-buttons" aria-label="Project actions">
      <button className="secondary-button" type="button" disabled={busy} onClick={() => requestTransition({ kind: 'new' })}>New Project</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={() => { setShowLibrary((shown) => !shown); void manager.refreshLibrary() }}>{showLibrary ? 'Close Library' : 'Open Project'}</button>
      <button className="primary-button" type="button" disabled={busy} onClick={() => { const name = project.currentProject?.name ?? askName('Project name', 'Untitled Project'); if (name) void run(() => manager.save(name)) }}>Save</button>
      <button className="secondary-button" type="button" disabled={busy} onClick={() => { const name = askName('Save project as', `${project.currentProject?.name ?? 'Untitled Project'} copy`); if (name) void run(() => manager.saveAs(name)) }}>Save As</button>
    </div>
    <dl className="effect-readout" aria-label="Project diagnostics">
      <div><dt>Current project</dt><dd>{project.currentProject?.name ?? 'Unsaved project'}</dd></div><div><dt>Project ID</dt><dd>{project.currentProject?.id ?? '—'}</dd></div><div><dt>Schema / DB</dt><dd>{project.currentProject?.schemaVersion ?? 1} / {project.databaseVersion}</dd></div>
      <div><dt>Storage used</dt><dd>{size(project.storage.usage)}</dd></div><div><dt>Storage available</dt><dd>{project.storage.quota === null || project.storage.usage === null ? 'Unavailable' : size(Math.max(0, project.storage.quota - project.storage.usage))}</dd></div><div><dt>Persistent</dt><dd>{project.storage.persistent === null ? 'Unavailable' : project.storage.persistent ? 'Requested / granted' : 'Not requested'}</dd></div>
      <div><dt>Project PCM</dt><dd>{size(project.currentProjectEstimatedBytes)} · {project.runtimeAudioBufferCount} buffers</dd></div><div><dt>Saved projects</dt><dd>{project.library.length}</dd></div><div><dt>Project stores</dt><dd>{project.storeNames.join(', ') || 'Loading…'}</dd></div><div><dt>Last operation</dt><dd>{project.lastTransaction ?? '—'}</dd></div>
    </dl>
    <button className="secondary-button" type="button" disabled={busy} onClick={() => void run(() => manager.requestPersistentStorage())}>Request Persistent Storage</button>
    {pending && <div className="composition-recording" role="dialog" aria-label="Unsaved project changes"><strong>Unsaved changes</strong><span>Save this project before {pending.kind === 'new' ? 'creating a new one' : 'opening another project'}?</span><div className="chord-buttons"><button className="primary-button" type="button" onClick={() => void completePending('save')}>Save</button><button className="secondary-button" type="button" onClick={() => void completePending('discard')}>Discard</button><button className="secondary-button" type="button" onClick={() => void completePending('cancel')}>Cancel</button></div></div>}
    {showLibrary && <div className="project-list" aria-label="Saved project library">
      {project.library.length === 0 ? <p>No saved projects yet.</p> : project.library.map((item) => <article className="composition-layer" key={item.id}><div><strong>{item.name}</strong><small>{item.layerCount} layer{item.layerCount === 1 ? '' : 's'} · {item.bpm} BPM · {item.barCount} bars · modified {date(item.modifiedAt)}</small></div><div className="composition-layer-controls"><button className="secondary-button" type="button" disabled={busy} onClick={() => requestTransition({ kind: 'open', projectId: item.id })}>Open</button><button className="secondary-button" type="button" disabled={busy} onClick={() => { const name = askName('Rename project', item.name); if (name) void run(() => manager.rename(item.id, name)) }}>Rename</button><button className="secondary-button" type="button" disabled={busy} onClick={() => { const name = askName('Duplicate project as', `${item.name} copy`); if (name) void run(() => manager.duplicate(item.id, name)) }}>Duplicate</button><button className="secondary-button" type="button" disabled={busy} onClick={() => { if (window.confirm(`Delete ${item.name}? This removes its stored layer audio only.`)) void run(() => manager.delete(item.id)) }}>Delete</button></div></article>)}
    </div>}
  </section>
}
