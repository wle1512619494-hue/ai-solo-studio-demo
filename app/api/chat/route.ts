import { NextRequest, NextResponse } from "next/server";
import { searchKnowledge } from "@/lib/knowledge";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SAFETY = /(漏电|带电|拆机|高压|电气|短路|触电|安全阀|压力容器|打开机壳|绕过.*保护|屏蔽.*保护)/i;
const MIN_RELEVANCE_SCORE = 2;

type Hit = Awaited<ReturnType<typeof searchKnowledge>>[number];

function getLiteLLMConfig() {
  const rawBase = process.env.LITELLM_BASE_URL || "http://localhost:4000/v1";
  const base = rawBase.replace(/\/+$/, "");
  return {
    baseUrl: base.endsWith("/v1") ? base : `${base}/v1`,
    apiKey: process.env.LITELLM_API_KEY || "",
    model: process.env.LITELLM_MODEL || "",
  };
}

function buildContext(hits: Hit[]) {
  return hits.map((hit, index) =>
    [
      `[资料 ${index + 1}]`,
      `文档：${hit.documentName}`,
      hit.page ? `页码：${hit.page}` : "",
      `内容：${hit.content}`,
    ].filter(Boolean).join("\n")
  ).join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const message = typeof body?.message === "string" ? body.message.trim() : "";

    if (!message) {
      return NextResponse.json({ error: "请输入问题" }, { status: 400 });
    }
    if (message.length > 2000) {
      return NextResponse.json({ error: "问题不能超过 2000 个字符" }, { status: 400 });
    }

    // 安全规则优先于知识检索和模型生成，避免模型给出危险操作指导。
    if (SAFETY.test(message)) {
      return NextResponse.json({
        answer: "这个问题可能涉及电气、压力或机械安全风险。请停止自行拆机、带电操作或绕过设备保护，联系具备资质的售后工程师。系统不会提供此类操作步骤。我可以帮您登记报修。",
        warning: true,
        handoff: true,
        sources: [],
      });
    }

    const hits = await searchKnowledge(message, 6);
    const relevantHits = hits.filter((hit) => hit.score >= MIN_RELEVANCE_SCORE);

    if (!relevantHits.length) {
      return NextResponse.json({
        answer: "我没有在当前企业知识库中找到足够相关的资料，暂时不能可靠回答。请补充设备品牌、型号或相关故障资料，也可以转由售后工程师确认。",
        warning: true,
        handoff: true,
        sources: [],
      });
    }

    const { baseUrl, apiKey, model } = getLiteLLMConfig();
    if (!apiKey || !model) {
      console.error("LiteLLM is not configured. Set LITELLM_API_KEY and LITELLM_MODEL.");
      return NextResponse.json(
        { error: "AI 服务尚未完成配置，请检查服务端 LiteLLM 环境变量。" },
        { status: 503 },
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let llmResponse: Response;
    try {
      llmResponse = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0.2,
          max_tokens: 900,
          messages: [
            {
              role: "system",
              content: [
                "你是企业设备售后知识库助手。你必须严格依据用户提供的知识库资料回答。",
                "规则：",
                "1. 只使用资料中明确支持的信息，不得使用常识补全型号、故障代码、参数、热线电话或维修步骤。",
                "2. 资料没有明确答案时，直接说明知识库资料不足，并建议联系人工售后；不要猜测。",
                "3. 不提供拆机、带电、高压、电气维修、短接、绕过安全保护等危险操作指导。遇到这类请求应停止回答并转人工。",
                "4. 用简洁、自然的中文回答。不要整段复述资料，只提炼与问题直接相关的内容。",
                "5. 回答末尾标注依据的资料编号，例如“资料依据：[资料 1]”。若资料无法支持结论，不要引用。",
                "6. 这些资料可能是演示内容。不得把演示型号、参数或联系方式说成真实厂商信息。",
              ].join("\n"),
            },
            {
              role: "user",
              content: `用户问题：${message}\n\n以下是从企业知识库检索到的资料，请仅依据这些资料回答：\n\n${buildContext(relevantHits)}`,
            },
          ],
        }),
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!llmResponse.ok) {
      const detail = await llmResponse.text().catch(() => "");
      console.error("LiteLLM request failed:", llmResponse.status, detail.slice(0, 1000));
      return NextResponse.json(
        { error: "AI 模型服务暂时不可用，请稍后重试。" },
        { status: 502 },
      );
    }

    const completion = await llmResponse.json();
    const answer = completion?.choices?.[0]?.message?.content;
    if (typeof answer !== "string" || !answer.trim()) {
      console.error("LiteLLM returned an empty assistant message.");
      return NextResponse.json({ error: "AI 暂时没有生成有效回答，请重试。" }, { status: 502 });
    }

    return NextResponse.json({
      answer: answer.trim(),
      warning: false,
      handoff: false,
      sources: relevantHits.map((hit) => ({
        documentName: hit.documentName,
        page: hit.page,
        excerpt: hit.content.slice(0, 220),
      })),
      usage: completion.usage ?? null,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      return NextResponse.json({ error: "AI 响应超时，请稍后重试。" }, { status: 504 });
    }
    console.error("Chat API error:", error);
    return NextResponse.json({ error: "请求处理失败，请检查服务端日志。" }, { status: 500 });
  }
}
