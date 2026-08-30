import React from "react";
import { Button } from "@/shared/ui/button";
import { getUiLanguage, t } from "@/shared/i18n";

/**
 * Catches a render crash in a workspace so the rest of the shell — the header,
 * the settings dialog, the other canvases — stays usable, and offers a retry
 * that does not throw away the page.
 */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error("UI crashed", error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    // Read the language directly: a hook is not available in a class, and this
    // path renders once, after a crash.
    const uiLang = getUiLanguage();
    return (
      <div className="w-full h-full flex items-center justify-center p-6">
        <div className="max-w-[720px] w-full rounded-xl border border-border/60 bg-background p-5">
          <div className="text-base font-medium mb-2">UI Error</div>
          <div className="text-sm text-muted-foreground whitespace-pre-wrap break-words mb-4">
            {String(this.state.error?.message || "Unknown error")}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="default" onClick={() => window.location.reload()}>
              {t(uiLang, "app.refresh")}
            </Button>
            <Button variant="outline" onClick={() => this.setState({ error: null })}>
              {t(uiLang, "app.tryContinue")}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
