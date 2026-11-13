// Video, the short form of github.com/flisk-sh/flisk-video-factory: scenes -> slides (Pillow) -> a voice per scene
// (edge-tts, the factory's warm neural voice) -> clips -> one mp4 (ffmpeg from the imageio-ffmpeg wheel, so the computer
// needs only python3 and pip). It runs on the user's fleet computer in the background, because one fleet command may
// last 60 seconds; chat polls until it is done, reads the mp4 back in parts (fleet reads at most 256 KB a call) and keeps it.
export const MAX_SCENES = 8;
export const MAX_PARTS = 12;
export const PART_BYTES = 180_000;
const DIR = '/tmp/flisk-video';
const b64 = (bytes) => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
};

// Keeps only what the script can draw and say.
export function cleanVideo(v) {
  if (!v || typeof v !== 'object' || !Array.isArray(v.scenes)) return null;
  const s = (x, n) => String(x ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
  const scenes = v.scenes
    .map((sc) => ({ text: s(sc?.text, 90), say: s(sc?.say, 240) }))
    .filter((sc) => sc.text || sc.say)
    .slice(0, MAX_SCENES);
  if (!scenes.length) return null;
  return { title: s(v.title, 60) || scenes[0].text.slice(0, 60), scenes };
}

export const VIDEO_PY = String.raw`import asyncio, json, os, re, subprocess, sys, textwrap
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg
FF = imageio_ffmpeg.get_ffmpeg_exe()
W, H = 854, 480
LOOKS = [((247,246,242),(27,27,24),(47,125,74)), ((15,20,38),(251,250,247),(111,240,174)), ((246,210,194),(113,43,19),(113,43,19)), ((201,237,228),(8,80,65),(8,80,65))]
spec = json.load(open('scenes.json'))

def font(size):
    try: return ImageFont.load_default(size=size)
    except TypeError: return ImageFont.load_default()

def slide(i, sc, path):
    bg, ink, acc = LOOKS[i % len(LOOKS)]
    im = Image.new('RGB', (W, H), bg); d = ImageDraw.Draw(im)
    d.rectangle([48, 52, 96, 58], fill=acc)
    d.text((48, 70), spec['title'], font=font(20), fill=acc)
    big = font(46 if len(sc['text']) < 40 else 36)
    lines = textwrap.wrap(sc['text'] or sc['say'], 26 if len(sc['text']) < 40 else 34)[:5]
    y = (H - len(lines) * 58) // 2 + 20
    for ln in lines:
        d.text((48, y), ln, font=big, fill=ink); y += 58
    d.text((48, H - 52), '%d / %d' % (i + 1, len(spec['scenes'])), font=font(16), fill=acc)
    im.save(path)

def length(media):
    r = subprocess.run([FF, '-i', media], capture_output=True, text=True)
    m = re.search(r'Duration: (\d+):(\d+):([\d.]+)', r.stderr)
    return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3)) if m else 0

async def voice(text, out):
    import edge_tts
    await edge_tts.Communicate(text, 'en-US-AvaMultilingualNeural', rate='-5%').save(out)

clips = []
for i, sc in enumerate(spec['scenes']):
    png, mp3, mp4 = 's%d.png' % i, 's%d.mp3' % i, 'c%d.mp4' % i
    slide(i, sc, png)
    spoken = False
    if sc['say']:
        try:
            asyncio.run(voice(sc['say'], mp3)); spoken = os.path.getsize(mp3) > 1000
        except Exception as e:
            print('voice failed, scene %d stays silent: %s' % (i + 1, e), file=sys.stderr)
    dur = (length(mp3) + 0.6) if spoken else max(3.0, len((sc['text'] + ' ' + sc['say']).split()) / 2.6)
    audio = ['-i', mp3] if spoken else ['-f', 'lavfi', '-i', 'anullsrc=r=24000:cl=mono']
    fade = 'fade=t=in:st=0:d=0.4,fade=t=out:st=%.2f:d=0.4,format=yuv420p' % max(0, dur - 0.4)
    subprocess.run([FF, '-y', '-loglevel', 'error', '-loop', '1', '-i', png] + audio + ['-t', '%.2f' % dur, '-vf', fade, '-r', '24',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-tune', 'stillimage', '-c:a', 'aac', '-b:a', '64k', '-ar', '24000', '-ac', '1', mp4], check=True)
    clips.append(mp4)
    print('scene %d of %d done' % (i + 1, len(spec['scenes'])), flush=True)
open('list.txt', 'w').write(''.join("file '%s'\n" % c for c in clips))
subprocess.run([FF, '-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', '-movflags', '+faststart', 'out.mp4'], check=True)
print('out.mp4 %d bytes, %.1f s' % (os.path.getsize('out.mp4'), length('out.mp4')))
`;

const PIP = 'python3 -m pip install -q --disable-pip-version-check';
const START = `cd ${DIR} && rm -f done && nohup setsid sh -c '(python3 -m pip --version >/dev/null 2>&1 || python3 -m ensurepip >/dev/null 2>&1); (${PIP} --break-system-packages edge-tts pillow imageio-ffmpeg || ${PIP} edge-tts pillow imageio-ffmpeg || ${PIP} --user edge-tts pillow imageio-ffmpeg) > pip.log 2>&1; python3 make.py > make.log 2>&1; echo $? > done' > /dev/null 2>&1 & echo started`;
const WAIT = `cd ${DIR} && i=0; while [ ! -f done ] && [ $i -lt 25 ]; do sleep 2; i=$((i+1)); done; if [ -f done ]; then echo "exit $(cat done)"; else echo running; fi; tail -n 3 make.log 2>/dev/null || tail -n 3 pip.log 2>/dev/null`;
const SPLIT = `cd ${DIR} && rm -f part_* && split -b ${PART_BYTES} -a 2 out.mp4 part_ && ls part_*`;

// computer: fleet client; podId: a started pod. save(parts) -> { url } | { error }. Returns what the model is told.
export async function makeVideo({ computer, podId, spec, save, emit = () => {}, polls = 10 }) {
  const say = (text) => emit({ type: 'note', text });
  const w1 = await computer.write(podId, `${DIR}/make.py`, VIDEO_PY);
  const w2 = w1.error ? w1 : await computer.write(podId, `${DIR}/scenes.json`, JSON.stringify(spec));
  if (w2.error) return { error: w2.error };
  say(`Drawing ${spec.scenes.length} scenes and recording the voice-over`);
  const s = await computer.run(podId, START);
  if (s.error || s.data?.exitCode) return { error: s.error || `could not start the video: ${s.data?.stderr || s.data?.stdout || ''}`.trim() };
  let state = 'running';
  for (let i = 0; i < polls && state === 'running'; i++) {
    const r = await computer.run(podId, WAIT);
    if (r.error) return { error: r.error };
    const out = String(r.data?.stdout || '');
    const exit = /^exit (\d+)/m.exec(out);
    state = exit ? (exit[1] === '0' ? 'ok' : 'failed') : 'running';
    const last = out.split('\n').filter((l) => l.trim() && !/^(exit \d+|running)$/.test(l)).pop();
    if (last) say(last.slice(0, 160));
    if (state === 'failed') return { error: `the video did not render: ${out.slice(-400)}` };
  }
  if (state !== 'ok') return { error: 'the video took too long to render' };
  const sp = await computer.run(podId, SPLIT);
  if (sp.error || sp.data?.exitCode) return { error: sp.error || 'could not read the video back' };
  const names = String(sp.data.stdout || '').split(/\s+/).filter((n) => /^part_[a-z]{2}$/.test(n));
  if (!names.length) return { error: 'the video file is empty' };
  if (names.length > MAX_PARTS) return { error: `the video is over ${Math.round((MAX_PARTS * PART_BYTES) / 1e6)} MB; make it shorter` };
  say('Saving the video');
  const parts = [];
  for (const n of names) {
    const r = await computer.read(podId, `${DIR}/${n}`);
    if (r.error) return { error: r.error };
    parts.push(r.data.encoding === 'base64' ? r.data.content : b64(new TextEncoder().encode(r.data.content)));
  }
  return save(parts, spec.title);
}
