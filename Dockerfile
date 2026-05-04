FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-venv libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements-python.txt ./
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --no-cache-dir --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir -r requirements-python.txt

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV PYTHON_BIN=/opt/venv/bin/python
ENV NODE_ENV=production

EXPOSE 3000

CMD ["node", "server.js"]
