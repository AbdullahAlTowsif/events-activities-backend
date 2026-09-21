import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import globalErrorHandler from "./globalErrorHandler";
import ApiError from "../errors/ApiError";

interface MockRes {
    status: (code: number) => MockRes;
    json: (body: unknown) => MockRes;
    statusCode: number | undefined;
    body: unknown;
}

const createMockRes = (): MockRes => {
    const res: MockRes = {
        status(code: number) {
            res.statusCode = code;
            return res;
        },
        json(body: unknown) {
            res.body = body;
            return res;
        },
        statusCode: undefined,
        body: undefined,
    };
    return res;
};

const createMockNext = (): { called: boolean } => ({ called: false });

describe("globalErrorHandler", () => {
    it("returns 401 for ApiError", () => {
        const res = createMockRes();
        const next = createMockNext();

        globalErrorHandler(new ApiError(401, "Invalid email or password"), {} as any, res as any, next as any);

        expect(res.statusCode).toBe(401);
        expect((res.body as any).message).toBe("Invalid email or password");
    });

    it("returns 400 with issues for ZodError", () => {
        const res = createMockRes();
        const next = createMockNext();

        const zodError = new ZodError([
            { code: "custom", message: "Rataking required", path: ["rating"] },
        ]);

        globalErrorHandler(zodError, {} as any, res as any, next as any);

        expect(res.statusCode).toBe(400);
        expect((res.body as any).message).toBe("Validation failed");
        expect(Array.isArray((res.body as any).error)).toBe(true);
    });

    it("returns 409 for Prisma P2002 duplicate key", () => {
        const res = createMockRes();
        const next = createMockNext();

        const prismaError = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
            code: "P2002",
            clientVersion: "7.0.0",
            meta: { target: ["eventId", "userEmail"] },
        });

        globalErrorHandler(prismaError, {} as any, res as any, next as any);

        expect(res.statusCode).toBe(409);
        expect(String((res.body as any).message)).toMatch(/duplicate/i);
    });

    it("returns 404 for Prisma P2025 not found", () => {
        const res = createMockRes();
        const next = createMockNext();

        const prismaError = new Prisma.PrismaClientKnownRequestError("Record not found", {
            code: "P2025",
            clientVersion: "7.0.0",
        });

        globalErrorHandler(prismaError, {} as any, res as any, next as any);

        expect(res.statusCode).toBe(404);
    });

    it("sanitizes unknown errors to 500 generic message in production", () => {
        const original = process.env.NODE_ENV;
        process.env.NODE_ENV = "production";

        try {
            const res = createMockRes();
            const next = createMockNext();

            const err: any = new Error("database host leaked");
            err.stack = "sensitive stack trace";

            globalErrorHandler(err, {} as any, res as any, next as any);

            expect(res.statusCode).toBe(500);
            expect((res.body as any).message).toBe("Something went wrong!");
            expect((res.body as any).error).toBeNull();
        } finally {
            process.env.NODE_ENV = original;
        }
    });
});