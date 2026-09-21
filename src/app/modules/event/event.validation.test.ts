import { describe, expect, it } from "vitest";
import { eventValidation } from "./event.validation";

const futureDateTime = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

describe("createEventValidationSchema", () => {
    const valid = {
        title: "Super Long Event Title",
        type: "conference",
        description: "A description that is definitely longer than twenty characters.",
        location: "Dhaka",
        dateTime: futureDateTime,
        joiningFee: 500,
    };

    it("accepts a valid payload", () => {
        expect(() => eventValidation.createEventValidationSchema.parse(valid)).not.toThrow();
    });

    it("rejects a negative joiningFee", () => {
        expect(() =>
            eventValidation.createEventValidationSchema.parse({ ...valid, joiningFee: -10 })
        ).toThrow();
    });

    it("rejects a past dateTime", () => {
        expect(() =>
            eventValidation.createEventValidationSchema.parse({
                ...valid,
                dateTime: new Date(Date.now() - 60_000).toISOString(),
            })
        ).toThrow();
    });

    it("rejects an invalid date string", () => {
        expect(() =>
            eventValidation.createEventValidationSchema.parse({ ...valid, dateTime: "not-a-date" })
        ).toThrow();
    });
});

describe("updateEventValidationSchema", () => {
    it("is a whitelist and rejects unknown fields", () => {
        expect(() =>
            eventValidation.updateEventValidationSchema.parse({ hostEmail: "attacker@x.com" })
        ).toThrow();
    });

    it("accepts partial known fields", () => {
        expect(() =>
            eventValidation.updateEventValidationSchema.parse({ joiningFee: 10, currency: "USD" })
        ).not.toThrow();
    });

    it("rejects a negative fee", () => {
        expect(() =>
            eventValidation.updateEventValidationSchema.parse({ joiningFee: -1 })
        ).toThrow();
    });
});

describe("createReviewValidationSchema", () => {
    it("accepts rating 1-5 and optional comment", () => {
        expect(() => eventValidation.createReviewValidationSchema.parse({ rating: 5 })).not.toThrow();
        expect(() =>
            eventValidation.createReviewValidationSchema.parse({ rating: 1, comment: "Great" })
        ).not.toThrow();
    });

    it("rejects rating outside 1-5", () => {
        expect(() => eventValidation.createReviewValidationSchema.parse({ rating: 0 })).toThrow();
        expect(() => eventValidation.createReviewValidationSchema.parse({ rating: 6 })).toThrow();
    });

    it("rejects non-integer rating", () => {
        expect(() => eventValidation.createReviewValidationSchema.parse({ rating: 3.5 })).toThrow();
    });

    it("rejects an over-long comment", () => {
        expect(() =>
            eventValidation.createReviewValidationSchema.parse({ rating: 4, comment: "x".repeat(501) })
        ).toThrow();
    });
});