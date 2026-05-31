---
name: pdf-to-markdown-long-task
description: |
  批量将 PDF 转为 Markdown，支持长时间执行、断点续跑、内容哈希缓存与表格硬校验。
  复杂表格默认输出为 HTML `<table>`（保留合并单元格能力），正文为 Markdown。
  当用户需要 PDF 转 MD、批量转换、可中断恢复、或强调表格不能静默出错时使用此技能。
origin: ECC
---

# PDF 转 Markdown（长任务）

这是面向 **Claude CLI 一句话触发** 的 skill。默认不要分别手动运行多个子脚本；优先运行总控入口 `scripts/run_pipeline.py`，让它负责环境准备、批量转换、表格校验、断点恢复与结果汇报。

## 何时使用

- 目录下有多份 PDF 需要批量转成 Markdown
- 任务耗时长，需要中断后从断点继续
- 表格必须经校验；低置信度表格不得标记为已完成

## 输入与输出（契约）

| 项 | 说明 |
| :--- | :--- |
| `input_dir` | 含 `.pdf` 的目录（递归可选，默认不递归） |
| `output_dir` | 输出目录；默认 `<input_dir>/md_out` |
| `cache_dir` | 内容哈希缓存；默认 `<output_dir>/.cache` |
| `progress.json` | 位于 `output_dir`，记录 pending/completed/失败与复核项 |
| `table_review.json` | 位于 `output_dir`，汇总所有表格校验结果 |
| 单文件产出 | `<stem>.md`，与 PDF 同名（扩展名改为 `.md`） |

**表格格式**：默认在 Markdown 中嵌入 **HTML 表格**（非 GFM pipe table），以便保留 `rowspan`/`colspan` 等结构。正文段落使用 PDF 提取的纯文本。

## Claude CLI 默认执行方式

当用户说“用这个 skill 把某个目录里的 PDF 转成 Markdown，并保证表格不能错”时，按下面顺序执行：

1. 确认 `input_dir`；可选 `output_dir`、`cache_dir`、`recursive`。
2. **优先运行总控脚本**，不要先让用户手动创建 venv 或安装依赖：

```bash
python3 embedded/skills/pdf-to-markdown-long-task/scripts/run_pipeline.py \
  "/path/to/pdfs" \
  --output-dir "/path/to/md_out"
```

3. 总控脚本会自动：
   - 创建或复用 `.venv-pdf-skill`
   - 安装 `requirements.txt`
   - 调用 `convert_pdf_batch.py`
   - 调用 `validate_tables.py`
   - 读取 `progress.json` 与 `table_review.json`
   - 输出最终摘要与退出码

4. **质量门**：若 `table_review.json` 中 `blocking_issues` 非空，或存在 `status: needs_review` 的表格，则**不得**将对应 PDF 标为最终完成；应在回复中明确指出需要复核。
5. **恢复**：再次运行相同命令即可；脚本会读取 `progress.json`，跳过已完成且哈希未变的文件（除非 `--force`）。

## 给 Claude CLI 的推荐提示词

```text
请使用 `pdf-to-markdown-long-task` skill，把 `/path/to/pdfs` 里的 PDF 批量转换成 Markdown，输出到 `/path/to/md_out`。要求支持长时间执行、断点恢复，并且表格必须经过校验；如果 `table_review.json` 有 blocking issues，就不要把结果当作最终完成。
```

## 长任务策略

- **原子单元**：按「每个 PDF 文件」完成即追加/更新进度并写出 `.md`。
- **缓存**：同一 PDF 内容 SHA-256 未变时，可直接复用缓存 Markdown，避免重复抽取。
- **低置信度**：表格空单元比例过高、行列不齐等会进入 `review_tables`，不静默通过。

## 本地验证

本 skill 现在带有机器可读 contract 与 smoke eval，可在修改脚本后先跑一遍确定回归未引入：

```bash
go run . verify embedded/skills/pdf-to-markdown-long-task --suite smoke
```

该验证会使用 `fixtures/sample_table.pdf`，自动创建临时输入/输出目录，运行 `scripts/run_pipeline.py`，并检查：

- 是否产出 `sample_table.md`
- 是否写出 `progress.json` 与 `table_review.json`
- Markdown 是否包含标题、源文件标记与 `<table>`
- 表格硬校验是否最终通过

## 扫描件 / OCR

若某页提取文本极短但存在位图，脚本会在该页插入 `OCR_FALLBACK` 提示块。完整 OCR 需本地工具链（`ocrmypdf` 等），见 [reference.md](reference.md)。

## 额外说明

- 详细 JSON 字段、总控脚本参数、校验规则与故障排查见 [reference.md](reference.md)。
