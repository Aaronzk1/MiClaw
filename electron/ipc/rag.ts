import { readFileSync } from 'fs'
import { extname } from 'path'
import { logger } from './logger'
import { kvList, kvUpsert, kvDelete, getDB } from '../storage/db'
import { loadConfig } from './core'

export interface RagDocument {
  id: string
  filename: string
  content: string
  chunks: string[]
  chunkCount: number
  source: string
  createdAt: string
}

export async function importDocument(filePath: string): Promise<{ ok: boolean; docId?: string; error?: string }> {
  try {
    const ext = extname(filePath).toLowerCase()
    const supported = ['.txt', '.md', '.json', '.csv', '.py', '.js', '.ts', '.html', '.css']
    if (!supported.includes(ext)) return { ok: false, error: `Unsupported format: ${ext}` }

    const content = readFileSync(filePath, 'utf8').slice(0, 500000)
    const chunks = chunkText(content, 500, 50)
    const docId = 'doc-' + Date.now()

    kvUpsert('documents', docId, {
      id: docId,
      filename: filePath.split(/[\\/]/).pop(),
      content: content.slice(0, 5000),
      chunks,
      chunkCount: chunks.length,
      source: filePath,
      createdAt: new Date().toISOString(),
    })

    generateChunkEmbeddings(docId, chunks)
    logger.info('RAG', `Imported: ${filePath}`, { chunks: chunks.length })
    return { ok: true, docId }
  } catch (e: any) {
    return { ok: false, error: e.message }
  }
}

function chunkText(text: string, chunkSize: number, overlap: number): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length)
    chunks.push(text.slice(start, end))
    start += chunkSize - overlap
  }
  return chunks
}

async function generateChunkEmbeddings(docId: string, chunks: string[]) {
  try {
    const config = loadConfig()
    const port = config.gateway?.port || 18789
    for (let i = 0; i < chunks.length; i += 10) {
      const batch = chunks.slice(i, i + 10)
      const resp = await fetch(`http://127.0.0.1:${port}/v1/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: batch }),
      })
      const data = await resp.json()
      if (data.data) {
        for (let j = 0; j < data.data.length; j++) {
          const chunkIdx = i + j
          getDB().prepare('INSERT OR REPLACE INTO rag_chunks (id, doc_id, chunk_idx, content, embedding) VALUES (?, ?, ?, ?, ?)').run(
            `${docId}-chunk-${chunkIdx}`, docId, chunkIdx, batch[j], JSON.stringify(data.data[j].embedding)
          )
        }
      }
    }
    logger.info('RAG', `Embeddings done: ${docId}`)
  } catch (e: any) {
    logger.warn('RAG', `Embedding failed: ${e.message}, using keyword fallback`)
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; normA += a[i] * a[i]; normB += b[i] * b[i]
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1)
}

export async function searchDocuments(query: string, topK = 5): Promise<Array<{ text: string; score: number; docId: string }>> {
  const embeddings = getDB().prepare('SELECT doc_id as docId, chunk_idx as chunkIdx, content as text, embedding FROM rag_chunks').all() as any[]
    for (const e of embeddings) { if (typeof e.embedding === 'string') e.embedding = JSON.parse(e.embedding) }
  if (embeddings.length === 0) return keywordSearch(query, topK)

  try {
    const config = loadConfig()
    const port = config.gateway?.port || 18789
    const resp = await fetch(`http://127.0.0.1:${port}/v1/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: query }),
    })
    const data = await resp.json()
    const queryEmb = data.data?.[0]?.embedding
    if (!queryEmb) return keywordSearch(query, topK)

    return embeddings
      .map((e: any) => ({ text: e.text, docId: e.docId, score: cosineSimilarity(queryEmb, e.embedding) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, topK)
      .filter(r => r.score > 0.25)
  } catch {
    return keywordSearch(query, topK)
  }
}

function keywordSearch(query: string, topK: number): Array<{ text: string; score: number; docId: string }> {
  const docs = kvList('documents') as any[]
  const words = query.toLowerCase().split(/\s+/).filter(w => w.length > 1)
  const results: Array<{ text: string; score: number; docId: string }> = []
  for (const doc of docs) {
    for (const chunk of (doc.chunks || [])) {
      const lower = chunk.toLowerCase()
      const score = words.filter(w => lower.includes(w)).length / (words.length || 1)
      if (score > 0) results.push({ text: chunk, score, docId: doc.id })
    }
  }
  return results.sort((a, b) => b.score - a.score).slice(0, topK)
}

export function listDocuments() {
  return kvList('documents').map((d: any) => ({
    id: d.id, filename: d.filename, chunkCount: d.chunkCount, createdAt: d.createdAt,
  }))
}

export function deleteDocument(docId: string) {
  kvDelete('documents', docId)
  getDB().prepare('DELETE FROM rag_chunks WHERE doc_id = ?').run(docId)
}

export async function injectRAGContext(messages: any[], userMessage: string): Promise<number> {
  const results = await searchDocuments(userMessage, 3)
  if (results.length === 0) return 0
  const ragContext = results
    .map((r, i) => `[Ref${i + 1}] (${(r.score * 100).toFixed(0)}%)\n${r.text}`)
    .join('\n\n---\n\n')
  const insertIdx = messages.findIndex(m => m.role === 'system') + 1
  messages.splice(insertIdx, 0, { role: 'system', content: `[Knowledge Base]\n${ragContext}` })
  return results.length
}