import { describe, expect, test } from 'bun:test';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { createCleanupPlan, buildCleanupScript } from './uninstall.ts';

const HOME = homedir();

function normalize(p: string): string {
  const res = resolve(p);
  return process.platform === 'win32' ? res.toLowerCase() : res;
}

describe('uninstall helpers', () => {
  test('includes managed repo installs under ~/.jarvis', () => {
    const jarvisHome = join(HOME, '.jarvis');
    const plan = createCleanupPlan(join(jarvisHome, 'daemon'));
    expect(plan.removablePaths.map(normalize)).toContain(normalize(jarvisHome));
    expect(plan.removablePaths.map(normalize)).toContain(normalize(join(jarvisHome, 'daemon')));
  });

  test('includes bun global installs', () => {
    const globalBun = join(HOME, '.bun', 'install', 'global');
    const plan = createCleanupPlan(join(globalBun, 'node_modules', '@usejarvis', 'brain'));
    expect(plan.removablePaths.some((path) => normalize(path).includes(normalize(globalBun)))).toBe(true);
  });

  test('does not remove arbitrary source checkouts', () => {
    const plan = createCleanupPlan(resolve('/work/projects/jarvis'));
    expect(plan.removablePaths.map(normalize)).toContain(normalize(join(HOME, '.jarvis')));
    expect(plan.removablePaths.map(normalize)).not.toContain(normalize(resolve('/work/projects/jarvis')));
  });

  test('cleanup script includes package uninstall and wrapper cleanup', () => {
    const script = buildCleanupScript({
      dataDir: '/tmp/.jarvis',
      packageRoot: '/tmp/.jarvis/daemon',
      removablePaths: ['/tmp/.jarvis/daemon', '/tmp/.jarvis'],
      cliWrapperPaths: ['/tmp/bin/jarvis'],
      bunPath: '/usr/bin/bun',
      autostartInstalled: false,
    });

    expect(script).toContain("@usejarvis/brain");
    expect(script).toContain('/tmp/bin/jarvis');
    expect(script).toContain('/usr/bin/bun');
  });
});
