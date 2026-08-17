"""service.py — الخدمة المحلية لـ Excel Autofix.

يخدم إضافة Chrome على http://127.0.0.1:8765

Endpoints:
- GET  /api/health         → {"status":"ok","version":"1.0"}
- POST /api/process        → multipart (file + optional title) → JSON
- GET  /downloads/<name>   → تنزيل الملف المعالج

الأمان:
- يربط على 127.0.0.1 فقط (لا وصول خارجي).
- CORS مفتوح للمتصفحات المحلية فقط.
- حد حجم الرفع 20MB، وأسماء الملفات المخرجة بـ UUID.

التشغيل:  python service.py   (أو service.bat)
"""

import json
import os
import re
import shutil
import sys
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

HOST = "127.0.0.1"
PORT = 8765
MAX_UPLOAD = 20 * 1024 * 1024  # 20MB

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
OUTPUT_DIR = os.path.join(BASE_DIR, "downloads")

from autofix_core import process_file  # noqa: E402


def ensure_output_dir():
    os.makedirs(OUTPUT_DIR, exist_ok=True)


def parse_multipart(body, boundary):
    """Parses a multipart/form-data body.

    Returns {"fields": {name: value}, "files": {name: (filename, bytes)}}
    """
    fields = {}
    files = {}
    boundary = boundary.strip().encode("utf-8")
    delim = b"--" + boundary
    parts = body.split(delim)
    for part in parts:
        if part in (b"", b"--", b"--\r\n", b"\r\n") or part.startswith(b"--\r\n"):
            continue
        if not part.startswith(b"\r\n"):
            part = b"\r\n" + part
        # part format: \r\n headers\r\n\r\n payload
        header_block, sep, payload = part.partition(b"\r\n\r\n")
        if not sep:
            continue
        headers = header_block.decode("utf-8", "replace").split("\r\n")
        disp = None
        for h in headers:
            if h.lower().startswith("content-disposition:"):
                disp = h
                break
        if not disp:
            continue
        name_match = re.search(r'name="([^"]*)"', disp, re.IGNORECASE)
        if not name_match:
            continue
        name = name_match.group(1)
        fname_match = re.search(r'filename="([^"]*)"', disp, re.IGNORECASE)
        if payload.endswith(b"\r\n"):
            payload = payload[:-2]
        if fname_match:
            files[name] = (fname_match.group(1), payload)
        else:
            fields[name] = payload.decode("utf-8", "replace")
    return fields, files


def json_response(handler, code, obj):
    body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json; charset=utf-8")
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    handler.send_header("Access-Control-Allow-Headers", "Content-Type")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    handler.wfile.write(body)


def make_handler():
    class Handler(BaseHTTPRequestHandler):
        server_version = "ExcelAutofixService/1.0"

        def log_message(self, fmt, *args):
            sys.stderr.write("[excel-autofix] %s\n" % (fmt % args))

        def do_OPTIONS(self):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
            self.send_header("Access-Control-Allow-Headers", "Content-Type")
            self.send_header("Content-Length", "0")
            self.end_headers()

        def do_GET(self):
            path = unquote(self.path.split("?", 1)[0])
            if path == "/api/health":
                json_response(self, 200, {"status": "ok", "version": "1.0"})
                return
            if path.startswith("/downloads/"):
                name = os.path.basename(path[len("/downloads/") :])
                fp = os.path.join(OUTPUT_DIR, name)
                if not name or not os.path.exists(fp):
                    json_response(self, 404, {"ok": False, "error": "File not found"})
                    return
                try:
                    with open(fp, "rb") as fh:
                        data = fh.read()
                except OSError as e:
                    json_response(self, 500, {"ok": False, "error": str(e)})
                    return
                self.send_response(200)
                self.send_header(
                    "Content-Type",
                    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                )
                self.send_header(
                    "Content-Disposition",
                    'attachment; filename="%s"' % name.replace('"', ""),
                )
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
                return
            json_response(self, 404, {"ok": False, "error": "Not found"})

        def do_POST(self):
            path = unquote(self.path.split("?", 1)[0])
            if path != "/api/process":
                json_response(self, 404, {"ok": False, "error": "Not found"})
                return
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                json_response(self, 400, {"ok": False, "error": "Empty request"})
                return
            if length > MAX_UPLOAD:
                json_response(
                    self, 413, {"ok": False, "error": "File too large (max 20MB)"}
                )
                return
            body = self.rfile.read(length)
            ctype = self.headers.get("Content-Type") or ""
            bm = re.search(r"boundary=([^;]+)", ctype, re.IGNORECASE)
            if not bm:
                json_response(
                    self, 400, {"ok": False, "error": "multipart boundary missing"}
                )
                return
            try:
                fields, files = parse_multipart(body, bm.group(1))
            except Exception as e:
                json_response(
                    self, 400, {"ok": False, "error": "Bad multipart: %s" % e}
                )
                return
            if "file" not in files:
                json_response(self, 400, {"ok": False, "error": "Missing file field"})
                return
            fname, fdata = files["file"]
            if not fname.lower().endswith((".xlsx", ".xls")):
                json_response(
                    self,
                    400,
                    {"ok": False, "error": "Only .xlsx / .xls files are allowed"},
                )
                return
            title = (fields.get("title") or "").strip() or None
            tmp = os.path.join(
                OUTPUT_DIR,
                "upload_%s%s" % (uuid.uuid4().hex[:8], os.path.splitext(fname)[1]),
            )
            out_name = "modified_%s.xlsx" % uuid.uuid4().hex[:8]
            out_path = os.path.join(OUTPUT_DIR, out_name)
            try:
                with open(tmp, "wb") as fh:
                    fh.write(fdata)
                actual_path, row_count = process_file(tmp, title)
                shutil.move(actual_path, out_path)
            except Exception as e:
                try:
                    os.remove(tmp)
                except OSError:
                    pass
                json_response(self, 500, {"ok": False, "error": str(e)})
                return
            finally:
                try:
                    os.remove(tmp)
                except OSError:
                    pass
            json_response(
                self,
                200,
                {
                    "ok": True,
                    "filename": out_name,
                    "row_count": row_count,
                    "download_url": "/downloads/%s" % out_name,
                },
            )

    return Handler


def main():
    ensure_output_dir()
    srv = ThreadingHTTPServer((HOST, PORT), make_handler())
    print("Excel Autofix Service running at http://%s:%d" % (HOST, PORT))
    print("Press Ctrl+C to stop.")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\nStopped.")
        srv.shutdown()


if __name__ == "__main__":
    main()
