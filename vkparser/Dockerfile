FROM node:12.6.0

WORKDIR /vkparser

COPY package.json /vkparser/package.json
COPY package-lock.json /vkparser/package-lock.json

RUN npm ci
