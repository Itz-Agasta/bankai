# Build: install from the lockfile, bundle the app into one file.
FROM oven/bun:1.4.4-alpine AS build
WORKDIR /app
COPY package.json bun.lock ./
COPY apps/cli/package.json apps/cli/
COPY apps/mcp/package.json apps/mcp/
COPY packages/core/package.json packages/core/
COPY packages/schemas/package.json packages/schemas/
RUN bun install --frozen-lockfile --production --ignore-scripts
COPY tsconfig.base.json ./
COPY apps apps
COPY packages packages
COPY skills/bankai skills/bankai
RUN bun build apps/cli/src/main.ts --target=bun --minify --external sharp --outfile dist/main.js
# sharp is native (libvips), so it stays a package: its locked tree, symlinks resolved.
RUN cp -rL node_modules/.bun/sharp@*/node_modules /sharp && rm -rf /sharp/.bin /sharp/@types

# Runtime: alpine, the bundle, sharp and the project data.
FROM oven/bun:1.4.4-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8080
COPY --from=build /sharp node_modules
COPY --from=build /app/dist/main.js main.js
COPY data data
USER bun
EXPOSE 8080
# The host sets BANKAI_PROJECT (a project folder inside the image, e.g. data/projects/alpha).
CMD ["bun", "main.js", "serve", "--demo"]
