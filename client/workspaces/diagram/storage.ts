import { createWorkspaceStore, type WorkspaceStore } from "@/shared/storage/indexed-db-store"
import { migrateLegacyOnce, readLocalStorage, readLocalStorageJson } from "@/shared/storage/legacy-migration"

/**
 * Every localStorage key the Diagram workspace uses.
 *
 * The names keep their original "next-ai-draw-io-" prefix from before this
 * workspace was folded into CanvasAnvil: renaming one would orphan whatever a
 * user had saved under it.
 *
 * messages, xmlSnapshots and diagramXml are no longer written here: they moved
 * to diagramStore (below). The keys stay, both because the migration reads them
 * and because an older release rolled back to still finds its data there.
 */

export const STORAGE_KEYS = {
    // Chat data
    messages: "next-ai-draw-io-messages",
    xmlSnapshots: "next-ai-draw-io-xml-snapshots",
    diagramXml: "next-ai-draw-io-diagram-xml",
    sessionId: "next-ai-draw-io-session-id",

    // Quota tracking
    requestCount: "next-ai-draw-io-request-count",
    requestDate: "next-ai-draw-io-request-date",
    tokenCount: "next-ai-draw-io-token-count",
    tokenDate: "next-ai-draw-io-token-date",
    tpmCount: "next-ai-draw-io-tpm-count",
    tpmMinute: "next-ai-draw-io-tpm-minute",

    // Settings
    globalConstraints: "next-ai-draw-io-global-constraints",
    accessCode: "next-ai-draw-io-access-code",
    aiProvider: "next-ai-draw-io-ai-provider",
    aiApiKey: "next-ai-draw-io-ai-api-key",
} as const

/** Database name is load-bearing: changing it orphans everything users saved. */
export const diagramStore = createWorkspaceStore("CanvasAnvilDiagramWorkspaceDB")

/** The large pieces of a diagram session, kept in diagramStore instead of localStorage (~5 MB cap). */
export const DIAGRAM_DB_KEYS = {
    messages: "messages",
    xmlSnapshots: "xml-snapshots",
    diagramXml: "diagram-xml",
} as const

const LEGACY_MIGRATION_KEY = "migrated:local-storage"

export interface DiagramSession {
    messages: unknown[] | null
    xmlSnapshots: Array<[number, string]> | null
    diagramXml: string | null
}

/** Copies the localStorage session into the store once; the old keys are left in place. */
export function migrateDiagramSession(store: WorkspaceStore = diagramStore) {
    return migrateLegacyOnce(store, LEGACY_MIGRATION_KEY, [
        { key: DIAGRAM_DB_KEYS.messages, readLegacy: () => readLocalStorageJson(STORAGE_KEYS.messages) },
        { key: DIAGRAM_DB_KEYS.xmlSnapshots, readLegacy: () => readLocalStorageJson(STORAGE_KEYS.xmlSnapshots) },
        { key: DIAGRAM_DB_KEYS.diagramXml, readLegacy: () => readLocalStorage(STORAGE_KEYS.diagramXml) },
    ])
}

/** Reads the saved session; each piece is null when absent or malformed. */
export async function loadDiagramSession(store: WorkspaceStore = diagramStore): Promise<DiagramSession> {
    const [messages, xmlSnapshots, diagramXml] = await Promise.all([
        store.read<unknown>(DIAGRAM_DB_KEYS.messages),
        store.read<unknown>(DIAGRAM_DB_KEYS.xmlSnapshots),
        store.read<unknown>(DIAGRAM_DB_KEYS.diagramXml),
    ])
    return {
        messages: Array.isArray(messages) ? messages : null,
        xmlSnapshots: Array.isArray(xmlSnapshots)
            ? (xmlSnapshots.filter(
                  (entry) => Array.isArray(entry) && typeof entry[0] === "number" && typeof entry[1] === "string",
              ) as Array<[number, string]>)
            : null,
        diagramXml: typeof diagramXml === "string" ? diagramXml : null,
    }
}

/**
 * Chat messages go through a JSON round trip before being stored: IndexedDB
 * structured-clones its values and a stray non-cloneable field would fail the
 * whole write, where localStorage used to just stringify it.
 */
export function toStorableMessages(messages: unknown[]): unknown[] {
    return JSON.parse(JSON.stringify(messages))
}
