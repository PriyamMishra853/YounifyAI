import { EventEmitter } from 'node:events'

/**
 * In-process signals:
 *   'job:queued'           a job was created — wakes an idle worker immediately
 *   'job:<id>'             a job changed — pushes to that job's SSE listeners
 * With several API processes these are only hints; SSE also polls the database.
 */
export function createEvents() {
  const ee = new EventEmitter()
  ee.setMaxListeners(0)
  return ee
}
