/*
Copyright 2024 Suredesigns Corp.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

/**
 * Tests whether or not the given value is a valid ISO 8601 format date-time string.
 * @param {*} s
 * A value to be tested.
 * 
 * @returns
 * `true` if the given value is a valid ISO 8601 format date-time string, `false` otherwise.
 */
const _isIso8601DateTime = (() => {
    const expr = /^(?:[\+\-]\d{6}|\d{4})-\d{2}-\d{2}[T\x09\x20]\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[\+\-]\d{2}:\d{2})$/;
    return (s) => (typeof s === "string" && expr.test(s));
})();


/**
 * A Utility class for representing datetime.
 */
class UtcDateTime {

    /**
     *  @constructor
     * 
     *  Creates an `UtcDateTime`.
     *  `UtcDateTime` is an immutable object, i.e. it is frozen at construction time.
     * 
     *  @param {UtcDateTime | Date | string | ({
     *       year   : number,
     *       month  : number,
     *       date   : number,
     *       hours  : number,
     *       minutes: number,
     *       seconds: number,
     *       ms     : number
     *   } | null )} o 
     * 
     *  The constructor behaves differently according to the given argument:
     *  
     *  -   If an `UtcDateTime` object is given, the constructor just returns the given `UtcDateTime`.
     *  -   If a `Date` object is given, it is converted into an `UtcDateTime` by using `getUTC*()` methods.
     *  -   If a string is given, it is parsed as ISO 8601 date-time and then it is converted to `UtcDateTime`.
     *  -   If a number is given, it is treated as elapsed time from the POSIX epoch in milliseconds.
     * -    If an object compatible with `UtcDateTime`, each of properties of the given object is copied to the `UtcDateTime` instance to be created.
     *  
     *  @throws {TypeError}
     *  -   When the given argument {@link o} is not a non-null object
     *  -   When the given argument {@link o} is `UtcDateTime`
     *  -   When the given string {@link o} is not compliant with ISO 8601 format 
     *  -   When the property {@link o.year} is not an integer
     *  -   When the property {@link o.month} is not an integer
     *  -   When the property {@link o.date} is not an integer
     *  -   When the property {@link o.hours} is not an integer
     *  -   When the property {@link o.minutes} is not an integer
     *  -   When the property {@link o.seconds} is not an integer
     *  -   When the property {@link o.ms} is not an integer
     *  -   When the given argument {@link o} is unexpected typed
     * 
     *  @throws {RangeError}
     *  -   When the given argument {@link o} is out of the range of valid datetimes
     */
    constructor(o) {
        if (o instanceof UtcDateTime) {
            return o;
        }

        let v = null;

        if (o instanceof Date) {
            v = o;
        } else if (o == null) {
            v = new Date(Date.now());
        } else if ((o instanceof Number) || (typeof o === "number")) {
            v = new Date(o.valueOf());
        } else if ((o instanceof String) || typeof o === "string") {
            const date_string = o.valueOf();
            if (!_isIso8601DateTime(date_string)) {
                throw new TypeError(`invalid ISO 8601 date string: ${date_string}`);
            }
            v = new Date(Date.parse(o.valueOf()));
        } else if (typeof o === "object") {
            const   year    = o.year    ?? 0,
                    month   = o.month   ?? 1,
                    date    = o.date    ?? 0,
                    hours   = o.hours   ?? 0,
                    minutes = o.minutes ?? 0,
                    seconds = o.seconds ?? 0,
                    ms      = o.ms      ?? 0
            ;
            if (!Number.isInteger(year)) {
                throw new TypeError(`year (${year}) is not an integer`);
            } else if (!Number.isInteger(month)) {
                throw new TypeError(`month (${month}) is not an integer`);
            } else if (!Number.isInteger(date)) {
                throw new TypeError(`date (${date}) is not an integer`);
            } else if (!Number.isInteger(hours)) {
                throw new TypeError(`hours (${hours}) is not an integer`);
            } else if (!Number.isInteger(minutes)) {
                throw new TypeError(`minutes (${minutes}) is not an integer`);
            } else if (!Number.isInteger(seconds)) {
                throw new TypeError(`seconds (${seconds}) is not an integer`);
            } else if (!Number.isInteger(ms)) {
                throw new TypeError(`ms (${ms}) is not an integer`);
            }
            v = new Date(Date.UTC(year, month - 1, date, hours, minutes, seconds, ms));
        } else {
            throw new TypeError(`${o} is unexpected typed`);
        }

        if (Number.isNaN(v.valueOf())) {
            throw new RangeError("Out of the range of valid datetimes");
        }

        this.#value = v;

        /**
         * @type {number}
         * An integer representing an year of the Gregorian calendar.
         */
        this.year    = v.getUTCFullYear();
        /**
         * @type {number}
         * An integer representing a month of the Gregorian calendar.
         * This value is set between `1` and `12`.
         */
        this.month   = v.getUTCMonth() + 1;
        /**
         * @type {number}
         * An integer representing a date-of-month of the Gregorian calendar.
         */
        this.date    = v.getUTCDate();
        /**
         * @type {number}
         * An integer representing hours.
         * This value is set between `0` and `23`.
         */
        this.hours   = v.getUTCHours();
        /**
         * @type {number}
         * An integer representing minutes.
         * This value is set between `0` and `59`.
         */
        this.minutes = v.getUTCMinutes();
        /**
         * @type {number}
         * An integer representing seconds.
         * This value is set between `0` and `59`.
         */
        this.seconds = v.getUTCSeconds();
        /**
         * @type {number}
         * An integer representing fraction in  milliseconds.
         * This value is set between `0` and `999`.
         */
        this.ms      = v.getUTCMilliseconds();

        Object.freeze(this);
    }

    /**
     * Tests whether or not the target year is a leap year.
     * 
     * @returns `true` if the target year is a leap year, `false` otherwise.
     */
    isLeapYear() {
        const y = this.year;
        return (y % 400 === 0) || (y % 100 !== 0 && y % 4 === 0);
    }

    /**
     * Gets the first date of the target month.
     * 
     * @returns the first date of the target month.
     */
    firstDate() {
        return new UtcDateTime({
            year: this.year,
            month: this.month,
            date: 1
        });
    }

    /**
     * Gets the last date of the target month.
     * 
     * @returns the last date of the target month.
     */
    lastDate() {
        return new UtcDateTime({
            year: this.year,
            month: this.month + 1,
            date: 0
        });
    }

    /**
     *  Calculates the previous datetime.
     * 
     *  @param {object} o
     *  An object representing a time interval from the target datetime.
     * 
     *  @param {number?} o.year
     *  A number representing a time interval from the target datetime in year.
     * 
     *  @param {number?} o.month
     *  A number representing a time interval from the target datetime in month.
     * 
     *  @param {number?} o.date
     *  A number representing a time interval from the target datetime in date.
     * 
     *  @param {number?} o.hours
     *  A number representing a time interval from the target datetime in hour.
     * 
     *  @param {number?} o.minutes
     *  A number representing a time interval from the target datetime in minute.
     * 
     *  @param {number?} o.seconds
     *  A number representing a time interval from the target datetime in second.
     * 
     *  @param {number?} o.ms
     *  A number representing a time interval from the target datetime in millisecond.
     * 
     *  @returns datetime.
     *  
     *  @throws {TypeError}
     *  -   When the given argument {@link o} is not a non-null object
     *  -   When the given argument {@link o} is `UtcDateTime`
     *  -   When the property {@link o.year} is not an integer
     *  -   When the property {@link o.month} is not an integer
     *  -   When the property {@link o.date} is not an integer
     *  -   When the property {@link o.hours} is not an integer
     *  -   When the property {@link o.minutes} is not an integer
     *  -   When the property {@link o.seconds} is not an integer
     *  -   When the property {@link o.ms} is not an integer
     * 
     *  @throws {RangeError}
     *  -   When the resulting datetime is out of the range of valid datetimes
     */
    prev(o) {
        if (o === null || typeof o !== "object") {
            throw new TypeError(`${o} is not a non-null object`);
        } else if (o instanceof UtcDateTime) {
            throw new TypeError(`UtcDateTime cannot be used as a difference between two points on timeline`);
        }
        const   year    = o.year    ?? 0,
                month   = o.month   ?? 0,
                date    = o.date    ?? 0,
                hours   = o.hours   ?? 0,
                minutes = o.minutes ?? 0,
                seconds = o.seconds ?? 0,
                ms      = o.ms      ?? 0
        ;
        if (!Number.isInteger(year)) {
            throw new TypeError(`year (${year}) is not an integer`);
        } else if (!Number.isInteger(month)) {
            throw new TypeError(`month (${month}) is not an integer`);
        } else if (!Number.isInteger(date)) {
            throw new TypeError(`date (${date}) is not an integer`);
        } else if (!Number.isInteger(hours)) {
            throw new TypeError(`hours (${hours}) is not an integer`);
        } else if (!Number.isInteger(minutes)) {
            throw new TypeError(`minutes (${minutes}) is not an integer`);
        } else if (!Number.isInteger(seconds)) {
            throw new TypeError(`seconds (${seconds}) is not an integer`);
        } else if (!Number.isInteger(ms)) {
            throw new TypeError(`ms (${ms}) is not an integer`);
        }

        return new UtcDateTime({
            year   : this.year    - year,
            month  : this.month   - month,
            date   : this.date    - date,
            hours  : this.hours   - hours,
            minutes: this.minutes - minutes,
            seconds: this.seconds - seconds,
            ms     : this.ms      - ms
        });
    }

    /**
     *  Calculates the next datetime.
     * 
     *  @param {object} o
     *  An object representing a time interval from the target datetime.
     * 
     *  @param {number?} o.year
     *  A number representing a time interval from the target datetime in year.
     * 
     *  @param {number?} o.month
     *  A number representing a time interval from the target datetime in month.
     * 
     *  @param {number?} o.date
     *  A number representing a time interval from the target datetime in date.
     * 
     *  @param {number?} o.hours
     *  A number representing a time interval from the target datetime in hour.
     * 
     *  @param {number?} o.minutes
     *  A number representing a time interval from the target datetime in minute.
     * 
     *  @param {number?} o.seconds
     *  A number representing a time interval from the target datetime in second.
     * 
     *  @param {number?} o.ms
     *  A number representing a time interval from the target datetime in millisecond.
     * 
     *  @returns datetime.
     *  
     *  @throws {TypeError}
     *  -   When the given argument {@link o} is not a non-null object
     *  -   When the given argument {@link o} is `UtcDateTime`
     *  -   When the property {@link o.year} is not an integer
     *  -   When the property {@link o.month} is not an integer
     *  -   When the property {@link o.date} is not an integer
     *  -   When the property {@link o.hours} is not an integer
     *  -   When the property {@link o.minutes} is not an integer
     *  -   When the property {@link o.seconds} is not an integer
     *  -   When the property {@link o.ms} is not an integer
     * 
     *  @throws {RangeError}
     *  -   When the resulting datetime is out of the range of valid datetimes
     */
    next(o) {
        if (o === null || typeof o !== "object") {
            throw new TypeError(`${o} is not a non-null object`);
        } else if (o instanceof UtcDateTime) {
            throw new TypeError(`UtcDateTime cannot be used as a difference between two points on timeline`);
        }

        const   year    = o.year    ?? 0,
                month   = o.month   ?? 0,
                date    = o.date    ?? 0,
                hours   = o.hours   ?? 0,
                minutes = o.minutes ?? 0,
                seconds = o.seconds ?? 0,
                ms      = o.ms      ?? 0
        ;
        if (!Number.isInteger(year)) {
            throw new TypeError(`year (${year}) is not an integer`);
        } else if (!Number.isInteger(month)) {
            throw new TypeError(`month (${month}) is not an integer`);
        } else if (!Number.isInteger(date)) {
            throw new TypeError(`date (${date}) is not an integer`);
        } else if (!Number.isInteger(hours)) {
            throw new TypeError(`hours (${hours}) is not an integer`);
        } else if (!Number.isInteger(minutes)) {
            throw new TypeError(`minutes (${minutes}) is not an integer`);
        } else if (!Number.isInteger(seconds)) {
            throw new TypeError(`seconds (${seconds}) is not an integer`);
        } else if (!Number.isInteger(ms)) {
            throw new TypeError(`ms (${ms}) is not an integer`);
        }

        return new UtcDateTime({
            year   : this.year    + year,
            month  : this.month   + month,
            date   : this.date    + date,
            hours  : this.hours   + hours,
            minutes: this.minutes + minutes,
            seconds: this.seconds + seconds,
            ms     : this.ms      + ms
        });
    }

    /**
     * Converts the target datetime into a number.
     * 
     * @returns a number representing an interval from the POSIX epoch (1970-01-01T00:00:00.000Z) in milliseconds.
     */
    valueOf() {
        return this.#value.valueOf();
    }

    /**
     * Converts the target datetime into a string. 
     * 
     * @returns ISO 8601 format date-time string representing the target datetime value.
     */
    toString() {
        return this.#value.toISOString();
    }

    /**
     * Converts the target datetime into a JSON string. 
     * 
     * This method is invoked by {@link JSON.stringify} to serialise the target object.
     * 
     * @returns ISO 8601 format date-time string representing the target datetime value.
     */
    toJSON() {
        return this.#value.toISOString();
    }

    /**
     *  Formats the target `UtcDateTime`.
     * 
     *  @param {"year" | "month" | "date" | "hours" | "minutes" | "seconds" | "ms" | undefined} precision 
     *  A string representing a precision of formatted datetime string.
     * 
     *  -   When precision is set to `"year"`
     *      -   Datetime is formatted in `YYYY` or `+YYYYYY` or `-YYYYYY` format.
     *  -   When precision is set to `"month"`
     *      -   Datetime is formatted in `YYYY-MM` or `+YYYYYY-MM` or `-YYYYYY-MM` format.
     *  -   When precision is set to `"date"`
     *      -   Datetime is formatted in `YYYY-MM-DD` or `+YYYYYY-MM-DD` or `-YYYYYY-MM-DD` format.
     *  -   When precision is set to `"hours"`
     *      -   Datetime is formatted in `YYYY-MM-DDThhZ` or `+YYYYYY-MM-DDThhZ` or `-YYYYYY-MM-DDThhZ` format.
     *  -   When precision is set to `"minutes"`
     *      -   Datetime is formatted in `YYYY-MM-DDThh:mmZ` or `+YYYYYY-MM-DDThh:mmZ` or `-YYYYYY-MM-DDThh:mmZ` format.
     *  -   When precision is set to `"seconds"`
     *      -   Datetime is formatted in `YYYY-MM-DDThh:mm:ssZ` or `+YYYYYY-MM-DDThh:mm:ssZ` or `-YYYYYY-MM-DDThh:mm:ssZ` format.
     *  -   When precision is set to `"ms"` or `undefined`
     *      -   Datetime is formatted in `YYYY-MM-DDThh:mm:ss.fffZ` or `+YYYYYY-MM-DDThh:mm:ss.fffZ` or `-YYYYYY-MM-DDThh:mm:ss.fffZ` format.
     * 
     *  Note that the given precision is coarser than `"hours"`, the timezone suffix `"Z"` is not appended.
     * 
     *  @returns 
     *  A formatted string.
     * 
     *  @throws {TypeError}
     *  -   when the given argument `precision` is neither null nor a string.
     * -    when the given `precision` is not supported.
     */
    format(precision) {
        if (precision != null && typeof precision !== "string") {
            throw new TypeError(`precision ${precision} is neither null nor a string`);
        }

        const buf = [];

        switch (precision) {
        case undefined:
        case null:
        case "ms":
        case "millisecond":
        case "milliseconds":
            buf.splice(0, 0, ".", ("00" + this.ms).slice(-3));
        case "seconds":
        case "second":
            buf.splice(0, 0, ":", ("0" + this.seconds).slice(-2));
        case "minutes":
        case "minute":
            buf.splice(0, 0, ":", ("0" + this.minutes).slice(-2));
        case "hours":
        case "hour":
            buf.splice(0, 0, "T", ("0" + this.year).slice(-2));
            buf.splice(buf.length, 0, "Z");
        case "date":
            buf.splice(0, 0, "-", ("0" + this.date).slice(-2));
        case "month":
            buf.splice(0, 0, "-", ("0" + this.month).slice(-2));
        case "year":
            buf.splice(0, 0,
                this.year >= 10000 ?
                    "+" + ("00000" + this.year).slice(-6) :
                this.year < 0 ?
                    "-" + ("00000" + this.year).slice(-6) :
                    ("000" + this.year).slice(-4) 
            );
            return buf.join("");
        default:
            throw new TypeError(`Unsupported precision "${precision}"`);
        }
    }

    /**
     * Tests whether or not the given value can be parsed as an `UtcDateTime`.
     * In other words, the given value is a string compliant with ISO 8601 date-time format.
     * 
     * @param {*} s
     * A value to be tested.
     * 
     * @returns
     * `true` if the given value can be parsed as `UtcDateTime`, `false` otherwise.
     */
    static canParse(s) {
        return _isIso8601DateTime(s);
    }

    /**
     * Parses the given date-time string as `UtcDateTime`.
     * 
     * @param {string} s 
     * A string representing a date-time.
     * @returns 
     * `UtcDateTime` instance if the given string could be parsed, `undefined` otherwise.
     */
    static parse(s) {
        return UtcDateTime.canParse(s) ? new UtcDateTime(s) : undefined;
    }

    #value;
}

/// Platform Specific -->
module.exports = { UtcDateTime };
/// <-- Platform Specific
