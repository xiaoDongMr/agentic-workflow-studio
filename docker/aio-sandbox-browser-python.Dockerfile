ARG BASE_IMAGE=enterprise-public-cn-beijing.cr.volces.com/vefaas-public/all-in-one-sandbox:latest
FROM ${BASE_IMAGE}

ARG BASE_IMAGE

ENV PYTHONUNBUFFERED=1

RUN python -m pip install --no-cache-dir playwright

LABEL org.opencontainers.image.title="aio-sandbox-browser-python" \
      org.opencontainers.image.description="aio-sandbox base image with Python Playwright dependency" \
      org.opencontainers.image.base.name="${BASE_IMAGE}"
