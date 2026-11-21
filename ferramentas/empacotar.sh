#!/usr/bin/env bash
# Gera ControleTV.wgt (sem assinatura) a partir de startup-probe/. O TizenBrew Installer assina a cópia dele.
# Feito com o zipfile do Python, como o Free My TV: com um zip do Info-ZIP o instalador não reassinou o pacote,
# e a TV recusou com "Check certificate error".
set -euo pipefail
cd "$(dirname "$0")/.."
python3 - <<'PY'
import zipfile
files = ['config.xml', 'index.html', 'service/quota.js', 'service/service.js']
with zipfile.ZipFile('ControleTV.wgt', 'w', zipfile.ZIP_DEFLATED) as z:
    for name in files:
        with open('startup-probe/' + name, 'rb') as f:
            z.writestr(name, f.read())
print('\n'.join(z.namelist()))
PY
