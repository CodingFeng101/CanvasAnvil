import { useEffect, useState } from "react";
import { Button } from "@/shared/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { useWorksT } from "./strings";

/** Asks for a work's name. Resolves null on cancel. */
export function NameDialog({
  request,
  onClose,
}: {
  request: { title: string; initial: string } | null;
  onClose: (name: string | null) => void;
}) {
  const t = useWorksT();
  const [name, setName] = useState("");
  useEffect(() => {
    if (request) setName(request.initial);
  }, [request]);
  const trimmed = name.trim();

  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose(null)}>
      <DialogContent className="sm:max-w-md">
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (trimmed) onClose(trimmed);
          }}
        >
          <DialogHeader>
            <DialogTitle>{request?.title}</DialogTitle>
            <DialogDescription>{t("save.desc")}</DialogDescription>
          </DialogHeader>
          <label className="grid gap-1.5 text-sm">
            <span className="text-muted-foreground">{t("save.name")}</span>
            <Input autoFocus value={name} maxLength={80} onChange={(event) => setName(event.target.value)} onFocus={(event) => event.target.select()} />
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onClose(null)}>
              {t("save.cancel")}
            </Button>
            <Button type="submit" disabled={!trimmed}>
              {t("save.confirm")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A draft with content, or a saved work with unsaved changes, is being left. */
export type LeaveRequest = { kind: "draft"; canvas: string } | { kind: "changes"; name: string };

/** Leaving unsaved content: save, don't save, or stay. */
export function LeaveDialog({
  request,
  onClose,
}: {
  request: LeaveRequest | null;
  onClose: (choice: "save" | "discard" | "cancel") => void;
}) {
  const t = useWorksT();
  return (
    <Dialog open={!!request} onOpenChange={(open) => !open && onClose("cancel")}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{request?.kind === "changes" ? t("leave.changesTitle") : t("leave.title")}</DialogTitle>
          <DialogDescription>
            {request?.kind === "changes"
              ? t("leave.changesDesc", { name: request.name })
              : t("leave.desc", { canvas: request?.canvas ?? "" })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose("cancel")}>
            {t("leave.cancel")}
          </Button>
          <Button variant="outline" onClick={() => onClose("discard")}>
            {t("leave.discard")}
          </Button>
          <Button onClick={() => onClose("save")}>{t("leave.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
