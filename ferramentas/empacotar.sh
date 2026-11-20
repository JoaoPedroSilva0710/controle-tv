#!/usr/bin/env bash
# Gera ControleTV.wgt (sem assinatura) a partir de startup-probe/. O TizenBrew Installer assina a cópia dele.
set -euo pipefail
cd "$(dirname "$0")/.."
rm -f ControleTV.wgt
(cd startup-probe && zip -X -D -q -r ../ControleTV.wgt config.xml index.html service)
unzip -l ControleTV.wgt
