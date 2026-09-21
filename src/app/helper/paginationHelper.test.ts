import { describe, expect, it } from "vitest";
import { paginationHelper } from "./paginationHelper";

describe("paginationHelper.calculatePagination", () => {
    it("defaults page to 1 and limit to 10", () => {
        const result = paginationHelper.calculatePagination({});
        expect(result.page).toBe(1);
        expect(result.limit).toBe(10);
        expect(result.skip).toBe(0);
    });

    it("clamps page to a minimum of 1 (negative/zero input)", () => {
        expect(paginationHelper.calculatePagination({ page: -3 }).page).toBe(1);
        expect(paginationHelper.calculatePagination({ page: 0 }).page).toBe(1);
    });

    it("clamps limit to a maximum of 100", () => {
        expect(paginationHelper.calculatePagination({ limit: 9999 }).limit).toBe(100);
    });

    it("clamps limit to a minimum of 1", () => {
        expect(paginationHelper.calculatePagination({ limit: -5 }).limit).toBe(1);
    });

    it("computes skip from page and limit", () => {
        const result = paginationHelper.calculatePagination({ page: 3, limit: 20 });
        expect(result.skip).toBe(40);
    });

    it("defaults sortBy/sortOrder", () => {
        const result = paginationHelper.calculatePagination({});
        expect(result.sortBy).toBe("createdAt");
        expect(result.sortOrder).toBe("desc");
    });
});