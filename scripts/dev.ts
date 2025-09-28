import { spawn, type ChildProcess } from 'node:child_process';
import process from 'node:process';

type ManagedProcess = {
  name: string;
  command: string;
  args: string[];
  child?: ChildProcess;
  done?: boolean;
};

const pnpmCommand = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';
const extraArgs = process.argv.slice(2);

const processes: ManagedProcess[] = [
  {
    name: 'tokens',
    command: pnpmCommand,
    args: ['run', 'tokens:watch'],
  },
  {
    name: 'next',
    command: pnpmCommand,
    args: ['exec', 'next', 'dev', ...extraArgs],
  },
];

const running: ManagedProcess[] = [];
let shuttingDown = false;
let exitCode = 0;
let forceKillTimer: NodeJS.Timeout | null = null;
let remaining = processes.length;

function markDone(proc: ManagedProcess) {
  if (proc.done) {
    return;
  }
  proc.done = true;
  remaining -= 1;
  if (remaining === 0) {
    if (forceKillTimer) {
      clearTimeout(forceKillTimer);
    }
    process.exit(exitCode);
  }
}

function terminate(signal: NodeJS.Signals = 'SIGTERM', source?: string) {
  for (const proc of running) {
    if (proc.name === source) {
      continue;
    }
    const child = proc.child;
    if (!child || child.killed) {
      continue;
    }
    try {
      child.kill(signal);
    } catch (error) {
      console.warn(`[dev] Failed to send ${signal} to ${proc.name}:`, error);
    }
  }

  if (forceKillTimer) {
    clearTimeout(forceKillTimer);
  }

  const forceSignal: NodeJS.Signals = process.platform === 'win32' ? 'SIGTERM' : 'SIGKILL';
  forceKillTimer = setTimeout(() => {
    for (const proc of running) {
      const child = proc.child;
      if (!child || child.killed) {
        continue;
      }
      try {
        child.kill(forceSignal);
      } catch (error) {
        console.warn(`[dev] Failed to force stop ${proc.name}:`, error);
      }
    }
  }, 5000);
}

function startProcess(proc: ManagedProcess) {
  console.log(`[dev] Starting ${proc.name}…`);
  const child = spawn(proc.command, proc.args, {
    stdio: 'inherit',
    env: process.env,
  });
  proc.child = child;
  running.push(proc);

  child.once('exit', (code, signal) => {
    const normalizedExit = code ?? (signal ? 1 : 0);
    if (!shuttingDown) {
      exitCode = normalizedExit;
      shuttingDown = true;
      terminate(signal ?? 'SIGTERM', proc.name);
    } else if (exitCode === 0 && normalizedExit !== 0) {
      exitCode = normalizedExit;
    }
  });

  child.once('error', (error) => {
    console.error(`[dev] Failed to start ${proc.name}:`, error);
    if (exitCode === 0) {
      exitCode = 1;
    }
    if (!shuttingDown) {
      shuttingDown = true;
      terminate('SIGTERM', proc.name);
    }
    markDone(proc);
  });

  child.once('close', () => {
    markDone(proc);
  });
}

function shutdownFromSignal(signal: NodeJS.Signals, code: number) {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  exitCode = code;
  terminate(signal);
}

process.on('SIGINT', () => {
  shutdownFromSignal('SIGINT', 130);
});

process.on('SIGTERM', () => {
  shutdownFromSignal('SIGTERM', 143);
});

for (const proc of processes) {
  startProcess(proc);
}
