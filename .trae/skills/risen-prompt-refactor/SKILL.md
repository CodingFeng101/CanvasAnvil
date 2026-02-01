---
name: "risen-prompt-refactor"
description: "把现有智能体 prompt 重构为 RISEN（含 Input/Output）结构，并统一变量占位符为 {{var}} 便于跨语言注入。需要用 RISEN 标准化 prompt 时调用。"
---

# RISEN Prompt Refactor（含 Input/Output）

将任意“散装 prompt / 现有智能体 prompt”重构为增强版 RISEN 提示词结构（R / I / Input / S / E / N / Output），并把所有运行时变量统一为 `{{var}}` 占位符，确保在 Python/JS/TS/Go/Java/C# 等语言里都能稳定注入。

## 何时调用

- 你想把一个混乱的 prompt 改成可复用、可验收、可控输出的结构
- 你希望明确 Input/Output 契约，让模型不跑偏
- 你需要把 prompt 变量工程化（统一 `{{var}}`，跨语言渲染）

## 你给我什么

- 原始 prompt（system/developer/user 任意形态）
- 已知变量（可选）：变量名、含义、是否必填、类型/范围
- 目标语言/运行环境（可选）：Python/TS/Go/Java/C#…
- 输出偏好（可选）：Markdown/JSON/纯文本/表格/代码块

## 我输出什么

- 一份重构后的 RISEN Prompt（可直接复制使用）
- 一份变量契约（变量名、含义、必填/可选、类型、默认值/约束）
- 一份跨语言注入说明（如何把 `{{var}}` 渲染为最终 prompt）

## RISEN 固定结构（增强版，含 I/O 的位置）

你可以把它理解为“强约束的写作骨架”，关键点是 **Input 固定在 I 之后、S 之前；Output 固定在 N 之后，独立一段**。

```text
# R - Role
你是[领域 + 资深程度]，擅长[核心能力1 + 核心能力2]，语气[简洁严谨/亲切接地气/专业规范]，能精准匹配[任务场景]需求，不输出冗余内容、不偏离专业范围。

# I - Instructions
你的核心任务：[用“动词 + 宾语”的句式，明确 1 个核心任务，不模糊、不冗余]

# Input
我将给你的输入内容：
- 输入类型：[文本/表格/代码片段/关键词列表/文件路径…]
- 输入格式：[每行1条/分点列出/自由文本/两行输入…]
- 输入范围：[只处理什么/忽略什么/时间范围/类型范围…]

# S - Steps
请严格按以下步骤执行：
1. [步骤1：一个具体动作]
2. [步骤2：一个具体动作]
3. [步骤3：一个具体动作]
4. [步骤4：一个具体动作]

# E - End Goal
最终要达成的效果/验收标准：[关联用户价值 + 明确完成标准]

# N - Narrowing
约束条件：
1. 内容约束：[只允许/禁止的内容范围]
2. 格式约束：[输出格式、是否允许解释、符号规则…]
3. 量化约束：[字数/准确率/时长/条目数/复杂度…]
4. 其他约束：[风格一致性/技术限制/禁用项…]

# Output Format
输出必须严格遵循以下格式：
1. 结构：[表格/一段式/分点/代码块(含运行示例)…]
2. 格式符号：[标题/加粗/分隔线/日期格式/代码块语言…]
3. 禁止：[禁止额外解释/标题/备注/冗余内容/报错崩溃…]
4. 补充说明（可选）：[异常提示格式/示例风格参考…]
```

## 变量与注入：不必拘泥“Input 里写死真实值”

RISEN 的 Input 目的是“告诉模型你会提供什么”，工程上你完全可以把真实输入作为变量在运行时注入。

推荐约定：

- prompt 内所有需要运行时填充的内容，一律写成 `{{var}}`
- Input 模块描述“你将给什么类型/格式/范围”，并在其中引用 `{{var}}` 来点明变量与用途
- Output 模块描述“最终输出的结构/格式/禁止项”，不要把变量值写死在这里

示例（Input 中引用运行时变量）：

```text
# Input
我将给你的输入内容：
- 输入类型：需求描述文本
- 输入格式：自由文本
- 输入范围：仅处理该需求相关内容

需求描述如下：
{{requirement}}
```

## 跨语言渲染/注入（统一处理 `{{var}}`）

下面示例将 `template` 中的 `{{key}}` 替换为 `vars[key]` 的字符串。未提供的 key 默认替换为空字符串（也可改为抛错）。

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

_var = re.compile(r"\{\{\s*([a-zA-Z_]\w*)\s*\}\}")

def render_template(template: str, vars: dict) -> str:
    def repl(m):
        key = m.group(1)
        v = vars.get(key)
        return "" if v is None else str(v)
    return _var.sub(repl, template)
```

### Go（使用 text/template：先把 `{{var}}` 变成 `{{.var}}`）

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

### Java

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

### C#

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

## 重构规则（我会自动做）

- R：把“身份/资历/语气/擅长领域”聚合为一个可执行角色
- I：压缩成一个“动词 + 宾语”的核心任务句，去掉冗余口号
- Input：只描述输入类型/格式/范围，并用 `{{var}}` 承载真实输入
- S：拆成可执行的小步骤，每步只做一个动作，按“输入→处理→输出”排序
- E：写清验收标准与用户价值，避免“做好就行”
- N：写硬约束（量化、明确禁忌），避免“尽量/不要太…”
- Output：写死输出结构与禁忌，让模型无需猜你要什么格式

## 快速自检（防跑偏）

- Role 是否具体到“领域 + 能力 + 语气”
- Input 是否包含 类型/格式/范围 三要素
- Steps 是否不跳步、每步一个动作
- Narrowing 是否量化且可执行
- Output 是否明确结构/格式符号/禁止项
