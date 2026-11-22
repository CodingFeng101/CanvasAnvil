import { useSyncExternalStore } from "react";

/*
 * The order the user gave the sidebar's recents by dragging them.
 *
 * Recents sort by when a work last really changed. A row the user moved keeps
 * the place they gave it (a sort value of its own) until the work changes
 * again: the move is remembered with the work's `updatedAt` at that moment,
 * and once that moves on, the work goes back to sorting by it, so an edited
 * work still comes to the top.
 *
 * Kept in localStorage for this browser only; nothing in the works store changes.
 */

const KEY = "CanvasAnvil-recent-order-v1";

interface Placed {
  /** The sort value the user gave the row (larger is higher). */
  at: number;
  /** The work's `updatedAt` when it was placed; a newer one ends the placement. */
  stamp: number;
}

type Order = Record<string, Placed>;

const listeners = new Set<() => void>();

function read(): Order {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as Order) : {};
  } catch {
    return {};
  }
}

let current: Order = typeof window === "undefined" ? {} : read();

function write(next: Order) {
  current = next;
  try {
    if (Object.keys(next).length) localStorage.setItem(KEY, JSON.stringify(next));
    else localStorage.removeItem(KEY);
  } catch {
    /* private mode: kept for this visit only */
  }
  for (const listener of listeners) listener();
}

export const recentKey = (workspace: string, id: string) => `${workspace}:${id}`;

/** Where a row sorts: the place the user gave it, while the work hasn't changed since; else when it last changed. */
export function sortValue(order: Order, key: string, updatedAt: number): number {
  const placed = order[key];
  return placed && placed.stamp === updatedAt ? placed.at : updatedAt;
}

/**
 * Put one row between two others (the rows that end up above and below it,
 * already in their sorted order; `null` at either end of the list).
 */
export function placeRecent(
  key: string,
  updatedAt: number,
  above: { key: string; updatedAt: number } | null,
  below: { key: string; updatedAt: number } | null,
) {
  const value = (row: { key: string; updatedAt: number }) => sortValue(current, row.key, row.updatedAt);
  const hi = above ? value(above) : null;
  const lo = below ? value(below) : null;
  const at = hi !== null && lo !== null ? (hi + lo) / 2 : hi !== null ? hi - 60_000 : lo !== null ? lo + 1 : updatedAt;
  write({ ...current, [key]: { at, stamp: updatedAt } });
}

/** Forget every move: the recents sort by when each work last changed again. */
export function resetRecentOrder() {
  write({});
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const get = () => current;

export function useRecentOrder(): Order {
  return useSyncExternalStore(subscribe, get, get);
}
