#!/bin/bash

# Hiển thị phiên bản Node.js
echo "Node version: $(node -v)"
echo "NPM version: $(npm -v)"

# Cài đặt dependencies
npm install

# Build ứng dụng
npm run build
