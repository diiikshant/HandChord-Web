import { useEffect, useRef, useState } from 'react'
import type { AudioEngine } from '../audio/AudioEngine.ts'
import type { CompositionTransport } from '../composition/CompositionTransport.ts'
import { ProjectManager, type ProjectManagerSnapshot } from '../projects/ProjectManager.ts'
import type { ProjectPreferences } from '../projects/projectTypes.ts'

type Inputs = {
  engine: AudioEngine
  transport: CompositionTransport
  getPreferences: () => ProjectPreferences
  applyPreferences: (preferences: ProjectPreferences) => Promise<string | null>
}

const INITIAL: ProjectManagerSnapshot = {
  currentProject: null, dirty: false, saveState: 'saved', error: null, warning: null, library: [], storage: { usage: null, quota: null, persistent: null }, databaseVersion: 1, storeNames: [], lastTransaction: null, migrationStatus: 'current', missingAudioDataIds: [], currentProjectEstimatedBytes: 0, runtimeAudioBufferCount: 0,
}

/** Keeps IndexedDB project state separate from camera, tracking, and audio playback state. */
export function useProjectManager(inputs: Inputs) {
  const inputsRef = useRef(inputs)
  inputsRef.current = inputs
  const managerRef = useRef<ProjectManager | null>(null)
  if (!managerRef.current) {
    managerRef.current = new ProjectManager({ engine: inputs.engine, transport: inputs.transport, getPreferences: () => inputsRef.current.getPreferences(), applyPreferences: (preferences) => inputsRef.current.applyPreferences(preferences) })
  }
  const manager = managerRef.current
  const [project, setProject] = useState<ProjectManagerSnapshot>(INITIAL)

  useEffect(() => {
    const unsubscribe = manager.subscribe(setProject)
    void manager.refreshLibrary()
    return () => { unsubscribe(); manager.dispose() }
  }, [manager])

  return { manager, project }
}
