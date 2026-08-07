#!/usr/bin/env python3
import cgi
import csv
import glob
import io
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


def tsv_page(image_path, page_index, psm):
    tsv = run(['tesseract', image_path, 'stdout', '-l', 'chi_sim+chi_tra+eng', '--psm', str(psm), 'tsv']).stdout
    rows = list(csv.DictReader(io.StringIO(tsv), delimiter='\t'))
    page_row = next((row for row in rows if row.get('level') == '1'), {})
    grouped = {}
    for row in rows:
        text = str(row.get('text') or '').strip()
        if row.get('level') != '5' or not text:
            continue
        word = {
            'text': text,
            'left': int(row.get('left') or 0),
            'top': int(row.get('top') or 0),
            'width': int(row.get('width') or 0),
            'height': int(row.get('height') or 0),
            'confidence': round(float(row.get('conf') or -1), 1),
        }
        key = (row.get('block_num'), row.get('par_num'), row.get('line_num'))
        grouped.setdefault(key, []).append(word)
    lines = []
    for words in grouped.values():
        words.sort(key=lambda word: word['left'])
        confidences = [word['confidence'] for word in words if word['confidence'] >= 0]
        lines.append({
            'text': ' '.join(word['text'] for word in words),
            'left': min(word['left'] for word in words),
            'top': min(word['top'] for word in words),
            'right': max(word['left'] + word['width'] for word in words),
            'bottom': max(word['top'] + word['height'] for word in words),
            'confidence': round(sum(confidences) / len(confidences), 1) if confidences else 0,
            'words': words,
        })
    lines.sort(key=lambda line: (line['top'], line['left']))
    return {
        'page': page_index,
        'width': int(page_row.get('width') or 0),
        'height': int(page_row.get('height') or 0),
        'lines': lines,
    }


def ocr_document(data):
    started = time.monotonic()
    with tempfile.TemporaryDirectory(prefix='mr-ocr-') as directory:
        if data.startswith(b'%PDF'):
            input_path = os.path.join(directory, 'input.pdf')
        elif data.startswith(b'\x89PNG\r\n\x1a\n'):
            input_path = os.path.join(directory, 'input.png')
        elif data.startswith(b'\xff\xd8\xff'):
            input_path = os.path.join(directory, 'input.jpg')
        else:
            raise ValueError('只支持 PDF、PNG 或 JPEG')
        with open(input_path, 'wb') as handle:
            handle.write(data)
        if input_path.endswith('.pdf'):
            info = run(['pdfinfo', input_path]).stdout
            pages_line = next((line for line in info.splitlines() if line.startswith('Pages:')), '')
            pages = int(pages_line.split(':', 1)[1].strip()) if pages_line else 0
            if not pages or pages > MAX_PAGES:
                raise ValueError(f'PDF 页数必须在 1-{MAX_PAGES} 页以内')
            prefix = os.path.join(directory, 'page')
            run(['pdftoppm', '-r', '300', '-png', '-f', '1', '-l', str(pages), input_path, prefix])
            image_paths = sorted(glob.glob(f'{prefix}-*.png'))
            psm = 4
        else:
            pages = 1
            image_paths = [input_path]
            psm = 6
        layout_pages = [tsv_page(image_path, index, psm) for index, image_path in enumerate(image_paths, 1)]
        text = '\n\n'.join('\n'.join(line['text'] for line in page['lines']) for page in layout_pages)
        return {
            'text': text,
            'layout': {'pages': layout_pages},
            'pages': pages,
            'durationMs': round((time.monotonic() - started) * 1000),
        }


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
            data = form['file'].file.read()
            if not data or len(data) > MAX_BYTES:
                raise ValueError('文件大小超过限制')
            with OCR_LOCK:
                result = ocr_document(data)
            self.send_json(200, result)
        except subprocess.TimeoutExpired:
            self.send_json(504, {'error': 'OCR 处理超时'})
        except Exception as error:
            self.send_json(422, {'error': str(error)})

    def log_message(self, _format, *_args):
        return


if __name__ == '__main__':
    ThreadingHTTPServer(('0.0.0.0', 8080), Handler).serve_forever()
