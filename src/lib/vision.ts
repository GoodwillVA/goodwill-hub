// Shared utility for fetching image attachments and passing them to Claude as vision content blocks.
// Claude supports: image/jpeg, image/png, image/gif, image/webp — max ~5 MB per image.

type SupportedMimeType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'

export interface ImageBlock {
  type: 'image'
  source: { type: 'base64'; media_type: SupportedMimeType; data: string }
}

/** Fetch a URL and return a base64 Claude image block, or null on failure. */
export async function fetchImageBlock(url: string, mimeType: string): Promise<ImageBlock | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    // Skip anything over 5 MB to avoid runaway token costs
    const len = res.headers.get('content-length')
    if (len && parseInt(len) > 5 * 1024 * 1024) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    return {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: mimeType as SupportedMimeType, data: buffer.toString('base64') },
    }
  } catch { return null }
}

/**
 * Prepend image blocks to a message thread as a synthetic user/assistant exchange so
 * Claude can see them throughout the whole conversation, not just the first turn.
 */
export function prependImageContext(
  messages: { role: 'user' | 'assistant'; content: string }[],
  imageBlocks: ImageBlock[]
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): any[] {
  if (imageBlocks.length === 0) return messages
  const plural = imageBlocks.length > 1
  return [
    {
      role: 'user',
      content: [
        { type: 'text', text: `${imageBlocks.length} attached reference image${plural ? 's' : ''}:` },
        ...imageBlocks,
      ],
    },
    {
      role: 'assistant',
      content: `I can see the ${plural ? `${imageBlocks.length} ` : ''}attached reference image${plural ? 's' : ''}. I'll reference ${plural ? 'them' : 'it'} throughout our conversation.`,
    },
    ...messages,
  ]
}
