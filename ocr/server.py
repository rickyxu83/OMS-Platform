#!/usr/bin/env python3
import cgi
import glob
import json
import os
import subprocess
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 10
TIMEOUT_SECONDS = 120
OCR_LOCK = threading.Lock()


def run(command, timeout=TIMEOUT_SECONDS):
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)


def ocr_pdf(data):
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='mr-ocr-') as directory:
        pdf_path = os.path.join(directory, 'input.pdf')
        with open(pdf_path, 'wb') as handle:
            handle.write(data)
        info = run(['pdfinfo', pdf_path]).stdout
        pages_line = next((line for line in info.splitlines() if line.startswith('Pages:')), '')
        pages = int(pages_line.split(':', 1)[1].strip()) if pages_line else 0
        if not pages or pages > MAX_PAGES:
            raise ValueError(f'PDF 页数必须在 1-{MAX_PAGES} 页以内')
        prefix = os.path.join(directory, 'page')
        run(['pdftoppm', '-r', '300', '-png', '-f', '1', '-l', str(pages), pdf_path, prefix])
        texts = []
        for image_path in sorted(glob.glob(f'{prefix}-*.png')):
            output_path = os.path.join(directory, os.path.basename(image_path))
            result = run(['tesseract', image_path, output_path, '-l', 'chi_sim+chi_tra+eng', '--psm', '6'])
            text_path = f'{output_path}.txt'
            with open(text_path, 'r', encoding='utf-8', errors='replace') as handle:
                texts.append(handle.read().strip())
        return {'text': '\n\n'.join(texts), 'pages': pages, 'durationMs': round((time.monotonic() - started) * 1000)}


class Handler(BaseHTTPRequestHandler):
    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == '/health':
            self.send_json(200, {'ok': True})
            return
        self.send_json(404, {'error': 'not found'})

    def do_POST(self):
        if self.path != '/ocr':
            self.send_json(404, {'error': 'not found'})
            return
        length = int(self.headers.get('Content-Length', '0'))
        if length <= 0 or length > MAX_BYTES:
            self.send_json(413, {'error': '文件大小超过限制'})
            return
        try:
            form = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD': 'POST', 'CONTENT_LENGTH': str(length)})
            field = form['file']
            data = field.file.read()
            if not data or len(data) > MAX_BYTES:
                raise ValueError('文件大小超过限制')
            with OCR_LOCK:
                result = ocr_pdf(data)
            self.send_json(200, result)
        except subprocess.TimeoutExpired:
            self.send_json(504, {'error': 'OCR 处理超时'})
        except Exception as error:
            self.send_json(422, {'error': str(error)})

    def log_message(self, _format, *_args):
        return


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
