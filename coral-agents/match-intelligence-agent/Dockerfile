# CoralOS runtime participant for the Rust-backed Match Intelligence Agent.
# Build from repo root:
#   docker build -f coral-agents/match-intelligence-agent/Dockerfile -t match-intelligence-agent:0.1.0 .

FROM python:3.13-slim

WORKDIR /app
RUN pip install --no-cache-dir "mcp>=1.0.0"

COPY coral-agents/match-intelligence-agent/agent.py /app/agent.py

ENTRYPOINT ["python", "/app/agent.py"]
