import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { addDocument, listDocuments, removeDocument, splitText, type KnowledgeChunk } from "@/lib/knowledge";

export const runtime = "nodejs";
const MAX_BYTES = 12 * 1024 * 1024;

export async function GET() {
  try {
    return NextResponse.json({ documents: await listDocuments() });
  } catch (error) {
    console.error("Knowledge list failed:", error);
    return NextResponse.json({ error: "读取知识库失败" }, { status: 500 });
  }
}

async function extractPdfText(buffer: Buffer): Promise<string> {
  const task = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    isEvalSupported: false,
  });
  const pdf = await task.promise;
  const pages: string[] = [];
  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .filter(Boolean)
        .join(" ");
      pages.push(pageText);
      page.cleanup();
    }
    return pages.join("\n");
  } finally {
    await pdf.destroy();
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
    const text = ext === "pdf" ? await extractPdfText(buffer) : buffer.toString("utf8");
    if (!text.trim()) {
      return NextResponse.json(
        { error: "没有提取到文字。该 PDF 可能是扫描件或图片型 PDF，目前暂不支持 OCR。" },
        { status: 422 },
      );
    }

    const id = randomUUID();
    const chunks: KnowledgeChunk[] = splitText(text).map((content) => ({
      id: randomUUID(),
      documentId: id,
      documentName: file.name,
      content,
      page: null,
    }));
    const doc = {
      id,
      name: file.name,
      type: ext || "unknown",
      size: file.size,
      createdAt: new Date().toISOString(),
      chunks,
    };
    await addDocument(doc);
    return NextResponse.json({
      document: { id, name: file.name, type: ext, chunkCount: chunks.length },
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
