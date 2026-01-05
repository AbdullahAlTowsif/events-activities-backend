#!/usr/bin/env bash
# exit on error
set -o errexit

npm install
npx prisma generate
npm run build
npx prisma migrate deploy
