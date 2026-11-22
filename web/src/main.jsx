import './app.css';
import '@astryxdesign/core/reset.css';
import '@astryxdesign/core/astryx.css';
import {useState, useEffect} from 'react';
import {createRoot} from 'react-dom/client';
import {Theme} from '@astryxdesign/core/theme';
import {themes, defaultThemeSlug} from '../astryx-themes.js';
import App from './App.jsx';
// The 3D Earth (src/earth.js) wakes when the page says data-theme=earth and class home.
const sync = (v) => { const r = document.documentElement; if (v === 'earth') { r.dataset.theme = 'earth'; r.classList.add('home'); } else { delete r.dataset.theme; r.classList.remove('home'); } };
function Root() {
  const [scheme, setScheme] = useState(() => { try { return localStorage.getItem('chat_scheme') || ((window.__BOOT__ || {}).theme === 'earth' ? 'earth' : 'system'); } catch (e) { return 'system'; } });
  const set = (v) => { setScheme(v); try { localStorage.setItem('chat_scheme', v); } catch (e) { /* storage blocked */ } document.documentElement.dataset.scheme = v; sync(v); };
  useEffect(() => { document.documentElement.dataset.scheme = scheme; sync(scheme); }, []);
  return <Theme theme={themes[defaultThemeSlug]} mode={scheme === 'earth' ? 'dark' : scheme}><App scheme={scheme} setScheme={set} /></Theme>;
}
createRoot(document.getElementById('root')).render(<Root />);
