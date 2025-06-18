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

const http                  = require("node:http");
const { Buffer }            = require("node:buffer");
const { parseJson, merge }  = require("./Copyutil.js");
const { Result }            = require("./Result.js");
const {
    WebApiError,
    InternalServerError
}                           = require("./WebApiError.js");
const { WebApi }            = require("./WebApi.js");
const { RequestParser }     = require("./RequestParser.js");
const { WebEntity }         = require("./_WebEntity.js");
const { WebResource }       = require("./WebResource.js");
const { PatternMap } = require("./PatternMap.js");
const { Pattern } = require("./Pattern.js");

const TrailingSlashPolicy = Object.freeze({
    asis  : "asis",
    add   : "add",
    remove: "remove"
});

/**
 * A class for routing incoming requests to appropriate web APIs.
 */
class Router {

    get allowsPostMethodOverride() { return this.#allows_post_method_override; }

    get parsesQueryAsJson() { return this.#parses_query_as_json; }

    get trailingSlashPolicy() { return this.#trailing_slash_policy; }

    get server() {
        return this.#server;
    }

    /**
     * @constructor
     * 
     * @param {object} o 
     * @param {"asis" | "add" | "remove" } o.trailingSlashPolicy
     * a string declaring the policy for handling trailing slashes in the paths.
     * 
     * -  `"asis"`   :  do nothing even when a path ending with a trailing slash is incoming
     * -  `"add"`    :  add a trailing slash to the request path whenever it does not end with a slash
     * -  `"remove"` :  remove a trailing slash from the request path whenever it ends with a slash
     * 
     * By default, `"remove"` policy is applied.
     * 
     * @param {boolean} o.allowsPostMethodOverride
     * a boolean representing whether or not to allow clients to override HTTP request methods with another method
     * using the `X-HTTP-Method-Override` or `X-Method-Override` or `X-HTTP-Method` headers.
     * If this value is `true`, the method override is allowed, otherwise it is not allowed.
     * 
     * By default, the method override is not allowed, i.e. this value is set to `false`.
     * 
     * Note that this parameter only affects `POST` requests.
     * Other kinds of requests will not be overridden regardless this parameter.
     * 
     * @param {boolean} o.parsesQueryAsJson
     * a boolean representing whether or not to parse queries in incoming requests as JSON.
     * 
     * By default, queries are parsed as JSON, i.e. this value is set to `true`.
     * 
     */
    constructor(o) {
        if (o === null || typeof o !== "object") {
            throw new TypeError(`${o} is not a non-null object`);
        }
        const trailing_slash_policy_       = o.trailingSlashPolicy ?? "remove";
        const allows_post_method_override_ = o.allowsPostMethodOverride ?? false;
        const parses_query_as_json_        = o.parsesQueryAsJson ?? true;

        if (typeof trailing_slash_policy_ !== "string") {
            throw new TypeError(`${trailing_slash_policy_} is not a string`);
        } else if (!Object.prototype.hasOwnProperty.call(TrailingSlashPolicy, trailing_slash_policy_)) {
            throw new TypeError(`"${trailing_slash_policy_}" is not a valid trailing slash policy name`);
        } else if (typeof allows_post_method_override_ !== "boolean") {
            throw new TypeError(`${allows_post_method_override_} is not a boolean`);
        } else if (typeof parses_query_as_json_ !== "boolean") {
            throw new TypeError(`${parses_query_as_json_} is not a boolean`);
        }
        
        const server_  = http.createServer((request, response) => {
            this.route(request, response);
        });

        this.#trailing_slash_policy       = trailing_slash_policy_;
        this.#allows_post_method_override = allows_post_method_override_;
        this.#parses_query_as_json        = parses_query_as_json_;
        this.#server                      = server_;
    }

    /**
     * Listens for connections.
     * @param {number} port a port number to be listened to
     * @returns {this}
     */
    listen(port) {
        this.#server.listen(port);
        return this;
    }

    /**
     * Enables the given web entity if it is not capable.
     * 
     * @param {WebEntity} webEntity a web entity to be enabled 
     * @returns {this}
     */
    enable(webEntity) {
        if (webEntity instanceof WebEntity) {
            const path = webEntity.path;
            const old_entity = this.#web_entity_map.get(path);
            if (old_entity != null && webEntity !== old_entity) {
                throw new Error(`${JSON.stringify(path.pattern)} is already used for other entity`);
            } else if (old_entity == null) {
                this.#web_entity_map.set(path, webEntity);
            }
        }
        return this;
    }

    /**
     * Disables the given web api if it is capable.
     * 
     * @param {WebEntity} webEntity a web entity to be disabled
     * @returns {this}
     */
    disable(webEntity) {
        if (webEntity instanceof WebEntity) {
            const path = webEntity.path;
            const cur_entity = this.#web_entity_map.get(path);
            if (cur_entity === webEntity) {
                this.#web_entity_map.delete(path);
            }
        }
        return this;
    }

    /**
     * Routes the given request and builds the corresponding response.
     * 
     * @param {http.IncomingMessage} request a request coming from a client
     * @param {http.OutgoingMessage} response the response corresponding to the incoming request
     */
    async route(request, response) {
        const { ok: raw_request_desc, error } = await Result(RequestParser.parse(request));

        if (error instanceof Error) {
            console.error(error);

            const status_code = 400;
            const message     = "Bad Request";
            const body_data   = new TextEncoder().encode(JSON.stringify({error: { message: message, status: status_code } }, null, null));

            response.writeHead(status_code, message, {"content-length": Buffer.byteLength(body_data), "content-type": "application/json" });
            response.write(body_data, "utf-8");
            response.end();

            return;
        }

        /** @type {string} */
        const path            = this.#formatRequestPath(raw_request_desc.path);
        /** @type {{[key: string]: string}} */
        const raw_query       = raw_request_desc.query;
        /** @type {({ [header_name: string]: { value: string, params: {[param_name: string]: string }? }[] })} */
        const headers         = raw_request_desc.headers;
        /** @type {Buffer | string | {[key: string]: number | string | boolean | object | Uint8Array | null }} */
        const body            = raw_request_desc.body;
        /** @type {string} */
        const original_method = raw_request_desc.method;
        const method          = this.#resolveMethodOverride(original_method, headers);
        //  Used for invoking WebApi's method.
        const method_lc       = method.toLowerCase();

        const query           = this.#parses_query_as_json ? ((rq) => {
                /** @type {({ [param_name: string]: any })} */
                const q = {};
                for (const k in rq) {
                    const v = rq[k];
                    try {
                        q[k] = parseJson(v);
                    } catch(e) {
                        console.warn(`${k}=${v} cannot be parsed as JSON. Given string is used instead.`);
                        q[k] = v;
                    }
                }
                return q;
            })(raw_query) :
            raw_query
        ;

        //  Used for verifying the request if needed.
        const request_desc = { method: original_method, path, headers, body, query };
        const path_pattern = new Pattern({ pattern: Pattern.escape(path) });

        const endpoint = this.#web_entity_map.get(path_pattern);

        if (endpoint == null) {
            const status_code = 404;
            const message     = `${path} not found`;
            if (method === "HEAD") {
                response.writeHead(status_code, message);
            } else {
                const body_data = new TextEncoder().encode(JSON.stringify({error: { message, status: status_code } }, null, null));
                const content_length = body_data.length;
                response.writeHead(status_code, message, { "content-length": content_length, "content-type": "application/json" });
                response.write(body_data);
            }
            response.end();
        } else if (
            !((endpoint instanceof WebResource) && method === "GET") &&
            !((endpoint instanceof WebApi)      && WebApi.supports(endpoint, method))
        ) {
            const status_code  = 405;
            const message      = `${method} is not allowed`;
            if (method === "HEAD") {
                response.writeHead(status_code, message);
            } else {
                const body_data = new TextEncoder().encode(JSON.stringify({
                    error: {
                        message,
                        status: status_code
                    }
                }, null, null));
                response.writeHead(status_code, message, {
                    "content-length": Buffer.byteLength(body_data),
                    "content-type"  : "application/json"
                });
                response.write(body_data);
            }
            response.end();
        } else {
            const verification_result = (await endpoint.verify(request_desc)) ?? ({ ok: false });

            if (!verification_result.ok) {
                const failed_scheme = verification_result.scheme;
                const status_code   = (failed_scheme != null) ? (verification_result.status ?? 401) : 401;
                const message       = status_code === 401 ?
                        "Unauthorized" :
                    status_code === 403 ?
                        "Forbidden" :
                        "Bad Request"
                ;
                const headers       = {};

                if (failed_scheme == null) {
                    const challenges = await endpoint.getChallenges();
                    headers["www-authenticate"] = challenges.join(", ");
                // } else if (status_code === 401) {
                } else {
                    let www_authenticate_value = await endpoint.getChallenge(failed_scheme);
                    const reason = verification_result.reason;
                    if (reason != null) {
                        if (www_authenticate_value === failed_scheme) {
                            www_authenticate_value += " ";
                        } else {
                            www_authenticate_value += ", ";
                        }
                        const reason_params = [];
                        for (const k in reason) {
                            if (!Object.prototype.hasOwnProperty.call(reason, k)) { continue; }
                            const v = reason[k];
                            if (typeof v === "string" && v.length >= 2 && v.startsWith("\"") && v.endsWith("\"")) {
                                // already quoted but it may be malformed.
                                const wellformed = v.slice(1, -1).replaceAll(/\\*\"/g, (s) => (s.length % 2 === 1 ? "\\" + s : s));
                                reason_params.push(`${k}="${wellformed}"`);
                            } else {
                                reason_params.push(`${k}=${JSON.stringify(v)}`);
                            }
                        }
                        www_authenticate_value += reason_params.join(", ");
                    }

                    headers["www-authenticate"] = www_authenticate_value;
                }

                let body_data = null;
                if (method !== "HEAD") {
                    body_data = new TextEncoder().encode(JSON.stringify({
                        error: {
                            status: status_code
                        }
                    }, null, null));
                    
                    headers["content-length"] = Buffer.byteLength(body_data);
                    headers["content-type"]   = "application/json";
                }

                response.writeHead(status_code, message, headers);
                
                if (body_data != null) {
                    response.write(body_data);
                }

                response.end();
            } else if (endpoint instanceof WebResource) {
                const result = await Result(endpoint.get(request_desc.path, ...request_desc.headers["accept"]));

                /**
                 * @type {({
                 *      contentType: string,
                 *      body: string | Uint8Array 
                 * })}
                 */
                const ok     = result.ok ?? { contentType: "text/plain", body: "" };
                const error  = result.error;
                if (error instanceof Error) {
                    console.error(__filename, ":", error);

                    const e = (error instanceof WebApiError) ?
                        error :
                        new InternalServerError(`Internal server error: ${error.message}`, { cause: error, description: "Something went wrong" })
                    ;
                    const status_code = e.statusCode;
                    const retry_after = e.retryAfter;

                    const body_data   = new TextEncoder().encode(JSON.stringify({ error: { message: e.description, status: status_code }}, null, null));

                    if (retry_after !== undefined) {
                        response.writeHead(status_code, {
                            "content-length": Buffer.byteLength(body_data),
                            "content-type"  : "application/json",
                            "retry-after"   : retry_after
                        });
                    } else {
                        response.writeHead(status_code, {
                            "content-length": Buffer.byteLength(body_data),
                            "content-type"  : "application/json"
                        });
                    }

                    response.write(body_data);
                } else {

                    const { contentType: content_type, body: response_body } = ok;

                    const body_data    = typeof response_body === "string" ?
                        new TextEncoder().encode(response_body) :
                        response_body
                    ;

                    response.writeHead(200, { "content-length": Buffer.byteLength(body_data), "content-type": content_type });
                    response.write(body_data);
                }

                response.end();
            } else {
                const methods_should_ignore_content = new Set([ "GET", "HEAD", "DELETE" ]);
                const params =  merge({}, query);
                if (!methods_should_ignore_content.has(method)) {
                    merge(params, (typeof body === "string" || (body instanceof Buffer)) ? { body } : body);
                }
                {
                    const extracted = endpoint.path.extract(request_desc.path)?.params;
                    if (extracted != null) {
                        for (const k in extracted) {
                            if (!Object.prototype.hasOwnProperty.call(extracted, k)) { continue; }

                            //  decoding must be done one word by one word because an encoded word may contain some special characters such like "/".
                            extracted[k] = decodeURIComponent(extracted[k]);
                        }
                        merge(params, extracted);
                    }
                }

                const result = await Result(endpoint[method_lc](params));
                const ok     = result.ok ?? {};
                const error  = result.error;
                if (error instanceof Error) {
                    console.error(__filename, ":", error);

                    const e = (error instanceof WebApiError) ?
                        error :
                        new InternalServerError(`Internal server error: ${error.message}`, { cause: error, description: "Something went wrong" })
                    ;
                    const status_code = e.statusCode;
                    const retry_after = e.retryAfter;

                    const body_data   = new TextEncoder().encode(JSON.stringify({ error: { message: e.description, status: status_code }}, null, null));

                    if (retry_after !== undefined) {
                        response.writeHead(status_code, {
                            "content-length": Buffer.byteLength(body_data),
                            "content-type"  : "application/json",
                            "retry-after"   : retry_after
                        });
                    } else {
                        response.writeHead(status_code, {
                            "content-length": Buffer.byteLength(body_data),
                            "content-type"  : "application/json"
                        });
                    }

                    response.write(body_data);
                } else if (method === "HEAD") {
                    response.writeHead(204, ok);
                } else if (method === "PUT") {
                    const { statusCode: status_code_override, noContent: no_content, created: created, ...response_headers } = ok;
                    const status_code = (typeof no_content === "boolean" && typeof created === "boolean") ?
                            200 :
                        (typeof no_content === "boolean" && no_content) ?
                            204 :
                        (typeof created === "boolean" && created) ?
                            201 :
                        (Number.isInteger(status_code_override) && 200 <= status_code_override && status_code_override <= 599) ?
                            status_code_override :
                            200
                    ;
                    if (typeof no_content === "boolean" && typeof created === "boolean") {
                        console.warn(`Returned object from ${method} request has both "noContent" and "created" properties. 200 OK is used instead 201 Created or 204 No Content.`);
                    } else if (!(status_code === 200 || status_code === 201 || status_code === 204)) {
                        console.warn(`Status code associated with ${method} request is set to ${status_code} which is neither 200 OK nor 201 Created nor 204. It may break ${method} semantics.`);
                    }
                    response.writeHead(status_code, response_headers);
                } else if (method === "DELETE") {
                    const { statusCode: status_code_override, noContent: no_content, accepted: accepted, ...response_body } = ok;
                    const status_code = (typeof no_content === "boolean" && typeof accepted === "boolean") ?
                            200 :
                        (typeof no_content === "boolean" && no_content) ?
                            204 :
                        (typeof accepted === "boolean" && accepted) ?
                            202 :
                        (Number.isInteger(status_code_override) && 200 <= status_code_override && status_code_override <= 599) ?
                            status_code_override :
                            200
                    ;
                    if (typeof no_content === "boolean" && typeof accepted === "boolean") {
                        console.warn(`Returned object from ${method} request has both "noContent" and "created" properties. 200 OK is used instead 202 Accepted or 204 No Content.`);
                    } else if (!(status_code === 200 || status_code === 202 || status_code === 204)) {
                        console.warn(`Status code associated with ${method} request is set to ${status_code} which is neither 200 OK nor 202 Accepted nor 204 No Content. It may break ${method} semantics.`);
                    }
                    if (status_code === 204) {
                        response.writeHead(status_code);
                    } else {
                        const content_type = "application/json";
                        const body_data    = new TextEncoder().encode(JSON.stringify(response_body, null, null));
                        response.writeHead(status_code, { "content-length": Buffer.byteLength(body_data), "content-type": content_type });
                        response.write(body_data);
                    }
                } else {
                    const { statusCode: status_code_override, ...response_body } = ok;
                    const status_code = (Number.isInteger(status_code_override) && 200 <= status_code_override && status_code_override <= 599) ?
                        status_code_override :
                        200
                    ;
                    if (status_code === 204) {
                        response.writeHead(status_code);
                    } else {
                        const content_type = "application/json";
                        const body_data    = new TextEncoder().encode(JSON.stringify(response_body, null, null));
                        response.writeHead(status_code, { "content-length": Buffer.byteLength(body_data), "content-type": content_type });
                        response.write(body_data);
                    }
                }
                response.end();
            }
        }
    }

    /**
     * Formats the given path.
     * 
     * @param {string} path the given path
     * @returns formatted path
     */
    #formatRequestPath(path) {
        switch (this.trailingSlashPolicy) {
            case "remove": {
                return path.replace(/\/*$/, "");
            }
            case "add": {
                return path.replace(/\/*$/, "/");
            }
            case "asis":
            default: {
                return path;
            }
        }
    }
    /**
     * Resolves HTTP method override.
     * 
     * The override is applied only if the original request method is POST and the request headers contain a method override directive.
     * 
     * @param {string} method 
     * @param {{[header_name: string]: ({ value: string, params: { [param_name: string]: string } })[] }?} headers 
     * @returns A string representing the HTTP method name to be used.
     * 
     */
    #resolveMethodOverride(method, headers) {
        if (!this.allowsPostMethodOverride || method !== "POST" || headers == null) {
            return method;
        }

        const http_method          = headers["x-http-method"];
        const http_method_override = headers["x-http-method-override"];
        const method_override      = headers["x-method-override"];

        if (http_method != null) {
            return http_method[0].value.toUpperCase();
        } else if (http_method_override != null) {
            return http_method_override[0].value.toUpperCase();
        } else if (method_override != null) {
            return method_override[0].value.toUpperCase();
        }

        return method;
    }

    #server;
    #trailing_slash_policy;
    #allows_post_method_override;
    #parses_query_as_json;
    /** @type {PatternMap<WebEntity>} */
    #web_entity_map = new PatternMap();
}

module.exports = { Router };
