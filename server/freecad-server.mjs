import http from "node:http"
import { URL } from "node:url"
import { promises as fs } from "node:fs"
import path from "node:path"
import os from "node:os"
import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"

const PORT = Number(process.env.FREECAD_SERVER_PORT || 43110)
const FREECAD_CMD = process.env.FREECAD_CMD || "E:\\freecad\\bin\\freecad.exe"
const ROOT = path.join(os.tmpdir(), "freecad-runner")

const setCors = (res) => {
  res.setHeader("Access-Control-Allow-Origin", "*")
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
  res.setHeader("Access-Control-Allow-Headers", "Content-Type")
}

const send = (res, status, body, headers = {}) => {
  setCors(res)
  Object.entries(headers).forEach(([k, v]) => res.setHeader(k, v))
  res.statusCode = status
  res.end(body)
}

const sendJson = (res, status, obj) => {
  send(res, status, JSON.stringify(obj), { "Content-Type": "application/json; charset=utf-8" })
}

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => {
      data += chunk
      if (data.length > 5_000_000) {
        req.destroy()
        reject(new Error("Body too large"))
      }
    })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })

const getFreecadArgs = (exePath, scriptPath) => {
  const base = path.basename(exePath).toLowerCase()
  if (base.includes("freecadcmd")) return [scriptPath]
  return ["-c", scriptPath]
}

const runFreecad = async (code) => {
  const id = randomUUID()
  const jobDir = path.join(ROOT, id)
  await fs.mkdir(jobDir, { recursive: true })

  const scriptPath = path.join(jobDir, "job.py")
  const outputPath = path.join(jobDir, "model.stl")
  const escapedOutputPath = outputPath.replace(/\\/g, "\\\\")

  const scriptParts = [
    "import os",
    "import sys",
    `output_path = r\"${escapedOutputPath}\"`,
    code,
    "import FreeCAD as App",
    "import Mesh",
    "doc = App.ActiveDocument",
    "if doc is None:",
    "    doc = App.newDocument(\"Doc\")",
    "doc.recompute()",
    "objs = [o for o in doc.Objects if hasattr(o, \"Shape\") and not o.Shape.isNull()]",
    "if len(objs) == 0:",
    "    raise Exception(\"No exportable objects\")",
    "Mesh.export(objs, output_path)",
    "print(\"EXPORT_OK:\" + output_path)",
  ]
  const pythonScript = scriptParts.join("\n")

  await fs.writeFile(scriptPath, pythonScript, "utf-8")

  const stdout = []
  const stderr = []

  const proc = spawn(FREECAD_CMD, getFreecadArgs(FREECAD_CMD, scriptPath), { windowsHide: true })

  const timeoutMs = Number(process.env.FREECAD_TIMEOUT_MS || 120000)
  const timeout = setTimeout(() => {
    try {
      proc.kill()
    } catch {
    }
  }, timeoutMs)

  const exitCode = await new Promise((resolve, reject) => {
    proc.stdout.on("data", (d) => stdout.push(d.toString()))
    proc.stderr.on("data", (d) => stderr.push(d.toString()))
    proc.on("error", reject)
    proc.on("close", resolve)
  })

  clearTimeout(timeout)

  const exists = await fs.stat(outputPath).then(() => true).catch(() => false)
  if (exitCode !== 0 || !exists) {
    const err = stderr.join("") || stdout.join("") || "FreeCAD 执行失败"
    throw new Error(err)
  }

  return { id }
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    send(res, 404, "Not Found")
    return
  }

  const url = new URL(req.url, "http://localhost")
  const pathname = url.pathname

  if (req.method === "OPTIONS") {
    send(res, 204, "")
    return
  }

  if (req.method === "POST" && pathname === "/api/freecad/run") {
    try {
      const body = await readBody(req)
      const payload = JSON.parse(body || "{}")
      const code = String(payload.code || "").trim()
      if (!code) {
        send(res, 400, "Missing code")
        return
      }
      const result = await runFreecad(code)
      sendJson(res, 200, { meshUrl: `/api/freecad/mesh/${result.id}` })
      return
    } catch (e) {
      const message = e instanceof Error ? e.message : "FreeCAD 执行失败"
      send(res, 500, message)
      return
    }
  }

  if (req.method === "GET" && pathname.startsWith("/api/freecad/mesh/")) {
    const id = pathname.split("/").pop() || ""
    if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
      send(res, 400, "Invalid id")
      return
    }
    const filePath = path.join(ROOT, id, "model.stl")
    try {
      const data = await fs.readFile(filePath)
      send(res, 200, data, { "Content-Type": "model/stl" })
      return
    } catch {
      send(res, 404, "Not Found")
      return
    }
  }

  send(res, 404, "Not Found")
})

server.listen(PORT, () => {
  console.log(`FreeCAD server listening on http://localhost:${PORT}`)
})
