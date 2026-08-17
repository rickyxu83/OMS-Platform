FROM debian:bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 poppler-utils tesseract-ocr tesseract-ocr-chi-sim tesseract-ocr-chi-tra tesseract-ocr-eng \
    && rm -rf /var/lib/apt/lists/*

COPY server.py /opt/ocr/server.py
WORKDIR /work
EXPOSE 8080
CMD ["python3", "/opt/ocr/server.py"]
