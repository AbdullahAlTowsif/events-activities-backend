import httpStatus from "http-status-codes";
import ApiError from "../errors/ApiError";

// Parses the JSON string that multer stores under `req.body.data` for
// multipart/form-data requests. Returns 400 (not 500) on malformed JSON (M10).
const parseMultipartBody = (raw: unknown): Record<string, unknown> => {
    if (typeof raw !== "string" || raw.length === 0) {
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid request body");
    }

    try {
        return JSON.parse(raw) as Record<string, unknown>;
    } catch {
        throw new ApiError(httpStatus.BAD_REQUEST, "Invalid JSON in request body");
    }
};

export default parseMultipartBody;