#!/usr/bin/env python3
"""Lê o status do Controle da TV sem Web Inspector: abre por SDB um stream tcp:8134 na TV e faz um GET no serviço.

    python3 ferramentas/ler-status.py <IP da TV> [pasta free-my-tv/tizen]

Usa o cliente SDB do Free My TV (tizen/install.py). Só lê; não muda nada na TV.
"""
import http.client
import io
import json
import os
import sys
import urllib.request

ip = sys.argv[1] if len(sys.argv) > 1 else sys.exit(__doc__)
here = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, sys.argv[2] if len(sys.argv) > 2 else os.path.join(here, '..', 'free-my-tv', 'tizen'))
from install import Sdb  # noqa: E402


def status():
    s = Sdb(ip)
    try:
        stream = s.open('tcp:8134')
        s.write(stream, b'GET / HTTP/1.1\r\nHost: 127.0.0.1:8134\r\nConnection: close\r\n\r\n')
        raw = s.read_until(stream, lambda b: False, 3)
    finally:
        s.sock.close()

    class Raw:
        def makefile(self, *args):
            return io.BytesIO(raw)
    response = http.client.HTTPResponse(Raw())
    response.begin()   # also undoes chunked encoding
    if response.status != 200:
        sys.exit('HTTP %d' % response.status)
    return json.loads(response.read())


print(json.dumps(status(), ensure_ascii=False))
youtube = 'http://%s:8001/api/v2/applications/111299001912' % ip
print('YouTube:', json.load(urllib.request.urlopen(youtube, timeout=3)))
