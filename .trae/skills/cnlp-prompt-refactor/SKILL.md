---
name: "cnlp-prompt-refactor"
description: "把现有智能体 prompt 重构为 CNL-P Agent 结构，并统一变量占位符（{{var}}）以便跨语言渲染。需要标准化/重构 prompt 时调用。"
---

# CNL-P Prompt Refactor

将任意“散装 prompt”重构为可维护的 CNL-P Agent 结构（Persona/Audience/Constraints/Concepts/Worker/Flow），同时解决“变量如何在不同语言里嵌入”的工程问题：统一使用 `{{var}}` 作为运行时占位符，并生成各语言渲染方式。

## 何时调用

- 你已经有一段可用但难维护的 prompt，需要拆成明确模块并可复用
- 你希望把变量从 prompt 中抽离出来，并能在不同语言中稳定注入
- 你想为某个 Agent 制定清晰的输入/输出契约、执行流程、异常路径与示例

## 你需要我提供的输入（按可得信息给即可）

- 原始 prompt（system/developer/user 任意形态都行）
- 变量清单（名称、含义、是否必填、期望类型；没有就让我从 prompt 推断）
- 运行时注入环境（Python/JS/TS/Go/Java/C#…；不知道就默认 JS/TS）
- 期望输出形态（纯文本、JSON、Markdown、表格等）

## 输出内容（我会生成这些）

- 一份重构后的 CNL-P Agent Prompt（可直接复制使用）
- 一份变量契约（变量名、类型、必填/可选、默认值/约束）
- 一份“渲染/注入”适配说明（把 `{{var}}` 填入模板的多语言方式）

## 占位符策略（解决“语法里变量引用 vs 工程注入”冲突）

CNL-P 语法里的引用常写作 `<REF>var_name</REF>`（语义上表示“这里引用变量内容”）。但在工程侧，各语言模板系统不统一：Python `format` 用 `{}`, JS 模板字符串用 `${}`, Go `text/template` 用 `{{.Var}}` 等。

因此本技能采用两层约定：

- **语义层（CNL-P）**：在结构化 prompt 中保留变量名与 I/O 契约（`VARIABLE`、`INPUTS`、`OUTPUTS`），必要时也可写 `<REF>var</REF>` 增强可读性
- **渲染层（运行时）**：所有需要被程序注入的值，统一在最终发给模型的字符串中使用 `{{var}}`

实操建议（默认做法）：

- 在 CNL-P 结构中，正文描述直接写 `{{var}}`，同时在 `VARIABLE`/`INPUTS` 中声明它
- 如果你更偏“语义可读”，正文可写 `<REF>var</REF>`，并在最后一步把 `<REF>var</REF>` 预处理替换为 `{{var}}` 再渲染

## CNL-P 结构模板（我会按这个组织）

```text
+DEFINE_AGENT: <agentName> <one-line description>]

+DEFINE_PERSONA:
Role: <description>
...（可选更多 AspectName: description）
+END_PERSONA

+DEFINE_AUDIENCE:
Audience: <description>
+END_AUDIENCE

+DEFINE_CONSTRAINTS:
...（格式/内容/安全/风格等）
+END_CONSTRAINTS

+DEFINE_CONCEPTS:
...（术语定义、缩写消歧）
+END_CONCEPTS

TYPES:
...（描述会处理的数据类型/Schema）

VARIABLE:
...（列出会使用/操作的变量，名称+含义+类型+默认值）

+DEFINE_WORKER: <workerName> <what this worker does>]
  ++INPUTS
    REQUIRED <REF>var1</REF>
    OPTIONAL <REF>var2</REF>
  ++END_INPUTS

  ++OUTPUTS
    <REF>result1</REF>
  ++END_OUTPUTS

  ++EXAMPLES
    <EXPECTED_WORKER_BEHAVIOR> { ... } </EXPECTED_WORKER_BEHAVIOR>
    <DEFECT_WORKER_BEHAVIOR> { defect-type, ... } </DEFECT_WORKER_BEHAVIOR>
  ++END_EXAMPLES

  ++MAIN_FLOW
    ++SEQUENTIAL_BLOCK
      COMMAND-1: ...
      COMMAND-2: ...
    ++END_SEQUENTIAL_BLOCK
  ++END_MAIN_FLOW

  ++ALTERNATIVE_FLOW: <when triggered>]
    ...
  ++END_ALTERNATIVE_FLOW

  ++EXCEPTION_FLOW: <when triggered>]
    LOG: ...
    ...
  ++END_EXCEPTION_FLOW
+END_WORKER

+END_AGENT
```

约束遵循：

- `SEQUENTIAL_BLOCK / IF_BLOCK / LOOP_BLOCK` 不嵌套；复杂逻辑拆成新的 `FLOW`
- `EXAMPLES` 同时提供“期望行为”和“缺陷行为”（缺陷类型+解释）

## 变量注入：各语言最小可用做法（统一处理 `{{var}}`）

下面示例都把 `template` 里的 `{{key}}` 替换为 `vars[key]` 的字符串形式。默认不存在的 key 替换为空字符串（你也可以改为抛错）。

### JavaScript / TypeScript

```ts
export function renderTemplate(template: string, vars: Record<string, unknown>) {
  return template.replace(/\{\{\s*([a-zA-Z_]\w*)\s*\}\}/g, (_, key) => {
    const v = (vars as any)[key];
    return v === undefined || v === null ? "" : String(v);
  });
}
```

### Python

```python
import re

def render_template(template: str, vars: dict) -> str:
    def repl(m):
        key = m.group(1)
        v = vars.get(key)
        return "" if v is None else str(v)
    return re.sub(r"\{\{\s*([a-zA-Z_]\w*)\s*\}\}", repl, template)
```

### Go（推荐使用 text/template；先把 `{{var}}` 转为 `{{.var}}`）

```go
package prompt

import (
	"bytes"
	"regexp"
	"text/template"
)

var mustacheVar = regexp.MustCompile(`\{\{\s*([a-zA-Z_]\w*)\s*\}\}`)

func RenderTemplate(tpl string, vars map[string]any) (string, error) {
	goTpl := mustacheVar.ReplaceAllString(tpl, "{{.$1}}")
	t, err := template.New("prompt").Option("missingkey=zero").Parse(goTpl)
	if err != nil {
		return "", err
	}
	var buf bytes.Buffer
	if err := t.Execute(&buf, vars); err != nil {
		return "", err
	}
	return buf.String(), nil
}
```

### Java / C#

Java（Pattern/Matcher）：

```java
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

public final class PromptTemplate {
  private static final Pattern VAR = Pattern.compile("\\\\{\\\\{\\\\s*([a-zA-Z_]\\\\w*)\\\\s*\\\\}\\\\}");

  public static String render(String template, Map<String, ?> vars) {
    Matcher m = VAR.matcher(template);
    StringBuffer sb = new StringBuffer();
    while (m.find()) {
      String key = m.group(1);
      Object v = vars.get(key);
      m.appendReplacement(sb, Matcher.quoteReplacement(v == null ? "" : String.valueOf(v)));
    }
    m.appendTail(sb);
    return sb.toString();
  }
}
```

C#（Regex）：

```csharp
using System.Collections.Generic;
using System.Text.RegularExpressions;

public static class PromptTemplate
{
    private static readonly Regex Var = new(@"\{\{\s*([a-zA-Z_]\w*)\s*\}\}", RegexOptions.Compiled);

    public static string Render(string template, IReadOnlyDictionary<string, object?> vars)
        => Var.Replace(template, m =>
        {
            var key = m.Groups[1].Value;
            return vars.TryGetValue(key, out var v) && v is not null ? v.ToString()! : "";
        });
}
```

## 重构规则（我会自动执行）

- 把“身份/语气/风格”归入 `PERSONA`
- 把“目标读者/输出层级”归入 `AUDIENCE`
- 把“必须/禁止/格式”归入 `CONSTRAINTS`
- 把“术语定义、缩写消歧”归入 `CONCEPTS`
- 把“输入/输出字段”显式写入 `INPUTS/OUTPUTS`，并同步到 `VARIABLE`
- 把“步骤/流程”拆成 `MAIN_FLOW`，必要时加 `ALTERNATIVE_FLOW/EXCEPTION_FLOW`
- 把隐含变量（如 “公司名/产品名/日期/语气”）抽成 `{{var}}` 并写清楚含义

## 示例：把普通 prompt 重构为 CNL-P（示意）

原始 prompt（散装）：

```text
你是资深后端工程师。根据用户给的需求描述，输出一份接口设计（含字段、错误码、示例请求响应），要求用 Markdown。
需求描述：{{requirement}}
服务名：{{service_name}}
```

重构后的关键片段（示意）：

```text
+DEFINE_AGENT: ApiDesigner 生成接口设计文档]

+DEFINE_PERSONA:
Role: 资深后端工程师，输出严谨、可落地的接口设计
+END_PERSONA

+DEFINE_CONSTRAINTS:
OutputFormat: 使用 Markdown，包含字段表、错误码表、示例请求/响应
NoSecrets: 不输出任何密钥或内部敏感信息
+END_CONSTRAINTS

VARIABLE:
requirement: 用户需求描述（text，必填）
service_name: 服务名（text，必填）

+DEFINE_WORKER: DesignAPI 基于需求生成接口设计]
  ++INPUTS
    REQUIRED <REF>requirement</REF>
    REQUIRED <REF>service_name</REF>
  ++END_INPUTS
  ++OUTPUTS
    <REF>api_doc</REF>
  ++END_OUTPUTS
  ++MAIN_FLOW
    ++SEQUENTIAL_BLOCK
      COMMAND-1: 解析 {{requirement}}，抽取资源、动作、实体字段
      COMMAND-2: 设计接口列表与路径，统一命名到 {{service_name}} 语境
      COMMAND-3: 生成 Markdown 文档输出为 api_doc
    ++END_SEQUENTIAL_BLOCK
  ++END_MAIN_FLOW
+END_WORKER

+END_AGENT
```

如果你希望正文用 `<REF>requirement</REF>`，我会在最后附上“将 `<REF>` 预处理成 `{{}}`”的规则，让你在运行时统一渲染。
