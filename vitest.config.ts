import { defineConfig } from "vitest/config";

export default defineConfig({
    test: {
        // Ignore the tsc build output and the generated Prisma client
        exclude: ["node_modules/**", "dist/**", "generated/**"],
    },
});