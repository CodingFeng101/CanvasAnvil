import { type ReactNode, useEffect, useRef, useState } from "react"
import { Layers } from "lucide-react"
import { CanvasPaneProvider, useCanvasPaneState } from "@/shared/canvas-pane"
import { DrawIoEmbed } from "react-drawio"
import ChatPanel from "@/workspaces/diagram/chat/ChatPanel"
import {
    ResizableHandle,
    ResizablePanel,
    ResizablePanelGroup,
} from "@/shared/ui/resizable"
import { CanvasSheet, sheetHandleClass } from "@/shared/ui/canvas-sheet"
import { DiagramProvider, useDiagram } from "@/workspaces/diagram/state/diagram-context"
import { useTheme } from "@/shared/theme"
import { Button } from "@/shared/ui/button"
import { DRAWIO_LOAD_TIMEOUT_MS, drawioSettleDelay, drawioSources, findLocalDrawio, nextDrawioSource } from "@/workspaces/diagram/lib/drawio-source"
import { useDiagramT } from "@/workspaces/diagram/lib/translations"

const CONFIGURED_DRAWIO =
    typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_DRAWIO_BASE_URL
        ? String(import.meta.env.VITE_DRAWIO_BASE_URL).trim()
        : ""

/**
 * The addresses to try, once known: a configured address is known at once;
 * otherwise the local copy is looked for first (a quick same-origin request).
 * Looked up once per page, so remounts do not ask again.
 */
let sourcesLookup: Promise<string[]> | null = null
function useDrawioSources(): string[] | null {
    const [sources, setSources] = useState<string[] | null>(() =>
        CONFIGURED_DRAWIO ? drawioSources(CONFIGURED_DRAWIO) : null,
    )
    useEffect(() => {
        if (sources) return
        let alive = true
        sourcesLookup ??= findLocalDrawio(new URL(import.meta.env.BASE_URL || "/", window.location.href).href).then(
            (local) => drawioSources("", local),
        )
        void sourcesLookup.then((found) => {
            if (alive) setSources(found)
        })
        return () => {
            alive = false
        }
    }, [sources])
    return sources
}

/**
 * draw.io's chrome in Claude's colours, sent through its `configure` message
 * (its `css` option), since the editor lives in a cross-origin iframe. Its
 * blue primary button and active page tab become ink; the toolbar and footer
 * sit on the ivory ground. Diagram content is not touched.
 */
function drawioChromeCss(dark: boolean) {
    const ink = dark ? "#faf9f5" : "#141413"
    const onInk = dark ? "#141413" : "#faf9f5"
    const ground = dark ? "#262624" : "#faf9f5"
    const wash = dark ? "rgba(255,255,255,.08)" : "rgba(20,20,19,.06)"
    return [
        `.geBtn.gePrimaryBtn,.gePrimaryBtn{background:${ink}!important;border-color:${ink}!important;color:${onInk}!important;border-radius:8px!important;box-shadow:none!important;background-image:none!important}`,
        `.geActivePage,.geTabItem.geActivePage{color:${ink}!important;background:${wash}!important;border-color:transparent!important;border-radius:6px!important}`,
        `.geToolbarContainer,.geFooterContainer,.geTabContainer,.geMenubarContainer{background:${ground}!important;border-color:${wash}!important}`,
        `.geToolbar .geButton:hover,.geTabItem:hover{background:${wash}!important}`,
        `.geToolbar .geButton.geActiveButton,.geSelectedButton{background:${wash}!important}`,
    ].join("")
}

function DiagramCanvas() {
    const { drawioRef, handleDiagramExport, onDrawioLoad, resetDrawioReady, isDrawioReady } =
        useDiagram()
    const t = useDiagramT()
    const pane = useCanvasPaneState({ kind: t("canvas.kind"), icon: Layers, variant: "diagram" })
    const [isMobile, setIsMobile] = useState(false)
    // Theme is app-wide now; this canvas only mirrors it into the draw.io embed.
    const { isDark: darkMode, resolved } = useTheme()


    // The embed is keyed on the theme, so a change from anywhere -- the app
    // header, or the OS while set to "system" -- remounts it. Reset first so
    // onDrawioLoad fires again afterwards.
    useEffect(() => {
        resetDrawioReady()
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolved])

    // Each address gets a few seconds to load before the next is tried; when
    // none loads, the canvas says so instead of staying blank. The address that
    // worked is kept for later remounts (theme changes).
    const sources = useDrawioSources()
    const [sourceIndex, setSourceIndex] = useState(0)
    const [loadAttempt, setLoadAttempt] = useState(0)
    const [loadFailed, setLoadFailed] = useState(false)
    useEffect(() => {
        if (!sources || isDrawioReady || loadFailed) return
        const timer = window.setTimeout(() => {
            const next = nextDrawioSource(sources, sourceIndex)
            console.warn(`[DiagramCanvas] draw.io did not load from ${sources[sourceIndex]}`)
            if (next.kind === "next") {
                resetDrawioReady()
                setSourceIndex(next.index)
            } else {
                setLoadFailed(true)
            }
        }, DRAWIO_LOAD_TIMEOUT_MS)
        return () => window.clearTimeout(timer)
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sources, isDrawioReady, loadFailed, sourceIndex, loadAttempt, resolved])
    useEffect(() => {
        if (isDrawioReady) setLoadFailed(false)
    }, [isDrawioReady])
    // On the GitHub Pages copy of draw.io, a diagram loaded straight after the
    // editor's first load lands at 1% zoom; that copy is reported ready only
    // after it has settled. The public embed is reported ready at once.
    const onEditorLoad = () => {
        const delay = sources ? drawioSettleDelay(sources[sourceIndex]) : 0
        if (delay) window.setTimeout(onDrawioLoad, delay)
        else onDrawioLoad()
    }
    const retryDrawio = () => {
        resetDrawioReady()
        setSourceIndex(0)
        setLoadFailed(false)
        setLoadAttempt((n) => n + 1)
    }

    // Check mobile
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 768)
        }

        checkMobile()
        window.addEventListener("resize", checkMobile)
        return () => window.removeEventListener("resize", checkMobile)
    }, [])


    // Ctrl/Cmd+B: enlarge the canvas over the chat, or bring the chat back.
    const paneRef = useRef(pane.value)
    paneRef.current = pane.value
    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            if ((event.ctrlKey || event.metaKey) && event.key === "b") {
                event.preventDefault()
                paneRef.current.toggleMaximize()
            }
        }

        window.addEventListener("keydown", handleKeyDown)
        return () => window.removeEventListener("keydown", handleKeyDown)
    }, [])

    // Chat first on a desktop, as on claude.ai; on a phone the canvas stays on top.
    const canvasPanel = (
        <ResizablePanel
            id="drawio-panel"
            {...(isMobile ? { defaultSize: "50%", minSize: "20%" } : pane.canvasPanelProps)}
        >
            {/* On a desktop the canvas is a sheet beside the chat; on a
                phone it stays flush, stacked above the chat. */}
            <DiagramSheet flush={isMobile}>
                <div className="h-full overflow-hidden">
                    {sources && <DrawIoEmbed
                        key={`drawio-${darkMode}-${sourceIndex}-${loadAttempt}`}
                        ref={drawioRef}
                        onExport={handleDiagramExport}
                        onLoad={onEditorLoad}
                        baseUrl={sources[sourceIndex]}
                        urlParameters={{
                            ui: "min",
                            spin: true,
                            libraries: false,
                            saveAndExit: false,
                            // Works are saved with the app's own Save; draw.io's did nothing.
                            noSaveBtn: true,
                            noExitBtn: true,
                            dark: darkMode,
                        }}
                        configuration={{ css: drawioChromeCss(darkMode) }}
                    />}
                </div>
                {loadFailed && (
                    <div
                        role="alert"
                        className="absolute inset-0 flex items-center justify-center bg-background/95 p-6"
                    >
                        <div className="max-w-sm text-center space-y-3">
                            <p className="text-base font-medium">{t("drawio.load_failed")}</p>
                            <p className="text-sm text-muted-foreground">{t("drawio.load_failed_hint")}</p>
                            <Button onClick={retryDrawio}>{t("drawio.retry")}</Button>
                        </div>
                    </div>
                )}
            </DiagramSheet>
        </ResizablePanel>
    )

    const chatPanel = (
        <ResizablePanel
            id="chat-panel"
            {...(isMobile ? { defaultSize: "50%", minSize: "20%", maxSize: "80%" } : pane.chatPanelProps)}
        >
            <div ref={pane.chatColumnRef} className={isMobile ? "h-full" : pane.chatColumnClassName}>
                <ChatPanel
                    isMobile={isMobile}
                />
            </div>
        </ResizablePanel>
    )

    const handle = <ResizableHandle id="resize-handle" className={isMobile ? undefined : sheetHandleClass} />

    return (
        <CanvasPaneProvider value={pane.value}>
        <div className="h-full relative overflow-hidden">
            <ResizablePanelGroup
                id="main-panel-group-v3"
                key={isMobile ? "mobile" : "desktop"}
                orientation={isMobile ? "vertical" : "horizontal"}
                className="h-full"
            >
                {isMobile ? (
                    <>
                        {canvasPanel}
                        {handle}
                        {chatPanel}
                    </>
                ) : (
                    <>
                        {chatPanel}
                        {handle}
                        {canvasPanel}
                    </>
                )}
            </ResizablePanelGroup>
        </div>
        </CanvasPaneProvider>
    )
}

/** The draw.io canvas: a sheet on a desktop, flush on a phone. */
function DiagramSheet({ flush, children }: { flush: boolean; children: ReactNode }) {
    if (flush) return <div className="h-full relative">{children}</div>
    return <CanvasSheet>{children}</CanvasSheet>
}

/**
 * The Diagram workspace: a draw.io canvas beside its chat panel.
 *
 * The diagram context wraps the pair because both halves read and write
 * the same XML — the chat panel proposes edits, the canvas applies them.
 */
export function DiagramWorkspace() {
  return (
    <DiagramProvider>
      <DiagramCanvas />
    </DiagramProvider>
  );
}
