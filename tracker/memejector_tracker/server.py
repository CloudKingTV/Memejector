"""
WebSocket broadcast, plus recording as a side effect.

The recording is byte-identical to what goes over the socket, one JSON object
per line. That is the whole trick behind "iterate on the UI without standing
up": there is no separate capture format to keep in sync, and a replay is
indistinguishable from a live tracker at the far end.
"""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

import websockets

from . import schema


class Recorder:
    def __init__(self, path: Path | None) -> None:
        self.path = path
        self._fh = None
        if path:
            path.parent.mkdir(parents=True, exist_ok=True)
            self._fh = path.open("w", buffering=1)

    def write(self, msg: dict) -> None:
        if self._fh:
            self._fh.write(json.dumps(msg, separators=(",", ":")) + "\n")

    def close(self) -> None:
        if self._fh:
            self._fh.close()
            self._fh = None


class TrackerServer:
    def __init__(self, source, host: str = "127.0.0.1", port: int = 8787,
                 record: Path | None = None, quiet: bool = False) -> None:
        self.source = source
        self.host = host
        self.port = port
        self.recorder = Recorder(record)
        self.quiet = quiet
        self.clients: set = set()
        self.seq = 0
        self._fps = 0.0
        self._last_t = None
        self._hello: dict | None = None
        self._stop = asyncio.Event()

    def _build_hello(self) -> dict:
        f = self.source.hello_fields()
        return schema.hello(source=self.source.name, **f)

    async def _handle(self, ws) -> None:
        self.clients.add(ws)
        if not self.quiet:
            print(f"wall connected ({len(self.clients)} client"
                  f"{'s' if len(self.clients) != 1 else ''})")
        try:
            await ws.send(json.dumps(self._hello))
            await ws.wait_closed()
        finally:
            self.clients.discard(ws)
            if not self.quiet:
                print(f"wall disconnected ({len(self.clients)} left)")

    async def _broadcast(self, msg: dict) -> None:
        if not self.clients:
            return
        payload = json.dumps(msg, separators=(",", ":"))
        dead = []
        for ws in self.clients:
            try:
                await ws.send(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.clients.discard(ws)

    async def _pump(self) -> None:
        """
        The source is a blocking generator, so it runs on a thread and hands
        frames over through a queue. A camera read that stalls must not take the
        socket down with it.
        """
        loop = asyncio.get_running_loop()
        queue: asyncio.Queue = asyncio.Queue(maxsize=4)

        def produce():
            try:
                for hands, t_capture in self.source.frames():
                    if self._stop.is_set():
                        return
                    try:
                        loop.call_soon_threadsafe(queue.put_nowait, (hands, t_capture))
                    except asyncio.QueueFull:
                        pass          # drop the oldest work, never block capture
                    except RuntimeError:
                        return
            except Exception as exc:                      # pragma: no cover
                loop.call_soon_threadsafe(queue.put_nowait, exc)

        loop.run_in_executor(None, produce)

        while not self._stop.is_set():
            item = await queue.get()
            if isinstance(item, Exception):
                await self._broadcast(schema.status("error", str(item)))
                print(f"source failed: {item}")
                return
            hands, t_capture = item

            now = time.perf_counter()
            if self._last_t is not None:
                dt = now - self._last_t
                if dt > 0:
                    inst = 1.0 / dt
                    self._fps = inst if self._fps == 0 else self._fps * 0.9 + inst * 0.1
            self._last_t = now

            self.seq += 1
            msg = schema.frame(self.seq, hands, t_capture, fps=self._fps,
                               dropped=getattr(self.source, "dropped", 0))
            self.recorder.write(msg)
            await self._broadcast(msg)

    async def run(self) -> None:
        self._hello = self._build_hello()
        self.recorder.write(self._hello)
        async with websockets.serve(self._handle, self.host, self.port,
                                    ping_interval=20, max_queue=8):
            if not self.quiet:
                print(f"tracker [{self.source.name}] on ws://{self.host}:{self.port}")
                if self.recorder.path:
                    print(f"recording to {self.recorder.path}")
                print("Ctrl+C to stop.")
            try:
                await self._pump()
            finally:
                self._stop.set()
                self.recorder.close()
                self.source.close()

    def stop(self) -> None:
        self._stop.set()
