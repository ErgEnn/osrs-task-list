import { normalizeSkillName } from '@/domain/skills';
import type { Status, TaskPayload } from '@/domain/types';
import { STATUSES } from '@/domain/types';
import type { TaskDraft } from '@/store/taskStore';

/**
 * Wiki-capture deep links: the companion userscript (public/osrs-task-capture.user.js)
 * runs on oldschool.runescape.wiki — a different origin, so it cannot touch this
 * app's localStorage. Instead it opens `<app>#/capture?d=<base64url JSON>` and the
 * app imports the task on load. Version field guards the wire format.
 */
export interface CaptureEnvelope {
  v: 1;
  title?: string;
  description?: string;
  status?: Status;
  payload: TaskPayload;
}

export type CaptureParse = { ok: true; draft: TaskDraft } | { ok: false; error: string };

function base64UrlDecode(data: string): string {
  const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function asName(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, Math.round(n)));
}

function parsePayload(raw: unknown): TaskPayload | string {
  if (typeof raw !== 'object' || raw === null) return 'missing payload';
  const p = raw as Record<string, unknown>;
  switch (p.kind) {
    case 'item': {
      const itemName = asName(p.itemName);
      if (!itemName) return 'item capture needs an item name';
      const quantity = asInt(p.quantity, 1, 2_000_000_000);
      return quantity === null ? { kind: 'item', itemName } : { kind: 'item', itemName, quantity };
    }
    case 'level': {
      const skill = typeof p.skill === 'string' ? normalizeSkillName(p.skill) : null;
      if (!skill) return `unknown skill "${String(p.skill)}"`;
      const level = asInt(p.level, 1, 99);
      if (level === null) return 'level capture needs a level';
      return { kind: 'level', skill, level };
    }
    case 'quest': {
      const questName = asName(p.questName);
      if (!questName) return 'quest capture needs a quest name';
      return { kind: 'quest', questName };
    }
    case 'activity': {
      const activityName = asName(p.activityName);
      if (!activityName) return 'activity capture needs an activity name';
      const count = asInt(p.count, 1, 2_000_000_000);
      return count === null
        ? { kind: 'activity', activityName }
        : { kind: 'activity', activityName, count };
    }
    case 'kill': {
      const monsterName = asName(p.monsterName);
      if (!monsterName) return 'kill capture needs a monster name';
      const count = asInt(p.count, 1, 2_000_000_000);
      return count === null ? { kind: 'kill', monsterName } : { kind: 'kill', monsterName, count };
    }
    case 'clog': {
      const target = asName(p.target);
      if (!target) return 'collection log capture needs a target';
      return { kind: 'clog', target };
    }
    case 'ca': {
      const name = asName(p.name);
      if (!name) return 'combat achievement capture needs a name';
      return { kind: 'ca', name };
    }
    default:
      return `unknown task type "${String(p.kind)}"`;
  }
}

export function parseCapture(data: string): CaptureParse {
  let envelope: unknown;
  try {
    envelope = JSON.parse(base64UrlDecode(data));
  } catch {
    return { ok: false, error: 'could not decode the capture data' };
  }
  if (typeof envelope !== 'object' || envelope === null) {
    return { ok: false, error: 'could not decode the capture data' };
  }
  const raw = envelope as Record<string, unknown>;
  if (raw.v !== 1) return { ok: false, error: `unsupported capture version "${String(raw.v)}"` };

  const payload = parsePayload(raw.payload);
  if (typeof payload === 'string') return { ok: false, error: payload };

  const status = STATUSES.find((s) => s === raw.status) ?? 'todo';
  return {
    ok: true,
    draft: {
      payload,
      status,
      title: asName(raw.title) ?? undefined,
      description: typeof raw.description === 'string' ? raw.description : undefined,
    },
  };
}

/** Null when the hash is not a capture link at all. */
export function captureFromHash(hash: string): CaptureParse | null {
  const match = /^#\/?capture\?(.*)$/.exec(hash);
  if (!match) return null;
  const data = new URLSearchParams(match[1]).get('d');
  if (!data) return { ok: false, error: 'capture link is missing its data' };
  return parseCapture(data);
}
