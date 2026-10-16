"""Alpha's own proxy for a module's scripts (§12): the one road out of the sandbox.

A script the core runs for a module (a part, a build's session) reaches the network only through
this proxy, bound to the loopback on a port of its own for the run; the Seatbelt profile allows
outbound connections to that port and nothing else. The proxy lets through only the hosts the
part or the workflow page names (exact, or a subdomain of one), refuses the rest with 403, and
counts every request per host so the run can journal what was reached and what was refused.
HTTPS goes through as a CONNECT tunnel (the proxy sees the host, never the content); plain HTTP
is forwarded.
"""

from __future__ import annotations

import http.client
import logging
import select
import socket
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any
from urllib.parse import urlsplit

from alpha.config import settings

log = logging.getLogger("alpha.proxy")
CONNECT_TIMEOUT_S = settings.proxy.connect_timeout_s
IDLE_S = settings.proxy.idle_s


def allowed(host: str, hosts: list[str]) -> bool:
    h = host.lower().rstrip(".")
    for a in hosts:
        a = a.lower().rstrip(".")
        if h == a or h.endswith("." + a):
            return True
    return False


class Proxy:
    def __init__(self, hosts: list[str]) -> None:
        self.hosts = [h for h in hosts if h]
        self.reached: dict[str, int] = {}
        self.refused: dict[str, int] = {}
        self._lock = threading.Lock()
        proxy = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def log_message(self, *_args: Any) -> None:  # quiet
                pass

            def _check(self, host: str) -> bool:
                with proxy._lock:
                    if allowed(host, proxy.hosts):
                        proxy.reached[host] = proxy.reached.get(host, 0) + 1
                        return True
                    proxy.refused[host] = proxy.refused.get(host, 0) + 1
                self.send_response(403, "Host not allowed by Alpha")
                self.send_header("Content-Length", "0")
                self.send_header("Connection", "close")
                self.end_headers()
                return False

            def do_CONNECT(self) -> None:
                host, _, port = self.path.rpartition(":")
                if not host or not self._check(host):
                    return
                try:
                    upstream = socket.create_connection((host, int(port or 443)),
                                                        timeout=CONNECT_TIMEOUT_S)
                except OSError as e:
                    self.send_error(502, f"Could not reach {host}: {e}")
                    return
                self.send_response(200, "Connection established")
                self.end_headers()
                client = self.connection
                client.setblocking(True)
                upstream.setblocking(True)
                try:
                    while True:
                        ready, _, _ = select.select([client, upstream], [], [], IDLE_S)
                        if not ready:
                            break
                        done = False
                        for s in ready:
                            data = s.recv(65536)
                            if not data:
                                done = True
                                break
                            (upstream if s is client else client).sendall(data)
                        if done:
                            break
                finally:
                    upstream.close()
                self.close_connection = True

            def _forward(self) -> None:
                parts = urlsplit(self.path)
                host = parts.hostname or ""
                if not host or not self._check(host):
                    return
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length) if length else None
                headers = {k: v for k, v in self.headers.items()
                           if k.lower() not in ("proxy-connection", "connection")}
                try:
                    conn = http.client.HTTPConnection(host, parts.port or 80,
                                                      timeout=CONNECT_TIMEOUT_S)
                    path = parts.path or "/"
                    if parts.query:
                        path += "?" + parts.query
                    conn.request(self.command, path, body=body, headers=headers)
                    resp = conn.getresponse()
                    payload = resp.read()
                except OSError as e:
                    self.send_error(502, f"Could not reach {host}: {e}")
                    return
                self.send_response(resp.status, resp.reason)
                for k, v in resp.getheaders():
                    if k.lower() in ("transfer-encoding", "connection", "content-length"):
                        continue
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(payload)))
                self.send_header("Connection", "close")
                self.end_headers()
                self.wfile.write(payload)
                self.close_connection = True

            do_GET = do_POST = do_PUT = do_HEAD = do_DELETE = do_PATCH = _forward

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.server.daemon_threads = True
        self.port = int(self.server.server_address[1])
        self._thread = threading.Thread(target=self.server.serve_forever, daemon=True,
                                        name=f"proxy-{self.port}")

    def start(self) -> Proxy:
        self._thread.start()
        return self

    def stop(self) -> None:
        try:
            self.server.shutdown()
            self.server.server_close()
        except OSError:
            pass

    def words(self) -> str:
        parts = [f"reached {h} ({n})" for h, n in sorted(self.reached.items())]
        parts += [f"refused {h} ({n})" for h, n in sorted(self.refused.items())]
        return "; ".join(parts) if parts else "no network"
