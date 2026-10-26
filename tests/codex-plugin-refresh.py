#!/usr/bin/env python3
"""Exercise the installer helper with an isolated PATH; no real client or network."""
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[1]

# Sanitized Codex 0.163 list responses: retain the CLI schema, remove user paths.
MARKETPLACES = {'marketplaces': [{'name': 'nadavai', 'root': '/fixture/marketplaces/nadavai',
    'marketplaceSource': {'sourceType': 'git', 'source': 'https://github.com/Nadav011/nadavai-claude.git'}}]}
PLUGIN = {'pluginId': 'nadavai@nadavai', 'name': 'nadavai', 'marketplaceName': 'nadavai',
    'version': 'local', 'installed': True, 'enabled': True,
    'source': {'source': 'local', 'path': '/fixture/plugins/nadavai'},
    'marketplaceSource': {'sourceType': 'git', 'source': 'https://github.com/Nadav011/nadavai-claude.git'},
    'installPolicy': 'AVAILABLE', 'authPolicy': 'ON_INSTALL'}
PLUGINS = {'installed': [PLUGIN], 'available': []}


class CodexPluginRefreshTests(unittest.TestCase):
    def run_refresh(self, *, listing=None, plugins=None, fail_at='', installed=True, full_update=False):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            commands = root / 'commands'
            for name in ('node', 'date', 'dirname'):
                (root / name).symlink_to(Path(shutil.which(name)).resolve())
            if installed:
                mock = root / 'codex'
                mock.write_text('''#!/bin/bash
printf '%s\\n' "$*" >> "$COMMANDS"
case "$*" in
  'plugin marketplace list --json')
    [ "$FAIL_AT" != list ] || exit 2
    printf '%s\\n' "$LISTING" ;;
  'plugin list --marketplace nadavai --json')
    [ "$FAIL_AT" != plugins ] || exit 5
    printf '%s\\n' "$PLUGINS" ;;
  'plugin marketplace upgrade nadavai --json')
    [ "$FAIL_AT" != upgrade ] || exit 3 ;;
  'plugin add nadavai@nadavai --json')
    [ "$FAIL_AT" != add ] || exit 4 ;;
  *) exit 99 ;;
esac
''')
                mock.chmod(0o755)
            env = dict(os.environ, PATH=str(root), COMMANDS=str(commands),
                       CLAUDE_CONFIG_DIR=str(root / 'config'),
                       PLUGINS=plugins if plugins is not None else json.dumps(PLUGINS),
                       FAIL_AT=fail_at, LISTING=listing if listing is not None else
                       json.dumps(MARKETPLACES))
            args = ['/bin/bash', '-c', 'set -euo pipefail; source "$1/lib/common.sh"; refresh_codex_plugin',
                 'test', str(REPO)]
            if full_update:
                # Execute the real update script with only unrelated helpers stubbed.
                (root / 'lib').mkdir()
                overrides = ''.join(f'\n{name}() {{ printf \"{name}\\n\" >> \"$COMMANDS\"; }}\n'
                    for name in ('ensure_continues', 'apply_model_policy', 'link_rules', 'link_git',
                                 'link_shell', 'link_shortcuts', 'retire_duplicate_skills',
                                 'mirror_rules_to_codex', 'mirror_to_antigravity'))
                (root / 'lib/common.sh').write_text((REPO / 'lib/common.sh').read_text() + overrides)
                (root / 'update.sh').write_text((REPO / 'update.sh').read_text())
                for name in ('git', 'claude'):
                    mock = root / name
                    mock.write_text('#!/bin/bash\nprintf \"' + name + ' %s\\n\" \"$*\" >> \"$COMMANDS\"\n')
                    mock.chmod(0o755)
                args = ['/bin/bash', str(root / 'update.sh')]
            result = subprocess.run(args, env=env, capture_output=True, text=True)
            calls = commands.read_text().splitlines() if commands.exists() else []
            return result, calls

    def test_refreshes_only_nadavai_in_order(self):
        result, calls = self.run_refresh()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, ['plugin marketplace list --json',
                                 'plugin list --marketplace nadavai --json',
                                 'plugin marketplace upgrade nadavai --json',
                                 'plugin add nadavai@nadavai --json'])
        self.assertIn('Codex nadavai plugin refreshed', result.stdout)

    def test_missing_codex_is_explicit_skip(self):
        result, calls = self.run_refresh(installed=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(calls, [])
        self.assertIn('skipped: codex is not installed', result.stdout)

    def test_unconfigured_marketplace_is_explicit_skip(self):
        for marketplaces in ([], [{'name': 'nadavai-other'}]):
            with self.subTest(marketplaces=marketplaces):
                result, calls = self.run_refresh(listing=json.dumps({'marketplaces': marketplaces}))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(calls), 1)
                self.assertIn('skipped: nadavai marketplace is not configured', result.stdout)

    def test_invalid_list_is_failure_not_skip(self):
        for listing in ('garbage', '', 'null', '{}', '[]', '{"marketplaces":{}}',
                        '{"marketplaces":[null]}', '{"marketplaces":[{}]}'):
            with self.subTest(listing=listing):
                result, calls = self.run_refresh(listing=listing)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(calls), 1)
                self.assertIn('Invalid Codex marketplace list JSON', result.stderr)
                self.assertNotIn('skipped', result.stdout)

    def test_command_failures_stop_refresh(self):
        for command, count in (('list', 1), ('plugins', 2), ('upgrade', 3), ('add', 4)):
            with self.subTest(command=command):
                result, calls = self.run_refresh(fail_at=command)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(calls), count)
                self.assertIn('failed', result.stderr)
                self.assertNotIn('plugin refreshed', result.stdout)

    def test_missing_or_disabled_plugin_is_preserved(self):
        for entries, state in (([], 'missing'), ([dict(PLUGIN, enabled=False)], 'disabled'),
                               ([dict(PLUGIN, pluginId='other@nadavai')], 'missing'),
                               ([dict(PLUGIN, installed=False)], 'missing')):
            with self.subTest(state=state, entries=entries):
                result, calls = self.run_refresh(plugins=json.dumps({'installed': entries, 'available': [PLUGIN]}))
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(len(calls), 2)
                self.assertIn('nadavai plugin is ' + state, result.stdout)

    def test_invalid_plugin_list_fails(self):
        for plugins in ('garbage', 'null', '{}', '{"installed":[],"available":{}}',
                        '{"installed":[{}],"available":[]}',
                        json.dumps({'installed': [dict(PLUGIN, enabled='true')], 'available': []})):
            with self.subTest(plugins=plugins):
                result, calls = self.run_refresh(plugins=plugins)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(len(calls), 2)
                self.assertIn('Invalid Codex plugin list JSON', result.stderr)

    def test_update_finishes_other_steps_and_reports_refresh_failure(self):
        result, calls = self.run_refresh(fail_at='upgrade', full_update=True)
        self.assertNotEqual(result.returncode, 0, result.stdout)
        self.assertIn('link_rules', calls)
        self.assertIn('mirror_to_antigravity', calls)
        self.assertLess(calls.index('plugin marketplace upgrade nadavai --json'), calls.index('link_rules'))
        self.assertIn('Other installer steps completed', result.stderr)
        self.assertNotIn('== Done', result.stdout)
        self.assertNotIn('plugin add nadavai@nadavai --json', calls)

    def test_both_installers_refresh_before_linking(self):
        for script, claude_command in (('update.sh', 'claude plugin update nadavai@nadavai'),
                                       ('setup.sh', 'claude plugin install nadavai@nadavai')):
            with self.subTest(script=script):
                source = (REPO / script).read_text()
                self.assertEqual(source.count('\nrefresh_codex_plugin || CODEX_REFRESH_FAILED=1\n'), 1)
                self.assertLess(source.index(claude_command), source.index('\nrefresh_codex_plugin || CODEX_REFRESH_FAILED=1\n'))
                self.assertLess(source.index('\nrefresh_codex_plugin || CODEX_REFRESH_FAILED=1\n'), source.index('\nlink_rules\n'))
                gate = 'if [ \"$CODEX_REFRESH_FAILED\" = 1 ]; then'
                self.assertEqual(source.count(gate), 1)
                self.assertIn(gate + '\n  die ', source)
                self.assertLess(source.index('\nrefresh_codex_plugin || CODEX_REFRESH_FAILED=1\n'), source.index(gate))
                self.assertLess(source.index('\nlink_rules\n'), source.index(gate))
                self.assertLess(source.index(gate), source.index('\nstep \"Done\"'))


if __name__ == '__main__':
    unittest.main()
