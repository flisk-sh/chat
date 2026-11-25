// Reading a picture: the posts @askflisk answers often point at one ("is this ranking right?", a screenshot, a chart).
// A vision model on Workers AI writes down what is in it (text, names, tiers), and the answer is made from that.
export const VISION_MODELS = ['@cf/meta/llama-3.2-11b-vision-instruct', '@cf/llava-hf/llava-1.5-7b-hf'];
export const MAX_IMAGE_BYTES = 3_000_000;
export const MAX_IMAGES = 2;
// Only pictures that X itself hosts: the bot sends links, chat fetches them, so no link to anywhere else is followed.
export const IMAGE_URL = /^https:\/\/pbs\.twimg\.com\/(?:media|ext_tw_video_thumb|amplify_video_thumb|tweet_video_thumb)\/[\w./-]+(?:\?[\w=&.%-]*)?$/;
export const imageUrls = (list) => (Array.isArray(list) ? list.filter((u) => typeof u === 'string' && IMAGE_URL.test(u)).slice(0, MAX_IMAGES) : []);

// What is in these pictures, for someone who asked `question`: plain text, '' when none could be read.
export async function seeImages(env, urls, question, fetchImpl = fetch) {
  if (!env?.AI || !urls.length) return '';
  const parts = [];
  for (const url of urls) {
    const res = await fetchImpl(url).catch(() => null);
    if (!res?.ok) continue;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (!buf.length || buf.length > MAX_IMAGE_BYTES) continue;
    const prompt = `Someone asks about this picture: "${String(question).slice(0, 200)}". Write down what is in it, facts only: every readable text, name and label. For a ranking, tier list or chart write each tier or group with the items in it, in order. Under 1200 characters.`;
    for (const model of VISION_MODELS) {
      const r = await env.AI.run(model, { image: [...buf], prompt, max_tokens: 600 }).catch(() => null);
      const text = String(r?.description || r?.response || '').trim();
      if (text) { parts.push(text); break; }
    }
  }
  return parts.join('\n---\n').slice(0, 1800);
}
