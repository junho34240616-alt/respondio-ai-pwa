#!/bin/zsh

set -euo pipefail

export NVM_DIR="${HOME}/.nvm"

if [ ! -s "${NVM_DIR}/nvm.sh" ]; then
  echo "nvm is not installed at ${NVM_DIR}. Run the nvm install step first."
  exit 1
fi

. "${NVM_DIR}/nvm.sh"

nvm use 20.19.4 >/dev/null

exec "$@"
