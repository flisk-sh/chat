// Voice talk (Flisk Oracle): listen until you pause, the server writes it down and answers, the answer is read aloud, then it
// listens again. Same endpoints as the previous page: POST /api/talk (audio in, words and answer out) and GET /voice (speech).
import {useState, useEffect, useRef} from 'react';
import {Text} from '@astryxdesign/core/Text';
import {Button} from '@astryxdesign/core/Button';
import {BOOT} from './api.js';

const b64 = (blob) => new Promise((ok, no) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = () => no(r.error); r.readAsDataURL(blob); });
const sentences = (t) => (String(t).match(/[^.!?…\n]+[.!?…]*\s*/g) || [String(t)]).reduce((a, s) => { const l = a[a.length - 1]; if (l && l.length + s.length < 180) a[a.length - 1] = l + s; else a.push(s); return a; }, []).map((s) => s.trim()).filter(Boolean);
const SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';

export function Oracle({open, onClose, aiBlock, onKeep, onBuild}) {
  const [state, setState] = useState('thinking');
  const [msg, setMsg] = useState('Opening the microphone…');
  const [you, setYou] = useState('');
  const [say, setSay] = useState('');
  const live = useRef({on: false, stream: null, ctx: null, rec: null, aud: null, turns: [], lang: '', stopListen: null, stopSpeak: null});
  const o = (st, m) => { setState(st); setMsg(m); };

  const speak = (text) => new Promise((done) => {
    const L = live.current; const parts = sentences(text); let i = 0; let cancelled = false;
    L.stopSpeak = () => { cancelled = true; try { L.aud.pause(); } catch (e) { /* none */ } try { speechSynthesis.cancel(); } catch (e) { /* none */ } done(); };
    const fallback = (s) => { try { const u = new SpeechSynthesisUtterance(s); u.onend = u.onerror = next; speechSynthesis.speak(u); } catch (e) { next(); } };
    function next() {
      if (cancelled || !L.on || i >= parts.length) { L.stopSpeak = null; done(); return; }
      const s = parts[i++]; const a = L.aud;
      a.onended = next; a.onerror = () => fallback(s);
      a.src = '/voice?l=' + encodeURIComponent(L.lang) + '&t=' + encodeURIComponent(s.slice(0, 1200));
      const p = a.play(); if (p) p.catch(() => fallback(s));
    }
    next();
  });

  // One utterance: starts on speech, ends after ~1 s of quiet, 30 s at most, gives up after 9 s of silence.
  const hearOne = () => new Promise((done) => {
    const L = live.current; const chunks = [];
    const type = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const r = type ? new MediaRecorder(L.stream, {mimeType: type}) : new MediaRecorder(L.stream);
    const an = L.ctx.createAnalyser(); an.fftSize = 1024; const src = L.ctx.createMediaStreamSource(L.stream); src.connect(an);
    const buf = new Float32Array(an.fftSize);
    let floor = 0.005; let spoke = false; let quiet = 0; let talked = 0; const t0 = Date.now(); let last = t0;
    const tick = () => {
      an.getFloatTimeDomainData(buf); let sum = 0; for (let k = 0; k < buf.length; k++) sum += buf[k] * buf[k];
      const rms = Math.sqrt(sum / buf.length); const now = Date.now(); const dt = now - last; last = now;
      const loud = rms > Math.max(0.045, floor * 4);
      if (loud) { spoke = true; quiet = 0; talked += dt; } else { floor = floor * 0.95 + rms * 0.05; if (spoke) quiet += dt; }
      if ((spoke && quiet > (talked < 2000 ? 1100 : 750)) || now - t0 > 30000 || (!spoke && now - t0 > 9000)) { if (r.state !== 'inactive') r.stop(); }
    };
    const timer = setInterval(tick, 60);
    L.stopListen = () => { if (r.state !== 'inactive') r.stop(); };
    r.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    r.onstop = () => { clearInterval(timer); try { src.disconnect(); } catch (e) { /* done */ } L.stopListen = null; done(spoke ? new Blob(chunks, {type: r.mimeType || type || 'audio/webm'}) : null); };
    r.start();
  });

  const loop = async () => {
    const L = live.current;
    while (L.on) {
      o('listening', 'Listening…');
      const blob = await hearOne();
      if (!L.on) return;
      if (!blob) { o('idle', 'Tap the circle when you want to talk.'); return; }
      o('thinking', 'Thinking…');
      let j;
      try {
        const res = await fetch('/api/talk', {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify({audio: await b64(blob), type: blob.type, lang: L.lang, memo: '', ui: '', history: L.turns, ai: aiBlock()})});
        j = await res.json().catch(() => ({}));
        if (res.status === 401) { o('idle', 'Sign in with GitHub to talk.'); return; }
        if (!res.ok) throw new Error(j.error || 'Voice talk answered ' + res.status);
      } catch (e) { o('idle', String(e.message || e).slice(0, 160)); return; }
      const heard = String(j.heard || '').trim();
      if (!heard) { o('idle', 'I did not catch that. Tap the circle and try again.'); return; }
      if (j.lang) L.lang = j.lang;
      setYou(heard); setSay(String(j.text || ''));
      L.turns.push({role: 'user', content: heard}, {role: 'assistant', content: String(j.text || '')});
      o('speaking', 'Speaking… tap the circle to interrupt');
      await speak(j.text);
      if (!L.on) return;
      if (j.build) { const b = String(j.build).trim(); close(); onBuild(b); return; }
    }
  };

  const close = () => {
    const L = live.current; L.on = false;
    if (L.stopListen) L.stopListen(); if (L.stopSpeak) L.stopSpeak();
    if (L.stream) { L.stream.getTracks().forEach((t) => t.stop()); L.stream = null; }
    if (L.ctx) { try { L.ctx.close(); } catch (e) { /* closed */ } L.ctx = null; }
    if (L.turns.length) { onKeep(L.turns); L.turns = []; }
    onClose();
  };

  useEffect(() => {
    if (!open) return undefined;
    const L = live.current; L.turns = []; L.lang = ''; setYou(''); setSay('');
    if (!BOOT.login) { o('idle', 'Sign in with GitHub to talk with the Oracle.'); return undefined; }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.MediaRecorder) { o('idle', 'This browser cannot record. Try Chrome, Safari, Edge or Firefox.'); return undefined; }
    // Made inside the tap that opened this screen: an iPhone keeps audio made later silent.
    const AC = window.AudioContext || window.webkitAudioContext;
    try { L.ctx = new AC(); L.ctx.resume().catch(() => {}); } catch (e) { L.ctx = null; }
    L.aud = new Audio(); L.aud.src = SILENT; const p = L.aud.play(); if (p) p.catch(() => {});
    o('thinking', 'Opening the microphone…');
    let gone = false;
    navigator.mediaDevices.getUserMedia({audio: {echoCancellation: true, noiseSuppression: true}}).then((s) => {
      if (gone) { s.getTracks().forEach((t) => t.stop()); return; }
      L.stream = s; L.on = true; loop().catch(() => o('idle', 'Something went wrong. Tap the circle to try again.'));
    }).catch(() => o('idle', 'The microphone is blocked. Allow it for this site, then tap the circle.'));
    return () => { gone = true; if (L.on) { L.on = false; if (L.stopListen) L.stopListen(); if (L.stopSpeak) L.stopSpeak(); if (L.stream) L.stream.getTracks().forEach((t) => t.stop()); if (L.ctx) { try { L.ctx.close(); } catch (e) { /* closed */ } } } };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const k = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k);
  });

  if (!open) return null;
  const tap = () => {
    const L = live.current;
    if (state === 'speaking' && L.stopSpeak) { L.stopSpeak(); return; }
    if (state === 'listening' && L.stopListen) { L.stopListen(); return; }
    if (state === 'idle' && L.stream) { L.on = true; loop().catch(() => {}); }
  };
  return (
    <div className={'earth-talk ' + state} role="dialog" aria-modal="true" aria-label="Voice talk with the Flisk Oracle">
      <button type="button" className="earth-orb" aria-label="Interrupt or talk again" onClick={tap} />
      <Text type="emphasized">Flisk Oracle</Text>
      <Text type="supporting" color="secondary" role="status">{msg}</Text>
      {you && <Text type="supporting" color="secondary">You: {you}</Text>}
      {say && <Text>{say}</Text>}
      <Button label="End talk" variant="secondary" onClick={close} />
    </div>
  );
}
