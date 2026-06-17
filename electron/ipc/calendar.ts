/**
 * Calendar — scheduling, reminders, time management
 * 
 * Simple event-based calendar stored in DB.
 * Supports: create events, list events, reminders, recurring events.
 */

import { randomUUID } from 'crypto'
import { kvList, kvUpsert, kvDelete } from '../storage/db'

interface CalendarEvent {
  id: string
  title: string
  description?: string
  startTime: string    // ISO string
  endTime?: string     // ISO string
  reminder?: number    // minutes before
  reminded?: boolean   // already notified?
  recurring?: 'daily' | 'weekly' | 'monthly' | 'none'
  category?: string
  completed?: boolean
  createdAt: string
}

// Create event
export function createEvent(event: Omit<CalendarEvent, 'id' | 'createdAt'>): CalendarEvent {
  const id = 'evt-' + Date.now() + '-' + randomUUID().slice(0, 8)
  const full: CalendarEvent = { ...event, id, createdAt: new Date().toISOString() }
  kvUpsert('calendar', id, full)
  return full
}

// List events (optionally filtered by date range)
export function listEvents(startDate?: string, endDate?: string): CalendarEvent[] {
  const events = kvList('calendar') as CalendarEvent[]
  if (!startDate) return events.sort((a, b) => a.startTime.localeCompare(b.startTime))
  return events
    .filter(e => e.startTime >= startDate && (!endDate || e.startTime <= endDate))
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
}

// Get upcoming events (next 7 days)
export function getUpcoming(): CalendarEvent[] {
  const now = new Date()
  const weekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000)
  return listEvents(now.toISOString(), weekLater.toISOString())
}

// Get today's events
export function getToday(): CalendarEvent[] {
  const today = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)
  return listEvents(today, tomorrow)
}

// Update event — reset reminded flag if startTime or reminder changed
export function updateEvent(id: string, updates: Partial<CalendarEvent>) {
  const existing = kvList('calendar').find((e: any) => e.id === id) as CalendarEvent | undefined
  if (!existing) return
  const merged = { ...existing, ...updates }
  if (updates.startTime || updates.reminder !== undefined) merged.reminded = false
  kvUpsert('calendar', id, merged)
}

// Delete event
export function deleteEvent(id: string) {
  kvDelete('calendar', id)
}

// Get events needing reminder (within next N minutes), mark as reminded to prevent spam
export function getDueReminders(minutes: number = 5): CalendarEvent[] {
  const now = new Date()
  const future = new Date(now.getTime() + minutes * 60 * 1000)
  const events = listEvents(now.toISOString(), future.toISOString())
  const due = events.filter(e => e.reminder && !e.completed && !e.reminded)
  for (const e of due) {
    kvUpsert('calendar', e.id, { ...e, reminded: true })
  }
  return due
}
