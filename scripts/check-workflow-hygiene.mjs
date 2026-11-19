import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Every job in check.yml needs a bounded runtime, and every action must be
// pinned to the commit behind its tag so a moved tag cannot change CI.
const SHA = /^[0-9a-f]{40}$/;
const VERSION = /^v?\d+(?:\.\d+)*$/;

export function findWorkflowProblems(source, file = '.github/workflows/check.yml') {
  const problems = [];
  const lines = source.split(/\r?\n/);
  let inJobs = false;
  let job;
  let timeout = false;

  const closeJob = () => {
    if (inJobs && job && !timeout) {
      problems.push(`${file}:${job.line} job "${job.name}" has no timeout-minutes`);
    }
  };

  lines.forEach((line, index) => {
    const at = index + 1;
    const top = /^([A-Za-z0-9_-]+):\s*(?:#.*)?$/.exec(line);
    if (top) {
      closeJob();
      inJobs = top[1] === 'jobs';
      job = undefined;
      timeout = false;
      return;
    }
    if (!inJobs) return;

    const nextJob = /^  ([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (nextJob) {
      closeJob();
      job = { name: nextJob[1], line: at };
      timeout = false;
      return;
    }
    if (!job) return;

    if (/^\s+timeout-minutes:\s*\d+\s*(?:#.*)?$/.test(line)) timeout = true;
    const uses = /^\s*(?:-\s*)?uses:\s*([^\s#]+)(?:\s+#\s*(.+?))?\s*$/.exec(line);
    if (!uses) return;
    const ref = uses[1].split('@')[1];
    if (!ref || !SHA.test(ref)) {
      problems.push(`${file}:${at} ${uses[1]} is not pinned to a 40-character SHA`);
    }
    if (!uses[2] || !VERSION.test(uses[2].trim())) {
      problems.push(`${file}:${at} ${uses[1]} has no version comment`);
    }
  });
  closeJob();
  return problems;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const problems = findWorkflowProblems(
    readFileSync(new URL('../.github/workflows/check.yml', import.meta.url), 'utf8'),
  );
  if (problems.length) {
    console.error(problems.join('\n'));
    process.exitCode = 1;
  } else {
    console.log('check.yml: every job has a timeout and every action is SHA-pinned');
  }
}
