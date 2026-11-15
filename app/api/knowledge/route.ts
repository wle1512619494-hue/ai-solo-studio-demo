import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { addDocument, listDocuments, removeDocument, splitText, type KnowledgeChunk } from "@/lib/knowledge";

export const runtime = "nodejs";
const MAX_BYTES = 12 * 1024 * 1024;

// PDF.js needs its bundled CMaps and standard font data for some CID-font PDFs,
// especially documents generated with Chinese Type-0/CID fonts.
const pdfjsAssets = path.join(process.cwd(), "node_modules", "pdfjs-dist");

async function extractPdfText(buffer: Buffer): Promise<{ text: string; pageCount: number; extractedChars: number }> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
    cMapUrl: path.join(pdfjsAssets, "cmaps") + path.sep,
    cMapPacked: true,
    standardFontDataUrl: path.join(pdfjsAssets, "standard_fonts") + path.sep,
    disableFontFace: true,
  });
  const pdf = await task.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter((value) => value.length > 0)
        .join(" ");
      pages.push(pageText);
      page.cleanup();
    }
    const text = pages.join("\n").trim();
    return { text, pageCount: pdf.numPages, extractedChars: text.length };
  } finally {
    await pdf.destroy();
  }
}

export async function GET() {
  try {
    return NextResponse.json({ documents: await listDocuments() });
  } catch (error) {
    console.error("Knowledge list failed:", error);
    return NextResponse.json({ error: "读取知识库失败" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const data = await req.formData();
    const file = data.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "请选择文件" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: "文件不能超过 12MB" }, { status: 413 });
    }

    const ext = file.name.split(".").pop()?.toLowerCase();
    if (!["pdf", "txt", "md", "markdown"].includes(ext || "")) {
      return NextResponse.json({ error: "仅支持 PDF、TXT、Markdown" }, { status: 415 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    let text: string;
    let pdfDiagnostics: { pageCount: number; extractedChars: number } | undefined;

    if (ext === "pdf") {
      const result = await extractPdfText(buffer);
      text = result.text;
      pdfDiagnostics = { pageCount: result.pageCount, extractedChars: result.extractedChars };
      console.info("PDF extraction diagnostics:", { file: file.name, ...pdfDiagnostics });
      if (!text) {
        return NextResponse.json(
          {
            error: "PDF 已读取，但没有提取到文字。请确认它不是扫描件/图片型 PDF；如为文字型 PDF，请提供文件样本以继续排查。",
            diagnostics: pdfDiagnostics,
          },
          { status: 422 },
        );
      }
    } else {
      text = buffer.toString("utf8");
      if (!text.trim()) {
        return NextResponse.json({ error: "文件内容为空" }, { status: 422 });
      }
    }

    const id = randomUUID();
    const chunks: KnowledgeChunk[] = splitText(text).map((content) => ({
      id: randomUUID(),
      documentId: id,
      documentName: file.name,
      content,
      page: null,
    }));
    if (chunks.length === 0) {
      return NextResponse.json({ error: "文档没有生成可检索的文本片段" }, { status: 422 });
    }

    await addDocument({
      id,
      name: file.name,
      type: ext || "unknown",
      size: file.size,
      createdAt: new Date().toISOString(),
      chunks,
    });
    return NextResponse.json({
      document: { id, name: file.name, type: ext, chunkCount: chunks.length },
      ...(pdfDiagnostics ? { diagnostics: pdfDiagnostics } : {}),
    });
  } catch (error) {
    console.error("Knowledge upload failed:", error);
    const message = error instanceof Error ? error.message : "未知解析错误";
    return NextResponse.json({ error: `PDF/文档处理失败：${message}` }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "缺少文档 ID" }, { status: 400 });
  await removeDocument(id);
  return NextResponse.json({ success: true });
}
