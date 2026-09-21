import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

/**
 * File storage behind a small interface so Supabase Storage / S3 can replace
 * the local disk without touching callers (see docs/05-handoff.md).
 *   put(key, srcPath)  move an uploaded temp file into place
 *   putBuffer(key, buf)
 *   read(key) → Buffer      stream(key) → Readable      exists(key)      remove(key)
 * Keys look like  ws/<workspaceId>/jobs/<jobId>/<inputId>-<name>
 */
export function createLocalStorage(root) {
  const abs = (key) => {
    const p = path.resolve(root, key)
    if (!p.startsWith(path.resolve(root) + path.sep)) throw new Error(`storage key escapes root: ${key}`)
    return p
  }
  return {
    kind: 'local',
    tmpDir: path.join(root, 'tmp'),
    async init() {
      await fsp.mkdir(path.join(root, 'tmp'), { recursive: true })
    },
    async put(key, srcPath) {
      const dest = abs(key)
      await fsp.mkdir(path.dirname(dest), { recursive: true })
      try {
        await fsp.rename(srcPath, dest)
      } catch {
        await fsp.copyFile(srcPath, dest)
        await fsp.rm(srcPath, { force: true })
      }
      return key
    },
    async putBuffer(key, buf) {
      const dest = abs(key)
      await fsp.mkdir(path.dirname(dest), { recursive: true })
      await fsp.writeFile(dest, buf)
      return key
    },
    localPath: abs,
    read: (key) => fsp.readFile(abs(key)),
    stream: (key) => fs.createReadStream(abs(key)),
    exists: (key) => fsp.access(abs(key)).then(() => true, () => false),
    remove: (key) => fsp.rm(abs(key), { force: true, recursive: true }),
  }
}
