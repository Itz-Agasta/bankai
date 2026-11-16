FROM oven/bun:1.4
WORKDIR /app
COPY . .
RUN bun install --frozen-lockfile --production
ENV PORT=8787
EXPOSE 8787
# The host sets BANKAI_PROJECT (a project folder inside the image, e.g. data/projects/alpha).
USER bun
CMD ["bun", "apps/cli/src/main.ts", "serve", "--demo"]
