import { describe, expect, it } from "vitest";
import parseExpiryToMs from "./parseExpiryToMs";

describe("parseExpiryToMs", () => {
    it("parses seconds", () => {
        expect(parseExpiryToMs("30s")).toBe(30_000);
    });

    it("parses minutes", () => {
        expect(parseExpiryToMs("2m")).toBe(2 * 60 * 1000);
    });

    it("parses hours", () => {
        expect(parseExpiryToMs("1h")).toBe(60 * 60 * 1000);
    });

    it("parses days", () => {
        expect(parseExpiryToMs("7d")).toBe(7 * 24 * 60 * 60 * 1000);
    });

    it("parses weeks", () => {
        expect(parseExpiryToMs("2w")).toBe(2 * 7 * 24 * 60 * 60 * 1000);
    });

    it("parses months (capital M)", () => {
        expect(parseExpiryToMs("1M")).toBe(30 * 24 * 60 * 60 * 1000);
    });

    it("parses years", () => {
        expect(parseExpiryToMs("1y")).toBe(365 * 24 * 60 * 60 * 1000);
    });

    it("defaults to 1 hour for garbage input", () => {
        expect(parseExpiryToMs("banana")).toBe(60 * 60 * 1000);
    });

    it("defaults to 1 hour when maxAge is missing", () => {
        expect(parseExpiryToMs(undefined)).toBe(60 * 60 * 1000);
    });
});