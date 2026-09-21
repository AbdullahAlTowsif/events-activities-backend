const parseExpiryToMs = (expiresIn: string | undefined): number => {
    if (typeof expiresIn !== "string" || expiresIn.length < 2) {
        return 1000 * 60 * 60; // default 1 hour
    }

    const unit = expiresIn.slice(-1);
    const value = parseInt(expiresIn.slice(0, -1), 10);

    if (isNaN(value)) {
        return 1000 * 60 * 60; // default 1 hour
    }

    switch (unit) {
        case "y":
            return value * 365 * 24 * 60 * 60 * 1000;
        case "M":
            return value * 30 * 24 * 60 * 60 * 1000;
        case "w":
            return value * 7 * 24 * 60 * 60 * 1000;
        case "d":
            return value * 24 * 60 * 60 * 1000;
        case "h":
            return value * 60 * 60 * 1000;
        case "m":
            return value * 60 * 1000;
        case "s":
            return value * 1000;
        default:
            return 1000 * 60 * 60; // default 1 hour
    }
};

export default parseExpiryToMs;