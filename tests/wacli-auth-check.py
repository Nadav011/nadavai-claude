"""Authentication gate regressions; no WhatsApp account or store is accessed."""

import contextlib
import importlib.util
import io
import json
from pathlib import Path
import subprocess
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "auth_check", Path(__file__).parents[1] / "systemd/user/wacli-auth-check.py"
)
auth_check = importlib.util.module_from_spec(spec)
spec.loader.exec_module(auth_check)


class AuthCheckTests(unittest.TestCase):
    def run_check(self, payload=None, error=None):
        result = subprocess.CompletedProcess([], 0, payload, "")
        with patch("sys.argv", ["check", "/fake/wacli", "/fake/store"]), patch(
            "subprocess.run", return_value=result, side_effect=error
        ) as run, contextlib.redirect_stderr(io.StringIO()) as stderr:
            status = auth_check.main()
        self.assertEqual(run.call_args.kwargs["timeout"], 15)
        self.assertTrue(run.call_args.kwargs["check"])
        self.assertIn("--read-only", run.call_args.args[0])
        self.assertNotIn("private-message", stderr.getvalue())
        return status

    def test_authenticated_and_unpaired(self):
        for value, expected in [(True, 0), (False, 1)]:
            with self.subTest(value=value):
                self.assertEqual(self.run_check(json.dumps({
                    "success": True, "data": {"authenticated": value}
                })), expected)

    def test_invalid_responses_fail_for_retry(self):
        payloads = ["private-message", "null", "[]", "{}", '{"data":null}',
                    '{"success":false,"data":{"authenticated":false}}']
        payloads += [json.dumps({"success": True, "data": {"authenticated": value}})
                     for value in [1, 0, "true", "false", None]]
        for payload in payloads:
            with self.subTest(payload=payload):
                self.assertEqual(self.run_check(payload), 255)

    def test_execution_errors_fail_for_retry(self):
        for error in [FileNotFoundError(), subprocess.TimeoutExpired("wacli", 15),
                      subprocess.CalledProcessError(1, "wacli", "private-message")]:
            with self.subTest(error=error):
                self.assertEqual(self.run_check(error=error), 255)


if __name__ == "__main__":
    unittest.main()
