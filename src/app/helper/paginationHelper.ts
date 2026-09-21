export type IOptions = {
    page?: string | number;
    limit?: string | number;
    sortBy?: string;
    sortOrder?: string;
}

export type IOptionsResult = {
    page: number;
    limit: number;
    skip: number;
    sortBy: string;
    sortOrder: string
}

const calculatePagination = (options: IOptions): IOptionsResult => {
    // Clamp page >= 1 and limit <= 100 to avoid pathological queries (Q5)
    const rawPage: number = Number(options.page) || 1;
    const rawLimit: number = Number(options.limit) || 10;

    const page = Math.max(1, rawPage);
    const limit = Math.min(100, Math.max(1, rawLimit));
    const skip = (page - 1) * limit;

    const sortBy: string = options.sortBy || "createdAt"
    const sortOrder: string = options.sortOrder || "desc"

    return {
        page,
        limit,
        skip,
        sortBy,
        sortOrder
    }
}

export const paginationHelper = {
    calculatePagination,
}
