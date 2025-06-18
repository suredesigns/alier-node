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

class WebApiError extends Error {

    get statusCode() {
        return this.#status_code;
    }

    get description() {
        return this.#description;
    }

    get retryAfter() {
        return this.#retry_after;
    }

    /**
     * 
     * @param {number} statusCode 
     * @param {string} statusMessage 
     * @param {({ description: string, retryAfter: (string|number|Date)?, cause: Error? })} options 
     */
    constructor(statusCode, statusMessage, options) {
        super("", options);

        /** @type {string} */
        const description_ = (typeof options?.description === "string" ?
            options.description :
            "Something went wrong"
        );

        const status_code_ = (Number.isInteger(statusCode) && 100 <= statusCode && statusCode <= 599) ?
            statusCode :
            500
        ;

        const status_message_ = (
            // Object.create(null) cannot be converted to a string
            (statusMessage == null || (Object.getPrototypeOf(statusMessage) == null)) ?
                "Internal Server Error" :
                String(statusMessage)
        );

        let retry_after_ = options?.retryAfter;
        if (retry_after_ != null) {
            const   t0 = Date.now(),
                    dt = 5
            ;

            if (typeof retry_after_ === "string") {
                const wday_expr     = String.raw`(?:San|Mon|Tue|Wed|Thu|Fri|Sat)`;
                const month_expr    = String.raw`(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)`;
                const httpdate_expr = String.raw`${wday_expr}\, \d{1,2} ${month_expr} \d{1,6} \d{1,2}\:\d{1,2}\:\d{1,2} GMT`;
                const isodate_expr  = String.raw`(?:\d{4}|[\+\-]\d{6})\-\d{2}\-\d{2}[T\x20]\d{2}\:\d{2}\:\d{2}(?:\.\d{1,6})?Z`;
                const date_expr     = new RegExp(String.raw`^(?:${httpdate_expr})|(?:${isodate_expr})$`, "g");

                if (date_expr.test(retry_after_)) {
                    retry_after_ = Date.parse(retry_after_);
                } else {
                    retry_after_ = t0 + dt;
                }
            } else if (retry_after_ instanceof Date) {
                retry_after_ = retry_after_.valueOf();
            } else if (typeof retry_after_ === "number") {
                retry_after_ = Number.isInteger(retry_after_) ?
                    (t0 + retry_after_) :
                    (t0 + dt)
                ;
            }

            if (Number.isNaN(retry_after_)) {
                retry_after_ = t0 + dt;
            }
        }


        this.message      = `${status_code_}: ${status_message_}`;

        this.#status_code = status_code_;
        this.#description = description_;
        this.#retry_after = typeof retry_after_ === "number" ?
            new Date(retry_after_).toUTCString() :
            undefined
        ;
    }

    #description;
    #status_code;
    #retry_after;
}

/**
 * @class
 */
class BadRequestError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(400, message, options);
    }
}

/**
 * @class
 */
class UnauthorizedError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(401, message, options);
    }
}

/**
 * @class
 */
class ForbiddenError extends WebApiError {
    /**
     * @param {string} requestedPath 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(requestedPath, options) {
        super(403, `Permission denied to access "${requestedPath}"`, options);
    }
}

/**
 * @class
 */
class NotFoundError extends WebApiError {
    /**
     * @param {string} requestedPath 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(requestedPath, options) {
        super(404, `"${requestedPath}" is not found`, options);
    }
}

/**
 * @class
 * 
 * An `Error` object notifying occurrence of method invocation which is not allowed.
 */
class MethodNotAllowedError extends WebApiError {
    /**
     * @param {string} method 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(method, options) {
        super(405, `"${method}" is not allowed`, options);
    }
}

/**
 * @class
 */
class NotAcceptableError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(406, message, options);
    }
}

/**
 * @class
 */
class ProxyAuthenticationRequiredError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(407, message, options);
    }
}

/**
 * @class
 */
class RequestTimeoutError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(408, message, options);
    }
}

/**
 * @class
 */
class ConflictError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(409, message, options);
    }
}

/**
 * @class
 */
class GoneError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(410, message, options);
    }
}
/**
 * @class
 * 
 * An `Error` object notifying that the requested content type is not supported.
 */
class UnsupportedMediaTypeError extends WebApiError {
    /**
     * @param {string} contentType 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(contentType, options) {
        super(415, `"${contentType}" is not supported`, options);
    }
}

/**
 * @class
 */
class InternalServerError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(500, message, options);
    }
}

/**
 * @class
 */
class NotImplementedError extends WebApiError {
    /**
     * @param {string} method 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(method, options) {
        super(501, `"${method}" is not implemented yet`, options);
    }
}

/**
 * @class
 */
class BadGatewayError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(502, message, options);
    }
}

/**
 * @class
 */
class ServiceUnavailableError extends WebApiError {

    /**
     * @param {string} message 
     * @param {({ description: string, retryAfter: (string | number | Date)?, cause: Error? })} options 
     */
    constructor(message, options) {
        super(503, message, options);
    }
}

/**
 * @class
 */
class NetworkAuthenticationRequiredError extends WebApiError {
    /**
     * @param {string} message 
     * @param {({ description: string, cause: Error? })} options 
     */
    constructor(message, options) {
        super(511, message, options);
    }
}

module.exports = {
    WebApiError,
    BadRequestError,
    UnauthorizedError,
    ForbiddenError,
    NotFoundError,
    MethodNotAllowedError,
    NotAcceptableError,
    ProxyAuthenticationRequiredError,
    RequestTimeoutError,
    ConflictError,
    GoneError,
    UnsupportedMediaTypeError,
    InternalServerError,
    NotImplementedError,
    BadGatewayError,
    ServiceUnavailableError,
    NetworkAuthenticationRequiredError
}