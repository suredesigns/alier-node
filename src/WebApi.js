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

const { WebEntity } = require("./_WebEntity.js");

const { MethodNotAllowedError } = require("./WebApiError.js");
const { AbstractAuthProtocol } = require("./Auth.js");

/**
 * @type {Set<"GET" | "POST" | "PUT" | "DELETE" | "HEAD" | "OPTIONS" | "PATCH">}
 */
const HttpMethods = new Set([
    "GET"    ,
    "POST"   ,
    "PUT"    ,
    "DELETE" ,
    "HEAD"   ,
    "OPTIONS",
    "PATCH"
]);

/**
 * @abstract
 * 
 * An abstract class of endpoints of Web APIs.
 * 
 * This class is not intended for direct use.
 * Implementers of Web APIs, MUST define the subclass of this and supply the subclass to the API users.
 * 
 * @see
 * - {@link WebEntity}
 */
class WebApi extends WebEntity {

    /**
     * An interface for HTTP GET request.
     * 
     * This method MUST be overridden and NEVER be called its base implementation.
     * 
     * @param {object} params parameters for GET API.
     * 
     * Ordinarily, this object is provided by the Router class and
     * the user, the implementor of subclasses of WebApi, does not need to know the details of the incoming request.
     * 
     * @throws {MethodNotAllowedError}
     * The base implementation is called or the target subclass does not override this method.
     */
    async get(params) { throw new MethodNotAllowedError("GET", { description: "\"GET\" method is not allowed" }); }
    
    /**
     * An interface for HTTP HEAD request.
     * 
     * This method MUST be overridden and NEVER be called its base implementation.
     * 
     * @param {object} params parameters for HEAD API.
     * 
     * Ordinarily, this object is provided by the Router class and
     * the user, the implementor of subclasses of WebApi, does not need to know the details of the incoming request.
     * 
     * @throws {MethodNotAllowedError}
     * The base implementation is called or the target subclass does not override this method.
     */
    async head(params) { throw new MethodNotAllowedError("HEAD", { description: "\"HEAD\" method is not allowed" }); }

    /**
     * An interface for HTTP POST request.
     * 
     * This method MUST be overridden and NEVER be called its base implementation.
     * 
     * @param {object} params parameters for POST API.
     * 
     * Ordinarily, this object is provided by the Router class and
     * the user, the implementor of subclasses of WebApi, does not need to know the details of the incoming request.
     * 
     * @throws {MethodNotAllowedError}
     * The base implementation is called or the target subclass does not override this method.
     */
    async post(params) { throw new MethodNotAllowedError("POST", { description: "\"POST\" method is not allowed"}); }

    /**
     * An interface for HTTP PUT request.
     * 
     * This method MUST be overridden and NEVER be called its base implementation.
     * 
     * @param {object} params parameters for PUT API.
     * 
     * Ordinarily, this object is provided by the Router class and
     * the user, the implementor of subclasses of WebApi, does not need to know the details of the incoming request.
     * 
     * @throws {MethodNotAllowedError}
     * The base implementation is called or the target subclass does not override this method.
     */
    async put(params) { throw new MethodNotAllowedError("PUT", { description: "\"PUT\" method is not allowed."}); }

    /**
     * An interface for HTTP PATCH request.
     * 
     * This method MUST be overridden and NEVER be called its base implementation.
     * 
     * @param {object} params parameters for PATCH API.
     * 
     * Ordinarily, this object is provided by the Router class and
     * the user, the implementor of subclasses of WebApi, does not need to know the details of the incoming request.
     * 
     * @throws {MethodNotAllowedError}
     * The base implementation is called or the target subclass does not override this method.
     */
    async patch(params) { throw new MethodNotAllowedError("PATCH", { description: "\"PATCH\" method is not allowed"}); }

    /**
     * An interface for HTTP DELETE request.
     * 
     * This method MUST be overridden and NEVER be called its base implementation.
     * 
     * @param {object} params parameters for DELETE API.
     * 
     * Ordinarily, this object is provided by the Router class and
     * the user, the implementor of subclasses of WebApi, does not need to know the details of the incoming request.
     * 
     * @throws {MethodNotAllowedError}
     * The base implementation is called or the target subclass does not override this method.
     */
    async delete(params) { throw new MethodNotAllowedError("DELETE", { description: "\"DELETE\" method is not allowed"}); }

    /**
     * An interface for HTTP OPTIONS request.
     * 
     * This method MUST be overridden and NEVER be called its base implementation.
     * 
     * @param {object} params parameters for OPTIONS API.
     * 
     * Ordinarily, this object is provided by the Router class and
     * the user, the implementor of subclasses of WebApi, does not need to know the details of the incoming request.
     * 
     * @throws {MethodNotAllowedError}
     * The base implementation is called or the target subclass does not override this method.
     */
    async options(params) { throw new MethodNotAllowedError("OPTIONS", { description: "\"OPTIONS\" method is not allowed"}); }

    /**
     * @constructor
     * 
     * This constructor MUST be called via the subclass's constructor.
     * If you try to operate `new` to this class directly, then `TypeError` will be thrown.
     * 
     * @param {object} o 
     * 
     * @param {string} o.path
     * see {@link WebEntity}
     * 
     * @param {AbstractAuthProtocol[] | null} o.authProtocols
     * see {@link WebEntity}
     * 
     * @throws {SyntaxError}
     * -  when instantiating this class directly.
     * -  when the `o.path` contains a wildcard `*` either or both of the beginning and the end of it.
     */
    constructor(o) {
        super(o);

        if (new.target === WebApi) {
            throw new SyntaxError(`${WebApi.name} cannot be instantiated directly`);
        } else if (this.path.kind !== "exact") {
            throw new SyntaxError(`Exact match is required but the path pattern ${JSON.stringify(this.path.pattern)} can matching partially was given`);
        }
    }

    /**
     * Tests whether or not the given Web API endpoint supports the specified HTTP method.
     * 
     * @param {WebApi} webApi A Web API endpoint
     * @param {string} method A string representing one of HTTP methods.
     * @returns `true` if the given method is supported by the given Web API endpoint,
     * `false` otherwise.
     */
    static supports(webApi, method) {
        if (!(webApi instanceof WebApi)) { return false; }
        if (typeof method !== "string") { return false; }
        if (!HttpMethods.has(method.toUpperCase())) { return false; }

        const method_lc = method.toLowerCase();
        const proto = Object.getPrototypeOf(webApi);
        //  proto[method_lc] may invoke the corresponding getter,
        //  so to avoid extra function calls, use getOwnPropertyDescriptor here.
        const desc = Object.getOwnPropertyDescriptor(proto, method_lc);

        return desc != null && typeof desc.value === "function";
    }

    /**
     * Gets a list of methods which the given web API endpoint supports.
     * 
     * All of method names is upper-cased.
     * 
     * @param {WebApi} webApi A Web API endpoint.
     * @returns A list of methods which the given web API endpoint supports.
     */
    static supportedMethodListOf(webApi) {
        const supported = [];
        for (const method of HttpMethods) {
            if (WebApi.supports(webApi, method)) {
                supported.push(method);
            }
        }
        return supported;
    }
}

module.exports = { WebApi };
