import { PipelineError, runPipeline } from './stages.js'

const STALE_MINUTES = 10
const MAX_ATTEMPTS = 3

/**
 * Pulls queued jobs and runs the pipeline. Claiming uses FOR UPDATE SKIP LOCKED,
 * so several workers (or several API processes) never take the same job.
 * A job whose worker died is re-queued after STALE_MINUTES, up to MAX_ATTEMPTS.
 */
export function createWorker(deps) {
  const { db, events, log, config } = deps
  const workerId = `w-${process.pid}-${Math.random().toString(36).slice(2, 6)}`
  const concurrency = Math.max(1, config.workerConcurrency)
  let running = 0
  let stopped = true
  let timer = null
  const inflight = new Set()

  const claim = () => db.one(
    `update app.jobs
        set status = 'running', locked_by = $1, locked_at = now(), started_at = coalesce(started_at, now()), attempts = attempts + 1
      where id = (
        select id from app.jobs where status = 'queued' order by created_at limit 1 for update skip locked
      )
      returning *`,
    [workerId],
  )

  async function recoverStale() {
    const failed = await db.query(
      `update app.jobs set status = 'failed', locked_by = null, finished_at = now(),
              error = 'Processing stopped unexpectedly several times. Try again, or contact support.'
        where status = 'running' and locked_at < now() - make_interval(mins => $1) and attempts >= $2
        returning id`,
      [STALE_MINUTES, MAX_ATTEMPTS],
    )
    const requeued = await db.query(
      `update app.jobs set status = 'queued', locked_by = null
        where status = 'running' and locked_at < now() - make_interval(mins => $1) and attempts < $2
        returning id`,
      [STALE_MINUTES, MAX_ATTEMPTS],
    )
    if (requeued.length) {
      await db.query(`update app.job_stages set status = 'pending', started_at = null, finished_at = null, log = '[]' where job_id = any($1::uuid[])`, [requeued.map((r) => r.id)])
    }
    if (failed.length || requeued.length) log.warn({ failed: failed.length, requeued: requeued.length }, 'recovered stale jobs')
  }

  async function runJob(job) {
    const started = Date.now()
    try {
      await runPipeline(deps, job)
      log.info({ jobId: job.id, ms: Date.now() - started }, 'job succeeded')
    } catch (e) {
      const message = e instanceof PipelineError ? e.message : 'Something went wrong while processing. Try again.'
      if (!(e instanceof PipelineError)) log.error({ err: e, jobId: job.id }, 'job crashed')
      await db.query(
        `update app.jobs set status = 'failed', error = $2, finished_at = now(), locked_by = null where id = $1`,
        [job.id, message],
      ).catch((err) => log.error({ err }, 'could not mark job failed'))
      events.emit(`job:${job.id}`)
    }
  }

  async function tick() {
    if (stopped) return
    try {
      while (!stopped && running < concurrency) {
        const job = await claim()
        if (!job) break
        running++
        const p = runJob(job).finally(() => {
          running--
          inflight.delete(p)
          schedule(0)
        })
        inflight.add(p)
      }
    } catch (e) {
      log.error({ err: e }, 'worker poll failed')
    }
    schedule(config.workerPollMs)
  }

  function schedule(ms) {
    if (stopped) return
    clearTimeout(timer)
    timer = setTimeout(tick, ms)
  }

  const wake = () => schedule(0)
  let staleTimer = null

  return {
    workerId,
    async start() {
      stopped = false
      await recoverStale()
      events.on('job:queued', wake)
      staleTimer = setInterval(() => recoverStale().catch((e) => log.error({ err: e }, 'stale recovery failed')), 60_000)
      staleTimer.unref?.()
      schedule(0)
      log.info({ workerId, concurrency }, 'pipeline worker started')
    },
    /** Stop claiming and wait for jobs in flight (up to `graceMs`). */
    async stop(graceMs = 10_000) {
      stopped = true
      clearTimeout(timer)
      clearInterval(staleTimer)
      events.off('job:queued', wake)
      await Promise.race([Promise.allSettled([...inflight]), new Promise((r) => setTimeout(r, graceMs))])
    },
    /** Test helper: resolve once no job is queued or running. */
    async drain(timeoutMs = 20_000) {
      const until = Date.now() + timeoutMs
      while (Date.now() < until) {
        const { n } = await db.one(`select count(*)::int as n from app.jobs where status in ('queued', 'running')`)
        if (!n && !running) return
        await new Promise((r) => setTimeout(r, 50))
      }
      throw new Error('worker did not drain in time')
    },
  }
}
