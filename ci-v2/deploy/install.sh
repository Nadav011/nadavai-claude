#!/usr/bin/env bash
# install.sh: install or update the deploy service on the Oracle VM (run there, as ubuntu, from a
# copy of ci-v2/deploy/). Idempotent. It never writes a secret: those are copied separately into
# ~/deploy/secrets (see ci-v2/README.md, "Deploy service").
#   ~/deploy/src/install.sh
set -euo pipefail
src=$(cd "$(dirname "$0")" && pwd)
T=/opt/nadavai-deploy/tools
NODE_V=v24.22.2 NODE_SHA=eb187837a2230d4047161ac0be008584e16b46f726e9c9490ee35dc6b17d9ba8
GH_V=2.103.3 GH_SHA=ee32df2323c8847f5fac6cb6b4b69ca75828e9329a8f22f677021f7b3306ce63

[ "$(uname -m)" = aarch64 ] || { echo "install.sh: expects the ARM64 Oracle VM" >&2; exit 1; }
for c in git jq python3 flock curl tar xz sha256sum; do command -v "$c" >/dev/null || { echo "install.sh: $c is missing (apt-get install git jq python3 util-linux curl tar xz-utils)" >&2; exit 1; }; done
# nadavai-build runs repo code (install, build, health check) with no token; nadavai-upload runs
# wrangler and the Vercel CLI with one repo's token. Neither can log in or read /home.
for u in nadavai-build nadavai-upload; do
  id "$u" >/dev/null 2>&1 ||
    sudo useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$u"
done
# The user timer must run without a login session, and after a reboot.
sudo loginctl enable-linger ubuntu
sudo install -d -o root -g root -m 755 /opt/nadavai-deploy "$T" "$T/bin"
sudo install -d -o ubuntu -g ubuntu -m 755 /srv/nadavai-deploy /srv/nadavai-deploy/work
sudo install -d -o nadavai-build -g nadavai-build -m 755 /srv/nadavai-deploy/cache /srv/nadavai-deploy/cache/pnpm-store
install -d -m 700 ~/deploy ~/deploy/secrets ~/deploy/state ~/deploy/logs ~/deploy/mirror ~/deploy/bin

tmp=$(mktemp -d); trap 'rm -rf -- "${tmp:?}"' EXIT
fetch() { # url sha256 -> $tmp/<name>
  curl -fsSL --max-time 300 -o "$tmp/${1##*/}" "$1"
  echo "$2  $tmp/${1##*/}" | sha256sum -c --quiet -
}
if [ "$("$T/node/bin/node" -v 2>/dev/null)" != "$NODE_V" ]; then
  fetch "https://nodejs.org/dist/$NODE_V/node-$NODE_V-linux-arm64.tar.xz" "$NODE_SHA"
  sudo tar -xJf "$tmp/node-$NODE_V-linux-arm64.tar.xz" -C "$T"
  sudo ln -sfn "node-$NODE_V-linux-arm64" "$T/node"
fi
if ! "$T/gh/bin/gh" --version 2>/dev/null | grep -q "gh version $GH_V "; then
  fetch "https://github.com/cli/cli/releases/download/v$GH_V/gh_${GH_V}_linux_arm64.tar.gz" "$GH_SHA"
  sudo tar -xzf "$tmp/gh_${GH_V}_linux_arm64.tar.gz" -C "$T"
  sudo ln -sfn "gh_${GH_V}_linux_arm64" "$T/gh"
fi
# The CLIs from the committed lockfile, installed as an unprivileged copy, then owned by root.
if ! cmp -s "$src/tools/package-lock.json" "$T/cli/package-lock.json"; then
  install -d "$tmp/cli" && cp "$src/tools/package.json" "$src/tools/package-lock.json" "$tmp/cli/"
  (cd "$tmp/cli" && PATH=$T/node/bin:$PATH npm ci --no-audit --no-fund --loglevel=error)
  sudo rm -rf -- "${T:?}/cli.new"; sudo cp -a "$tmp/cli" "$T/cli.new"; sudo chown -R root:root "$T/cli.new"
  sudo rm -rf -- "${T:?}/cli.old"; [ -d "$T/cli" ] && sudo mv "$T/cli" "$T/cli.old"
  sudo mv "$T/cli.new" "$T/cli"; sudo rm -rf -- "${T:?}/cli.old"
fi
printf '#!/bin/sh\nexec %s/node/bin/node %s/cli/node_modules/pnpm/bin/pnpm.cjs "$@"\n' "$T" "$T" | sudo tee "$T/bin/pnpm" >/dev/null
sudo chmod 755 "$T/bin/pnpm"

install -m 755 "$src/bin/nadavai-deploy" ~/deploy/bin/nadavai-deploy
sudo ln -sfn /home/ubuntu/deploy/bin/nadavai-deploy /usr/local/bin/nadavai-deploy
install -d ~/.config/systemd/user
install -m 644 "$src/systemd/nadavai-deploy-auto.service" "$src/systemd/nadavai-deploy-auto.timer" ~/.config/systemd/user/
systemctl --user daemon-reload
# The timer runs every 5 minutes and deploys nothing until a state/<repo>.auto file exists.
systemctl --user enable --now nadavai-deploy-auto.timer >/dev/null
echo "installed: node $("$T/node/bin/node" -v), $("$T/gh/bin/gh" --version | head -1), pnpm $("$T/bin/pnpm" -v)," \
  "wrangler $(jq -r .version "$T/cli/node_modules/wrangler/package.json"), vercel $(jq -r .version "$T/cli/node_modules/vercel/package.json")"
