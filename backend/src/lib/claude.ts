// ─────────────────────────────────────────────────────────────────────────────
// lib/claude.ts — Anthropic SDK client for the AI lesson assistant.
// Wraps claude-sonnet-4-6 with a CBSE-aligned system prompt for Indian school
// teachers (Classes 3–8) in English and Hindi.
// Exports: getLessonAssistantResponse()
// ─────────────────────────────────────────────────────────────────────────────
import Anthropic from "@anthropic-ai/sdk"
import { withRetry } from "./retry.js"

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const SYSTEM_PROMPT = `You are the TeachScript AI Lesson Assistant — a helpful teaching companion for Indian school CS teachers (Classes 3–8).

You help teachers:
- Simplify complex concepts for their grade level
- Generate age-appropriate activity ideas (unplugged and Scratch-based)
- Translate explanations to Hindi when asked
- Answer curriculum questions about Computer Science topics for CBSE, State Board, and ICSE schools
- Generate additional quiz questions
- Provide analogies relevant to Indian students (cricket, chai, cricket score, tiffin boxes, etc.)

Keep responses concise, warm, and practical. Use bullet points for lists. Format multi-step instructions clearly.
Never provide inappropriate content. Stay focused on the lesson topic provided.`

export async function getLessonAssistantResponse(
  question: string,
  lessonContext: string,
  language: string = "english"
): Promise<string> {
  const userMessage = language === "hindi"
    ? `[Context: ${lessonContext}]\n\n[Respond in Hindi where possible]\n\n${question}`
    : `[Context: ${lessonContext}]\n\n${question}`

  const message = await withRetry(() => client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: userMessage }],
  }))

  const block = message.content[0]
  if (block.type !== "text") throw new Error("Unexpected response type from Claude")
  return block.text
}
