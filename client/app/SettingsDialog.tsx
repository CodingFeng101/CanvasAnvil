import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import {
  BarChart3,
  Clapperboard,
  FileText,
  Puzzle,
  Bell,
  Cpu,
  Database,
  ArrowRight,
  ExternalLink,
  Eye,
  EyeOff,
  Info,
  Keyboard,
  Loader2,
  Palette,
  PanelsTopLeft,
  ScrollText,
  Search,
  SlidersHorizontal,
  X,
  type LucideIcon,
} from "lucide-react";
import { errorText, notify } from "@/shared/ui/notify";
import { normalizeAIConfig } from "@contracts/ai";
import type { AIConfig } from "@contracts/ai";
import { getAIConfig, saveAIConfig } from "@/ai/storage";
import { addModel, modelsChanged, removeModel, selectModel, useModels } from "@/ai/model-lists";
import { WORKSPACES } from "@/app/workspaces";
import { useWorksControl } from "@/app/works/works-provider";
import { exportAllWorks, importAllWorks, parseWorksBackup, storageByCanvas, type WorksBackup } from "@/app/works/works-registry";
import { resetRecentOrder, useRecentOrder } from "@/app/works/recent-order";
import {
  BarList,
  CANVAS_COLOR,
  CanvasBar,
  CanvasDonut,
  HourColumns,
  TokenTrend,
  UsageHeatmap,
  UsageSummary,
  UsageTrend,
  WEEKDAY_NAMES,
  WeekdayColumns,
  peakHour,
  peakWeekday,
  type TrendRange,
  canvasName,
  formatCount,
  formatDuration,
} from "@/app/UsageStats";
import { DocsShelf, FaqList, VideoShelf } from "@/app/LearnSettings";
import { docsHref } from "@/pages/docs/route";
import { AnvilColophon } from "@/shared/ui/ornaments";
import { VIDEO_KINDS, type VideoKind } from "@/app/videos";
import { clearStats, usesByCanvas, useUsageStats } from "@/shared/usage-stats";
import {
  PLUGIN_COMMANDS,
  CommandBlock,
  SKILLS,
  TARGET_DIR,
  TARGET_NAME,
  gitCommands,
  installCommand,
  installSkill,
  useSkillsInfo,
  type SkillName,
  type SkillTarget,
  type SkillVia,
} from "@/app/SkillsSettings";
import type { WorkspaceId } from "@/app/workspaces";
import { setUiLanguage, useUiLanguage, type UiLanguage } from "@/shared/i18n";
import { cn } from "@/shared/lib/utils";
import { resetPreferences, setPreference, usePreferences, type ChimeKind, type Preferences } from "@/shared/preferences";
import { CHIME_KINDS, notificationsSupported, playChime, requestNotificationPermission } from "@/shared/task-done";
import { useTheme, type Theme } from "@/shared/theme";
import { listedWorks } from "@/shared/works/works-index";
import { OPEN_SETTINGS_EVENT, takePendingSettings, type OpenSettingsDetail, type SettingsSection } from "@/shared/settings-bus";
import { getConstraint, setConstraintEnabled, setConstraintText, useConstraintsVersion, type ConstraintScope } from "@/shared/constraints";
import { ConfirmDialog } from "@/shared/ui/confirm-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/ui/select";

/*
 * Settings, after Claude's own settings page: a search field and the
 * categories down the left; on the right, one row per setting (what it is and
 * a line of why on the left, its control on the right), rows parted by
 * hairlines. Everything applies the moment it changes; there is no Save.
 *
 * Model channels are reached over the OpenAI HTTP protocol, so a channel is
 * base URL + key + model name; pointing the base URL at a vendor's
 * OpenAI-compatible endpoint is all that switching providers takes.
 */

const REPO_URL = "https://github.com/CodingFeng101/CanvasAnvil";
const MINERU_LINK = "https://mineru.net/";

/** Where to get a key for the endpoint in Base URL; an unknown endpoint gets OpenAI's page. */
const KEY_PAGES: Array<[RegExp, string]> = [
  [/deepseek\.com/, "https://platform.deepseek.com/api_keys"],
  [/dashscope|aliyuncs\.com/, "https://bailian.console.aliyun.com/?apiKey=1"],
  [/moonshot/, "https://platform.moonshot.cn/console/api-keys"],
  [/bigmodel\.cn/, "https://open.bigmodel.cn/usercenter/apikeys"],
  [/volces\.com|volcengine/, "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey"],
  [/siliconflow/, "https://cloud.siliconflow.cn/account/ak"],
  [/openrouter\.ai/, "https://openrouter.ai/settings/keys"],
  [/anthropic\.com/, "https://console.anthropic.com/settings/keys"],
  [/googleapis\.com|generativelanguage/, "https://aistudio.google.com/apikey"],
];
function keyPageFor(baseUrl: string): string {
  const url = (baseUrl || "").toLowerCase();
  return KEY_PAGES.find(([re]) => re.test(url))?.[1] ?? "https://platform.openai.com/api-keys";
}
const OPENAI_KEYS_LINK = "https://platform.openai.com/api-keys";

type SectionId = SettingsSection;

const CHIME_LABEL: Record<ChimeKind, [string, string]> = {
  soft: ["轻叮", "Soft"],
  bell: ["铃声", "Bell"],
  marimba: ["木琴", "Marimba"],
  chord: ["和弦", "Chord"],
  pop: ["气泡", "Pop"],
  drop: ["水滴", "Drop"],
};
type ChannelKey = "text" | "image";

const CHANNEL_FIELDS = {
  text: { apiKey: "textApiKey", baseUrl: "textBaseUrl", model: "textModel" },
  image: { apiKey: "imageApiKey", baseUrl: "imageBaseUrl", model: "imageModel" },
} as const satisfies Record<ChannelKey, Record<"apiKey" | "baseUrl" | "model", keyof AIConfig>>;

// ---- Controls ---------------------------------------------------------------

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (next: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full transition-colors duration-fast ease-out-soft focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30",
        checked ? "bg-[hsl(211_78%_52%)]" : "bg-foreground/[0.16]",
      )}
    >
      <span
        className={cn(
          "absolute left-[3px] size-4 rounded-full bg-white shadow-[0_1px_2px_rgba(0,0,0,0.2)] transition-transform duration-fast ease-out-soft",
          checked && "translate-x-4",
        )}
      />
    </button>
  );
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: { value: T; label: string }[]; onChange: (next: T) => void }) {
  return (
    <div role="radiogroup" className="inline-flex shrink-0 rounded-lg bg-foreground/[0.05] p-0.5">
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 rounded-md px-3 text-[13px] transition-[background-color,color,box-shadow] duration-fast",
              on ? "bg-card text-foreground shadow-[0_1px_2px_rgba(20,20,19,0.08),0_0_0_1px_hsl(var(--border))]" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

function SelectBox<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (next: T) => void; label: string }) {
  // The app's one dropdown (shared/ui/select), not the browser's own list.
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger
        aria-label={label}
        size="sm"
        className="w-[200px] shrink-0 rounded-lg border-transparent bg-foreground/[0.05] px-3 text-[13px] shadow-none hover:bg-foreground/[0.08] data-[state=open]:bg-foreground/[0.08]"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end" className="min-w-[200px]">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

const fieldClass =
  "h-8 w-[280px] max-w-full shrink-0 rounded-lg border border-transparent bg-foreground/[0.05] px-3 text-[13px] text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 hover:bg-foreground/[0.08] focus-visible:border-ring/60 focus-visible:bg-card";

function TextField({ value, onChange, placeholder, label }: { value: string; onChange: (v: string) => void; placeholder: string; label: string }) {
  return <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={fieldClass} />;
}

function SecretField({ value, onChange, placeholder, label, zh }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; zh: boolean }) {
  const [visible, setVisible] = useState(false);
  const tip = zh ? (visible ? "隐藏" : "显示") : visible ? "Hide" : "Show";
  return (
    <div className="relative w-[280px] max-w-full shrink-0">
      <input
        aria-label={label}
        type={visible ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(fieldClass, "w-full pr-9")}
      />
      <button
        type="button"
        title={tip}
        aria-label={tip}
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-8 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
      </button>
    </div>
  );
}

function SmallButton({ children, onClick, danger, disabled, title }: { children: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[13px] transition-colors duration-fast disabled:opacity-50",
        danger ? "bg-destructive/[0.08] text-destructive hover:bg-destructive/[0.14]" : "bg-foreground/[0.06] text-foreground hover:bg-foreground/[0.1]",
      )}
    >
      {children}
    </button>
  );
}

function ModelList({ channel, zh, placeholder }: { channel: ChannelKey; zh: boolean; placeholder: string }) {
  const { models, current } = useModels(channel);
  const [draft, setDraft] = useState("");
  const add = () => {
    if (!draft.trim()) return;
    addModel(channel, draft);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {models.map((model) => {
        const on = model === current;
        return (
          <span
            key={model}
            className={cn(
              "group/chip inline-flex h-7 items-center rounded-lg border text-[12.5px] transition-colors duration-fast",
              on ? "border-foreground/25 bg-card text-foreground" : "border-border/80 text-muted-foreground hover:text-foreground",
            )}
          >
            <button type="button" title={on ? (zh ? "正在使用" : "In use") : zh ? "改用这个模型" : "Use this model"} onClick={() => selectModel(channel, model)} className="flex h-full items-center gap-1.5 pl-2.5 pr-1">
              <span className={cn("size-1.5 rounded-full", on ? "bg-[hsl(145_55%_42%)]" : "bg-foreground/20")} />
              {model}
            </button>
            <button type="button" title={zh ? "移除" : "Remove"} aria-label={zh ? `移除 ${model}` : `Remove ${model}`} onClick={() => removeModel(channel, model)} className="flex h-full w-6 items-center justify-center rounded-r-lg text-muted-foreground/70 hover:text-foreground">
              <X className="size-3" />
            </button>
          </span>
        );
      })}
      <input
        aria-label={zh ? "添加模型" : "Add a model"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
        placeholder={models.length ? (zh ? "+ 添加模型，回车确认" : "+ Add a model, Enter") : placeholder}
        className="h-7 w-[200px] rounded-lg border border-dashed border-border bg-transparent px-2.5 text-[12.5px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-ring/60"
      />
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-border/80 bg-card px-1.5 py-0.5 font-sans text-[12px] text-muted-foreground">{children}</kbd>;
}

// ---- Rows -------------------------------------------------------------------

interface RowSpec {
  section: SectionId;
  id: string;
  title: string;
  desc?: string;
  badge?: string;
  control: ReactNode;
  /** A full-width part under the row (a text box). */
  below?: ReactNode;
  /** Takes half the width: two half rows in a row share one line. */
  half?: boolean;
  /** Extra words the search should match. */
  keywords?: string;
  /** Rows of one block (a model channel), shown together under one heading. */
  group?: RowGroup;
}

interface RowGroup {
  id: string;
  title: string;
  desc?: string;
  action?: ReactNode;
}

/** The section's rows; a group's rows sit under its heading with no lines between them. */
function RowList({ rows }: { rows: RowSpec[] }) {
  const out: ReactNode[] = [];
  for (let i = 0; i < rows.length; ) {
    const group = rows[i].group;
    if (rows[i].half) {
      // A half row with no partner takes the whole line.
      const pair = [rows[i++]];
      if (i < rows.length && rows[i].half) pair.push(rows[i++]);
      out.push(
        <div key={`half-${pair[0].id}`} className={cn("grid gap-x-8 border-t border-border/70 py-1 first:border-t-0", pair.length === 2 && "sm:grid-cols-2")}>
          {pair.map((row) => (
            <Row key={row.id} row={row} plain half />
          ))}
        </div>,
      );
      continue;
    }
    if (!group) {
      out.push(<Row key={rows[i].id} row={rows[i]} />);
      i += 1;
      continue;
    }
    const members: RowSpec[] = [];
    while (i < rows.length && rows[i].group?.id === group.id) members.push(rows[i++]);
    out.push(
      <section key={`group-${group.id}`} className="border-t border-border/70 pb-2 pt-4 first:border-t-0 first:pt-1">
        <div className="flex items-center gap-4 pb-1">
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-semibold text-foreground">{group.title}</div>
            {group.desc && <p className="mt-0.5 text-[13px] text-muted-foreground">{group.desc}</p>}
          </div>
          {group.action}
        </div>
        {members.map((row) => (
          <Row key={row.id} row={row} plain />
        ))}
      </section>,
    );
  }
  return <>{out}</>;
}

function Row({ row, plain, half }: { row: RowSpec; plain?: boolean; half?: boolean }) {
  return (
    <div id={`settings-row-${row.id}`} className={plain ? "py-2.5" : "border-t border-border/70 py-3.5 first:border-t-0"}>
    <div className="flex items-center gap-6">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-medium text-foreground">{row.title}</span>
          {row.badge && <span className="rounded-md bg-foreground/[0.06] px-1.5 py-px text-[11px] text-muted-foreground">{row.badge}</span>}
        </div>
        {/* Side by side, the heading stays one line each so both charts start level. */}
        {row.desc && <p className={cn("mt-0.5 text-[13px] leading-relaxed text-muted-foreground", half && "truncate")} title={half ? row.desc : undefined}>{row.desc}</p>}
      </div>
      {row.control}
    </div>
    {row.below && <div className={half ? "mt-4" : "mt-2.5"}>{row.below}</div>}
    </div>
  );
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

// ---- The dialog -------------------------------------------------------------

/** One quiet line under each section's title, in the serif: what the section is for. */
const SECTION_LINES: Record<SettingsSection, Record<"zh" | "en", string>> = {
  general: { zh: "让它顺着你的习惯来。", en: "Let it follow your habits." },
  appearance: { zh: "字的大小，纸的质感，光的明暗。", en: "The size of the type, the feel of the paper, the light." },
  canvas: { zh: "画布占多大，由你决定。", en: "How much room the canvas takes is yours to decide." },
  notifications: { zh: "去忙别的吧，好了会叫你。", en: "Go and do something else; you will hear when it is done." },
  models: { zh: "它只说一种语言，所以接哪一家都行。", en: "It speaks one protocol, so any provider will do." },
  constraints: { zh: "写在这里的，它每一次都会记得。", en: "What you write here, it remembers every time." },
  shortcuts: { zh: "手不离开键盘，也能走完一整程。", en: "The whole way, without leaving the keyboard." },
  stats: { zh: "一点一滴，只记在这台电脑上。", en: "Every bit of it, counted on this computer alone." },
  skills: { zh: "把画布带进你常用的编程助手。", en: "Take the canvases into the coding agent you already use." },
  data: { zh: "你的作品，只在你这里。", en: "Your work stays with you." },
  tutorials: { zh: "看别人怎么用，往往比读说明更快。", en: "Watching is often quicker than reading." },
  docs: { zh: "它做了什么，又为什么这样做。", en: "What it does, and why it does it that way." },
  about: { zh: "一张安静的工作台。", en: "A quiet workbench." },
};

export function SettingsDialog({ renderTrigger }: { renderTrigger: (open: () => void) => ReactNode }) {
  const [open, setOpen] = useState(false);
  const [initial, setInitial] = useState<SectionId>("general");
  const [focus, setFocus] = useState<string | undefined>();
  useEffect(() => {
    const show = (detail: OpenSettingsDetail) => {
      setInitial(detail.section ?? "general");
      setFocus(detail.focus);
      setOpen(true);
    };
    const onOpen = (e: Event) => {
      takePendingSettings();
      show((e as CustomEvent<OpenSettingsDetail>).detail ?? {});
    };
    // Asked for before this mounted (the landing page's "Videos" link).
    const waiting = takePendingSettings();
    if (waiting) show(waiting);
    window.addEventListener(OPEN_SETTINGS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, onOpen);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Ctrl/Cmd+, opens Settings, as in most desktop apps.
      if ((e.ctrlKey || e.metaKey) && e.key === ",") {
        e.preventDefault();
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      {renderTrigger(() => {
        setInitial("general");
        setFocus(undefined);
        setOpen(true);
      })}
      {open && <SettingsPanel initial={initial} focus={focus} onClose={() => setOpen(false)} />}
    </>
  );
}

function SettingsPanel({ initial, focus, onClose }: { initial: SectionId; focus?: string; onClose: () => void }) {
  const lang = useUiLanguage();
  const zh = lang === "zh";
  const prefs = usePreferences();
  const hasRecentOrder = Object.keys(useRecentOrder()).length > 0;
  /** Whether the backup file carries the model keys (off unless asked: the file may be passed around). */
  const [exportKeys, setExportKeys] = useState(false);
  const { theme, setTheme } = useTheme();
  const control = useWorksControl();
  const [section, setSection] = useState<SectionId>(initial);
  useEffect(() => setSection(initial), [initial]);
  // Opened for one row (the + menu's Constraints opens this canvas's): bring it into view and focus it.
  useEffect(() => {
    if (!focus) return;
    const id = window.setTimeout(() => {
      const row = document.getElementById(`settings-row-${focus}`);
      row?.scrollIntoView({ block: "center" });
      row?.querySelector<HTMLElement>("textarea, input")?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [focus, initial]);
  useConstraintsVersion();
  const [query, setQuery] = useState("");
  const [config, setConfig] = useState<AIConfig>(() => getAIConfig());
  const [testing, setTesting] = useState<ChannelKey | null>(null);
  const [usage, setUsage] = useState<{ used: number; quota: number } | null>(null);
  const [workCount, setWorkCount] = useState<number | null>(null);
  const [worksByCanvas, setWorksByCanvas] = useState<Partial<Record<WorkspaceId, number>>>({});
  const [storage, setStorage] = useState<Record<WorkspaceId, number> | null>(null);
  // Every clear, delete or replace asks first in one dialog.
  const [confirm, setConfirm] = useState<{ title: string; description: string; label: string; run: () => void } | null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const [usesRange, setUsesRange] = useState<TrendRange>("month");
  const [tokenRange, setTokenRange] = useState<TrendRange>("month");
  const stats = useUsageStats();
  const [skillTarget, setSkillTarget] = useState<SkillTarget>("claude");
  const [videoKind, setVideoKind] = useState<VideoKind>("tutorial");
  const [skillVia, setSkillVia] = useState<SkillVia>("auto");
  const [installing, setInstalling] = useState<SkillName | null>(null);
  const skills = useSkillsInfo(section === "skills");
  // One click only works when the page runs on this computer; otherwise fall back to the command.
  const via: SkillVia = skillVia === "auto" && !skills.info?.local ? "npx" : skillVia;
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : "denied"));
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // An open dropdown takes Esc for itself.
      if (e.key === "Escape" && !confirm && !document.querySelector('[data-slot="select-content"]')) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, confirm]);

  useEffect(() => {
    void navigator.storage?.estimate?.().then((e) => setUsage({ used: e.usage ?? 0, quota: e.quota ?? 0 }));
    void control.loadAll().then((all) => {
      const counts = Object.fromEntries(WORKSPACES.map(({ id }) => [id, listedWorks(all[id]?.index ?? []).length])) as Record<WorkspaceId, number>;
      setWorksByCanvas(counts);
      setWorkCount(Object.values(counts).reduce((a, b) => a + b, 0));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [control.revision]);

  // What each canvas takes: read only when the Data page is open (it reads every stored value).
  useEffect(() => {
    if (section !== "data") return;
    let cancelled = false;
    void storageByCanvas()
      .then((sizes) => !cancelled && setStorage(sizes))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [section, control.revision]);

  const pref = <K extends keyof Preferences>(key: K) => (value: Preferences[K]) => setPreference(key, value);
  // Model settings are saved as they are typed, like everything else here.
  const patchConfig = (values: Partial<AIConfig>) =>
    setConfig((prev) => {
      const next = { ...prev, ...values, ...pickModels() };
      saveAIConfig(next);
      queueMicrotask(modelsChanged);
      return next;
    });

  // The model in use is changed by the list, outside this state: keep it.
  const pickModels = () => {
    const saved = getAIConfig();
    return { textModel: saved.textModel, imageModel: saved.imageModel };
  };

  const testChannel = async (channel: ChannelKey) => {
    const normalized = normalizeAIConfig({ ...config, ...pickModels() });
    const fields = CHANNEL_FIELDS[channel];
    if (!normalized[fields.apiKey] || !normalized[fields.baseUrl] || !normalized[fields.model]) {
      notify.warning(zh ? "还不能测试" : "Not ready to test", { description: zh ? "先填好模型、Base URL 和 API Key。" : "Fill in the model, base URL and API key first." });
      return;
    }
    setTesting(channel);
    try {
      const response = await fetch("/api/ppt-ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          channel === "text"
            ? { kind: "chat", aiConfig: normalized, messages: [{ role: "user", content: "Reply with OK only." }] }
            : { kind: "image", aiConfig: normalized, prompt: "A simple blue square icon on white background." },
        ),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || (channel === "image" && !payload?.url)) throw new Error(String(payload?.error || "Model test failed"));
      notify.success(zh ? "连接正常" : "Connected", { description: zh ? "这个模型可以用了。" : "The model works." });
    } catch (error) {
      notify.error(zh ? "模型测试没通过" : "Model test failed", { description: errorText(error) });
    } finally {
      setTesting(null);
    }
  };

  const exportWorks = async () => {
    try {
      const data = await exportAllWorks(exportKeys);
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `canvasanvil-backup-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      if (exportKeys)
        notify.warning(zh ? "备份里有你的 API Key" : "The backup holds your API keys", {
          description: zh ? "请像密码一样保管这个文件，不要发给别人。" : "Keep the file like a password; don't share it.",
        });
    } catch (error) {
      notify.error(zh ? "作品没能导出" : "Could not export the works", { description: errorText(error) });
    }
  };

  const pickImport = async (file: File | undefined) => {
    if (!file) return;
    let backup: WorksBackup;
    try {
      backup = parseWorksBackup(await file.text());
    } catch {
      notify.error(zh ? "无法恢复这个文件" : "Cannot restore this file", { description: zh ? "它不是 CanvasAnvil 导出的作品备份。" : "It isn't a CanvasAnvil works backup." });
      return;
    }
    const withSettings = !!backup.settings;
    setConfirm({
      title: zh ? "用备份替换当前内容？" : "Replace everything with this backup?",
      description: zh
        ? withSettings
          ? `四个画布的所有作品，以及设置、记忆和模型配置，都会换成「${file.name}」里的内容，替换前的无法找回。${backup.settings!.secrets ? "" : "备份里没有 API Key，会保留这台电脑上已填的。"}不确定的话先导出一份。`
          : `当前四个画布的所有作品会被「${file.name}」里的内容替换，替换前的作品无法找回。这个备份是旧版导出的，不含设置。不确定的话先导出一份。`
        : withSettings
          ? `Every work on all four canvases, and the settings, memory and model settings, will be replaced by “${file.name}”. What is here now cannot be recovered.${backup.settings!.secrets ? "" : " The backup has no API keys; the ones on this computer are kept."} Export first if unsure.`
          : `Every work on all four canvases will be replaced by “${file.name}”. The current works cannot be recovered. This older backup has no settings. Export first if unsure.`,
      label: zh ? "替换并恢复" : "Replace",
      run: () => void runImport(backup),
    });
  };

  const runImport = async (backup: WorksBackup) => {
    try {
      await importAllWorks(backup);
      notify.success(zh ? "已恢复" : "Restored", { description: zh ? "正在重新载入…" : "Reloading…" });
      window.setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      notify.error(zh ? "没能恢复" : "Could not restore", { description: errorText(error) });
    }
  };

  const wipeWorks = async () => {
    const all = await control.loadAll();
    for (const { id } of WORKSPACES) for (const work of listedWorks(all[id]?.index ?? [])) await control.removeWork(id, work.id);
    notify.success(zh ? "作品已全部清空" : "All works cleared");
  };

  const askNotify = async (next: boolean) => {
    if (next) {
      const granted = await requestNotificationPermission();
      setPermission(notificationsSupported() ? Notification.permission : "denied");
      if (!granted) {
        notify.warning(zh ? "浏览器没有允许通知" : "The browser blocked notifications", { description: zh ? "可以在地址栏左侧的网站设置里打开。" : "Allow them in the site settings by the address bar." });
        return;
      }
    }
    setPreference("notifyDone", next);
  };

  const mod = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl";
  const local = zh ? "仅本机" : "This device";

  const sections: { id: SectionId; label: string; icon: LucideIcon }[] = [
    { id: "general", label: zh ? "通用" : "General", icon: SlidersHorizontal },
    { id: "appearance", label: zh ? "外观" : "Appearance", icon: Palette },
    { id: "canvas", label: zh ? "画布" : "Canvas", icon: PanelsTopLeft },
    { id: "notifications", label: zh ? "通知" : "Notifications", icon: Bell },
    { id: "models", label: zh ? "模型" : "Models", icon: Cpu },
    { id: "constraints", label: zh ? "记忆" : "Memory", icon: ScrollText },
    { id: "shortcuts", label: zh ? "快捷键" : "Shortcuts", icon: Keyboard },
    { id: "stats", label: zh ? "使用统计" : "Usage", icon: BarChart3 },
    { id: "skills", label: zh ? "技能与插件" : "Skills & plugins", icon: Puzzle },
    { id: "data", label: zh ? "数据" : "Data", icon: Database },
    { id: "tutorials", label: zh ? "视频" : "Videos", icon: Clapperboard },
    { id: "docs", label: zh ? "文档" : "Docs", icon: FileText },
    { id: "about", label: zh ? "关于" : "About", icon: Info },
  ];

  const channelRows = (channel: ChannelKey, name: string, desc: string, modelHint: string): RowSpec[] => {
    const f = CHANNEL_FIELDS[channel];
    // One channel is one block: its models, base URL and key together, no rules between them.
    const group: RowGroup = {
      id: channel,
      title: name,
      desc,
      action: (
        <SmallButton onClick={() => void testChannel(channel)} disabled={testing !== null} title={zh ? "发一个真实的小请求，确认能连通" : "Sends one small real request"}>
          {testing === channel && <Loader2 className="size-3.5 animate-spin" />}
          {zh ? "测试连接" : "Test"}
        </SmallButton>
      ),
    };
    return [
      {
        section: "models",
        group,
        id: `${channel}-model`,
        title: zh ? "模型" : "Models",
        desc: zh ? "可以加好几个，输入框下面随时切换。" : "Add several; switch under the input at any time.",
        control: null,
        below: <ModelList channel={channel} zh={zh} placeholder={modelHint} />,
        keywords: `model 模型 ${name}`,
      },
      {
        section: "models",
        group,
        id: `${channel}-base`,
        title: "Base URL",
        desc: zh ? "任何 OpenAI 兼容端点都可以。" : "Any OpenAI-compatible endpoint.",
        control: <TextField label="Base URL" value={config[f.baseUrl]} onChange={(v) => patchConfig({ [f.baseUrl]: v } as Partial<AIConfig>)} placeholder="https://api.openai.com/v1" />,
        keywords: `endpoint url ${name}`,
      },
      {
        section: "models",
        group,
        id: `${channel}-key`,
        title: "API Key",
        desc: zh ? "只存在这台设备的浏览器里。" : "Kept only in this browser.",
        badge: local,
        control: (
          <div className="flex items-center gap-2">
            <a href={keyPageFor(config[f.baseUrl])} target="_blank" rel="noreferrer" title={zh ? "获取 API Key" : "Get an API key"} className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="size-3.5" />
            </a>
            <SecretField zh={zh} label="API Key" value={config[f.apiKey]} onChange={(v) => patchConfig({ [f.apiKey]: v } as Partial<AIConfig>)} placeholder="sk-..." />
          </div>
        ),
        keywords: `key token secret ${name}`,
      },
    ];
  };

  const rows: RowSpec[] = [
    // General
    {
      section: "general",
      id: "language",
      title: zh ? "界面语言" : "Language",
      desc: zh ? "菜单、按钮和提示所用的语言。" : "The language of menus, buttons and hints.",
      control: <Segmented<UiLanguage> value={lang} onChange={setUiLanguage} options={[{ value: "zh", label: "中文" }, { value: "en", label: "English" }]} />,
      keywords: "language 中文 english",
    },
    {
      section: "general",
      id: "start",
      title: zh ? "打开时进入" : "On launch",
      desc: zh ? "每次打开 CanvasAnvil 时先看到什么。" : "What CanvasAnvil opens on.",
      control: (
        <SelectBox<Preferences["startOn"]>
          label={zh ? "打开时进入" : "On launch"}
          value={prefs.startOn}
          onChange={pref("startOn")}
          options={[
            { value: "last", label: zh ? "上次离开的地方" : "Where I left off" },
            { value: "home", label: zh ? "首页" : "Home page" },
            { value: "workspace", label: zh ? "画布" : "The canvases" },
          ]}
        />
      ),
    },
    {
      section: "general",
      id: "sendKey",
      title: zh ? "发送消息" : "Send messages with",
      desc: zh ? "另一种按法用来换行。" : "The other combination breaks a line.",
      control: (
        <Segmented<Preferences["sendKey"]>
          value={prefs.sendKey}
          onChange={pref("sendKey")}
          options={[
            { value: "enter", label: "Enter" },
            { value: "mod-enter", label: `${mod} + Enter` },
          ]}
        />
      ),
      keywords: "enter 回车 换行 shortcut",
    },
    {
      section: "general",
      id: "replyLanguage",
      title: zh ? "AI 回复语言" : "AI reply language",
      desc: zh ? "跟随你提问的语言，或固定一种。" : "Follow the language you ask in, or always use one.",
      control: (
        <SelectBox<Preferences["replyLanguage"]>
          label={zh ? "AI 回复语言" : "AI reply language"}
          value={prefs.replyLanguage}
          onChange={pref("replyLanguage")}
          options={[
            { value: "auto", label: zh ? "跟随提问" : "Match my question" },
            { value: "zh", label: "简体中文" },
            { value: "en", label: "English" },
          ]}
        />
      ),
      keywords: "language reply 语言 回复",
    },
    {
      section: "general",
      id: "confirmClear",
      title: zh ? "清空对话前确认" : "Confirm before clearing a chat",
      desc: zh ? "关掉后，点清空会直接清掉当前对话。" : "Off, clearing a chat happens at once, without asking.",
      control: <Toggle label={zh ? "清空对话前确认" : "Confirm before clearing a chat"} checked={prefs.confirmClear} onChange={pref("confirmClear")} />,
      keywords: "clear confirm 清空 确认 删除",
    },
    {
      section: "general",
      id: "recentOrder",
      title: zh ? "侧栏最近的顺序" : "Order of recents in the sidebar",
      desc: hasRecentOrder
        ? zh
          ? "你拖动调整过顺序。恢复后，按最后修改的时间排列。"
          : "You have moved some by hand. Restoring sorts them by when they last changed."
        : zh
          ? "按最后修改的时间排列。长按一条可以拖动换位置。"
          : "Sorted by when each last changed. Press and hold one to drag it elsewhere.",
      control: (
        <SmallButton onClick={resetRecentOrder} disabled={!hasRecentOrder}>
          {zh ? "恢复自动排序" : "Sort automatically"}
        </SmallButton>
      ),
      keywords: "recent order sort drag 最近 排序 拖动 顺序",
    },
    // Appearance
    {
      section: "appearance",
      id: "theme",
      title: zh ? "主题" : "Theme",
      desc: zh ? "跟随系统时，白天浅色、夜里深色。" : "Following the system switches with your OS.",
      control: (
        <Segmented<Theme>
          value={theme}
          onChange={setTheme}
          options={[
            { value: "light", label: zh ? "浅色" : "Light" },
            { value: "dark", label: zh ? "深色" : "Dark" },
            { value: "system", label: zh ? "跟随系统" : "System" },
          ]}
        />
      ),
      keywords: "dark light 深色 浅色 暗色",
    },
    {
      section: "appearance",
      id: "replyFont",
      title: zh ? "回复字体" : "Reply font",
      desc: zh ? "AI 回复用衬线体读起来像书页；也可以和界面一样用无衬线体。" : "Serif makes replies read like a page; sans matches the interface.",
      control: (
        <Segmented<Preferences["replyFont"]>
          value={prefs.replyFont}
          onChange={pref("replyFont")}
          options={[
            { value: "serif", label: zh ? "衬线" : "Serif" },
            { value: "sans", label: zh ? "无衬线" : "Sans" },
          ]}
        />
      ),
      keywords: "font 字体",
    },
    {
      section: "appearance",
      id: "chatWidth",
      title: zh ? "对话栏宽度" : "Chat column width",
      desc: zh ? "画布关着时，对话在中间排成多宽的一栏。" : "How wide the conversation runs while the canvas is closed.",
      control: (
        <Segmented<Preferences["chatWidth"]>
          value={prefs.chatWidth}
          onChange={pref("chatWidth")}
          options={[
            { value: "narrow", label: zh ? "窄" : "Narrow" },
            { value: "standard", label: zh ? "适中" : "Standard" },
            { value: "wide", label: zh ? "宽" : "Wide" },
          ]}
        />
      ),
    },
    {
      section: "appearance",
      id: "fontSize",
      title: zh ? "文字大小" : "Text size",
      desc: zh ? "整个界面的字号。" : "The size of text across the app.",
      control: (
        <Segmented<Preferences["fontSize"]>
          value={prefs.fontSize}
          onChange={pref("fontSize")}
          options={[
            { value: "small", label: zh ? "小" : "Small" },
            { value: "medium", label: zh ? "标准" : "Default" },
            { value: "large", label: zh ? "大" : "Large" },
          ]}
        />
      ),
      keywords: "font size 字号 字体",
    },
    {
      section: "appearance",
      id: "density",
      title: zh ? "消息间距" : "Message spacing",
      desc: zh ? "紧凑一些，一屏能看到更多对话。" : "Tighter shows more of the conversation at once.",
      control: (
        <Segmented<Preferences["density"]>
          value={prefs.density}
          onChange={pref("density")}
          options={[
            { value: "comfortable", label: zh ? "舒适" : "Comfortable" },
            { value: "compact", label: zh ? "紧凑" : "Compact" },
          ]}
        />
      ),
      keywords: "density compact 紧凑 间距",
    },
    {
      section: "appearance",
      id: "grain",
      title: zh ? "纸张纹理" : "Paper grain",
      desc: zh ? "背景上一层很淡的纸纹。" : "A faint paper texture on the ground.",
      control: <Toggle label={zh ? "纸张纹理" : "Paper grain"} checked={prefs.paperGrain} onChange={pref("paperGrain")} />,
    },
    {
      section: "appearance",
      id: "motion",
      title: zh ? "减少动画" : "Reduce motion",
      desc: zh ? "关掉滑入、淡入这些过渡。系统里开了「减少动态效果」时也会自动减少。" : "Turns off slides and fades. Also follows your system's reduce-motion setting.",
      control: <Toggle label={zh ? "减少动画" : "Reduce motion"} checked={prefs.reduceMotion} onChange={pref("reduceMotion")} />,
      keywords: "animation 动画",
    },
    // Canvas
    {
      section: "canvas",
      id: "autoOpen",
      title: zh ? "自动打开画布" : "Open the canvas by itself",
      desc: zh
        ? "发出第一个请求就打开画布，看着它边生成边画出来。关掉后画布保持收起，点回复下面的卡片再打开。"
        : "The first request opens the canvas, so you watch it being drawn. Off, it stays closed until you click the card under the reply.",
      control: <Toggle label={zh ? "自动打开画布" : "Open the canvas by itself"} checked={prefs.autoOpenCanvas} onChange={pref("autoOpenCanvas")} />,
    },
    {
      section: "canvas",
      id: "share",
      title: zh ? "画布打开时的宽度" : "Canvas width when it opens",
      desc: zh ? "之后仍然可以拖动中间的分隔线调整。" : "You can still drag the divider afterwards.",
      control: (
        <Segmented<Preferences["canvasShare"]>
          value={prefs.canvasShare}
          onChange={pref("canvasShare")}
          options={[
            { value: "half", label: zh ? "一半" : "Half" },
            { value: "most", label: zh ? "大部分" : "Most" },
          ]}
        />
      ),
    },
    {
      section: "canvas",
      id: "minimap",
      title: zh ? "对话缩略条" : "Conversation outline",
      desc: zh ? "对话左边一列短线，一条消息一根，悬停看内容、点一下跳过去。" : "A column of short lines by the chat, one per message: hover to preview, click to jump.",
      control: <Toggle label={zh ? "对话缩略条" : "Conversation outline"} checked={prefs.showMinimap} onChange={pref("showMinimap")} />,
      keywords: "minimap outline 缩略",
    },
    {
      section: "canvas",
      id: "showTokens",
      title: zh ? "显示 token 用量" : "Show token usage",
      desc: zh ? "生成时在“工作中”那一行显示大约收到了多少 token。" : "While generating, the working line shows roughly how many tokens have come back.",
      control: <Toggle label={zh ? "显示 token 用量" : "Show token usage"} checked={prefs.showTokens} onChange={pref("showTokens")} />,
      keywords: "token usage 用量 消耗",
    },
    {
      section: "canvas",
      id: "thinkingOpen",
      title: zh ? "思考过程保持展开" : "Keep thinking open",
      desc: zh ? "深度思考结束后不自动收起。" : "Don't fold the thinking away once it ends.",
      control: <Toggle label={zh ? "思考过程保持展开" : "Keep thinking open"} checked={prefs.thinkingOpen} onChange={pref("thinkingOpen")} />,
      keywords: "thinking reasoning 思考 深度",
    },
    // Notifications
    {
      section: "notifications",
      id: "notify",
      title: zh ? "完成时桌面提醒" : "Desktop notification when done",
      desc:
        permission === "denied" && notificationsSupported()
          ? zh
            ? "浏览器已拒绝通知，请在地址栏左侧的网站设置里允许。"
            : "The browser has blocked notifications; allow them in the site settings."
          : zh
            ? "AI 画完时，如果你正看着别的窗口，就弹一条系统通知。"
            : "When the AI finishes while you're in another window, show a system notification.",
      badge: local,
      control: <Toggle label={zh ? "完成时桌面提醒" : "Desktop notification when done"} checked={prefs.notifyDone && permission === "granted"} onChange={(v) => void askNotify(v)} />,
      keywords: "notification 通知 提醒",
    },
    {
      section: "notifications",
      id: "sound",
      title: zh ? "完成时提示音" : "Chime when done",
      desc: zh ? "AI 画完时响一声。" : "A sound when the AI finishes.",
      control: <Toggle label={zh ? "完成时提示音" : "Chime when done"} checked={prefs.soundDone} onChange={pref("soundDone")} />,
      keywords: "sound 声音 提示音",
    },
    {
      section: "notifications",
      id: "chime",
      title: zh ? "提示音" : "Sound",
      desc: zh ? "选一个就会试听。" : "Picking one plays it.",
      control: (
        <SelectBox<ChimeKind>
          label={zh ? "提示音" : "Sound"}
          value={prefs.chime}
          onChange={(kind) => {
            setPreference("chime", kind);
            playChime(kind);
          }}
          options={CHIME_KINDS.map((kind) => ({ value: kind, label: CHIME_LABEL[kind][zh ? 0 : 1] }))}
        />
      ),
      keywords: "sound 声音 提示音 chime",
    },
    {
      section: "notifications",
      id: "chimeVolume",
      title: zh ? "音量" : "Volume",
      control: (
        <div className="flex items-center gap-2">
          <Segmented<Preferences["chimeVolume"]>
            value={prefs.chimeVolume}
            onChange={(volume) => {
              setPreference("chimeVolume", volume);
              playChime(prefs.chime, volume);
            }}
            options={[
              { value: "quiet", label: zh ? "轻" : "Quiet" },
              { value: "normal", label: zh ? "适中" : "Normal" },
              { value: "loud", label: zh ? "响" : "Loud" },
            ]}
          />
          <SmallButton onClick={() => playChime()} title={zh ? "试听" : "Preview"}>
            {zh ? "试听" : "Preview"}
          </SmallButton>
        </div>
      ),
      keywords: "sound volume 音量",
    },
    // Models
    ...channelRows("text", zh ? "文本模型" : "Text model", zh ? "聊天、写作和看图都用它。" : "Used for chat, writing and reading images.", "gpt-4o-mini"),
    ...channelRows("image", zh ? "图像模型" : "Image model", zh ? "只用来生成图片，和文本模型互不影响。" : "Only for generating images; separate from the text model.", "gpt-image-1"),
    {
      section: "models",
      id: "mineru",
      title: zh ? "文件解析 · MinerU Token" : "File parsing · MinerU token",
      desc: zh ? "解析 PDF 等文件。留空则在本地解析。" : "Parses PDFs and other files. Leave empty to parse locally.",
      control: (
        <div className="flex items-center gap-2">
          <a href={MINERU_LINK} target="_blank" rel="noreferrer" title={zh ? "获取 Token" : "Get a token"} className="text-muted-foreground hover:text-foreground">
            <ExternalLink className="size-3.5" />
          </a>
          <SecretField zh={zh} label="MinerU Token" value={config.fileParserApiToken} onChange={(v) => patchConfig({ fileParserApiToken: v })} placeholder={zh ? "可选" : "Optional"} />
        </div>
      ),
      keywords: "pdf mineru token",
    },
    {
      section: "models",
      id: "keys",
      title: zh ? "还没有 API Key？" : "No API key yet?",
      desc: zh ? "可以去 OpenAI 或任意兼容服务商申请。" : "Get one from OpenAI or any compatible provider.",
      control: (
        <a href={OPENAI_KEYS_LINK} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-foreground/[0.06] px-3 text-[13px] text-foreground hover:bg-foreground/[0.1]">
          {zh ? "去申请" : "Get a key"}
          <ExternalLink className="size-3.5" />
        </a>
      ),
    },
    // Constraints
    ...(
      [
        ["all", zh ? "全部画布" : "All canvases", zh ? "四个画布都会带上，比如语言、语气、品牌色。" : "Sent with every canvas: language, tone, brand colours."],
        ["diagram", zh ? "图表绘制" : "Diagram", zh ? "只用于图表，比如配色、字体、连线风格。" : "Diagrams only: colours, fonts, line style."],
        ["cad", zh ? "室内设计" : "Interior", zh ? "只用于户型，比如层高、规范、常用材料。" : "Floor plans only: ceiling height, codes, materials."],
        ["ppt", zh ? "PPT 演示" : "Slides", zh ? "只用于演示文稿，比如页数、版式、配色。" : "Decks only: length, layout, colours."],
        ["canvas", zh ? "自由绘制" : "Free drawing", zh ? "只用于生成图片，比如画风、构图偏好。" : "Pictures only: style, composition."],
      ] as const
    ).map(([scope, title, desc]): RowSpec => {
      const c = getConstraint(scope as ConstraintScope);
      return {
        section: "constraints",
        id: `constraint-${scope}`,
        title,
        desc,
        keywords: "memory 记忆 constraint 约束 prompt 提示词",
        control: <Toggle label={title} checked={c.enabled} onChange={(v) => setConstraintEnabled(scope as ConstraintScope, v)} />,
        below: (
          <textarea
            aria-label={title}
            defaultValue={c.text}
            onChange={(e) => setConstraintText(scope as ConstraintScope, e.target.value)}
            rows={3}
            placeholder={zh ? "写下希望 AI 一直记住的事，每次请求都会带上…" : "What the AI should always remember; sent with every request…"}
            className={cn(
              "block w-full resize-y rounded-lg border border-transparent bg-foreground/[0.05] px-3 py-2 text-[13px] leading-relaxed text-foreground outline-none transition-[background-color,border-color,opacity] placeholder:text-muted-foreground/60 hover:bg-foreground/[0.07] focus-visible:border-ring/60 focus-visible:bg-card",
              !c.enabled && "opacity-50",
            )}
          />
        ),
      };
    }),
    // Shortcuts
    ...(
      [
        ["search", zh ? "搜索作品" : "Search works", [mod, "K"]],
        ["settings", zh ? "打开设置" : "Open settings", [mod, ","]],
        ["maximize", zh ? "放大画布 / 还原（图表画布）" : "Enlarge / restore the canvas (Diagram)", [mod, "B"]],
        ["send", zh ? "发送消息" : "Send a message", prefs.sendKey === "enter" ? ["Enter"] : [mod, "Enter"]],
        ["newline", zh ? "换行" : "New line", prefs.sendKey === "enter" ? ["Shift", "Enter"] : ["Enter"]],
        ["upload", zh ? "添加图片或文件（输入框里）" : "Add files or photos (in the input)", [mod, "U"]],
        ["accept", zh ? "填入输入框里的灰色建议" : "Take the grey suggestion in the input", ["Tab"]],
        ["search", zh ? "搜索作品" : "Search works", [mod, "K"]],
        ["move", zh ? "上下移动侧栏里选中的作品" : "Move the focused work in the sidebar", ["Alt", "↑ / ↓"]],
        ["close", zh ? "关闭弹窗" : "Close a dialog", ["Esc"]],
      ] as const
    ).map(
      ([id, title, keys]): RowSpec => ({
        section: "shortcuts",
        id: `kbd-${id}`,
        title,
        control: (
          <div className="flex items-center gap-1">
            {keys.map((k, i) => (
              <Kbd key={i}>{k}</Kbd>
            ))}
          </div>
        ),
        keywords: "shortcut 快捷键",
      }),
    ),
    // Usage
    {
      section: "stats",
      id: "stats-summary",
      title: zh ? "概览" : "Overview",
      desc:
        zh
          ? `从 ${new Date(stats.since).toLocaleDateString("zh-CN")} 开始统计，只存在这台设备上。AI 每开始生成一次算一次。`
          : `Counted since ${new Date(stats.since).toLocaleDateString("en")}, on this device only. Each time the AI starts generating counts once.`,
      control: null,
      below: <UsageSummary stats={stats} lang={lang} />,
      keywords: "usage stats 统计 次数",
    },
    {
      section: "stats",
      id: "stats-heatmap",
      title: zh ? "活跃度" : "Activity",
      desc: zh ? "每格是一天，颜色越深用得越多。" : "Each square is a day; darker means more use.",
      control: null,
      below: <UsageHeatmap stats={stats} lang={lang} />,
      keywords: "heatmap 热力图 活跃",
    },
    {
      section: "stats",
      id: "stats-trend",
      title: zh ? "使用趋势" : "Trend",
      desc: zh ? "每天（按年看时每月）的使用次数，悬停看各画布。" : "Uses per day (per month over a year); hover for each canvas.",
      control: <Segmented value={usesRange} options={[{ value: "week", label: zh ? "近 7 天" : "7 days" }, { value: "month", label: zh ? "近 30 天" : "30 days" }, { value: "year", label: zh ? "近一年" : "1 year" }]} onChange={setUsesRange} />,
      below: <UsageTrend stats={stats} lang={lang} range={usesRange} />,
      keywords: "trend 趋势 折线 周 月 年 daily month",
    },
    {
      section: "stats",
      id: "stats-hours",
      half: true,
      title: zh ? "一天中的时段" : "Time of day",
      desc: (() => {
        const peak = peakHour(stats);
        return peak ? (zh ? `最常在 ${peak}` : `Busiest ${peak}`) : zh ? "按小时统计" : "Uses by hour";
      })(),
      control: null,
      below: <HourColumns stats={stats} lang={lang} />,
      keywords: "hour 时段 小时",
    },
    {
      section: "stats",
      id: "stats-weekdays",
      half: true,
      title: zh ? "一周中的哪天" : "Day of week",
      desc: (() => {
        const peak = peakWeekday(stats);
        return peak === null ? (zh ? "按星期统计" : "Uses by weekday") : zh ? `最常在${WEEKDAY_NAMES.zh[peak]}` : `Busiest on ${WEEKDAY_NAMES.en[peak]}`;
      })(),
      control: null,
      below: <WeekdayColumns stats={stats} lang={lang} />,
      keywords: "weekday 星期 周",
    },
    {
      section: "stats",
      id: "stats-canvases",
      half: true,
      title: zh ? "画布占比" : "By canvas",
      desc: zh ? "各画布的使用次数" : "Uses per canvas",
      control: null,
      below: (
        <CanvasDonut
          values={usesByCanvas(stats) as Partial<Record<WorkspaceId, number>>}
          lang={lang}
          format={(n) => (zh ? `${formatCount(n)} 次` : formatCount(n))}
          empty={zh ? "还没有使用记录" : "No use yet"}
        />
      ),
      keywords: "canvas share 占比 扇形 饼图",
    },
    {
      section: "stats",
      id: "stats-works",
      half: true,
      title: zh ? "作品数量" : "Works",
      desc: zh ? "「我的作品」里各画布的作品" : "Saved works per canvas",
      control: null,
      below: (
        <CanvasDonut
          values={worksByCanvas}
          lang={lang}
          format={(n) => (zh ? `${n} 件` : String(n))}
          empty={zh ? "还没有保存作品" : "No saved works yet"}
        />
      ),
      keywords: "works 作品 数量",
    },
    {
      section: "stats",
      id: "stats-images",
      half: true,
      title: zh ? "生成图片" : "Images",
      desc: zh ? "图片模型返回的图片" : "Pictures from the image model",
      control: null,
      below: (
        <CanvasDonut
          values={stats.images as Partial<Record<WorkspaceId, number>>}
          lang={lang}
          format={(n) => (zh ? `${formatCount(n)} 张` : formatCount(n))}
          empty={zh ? "还没有生成过图片" : "No images yet"}
        />
      ),
      keywords: "image 图片 生图",
    },
    {
      section: "stats",
      id: "stats-token-share",
      half: true,
      title: zh ? "Token 分布" : "Tokens by canvas",
      desc: zh ? "各画布消耗的 Token" : "Reported tokens per canvas",
      control: null,
      below: (
        <CanvasDonut
          values={Object.fromEntries(Object.entries(stats.tokens).map(([id, x]) => [id, x.input + x.output])) as Partial<Record<WorkspaceId, number>>}
          lang={lang}
          format={formatCount}
          empty={zh ? "还没有接口返回的用量" : "No reported usage yet"}
        />
      ),
      keywords: "token 分布 画布",
    },
    {
      section: "stats",
      id: "stats-durations",
      half: true,
      title: zh ? "平均生成耗时" : "Average generation time",
      desc: zh ? "开始到完成，按画布平均" : "Start to done, per canvas",
      control: null,
      below: (
        <BarList
          rows={WORKSPACES.map(({ id }) => {
            const d = stats.durations[id];
            return {
              key: id,
              label: canvasName(id, lang),
              value: d?.count ? d.total / d.count : 0,
              color: CANVAS_COLOR[id],
              detail: d?.count ? (zh ? `${d.count} 次 · 最长 ${formatDuration(d.longest, true)}` : `${d.count} runs · longest ${formatDuration(d.longest, false)}`) : undefined,
            };
          })}
          format={(ms) => formatDuration(ms, zh)}
          empty={zh ? "还没有完成的生成" : "No finished generations yet"}
        />
      ),
      keywords: "duration 耗时 时间 速度",
    },
    {
      section: "stats",
      id: "stats-models",
      half: true,
      title: zh ? "常用模型" : "Models",
      desc: zh ? "调用次数最多的 4 个模型" : "The four most-called models",
      control: null,
      below: (
        <BarList
          rows={Object.entries(stats.models)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 4)
            .map(([model, n]) => ({ key: model, label: model, value: n, color: "hsl(var(--brand))", detail: model }))}
          format={(n) => (zh ? `${formatCount(n)} 次` : formatCount(n))}
          empty={zh ? "还没有模型调用记录" : "No model calls yet"}
        />
      ),
      keywords: "model 模型 调用",
    },
    {
      section: "stats",
      id: "stats-tokens",
      title: zh ? "Token 用量" : "Tokens",
      desc: (() => {
        const t = Object.values(stats.tokens).reduce((a, x) => ({ input: a.input + x.input, output: a.output + x.output }), { input: 0, output: 0 });
        const total = zh ? `累计输入 ${formatCount(t.input)}，输出 ${formatCount(t.output)}。` : `In ${formatCount(t.input)}, out ${formatCount(t.output)} so far. `;
        return total + (zh ? "只算接口返回的真实用量。" : "Only what the provider reported.");
      })(),
      control: <Segmented value={tokenRange} options={[{ value: "week", label: zh ? "近 7 天" : "7 days" }, { value: "month", label: zh ? "近 30 天" : "30 days" }, { value: "year", label: zh ? "近一年" : "1 year" }]} onChange={setTokenRange} />,
      below: <TokenTrend stats={stats} lang={lang} range={tokenRange} />,
      keywords: "token 用量 消耗 趋势",
    },
    {
      section: "stats",
      id: "stats-clear",
      title: zh ? "清空统计" : "Clear usage",
      desc: zh ? "只清空这里的统计，作品不受影响。" : "Clears these counts only; works are untouched.",
      control: (
        <SmallButton
          danger
          onClick={() =>
            setConfirm({
              title: zh ? "清空使用统计？" : "Clear usage stats?",
              description: zh ? "这里的所有统计数字和图表会归零，无法找回。作品不受影响。" : "Every count and chart here goes back to zero, for good. Works are untouched.",
              label: zh ? "清空" : "Clear",
              run: () => {
                clearStats();
                notify.success(zh ? "统计已清空" : "Usage cleared");
              },
            })
          }
        >
          {zh ? "清空" : "Clear"}
        </SmallButton>
      ),
      keywords: "clear 清空 统计",
    },
    // Skills & plugins
    {
      section: "skills",
      id: "skills-target",
      title: zh ? "用在哪个工具" : "For which tool",
      desc: zh ? "下面的插件和 Skill 都会按这里选的工具给出装法。" : "The plugin and skills below follow the tool picked here.",
      control: (
        <Segmented<SkillTarget>
          value={skillTarget}
          onChange={setSkillTarget}
          options={[
            { value: "claude", label: "Claude Code" },
            { value: "codex", label: "Codex" },
          ]}
        />
      ),
      keywords: "skill 插件 plugin claude codex 安装 install",
    },
    {
      section: "skills",
      id: "skills-plugin",
      group: {
        id: "plugin",
        title: zh ? "插件（推荐）" : "Plugin (recommended)",
        desc: zh
          ? "一次装好白板、图表、室内设计、PPT 四个 Skill 和画布服务，不用克隆仓库，以后更新插件即可。"
          : "Installs the canvas, diagram, interior and PPT skills plus the canvas server in one go; no clone, update the plugin later.",
      },
      title: `canvasanvil-canvas · ${TARGET_NAME[skillTarget]}`,
      desc:
        skillTarget === "claude"
          ? zh
            ? "在终端里运行下面两行，重启 Claude Code 后说「打开 CanvasAnvil 画布」。只下载插件用到的文件，不会拉取整个仓库。画布会在浏览器里打开，改完回到对话继续。"
            : "Run these two lines in a terminal, restart Claude Code, then ask to open the CanvasAnvil canvas. Only the plugin's files are downloaded, not the whole repository. It opens in your browser; come back to the chat when done."
          : zh
            ? "在终端里运行下面两行（只下载插件用到的文件），重启 Codex 后用 $canvas-skill、$diagram-skill 或 $cad-skill 调用。画布直接在对话里打开。"
            : "Run these two lines (they download only the plugin's files), restart Codex, then call $canvas-skill, $diagram-skill or $cad-skill. The canvases open right in the conversation.",
      control: null,
      below: <CommandBlock zh={zh} lines={PLUGIN_COMMANDS[skillTarget]} />,
      keywords: "plugin 插件 marketplace claude codex",
    },
    {
      section: "skills",
      id: "skills-via",
      group: {
        id: "single",
        title: zh ? "单独安装 Skill" : "Install skills one by one",
        desc: zh
          ? `只要某一个 Skill，或者要 PPT（插件里没有）时用。会放进 ~/${TARGET_DIR[skillTarget]}/<名称>，装好后重启 ${TARGET_NAME[skillTarget]}。`
          : `For a single skill, or for PPT (not in the plugin). Goes to ~/${TARGET_DIR[skillTarget]}/<name>; restart ${TARGET_NAME[skillTarget]} afterwards.`,
      },
      title: zh ? "装法" : "How",
      desc:
        via === "auto"
          ? zh ? "直接复制到这台电脑，会替换旧版本，保留你填过的图片和解析配置。" : "Copies straight onto this computer, replacing an older copy and keeping your provider config."
          : via === "zip"
            ? zh ? `下载后解压，把里面的文件夹整个放进 ~/${TARGET_DIR[skillTarget]}/。需要 Node 20 以上。` : `Unzip and move the folder inside into ~/${TARGET_DIR[skillTarget]}/. Needs Node 20+.`
            : zh ? "复制命令到终端运行。" : "Copy the command into a terminal.",
      control: (
        <Segmented<SkillVia>
          value={via}
          onChange={setSkillVia}
          options={[
            ...(skills.info?.local ? [{ value: "auto" as const, label: zh ? "一键安装" : "One click" }] : []),
            { value: "npx", label: "npx" },
            { value: "git", label: "git" },
            { value: "zip", label: zh ? "压缩包" : "Zip" },
          ]}
        />
      ),
      keywords: "command 命令 npx degit git 终端 zip 压缩包 一键",
    },
    ...SKILLS.map(({ name, zh: descZh, en: descEn }): RowSpec => {
      const server = skills.info?.skills.find((s) => s.name === name);
      const installed = server?.installed[skillTarget];
      return {
        section: "skills",
        id: `skill-${name}`,
        group: { id: "single", title: "" },
        title: name,
        badge: installed ? (zh ? "已安装" : "Installed") : undefined,
        desc: `${zh ? descZh : descEn}${server ? ` · ${formatBytes(server.bytes)}` : ""}`,
        control:
          via === "auto" ? (
            <SmallButton
              disabled={installing !== null}
              onClick={() => {
                setInstalling(name);
                installSkill(name, skillTarget)
                  .then((where) => {
                    notify.success(zh ? `已安装 ${name}` : `${name} installed`, { description: zh ? `重启 ${TARGET_NAME[skillTarget]} 后可用。${where ?? ""}` : `Restart ${TARGET_NAME[skillTarget]} to use it. ${where ?? ""}` });
                    skills.reload();
                  })
                  .catch((error: unknown) => notify.error(zh ? "没能安装" : "Install failed", { description: errorText(error) }))
                  .finally(() => setInstalling(null));
              }}
            >
              {installing === name ? (zh ? "安装中…" : "Installing…") : installed ? (zh ? "重新安装" : "Reinstall") : zh ? "安装" : "Install"}
            </SmallButton>
          ) : via === "zip" ? (
            <a
              href={`/api/skills/zip?name=${name}`}
              download={`${name}.zip`}
              className="inline-flex h-8 shrink-0 items-center rounded-lg bg-foreground/[0.06] px-3 text-[13px] text-foreground transition-colors duration-fast hover:bg-foreground/[0.1]"
            >
              {zh ? "下载 .zip" : "Download .zip"}
            </a>
          ) : null,
        below: via === "npx" || via === "git" ? <CommandBlock zh={zh} lines={via === "npx" ? [installCommand(name, skillTarget)] : gitCommands(name, skillTarget)} /> : undefined,
        keywords: `skill ${name} 安装 下载 zip`,
      };
    }),
    // Data
    {
      section: "data",
      id: "usage",
      title: zh ? "存储占用" : "Storage used",
      desc: zh ? "作品都存在这台设备的浏览器里，不会上传。" : "Works live in this browser on this device and are never uploaded.",
      control: (
        <span className="shrink-0 text-[13px] tabular-nums text-muted-foreground">
          {workCount !== null && (zh ? `${workCount} 件作品 · ` : `${workCount} works · `)}
          {usage ? `${formatBytes(usage.used)}${usage.quota ? ` / ${formatBytes(usage.quota)}` : ""}` : "…"}
        </span>
      ),
      below: storage ? (
        <CanvasBar values={storage} lang={lang} format={formatBytes} empty={zh ? "还没有存任何作品。" : "Nothing stored yet."} />
      ) : (
        <p className="text-[13px] text-muted-foreground">{zh ? "正在统计各画布占用…" : "Measuring each canvas…"}</p>
      ),
      keywords: "storage 空间 占用",
    },
    {
      section: "data",
      id: "export",
      title: zh ? "导出备份" : "Export a backup",
      desc: zh
        ? "所有作品（含对话和历史版本）、设置、记忆、模型配置和使用统计打包成一个 JSON 文件。换台电脑导入后，和这里基本一样。"
        : "Every work (with its chats and versions), the settings, memory, model settings and usage, in one JSON file. Imported on another computer, it comes back much as it is here.",
      control: (
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex cursor-pointer items-center gap-1.5 text-[13px] text-muted-foreground">
            <input type="checkbox" checked={exportKeys} onChange={(e) => setExportKeys(e.target.checked)} className="size-3.5 accent-foreground" />
            {zh ? "包含 API Key" : "Include API keys"}
          </label>
          <SmallButton onClick={() => void exportWorks()}>{zh ? "导出" : "Export"}</SmallButton>
        </div>
      ),
      keywords: "backup 备份 export 导出 迁移 换电脑 api key 密钥",
    },
    {
      section: "data",
      id: "import",
      title: zh ? "从备份恢复" : "Restore from a backup",
      desc: zh ? "选一个导出的 JSON 文件，用它替换当前所有作品和设置。" : "Pick an exported JSON file to replace all current works and settings with it.",
      control: (
        <div className="flex shrink-0 items-center gap-2">
          <input ref={importInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => (void pickImport(e.target.files?.[0]), (e.target.value = ""))} />
          <SmallButton onClick={() => importInput.current?.click()}>{zh ? "选择文件" : "Choose file"}</SmallButton>
        </div>
      ),
      keywords: "import restore 导入 恢复 备份",
    },
    {
      section: "data",
      id: "resetPrefs",
      title: zh ? "恢复默认设置" : "Restore default settings",
      desc: zh ? "这一页的选项回到初始状态。模型配置和作品不受影响。" : "Puts this page's choices back. Model settings and works are untouched.",
      control: (
        <SmallButton
          onClick={() =>
            setConfirm({
              title: zh ? "恢复默认设置？" : "Restore default settings?",
              description: zh ? "通用、外观、画布、通知里的选项都会回到初始状态。模型配置、记忆和作品不受影响。" : "General, Appearance, Canvas and Notifications go back to their defaults. Models, memory and works are untouched.",
              label: zh ? "恢复默认" : "Restore",
              run: () => {
                resetPreferences();
                notify.success(zh ? "已恢复默认设置" : "Defaults restored");
              },
            })
          }
        >
          {zh ? "恢复" : "Restore"}
        </SmallButton>
      ),
    },
    {
      section: "data",
      id: "wipe",
      title: zh ? "清空全部作品" : "Delete all works",
      desc: zh ? "删除四个画布里的所有作品，无法找回。建议先导出。" : "Deletes every work on all four canvases, for good. Export first.",
      control: (
        <SmallButton
          danger
          onClick={() =>
            setConfirm({
              title: zh ? "清空全部作品？" : "Delete all works?",
              description: zh ? `${workCount ?? ""} 件作品会被永久删除，无法找回。建议先导出。` : `${workCount ?? ""} works will be deleted for good. Export first.`,
              label: zh ? "全部删除" : "Delete all",
              run: () => void wipeWorks(),
            })
          }
        >
          {zh ? "清空" : "Delete all"}
        </SmallButton>
      ),
      keywords: "delete 删除",
    },
    // Videos: one kind at a time, so the list stays short as videos are added.
    (() => {
      const k = VIDEO_KINDS.find((x) => x.kind === videoKind)!;
      return {
        section: "tutorials",
        id: "videos",
        title: zh ? k.zh : k.en,
        desc: zh ? k.zhDesc : k.enDesc,
        control: (
          <Segmented<VideoKind>
            value={videoKind}
            onChange={setVideoKind}
            options={VIDEO_KINDS.map(({ kind, zh: name, en }) => ({ value: kind, label: zh ? name : en }))}
          />
        ),
        below: <VideoShelf kind={videoKind} lang={lang} />,
        keywords: "video 视频 教程 tutorial 宣传 更新 实践 bilibili",
      } satisfies RowSpec;
    })(),
    // Docs
    {
      section: "docs",
      id: "doc-home",
      title: zh ? "CanvasAnvil 文档" : "CanvasAnvil docs",
      desc: zh ? "从上手、画布指南，到底层的算法与它们为什么这样做。" : "From getting started and the canvas guides to the algorithms underneath, and why they work that way.",
      control: (
        <a href={docsHref()} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[13px] text-background transition-opacity hover:opacity-90">
          {zh ? "打开文档" : "Open the docs"}
          <ArrowRight className="size-3.5" />
        </a>
      ),
      below: <DocsShelf lang={lang} />,
      keywords: "docs 文档 readme 原理 算法 架构 architecture skill 插件",
    },
    {
      section: "docs",
      id: "doc-faq",
      title: zh ? "常见问题" : "FAQ",
      control: null,
      below: <FaqList lang={lang} />,
      keywords: "faq 常见问题 问答 help 帮助",
    },
    // About
    {
      section: "about",
      id: "version",
      title: zh ? "版本" : "Version",
      control: <span className="shrink-0 font-mono text-[13px] text-muted-foreground">v{__APP_VERSION__}</span>,
    },
    ...(
      [
        ["github", "GitHub", zh ? "源代码、问题反馈和讨论。" : "Source code, issues and discussions.", REPO_URL],
        ["changelog", zh ? "更新日志" : "Changelog", zh ? "每一次改动都记在这里。" : "Every change, as it landed.", docsHref("changelog")],
        ["issue", zh ? "反馈问题" : "Report a problem", zh ? "遇到问题或有想法，欢迎提一个 Issue。" : "Found a problem or have an idea? Open an issue.", `${REPO_URL}/issues/new`],
      ] as const
    ).map(
      ([id, title, desc, href]): RowSpec => ({
        section: "about",
        id,
        title,
        desc,
        control: (
          // The changelog lives in the docs here; the rest are on GitHub.
          <a href={href} {...(href.startsWith("#") ? {} : { target: "_blank", rel: "noreferrer" })} className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg bg-foreground/[0.06] px-3 text-[13px] text-foreground hover:bg-foreground/[0.1]">
            {zh ? "打开" : "Open"}
            {href.startsWith("#") ? <ArrowRight className="size-3.5" /> : <ExternalLink className="size-3.5" />}
          </a>
        ),
      }),
    ),
  ];

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () => (q ? rows.filter((r) => `${r.title} ${r.desc ?? ""} ${r.keywords ?? ""}`.toLowerCase().includes(q)) : []),
    // rows are rebuilt every render; the query is what decides
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q, rows.length, lang, prefs, config, theme, usage, permission, stats, storage, worksByCanvas, usesRange, tokenRange, videoKind, skillTarget, skillVia, installing, skills.info],
  );
  const current = sections.find((s) => s.id === section)!;

  return createPortal(
    <div data-works-ui className="fixed inset-0 z-[100] flex items-center justify-center bg-overlay/35 p-4 animate-in fade-in duration-base" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={zh ? "设置" : "Settings"}
        className="flex h-[min(680px,90vh)] w-full max-w-[960px] flex-col overflow-hidden rounded-[14px] border border-border/80 bg-background shadow-[0_12px_40px_hsl(var(--shadow-hue)/0.16),0_2px_6px_hsl(var(--shadow-hue)/0.06)] animate-in zoom-in-[0.98] duration-base"
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/70 pl-5 pr-2">
          <h2 className="font-display text-[17px] tracking-[-0.01em] text-foreground">{zh ? "设置" : "Settings"}</h2>
          <button type="button" title={zh ? "关闭 (Esc)" : "Close (Esc)"} aria-label={zh ? "关闭" : "Close"} onClick={onClose} className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1">
          <nav className="flex w-[220px] shrink-0 flex-col gap-0.5 overflow-y-auto border-r border-border/70 p-3 max-md:w-[64px]">
            <div className="relative mb-2 max-md:hidden">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                ref={searchRef}
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={zh ? "搜索设置" : "Search"}
                className="h-8 w-full rounded-lg bg-foreground/[0.05] pl-8 pr-2 text-[13px] text-foreground outline-none placeholder:text-muted-foreground/70 focus-visible:bg-foreground/[0.07]"
              />
            </div>
            {sections.map(({ id, label, icon: Icon }, i) => (
              <div key={id}>
                {(i === 4 || i === 7 || i === 10) && <div className="mx-2 my-2 h-px bg-border/70" />}
                <button
                  type="button"
                  title={label}
                  onClick={() => {
                    setSection(id);
                    setQuery("");
                  }}
                  className={cn(
                    "flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-left text-[14px] transition-colors duration-fast max-md:justify-center max-md:px-0",
                    id === section && !q ? "bg-foreground/[0.08] text-foreground" : "text-foreground/75 hover:bg-foreground/[0.05] hover:text-foreground",
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate max-md:hidden">{label}</span>
                </button>
              </div>
            ))}
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto px-7 pb-8 pt-5 scrollbar-thin">
            {q ? (
              <>
                <h3 className="mb-2 text-[15px] font-medium text-foreground">{zh ? `“${query.trim()}” 的结果` : `Results for “${query.trim()}”`}</h3>
                {matches.length === 0 ? (
                  <p className="aside-voice py-10 text-center text-[14px] text-muted-foreground">{zh ? "没有找到相关的设置。" : "No setting matches."}</p>
                ) : (
                  <RowList rows={matches} />
                )}
              </>
            ) : (
              <>
                <h3 className="font-display text-[22px] leading-tight tracking-[-0.01em] text-foreground">{current.label}</h3>
                <p className="aside-voice mb-3 mt-1 text-[14px] text-muted-foreground">{SECTION_LINES[section][lang]}</p>
                <RowList rows={rows.filter((r) => r.section === section)} />
                {/* The About page ends the way a book does, with the maker's mark. */}
                {section === "about" && (
                  <div className="mt-12 flex flex-col items-center gap-2 text-center">
                    <AnvilColophon className="text-[#c96442]/70" />
                    <p className="aside-voice text-[13.5px] text-muted-foreground">{zh ? "在铁砧上，一稿一稿地锻打成形。" : "Hammered into shape on the anvil, one draft at a time."}</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirm?.title ?? ""}
        description={confirm?.description}
        confirmLabel={confirm?.label ?? ""}
        cancelLabel={zh ? "取消" : "Cancel"}
        onConfirm={() => confirm?.run()}
      />
    </div>,
    document.body,
  );
}
