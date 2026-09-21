import { NextFunction, Request, Response } from "express";
import { z } from "zod";

// Supports both flat schemas (z.object({ title, type, ... })) and wrapped
// schemas (z.object({ body, query, params })). Validates each part that the
// schema declares and writes the parsed result back onto the request.
const validateRequest = (schema: z.ZodTypeAny) => async (req: Request, _res: Response, next: NextFunction) => {
    try {
        const shape = (schema as z.ZodObject<z.ZodRawShape>).shape ?? {};
        const isWrapped = "body" in shape || "query" in shape || "params" in shape;

        if (isWrapped) {
            const input: Record<string, unknown> = {};
            if ("body" in shape) input.body = req.body;
            if ("query" in shape) input.query = req.query;
            if ("params" in shape) input.params = req.params;

            const parsed = (await schema.parseAsync(input)) as Record<string, unknown>;

            if (parsed.body !== undefined) req.body = parsed.body as Request["body"];
            if (parsed.query !== undefined) req.query = parsed.query as typeof req.query;
            if (parsed.params !== undefined) req.params = parsed.params as typeof req.params;
        } else {
            req.body = await schema.parseAsync(req.body);
        }

        return next();
    } catch (err) {
        next(err);
    }
}

export default validateRequest;