import { Receiver } from "@upstash/qstash";

export async function verifyQStashRequest(request: Request, body: string, expectedUrl?: string) {
  const signature = request.headers.get("upstash-signature");
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;

  if (!signature || !currentSigningKey || !nextSigningKey) return false;

  try {
    const receiver = new Receiver({ currentSigningKey, nextSigningKey, devMode: false });
    return await receiver.verify({
      signature,
      body,
      url: expectedUrl ?? request.url,
      upstashRegion: request.headers.get("upstash-region") ?? undefined,
      clockTolerance: 5,
    });
  } catch {
    return false;
  }
}
