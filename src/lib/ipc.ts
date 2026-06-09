import type { AaronClawAPI } from '../types/ipc-api'

export const api: AaronClawAPI = (window as any).api

export async function withErrorToast<T>(promise: Promise<T>, context: string): Promise<T> {
  try {
    return await promise
  } catch (err: any) {
    console.error(`[${context}]`, err)
    throw err
  }
}
