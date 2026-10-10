const isPositiveInteger = (value) => {
    const number = Number(value);
    return Number.isInteger(number) && number > 0;
};

const isDateOnly = (value) => {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
};

const isQRToken = (value) => (
    typeof value === "string" && /^[a-f0-9]{32}$/i.test(value)
);

const isNonEmptyString = (value) => (
    typeof value === "string" && value.trim().length > 0
);

const isEmail = (value) => (
    typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
);

module.exports = {
    isPositiveInteger,
    isDateOnly,
    isQRToken,
    isNonEmptyString,
    isEmail
};