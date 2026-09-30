// admin/vite-plugin.ts — the dev-only builder endpoints (Phase 9, slice 3).
//
// The plugin owns the on-disk builder storage: the document collection
// (`src/builder/generated/documents.json`) and the compiled theme artifacts.
// It is a Vite middleware (`apply: 'serve'`) and is never part of the public
// build. Endpoints:
//
//   GET  /__jlz-admin/documents        the whole collection
//   GET  /__jlz-admin/document?slug=   one document (no slug → the first)
//   POST /__jlz-admin/save             upsert { slug, document } + compile theme
//   POST /__jlz-admin/delete           { slug } → remove from the collection
//
// The save body is strictly the `{ slug, document }` envelope; the envelope
// slug must match the document slug.
import { existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import less from 'less'

import {
  generateBuilderComponentLess,
  generateBuilderThemeLess,
  getBuilderUIKitComponents,
} from '../src/builder/compiler'
import {
  BUILDER_DOCUMENTS_VERSION,
  findBuilderDocument,
  isSafeBuilderSlug,
  removeBuilderDocument,
  upsertBuilderDocument,
  validateBuilderDocuments,
  type BuilderDocuments,
} from '../src/builder/documents'
import { validateBuilderDocument } from '../src/builder/schema'

const MAX_DOCUMENT_BYTES = 256 * 1024

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Builder request failed'
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.statusCode = status
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.setHeader('Cache-Control', 'no-store')
  response.end(JSON.stringify(body))
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  let body = ''
  for await (const chunk of request) {
    body += chunk.toString()
    if (Buffer.byteLength(body) > MAX_DOCUMENT_BYTES) throw new Error('Document exceeds 256 KB')
  }
  return JSON.parse(body) as unknown
}

function writeAtomic(path: string, content: string): void {
  const temporaryPath = `${path}.tmp`
  writeFileSync(temporaryPath, content, 'utf8')
  renameSync(temporaryPath, path)
}

export function jlzAdminPlugin(): Plugin {
  const root = resolve(import.meta.dirname, '..')
  const documentsPath = resolve(root, 'src/builder/generated/documents.json')
  const themePath = resolve(root, 'src/assets/builder/theme.generated.less')
  const componentsPath = resolve(root, 'src/assets/builder/components.generated.less')
  const mainLessPath = resolve(root, 'src/assets/main.less')

  /** Read the current document collection. */
  const loadCollection = (): BuilderDocuments => {
    if (existsSync(documentsPath)) {
      const validation = validateBuilderDocuments(
        JSON.parse(readFileSync(documentsPath, 'utf8')) as unknown,
      )
      if (!validation.ok || !validation.documents)
        throw new Error(`documents.json is invalid: ${validation.errors.join('; ')}`)
      return validation.documents
    }
    return { version: BUILDER_DOCUMENTS_VERSION, documents: [] }
  }

  const saveCollection = (collection: BuilderDocuments): void => {
    writeAtomic(documentsPath, `${JSON.stringify(collection, null, 2)}\n`)
  }

  return {
    name: 'jlz-dev-admin',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? '/', 'http://localhost')
        const pathname = url.pathname

        if (pathname === '/__jlz-admin/documents') {
          if (request.method !== 'GET') {
            sendJson(response, 405, { ok: false, error: 'Method not allowed' })
            return
          }
          try {
            sendJson(response, 200, loadCollection())
          } catch (error) {
            sendJson(response, 500, { ok: false, error: errorMessage(error) })
          }
          return
        }

        if (pathname === '/__jlz-admin/document') {
          if (request.method !== 'GET') {
            sendJson(response, 405, { ok: false, error: 'Method not allowed' })
            return
          }
          try {
            const collection = loadCollection()
            const slug = url.searchParams.get('slug')
            const document = slug ? findBuilderDocument(collection, slug) : collection.documents[0]
            if (!document) {
              sendJson(response, 404, {
                ok: false,
                error: slug ? `Unknown document "${slug}"` : 'No documents saved yet',
              })
              return
            }
            sendJson(response, 200, document)
          } catch (error) {
            sendJson(response, 500, { ok: false, error: errorMessage(error) })
          }
          return
        }

        if (pathname === '/__jlz-admin/save') {
          if (request.method !== 'POST') {
            sendJson(response, 405, { ok: false, error: 'Method not allowed' })
            return
          }
          if (!request.headers['content-type']?.startsWith('application/json')) {
            sendJson(response, 415, { ok: false, error: 'Expected application/json' })
            return
          }

          let snapshots: Array<{ path: string; content: string }> = []
          try {
            const body = await readJsonBody(request)
            if (!isRecord(body) || !isRecord(body.document)) {
              sendJson(response, 400, { ok: false, error: 'Expected { slug, document }' })
              return
            }
            const validation = validateBuilderDocument(body.document)
            if (!validation.ok || !validation.document) {
              sendJson(response, 400, { ok: false, error: validation.errors.join('; ') })
              return
            }
            const document = validation.document
            if (body.slug !== document.slug) {
              sendJson(response, 400, {
                ok: false,
                error: 'envelope slug must match the document slug',
              })
              return
            }

            const collection = upsertBuilderDocument(loadCollection(), document)
            const collectionValidation = validateBuilderDocuments(collection)
            if (!collectionValidation.ok || !collectionValidation.documents) {
              sendJson(response, 400, {
                ok: false,
                error: collectionValidation.errors.join('; '),
              })
              return
            }

            const collectionJson = `${JSON.stringify(collectionValidation.documents, null, 2)}\n`
            const themeLess = generateBuilderThemeLess(document)
            const componentsLess = generateBuilderComponentLess(document)
            snapshots = [documentsPath, themePath, componentsPath].map((path) => ({
              path,
              content: existsSync(path) ? readFileSync(path, 'utf8') : '',
            }))

            writeAtomic(documentsPath, collectionJson)
            writeAtomic(themePath, themeLess)
            writeAtomic(componentsPath, componentsLess)

            const mainLess = readFileSync(mainLessPath, 'utf8')
            const compilation = await less.render(mainLess, {
              filename: mainLessPath,
              javascriptEnabled: true,
              rewriteUrls: 'all',
            })
            server.moduleGraph.invalidateAll()
            sendJson(response, 200, {
              ok: true,
              slug: document.slug,
              cssBytes: Buffer.byteLength(compilation.css),
              components: getBuilderUIKitComponents(document),
            })
          } catch (error) {
            for (const snapshot of snapshots) writeAtomic(snapshot.path, snapshot.content)
            const temporaryPaths = [documentsPath, themePath, componentsPath].map(
              (path) => `${path}.tmp`,
            )
            for (const path of temporaryPaths) if (existsSync(path)) unlinkSync(path)
            sendJson(response, 500, {
              ok: false,
              error: errorMessage(error),
            })
          }
          return
        }

        if (pathname === '/__jlz-admin/delete') {
          if (request.method !== 'POST') {
            sendJson(response, 405, { ok: false, error: 'Method not allowed' })
            return
          }
          if (!request.headers['content-type']?.startsWith('application/json')) {
            sendJson(response, 415, { ok: false, error: 'Expected application/json' })
            return
          }

          try {
            const body = (await readJsonBody(request)) as unknown
            if (!isRecord(body) || typeof body.slug !== 'string' || !isSafeBuilderSlug(body.slug)) {
              sendJson(response, 400, { ok: false, error: 'slug must be a safe document slug' })
              return
            }
            const collection = loadCollection()
            if (collection.documents.length < 2) {
              sendJson(response, 400, { ok: false, error: 'At least one document must remain' })
              return
            }
            const next = removeBuilderDocument(collection, body.slug)
            if (next.documents.length === collection.documents.length) {
              sendJson(response, 404, { ok: false, error: `Unknown document "${body.slug}"` })
              return
            }
            saveCollection(next)
            sendJson(response, 200, { ok: true, slug: body.slug })
          } catch (error) {
            sendJson(response, 500, { ok: false, error: errorMessage(error) })
          }
          return
        }

        next()
      })
    },
  }
}
