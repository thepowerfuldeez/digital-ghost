FROM node:12.6.0

WORKDIR /vcpub

COPY package.json /vcpub/package.json
COPY package-lock.json /vcpub/package-lock.json

RUN npm ci
