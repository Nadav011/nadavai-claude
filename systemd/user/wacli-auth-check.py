"""Gate sync startup on an authenticated local wacli store."""

import json
import subprocess
import sys


def main():
    try:
        binary, store = sys.argv[1:]
        result = subprocess.run(
            [binary, "--store", store, "--read-only", "--json", "auth", "status"],
            capture_output=True,
            text=True,
            timeout=15,
            check=True,
        )
        payload = json.loads(result.stdout)
        authenticated = payload["data"]["authenticated"]
        if payload.get("success") is not True or type(authenticated) is not bool:
            raise ValueError("Invalid authentication response")
        return 0 if authenticated else 1
    except (OSError, subprocess.SubprocessError, ValueError, KeyError, TypeError):
        print(
            "wacli authentication check failed; inspect the binary/store and run "
            "read-only auth status locally. Sync will retry.",
            file=sys.stderr,
        )
        return 255


if __name__ == "__main__":
    sys.exit(main())
