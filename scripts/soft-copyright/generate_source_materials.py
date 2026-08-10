"""根据软著清单生成源码包、文件清单和带语法配色的 PDF。"""

from __future__ import annotations

import argparse
import fnmatch
import hashlib
import json
import math
import re
import subprocess
import zipfile
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from reportlab.lib.colors import HexColor
from reportlab.lib.pagesizes import A4
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MANIFEST = ROOT / "docs" / "soft-copyright" / "source-manifest.json"
DEFAULT_OUTPUT = ROOT / "docs" / "soft-copyright" / "deliverables"
CODE_FONT = "SoftCopyrightCode"
HEADER_FONT = "SoftCopyrightHeader"

KEYWORDS = {
    "and", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
    "def", "default", "delete", "do", "elif", "else", "except", "export", "extends", "false",
    "finally", "for", "from", "function", "if", "implements", "import", "in", "interface", "is",
    "let", "new", "none", "not", "null", "or", "pass", "raise", "return", "switch", "throw",
    "true", "try", "type", "typeof", "undefined", "while", "with", "yield",
}

TOKEN_PATTERN = re.compile(
    r"(?P<comment>//.*|#.*)"
    r"|(?P<string>`(?:\\.|[^`])*`|\"(?:\\.|[^\"\\])*\"|'(?:\\.|[^'\\])*')"
    r"|(?P<number>\b(?:0x[0-9A-Fa-f]+|\d+(?:\.\d+)?)\b)"
    r"|(?P<word>\b[A-Za-z_][A-Za-z0-9_]*\b)"
)


@dataclass(frozen=True)
class SourceFile:
    path: str
    text: str
    sha256: str


def _load_manifest(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def _is_excluded(relative_path: str, patterns: list[str]) -> bool:
    normalized = relative_path.replace("\\", "/")
    return any(fnmatch.fnmatch(normalized, pattern) for pattern in patterns)


def _collect_files(manifest: dict) -> list[SourceFile]:
    paths: set[Path] = set()
    for pattern in manifest["include"]:
        paths.update(path for path in ROOT.glob(pattern) if path.is_file())

    result: list[SourceFile] = []
    for path in sorted(paths, key=lambda item: item.relative_to(ROOT).as_posix()):
        relative = path.relative_to(ROOT).as_posix()
        if _is_excluded(relative, manifest["exclude"]):
            continue
        raw = path.read_bytes()
        if b"\x00" in raw:
            raise ValueError(f"源码清单包含二进制文件: {relative}")
        text = raw.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")
        result.append(SourceFile(relative, text, hashlib.sha256(raw).hexdigest()))
    return result


def _git_revision() -> str:
    completed = subprocess.run(
        ["git", "rev-parse", "--short", "HEAD"],
        cwd=ROOT,
        check=False,
        capture_output=True,
        text=True,
    )
    return completed.stdout.strip() or "working-tree"


def _register_fonts() -> None:
    font_dir = Path("C:/Windows/Fonts")
    code_path = font_dir / "simfang.ttf"
    header_path = font_dir / "simhei.ttf"
    if not code_path.exists():
        raise FileNotFoundError("缺少 Windows 仿宋字体 C:/Windows/Fonts/simfang.ttf")
    if not header_path.exists():
        header_path = code_path
    pdfmetrics.registerFont(TTFont(CODE_FONT, str(code_path)))
    pdfmetrics.registerFont(TTFont(HEADER_FONT, str(header_path)))


def _wrap_code_line(line: str, max_columns: int = 118) -> list[str]:
    expanded = line.expandtabs(4)
    if not expanded:
        return [""]
    chunks = []
    current = expanded
    while len(current) > max_columns:
        split_at = current.rfind(" ", 0, max_columns + 1)
        if split_at < max_columns // 2:
            split_at = max_columns
        chunks.append(current[:split_at])
        current = "    " + current[split_at:].lstrip()
    chunks.append(current)
    return chunks


def _visual_lines(files: list[SourceFile]) -> list[tuple[str, int | None, str]]:
    lines: list[tuple[str, int | None, str]] = []
    for source in files:
        comment_prefix = "#" if source.path.endswith(".py") else "//"
        lines.append((source.path, None, f"{comment_prefix} ===== 文件: {source.path} ====="))
        for line_number, code_line in enumerate(source.text.split("\n"), start=1):
            wrapped = _wrap_code_line(code_line)
            lines.append((source.path, line_number, wrapped[0]))
            lines.extend((source.path, None, part) for part in wrapped[1:])
        lines.append((source.path, None, ""))
    return lines


def _token_segments(line: str) -> list[tuple[str, HexColor]]:
    colors = {
        "plain": HexColor("#20242B"),
        "comment": HexColor("#39714B"),
        "string": HexColor("#A33A2B"),
        "number": HexColor("#7651A8"),
        "keyword": HexColor("#175A9C"),
    }
    segments: list[tuple[str, HexColor]] = []
    cursor = 0
    for match in TOKEN_PATTERN.finditer(line):
        if match.start() > cursor:
            segments.append((line[cursor:match.start()], colors["plain"]))
        token = match.group(0)
        kind = match.lastgroup or "plain"
        if kind == "word" and token.lower() in KEYWORDS:
            kind = "keyword"
        elif kind == "word":
            kind = "plain"
        segments.append((token, colors[kind]))
        cursor = match.end()
        if kind == "comment":
            break
    if cursor < len(line):
        segments.append((line[cursor:], colors["plain"]))
    return segments or [("", colors["plain"])]


def _draw_pdf(
    output_path: Path,
    title: str,
    version: str,
    lines: list[tuple[str, int | None, str]],
    *,
    lines_per_page: int,
    forced_page_count: int | None = None,
    page_offset: int = 0,
    canvas_instance: canvas.Canvas | None = None,
) -> canvas.Canvas:
    page_width, page_height = A4
    pdf = canvas_instance or canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
    total_pages = forced_page_count or max(1, math.ceil(len(lines) / lines_per_page))
    line_height = min(10.0, (page_height - 66) / lines_per_page)
    font_size = max(5.7, min(7.1, line_height * 0.72))
    left = 24
    code_left = 52

    for local_page in range(total_pages):
        page_number = page_offset + local_page + 1
        page_lines = lines[local_page * lines_per_page:(local_page + 1) * lines_per_page]
        current_path = next((item[0] for item in page_lines if item[0]), "")

        pdf.setFillColor(HexColor("#14202B"))
        pdf.setFont(HEADER_FONT, 8.2)
        pdf.drawString(left, page_height - 24, f"{title} {version}")
        pdf.setFont(CODE_FONT, 6.6)
        pdf.setFillColor(HexColor("#5D6873"))
        pdf.drawRightString(page_width - 24, page_height - 24, f"第 {page_number} 页")
        pdf.setStrokeColor(HexColor("#C9D1D9"))
        pdf.line(left, page_height - 30, page_width - 24, page_height - 30)
        if current_path:
            pdf.setFillColor(HexColor("#4D5A66"))
            pdf.drawString(left, page_height - 40, current_path[:92])

        y = page_height - 52
        for _path, line_number, code_line in page_lines:
            pdf.setFont(CODE_FONT, font_size)
            pdf.setFillColor(HexColor("#8A939D"))
            number_text = "" if line_number is None else str(line_number)
            pdf.drawRightString(code_left - 5, y, number_text)
            x = code_left
            for segment, color in _token_segments(code_line):
                pdf.setFillColor(color)
                pdf.drawString(x, y, segment)
                x += pdfmetrics.stringWidth(segment, CODE_FONT, font_size)
            y -= line_height

        pdf.setStrokeColor(HexColor("#D6DCE2"))
        pdf.line(left, 21, page_width - 24, 21)
        pdf.setFillColor(HexColor("#68737D"))
        pdf.setFont(CODE_FONT, 6.2)
        pdf.drawString(left, 11, "软著源码材料 - 由 source-manifest.json 可复现生成")
        pdf.showPage()

    if canvas_instance is None:
        pdf.save()
    return pdf


def _write_full_pdf(output_path: Path, manifest: dict, files: list[SourceFile]) -> int:
    lines = _visual_lines(files)
    _draw_pdf(
        output_path,
        manifest["softwareName"],
        manifest["version"],
        lines,
        lines_per_page=50,
    )
    return math.ceil(len(lines) / 50)


def _write_submission_pdf(output_path: Path, manifest: dict, files_by_path: dict[str, SourceFile]) -> tuple[int, int]:
    first_files = [files_by_path[path] for path in manifest["submissionFirst"]]
    last_files = [files_by_path[path] for path in manifest["submissionLast"]]
    first_lines = _visual_lines(first_files)
    last_lines = _visual_lines(last_files)
    # 两组源码都按完整文件组织；分别计算页容量，避免某一组较短时在末尾留下整页空白。
    first_lines_per_page = max(50, math.ceil(len(first_lines) / 30))
    last_lines_per_page = max(50, math.ceil(len(last_lines) / 30))

    pdf = canvas.Canvas(str(output_path), pagesize=A4, pageCompression=1)
    _draw_pdf(
        output_path,
        manifest["softwareName"],
        manifest["version"],
        first_lines,
        lines_per_page=first_lines_per_page,
        forced_page_count=30,
        canvas_instance=pdf,
    )
    _draw_pdf(
        output_path,
        manifest["softwareName"],
        manifest["version"],
        last_lines,
        lines_per_page=last_lines_per_page,
        forced_page_count=30,
        page_offset=30,
        canvas_instance=pdf,
    )
    pdf.save()
    return 60, max(first_lines_per_page, last_lines_per_page)


def _write_file_list(output_path: Path, manifest: dict, files: list[SourceFile], revision: str) -> None:
    lines = [
        f"软件名称：{manifest['softwareName']}",
        f"软件版本：{manifest['version']}",
        f"Git 基线：{revision}",
        f"生成时间（UTC）：{datetime.now(timezone.utc).isoformat(timespec='seconds')}",
        f"源码文件数：{len(files)}",
        "",
    ]
    for index, source in enumerate(files, start=1):
        line_count = len(source.text.splitlines())
        lines.append(f"{index:03d}  {source.path}  lines={line_count}  sha256={source.sha256}")
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_exclusion_list(output_path: Path, manifest: dict) -> None:
    lines = ["软著源码 PDF 排除项", ""]
    lines.extend(f"- {pattern}" for pattern in manifest["exclude"])
    lines.extend([
        "",
        "说明：示例数据、算法转换实现、测试、迁移、SQL、依赖、日志、密钥配置和二进制文件不进入源码 PDF 主体。",
    ])
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_verification(output_path: Path, files: list[SourceFile], full_pages: int, submission_lpp: int) -> None:
    forbidden = ["Ionosphere", "Synthetic Benchmark", "OMELET-072", "91.8%", "86.7%", "Ionosphere_results_1012"]
    absolute_path_pattern = re.compile(r"(?i)\b[A-Z]:[\\/](?:Users|研究生阶段|Desktop|Apps)[\\/]")
    findings = []
    for source in files:
        for marker in forbidden:
            if marker in source.text:
                findings.append(f"演示标记 {marker}: {source.path}")
        if absolute_path_pattern.search(source.text):
            findings.append(f"本机绝对路径: {source.path}")

    lines = [
        "软著源码材料生成校验",
        f"完整源码 PDF 页数：{full_pages}",
        "提交摘录 PDF 页数：60",
        f"提交摘录每页代码行容量：{submission_lpp}",
        f"运行时代码文件数：{len(files)}",
        f"演示标记/绝对路径发现数：{len(findings)}",
    ]
    lines.extend(f"- {finding}" for finding in findings)
    if not findings:
        lines.append("- 未发现计划列出的固定演示标记或常见本机绝对路径。")
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def _write_source_zip(output_path: Path, manifest_path: Path, files: list[SourceFile], generated_files: list[Path]) -> None:
    with zipfile.ZipFile(output_path, "w", zipfile.ZIP_DEFLATED) as archive:
        for source in files:
            archive.write(ROOT / source.path, source.path)
        archive.write(manifest_path, "docs/soft-copyright/source-manifest.json")
        for path in generated_files:
            archive.write(path, f"docs/soft-copyright/{path.name}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, default=DEFAULT_MANIFEST)
    parser.add_argument("--output-dir", type=Path, default=DEFAULT_OUTPUT)
    args = parser.parse_args()

    manifest_path = args.manifest.resolve()
    output_dir = args.output_dir.resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    manifest = _load_manifest(manifest_path)
    files = _collect_files(manifest)
    files_by_path = {source.path: source for source in files}
    missing = [path for path in manifest["submissionFirst"] + manifest["submissionLast"] if path not in files_by_path]
    if missing:
        raise FileNotFoundError(f"提交摘录文件不在源码清单中: {', '.join(missing)}")

    _register_fonts()
    revision = _git_revision()
    full_pdf = output_dir / "新材料数据分析系统-V1.0-完整源码.pdf"
    submission_pdf = output_dir / "新材料数据分析系统-V1.0-软著源码提交摘录.pdf"
    file_list = output_dir / "源码文件清单.txt"
    exclusion_list = output_dir / "源码排除项清单.txt"
    verification = output_dir / "源码材料校验报告.txt"
    source_zip = output_dir / "新材料数据分析系统-V1.0-原创平台源码包.zip"

    _write_file_list(file_list, manifest, files, revision)
    _write_exclusion_list(exclusion_list, manifest)
    full_pages = _write_full_pdf(full_pdf, manifest, files)
    _, submission_lpp = _write_submission_pdf(submission_pdf, manifest, files_by_path)
    _write_verification(verification, files, full_pages, submission_lpp)
    _write_source_zip(source_zip, manifest_path, files, [file_list, exclusion_list, verification])

    print(json.dumps({
        "files": len(files),
        "fullPages": full_pages,
        "submissionPages": 60,
        "submissionLinesPerPage": submission_lpp,
        "outputDir": str(output_dir),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
