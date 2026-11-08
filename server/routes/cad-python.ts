import { spawn } from "node:child_process";

/**
 * Python for the CAD workspace: floorplan recognition (server/recognizer/recognize.py) and the delivery
 * check's file test (qa_files.py) run the designer's own Python scripts on this server.
 * PYTHON picks the interpreter; otherwise `python` on Windows, `python3` elsewhere.
 */
export const pythonCommand = () => process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");

let ready: Promise<boolean> | undefined;
/** Whether that Python has what the recognition scripts import (checked once). */
export function pythonReady(): Promise<boolean> {
  return ready ??= new Promise((resolve) => {
    const child = spawn(pythonCommand(), ["-c", "import numpy, cv2, PIL, fitz, ezdxf"], { windowsHide: true, stdio: "ignore" });
    const timer = setTimeout(() => { child.kill(); resolve(false); }, 30000);
    child.on("error", () => { clearTimeout(timer); resolve(false); });
    child.on("close", (code) => { clearTimeout(timer); resolve(code === 0); });
  });
}
