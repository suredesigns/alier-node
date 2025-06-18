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

const { AbstractAuthProtocol } = require("./Auth.js");
const { Pattern } = require("./Pattern.js");

/**
 * @abstract
 * 
 * An abstract class of Web entities, i.e. API endpoints and data resources.
 * (This wording is introduced just for explanation and it is not commonly used.
 *  Where "API endpoints" means a set of features for manipulating a server's state from its clients,
 *  and "data resources" means a set of conceptually static data on a server which is allowed to access from clients
 * ).
 * 
 * This class is not intended for direct use.
 * Implementers of Web interfaces, MUST define the subclass of this and supply the subclass to the API users.
 * 
 * @see
 * - {@link WebApi}
 * - {@link WebResource}
 * 
 */
class WebEntity {

    /**
     * A pattern representing an unique path to the corresponding Web entity.
     * 
     * Where "unique" means that two sets consisting of strings determined by two different patterns have no intersection.
     * 
     * @type {Pattern}
     */
    get path() { return this.#path; }

    /**
     * A series of authentication protocols.
     */
    get authProtocols() { return this.#auth_protocols.values(); }

    /**
     * Weather or not the Web entity requires authentication.
     */
    get authRequired() { return this.authProtocols.next().value !== undefined; }

    /**
     * @async 
     * 
     * Verifies an incoming request.
     * 
     * If this function returns `false`, i.e. the request is invalid,
     * `Router` will make a "401 Unauthorized" response to the client sent the invalid request.
     * 
     * @param {(
     *  {
     *      method : "GET"     |
     *               "POST"    |
     *               "PUT"     |
     *               "DELETE"  |
     *               "HEAD"    |
     *               "OPTIONS" |
     *               "PATCH"   ,
     *      path   : string    ,
     *      body   : string    |
     *               Buffer    |
     *               { [key: string]: string | Uint8Array },
     *      headers: {
     *          [header_name: string]: {
     *              value : string,
     *              params: { [param_name: string]: string } | null,
     *          }[]
     *      },
     *      query: {
     *          [param_name: string]: any
     *      }
     *  }
     * )} request 
     * Incoming request to be verified.
     * 
     * @returns {Promise<(
     *  {
     *      ok    : boolean
     *  }
     * ) | (
     *  {
     *      ok    : boolean,
     *      scheme: string,
     *      status: number?,
     *      reason: ({
     *          [param_name: string]: number | string | null | boolean
     *      })?
     *  }
     * )>} an object representing a verification result.
     * 
     * -    `ok` represents whether or not the request is accepted.
     *      The incoming request is valid if `ok` is set to `true`, otherwise `false`.
     * -    `scheme` represents the kind of the authentication/authorization scheme that has failed.
     * -    `status` represents a HTTP status code. Typically it is set to `400`, `401`, or `403`.
     * -    `reason` describes the error details.
     *      The shape of this object is vary depending on what authentication/authorization scheme has failed.
     *      e.g., when Bearer scheme authentication failed, the following parameters will be set as the reason's properties:
     * 
     *      -   `error`            : `string`
     *          -   a string representing an error code.
     *              According to {@link https://www.rfc-editor.org/rfc/rfc6750.html#section-3.1 | IETF RFC 6750}, one of the following is set:
     *              -   `"invalid_request"`     (with HTTP 400 Bad Request)
     *              -   `"invalid_token"`       (with HTTP 401 Unauthorized)
     *              -   `"insufficient_scope"`  (with HTTP 403 Forbidden)
     * 
     *      -   `error_description`: `string`
     *          -   a string representing a human-readable description of the authentication/authorization error.
     * 
     * Any of the above properties except the `ok` property is optional.
     * However, if the result contains the status and/or the reason, it should have the scheme property.
     * 
     */
    async verify(request) {
        if (!this.authRequired) {
            return { ok: true };
        } else {
            const authorization = request.headers?.authorization?.[0];
            if (authorization == null) {
                return { ok: false };
            }

            const auth_protocol = this.getAuthProtocol(authorization.params.scheme);

            return (auth_protocol == null) ? { ok: false } : auth_protocol.verify(request);
        }
    }

    /**
     * Gets all challenges which will be accepted by the target web entity.
     * 
     * The challenges are used for `WWW-Authenticate` field values.
     * `WWW-Authenticate` field is set as a header of a response whose status code is 401 Unauthorized.
     * 
     * @returns array of challenges.
     * @see
     * - {@link WebEntity.getChallenge}
     */
    async getChallenges() {
        const challenge_promises = [];

        for (const protocol of this.authProtocols) {
            challenge_promises.push(this.getChallenge(protocol.scheme));
        }

        const challenges = [];
        for (const challenge of await Promise.all(challenge_promises)) {
            if (challenge !== undefined) {
                challenges.push(challenge);
            }
        }
        return challenges;
    }

    /**
     * Gets an object representing an authentication protocol by the target protocol scheme.
     * 
     * @param {string} scheme
     * a string representing a scheme of a challenge to be obtained.
     *  
     * @returns authentication protocol.
     * @see
     * - {@link WebEntity.getChallenges}
     */
    getAuthProtocol(scheme) {
        return this.#auth_protocols.get(scheme);
    }

    /**
     * Gets a challenge by the target protocol scheme.
     * 
     * The challenges are used for `WWW-Authenticate` field values.
     * `WWW-Authenticate` field is set as a header of a response whose status code is 401 Unauthorized.
     * 
     * @param {string} scheme
     * a string representing a scheme of a challenge to be obtained.
     *  
     * @returns challenge value.
     * @see
     * - {@link WebEntity.getChallenges}
     */
    async getChallenge(scheme) {
        if (typeof scheme !== "string") { return undefined; }

        return this.getAuthProtocol(scheme)?.getChallenge();
    }

    /**
     * @constructor
     * 
     * This constructor MUST be called via the subclass's constructor.
     * If you try to operate `new` to this class directly, then `TypeError` will be thrown.
     * 
     * @param {object} o 
     * @param {string} o.path
     * a string representing an unique path to the corresponding Web entity.
     * 
     * @param {boolean} o.isCaseSensitive
     * a boolean indicating whether or not comparison is done in a case-sensitive manner.
     * 
     * @param { AbstractAuthProtocol[] | null} o.authProtocols
     * a list of protocols which are used for authorization processes.
     * 
     * @throws {SyntaxError}
     * -  when instantiating this class directly.
     * 
     * @throws {TypeError}
     * -  when the given argument `o` is not a non-null object.
     * -  when the given value `o.path` is not a string.
     * -  when the given value `o.path` is starting with an asterisk `"*"` preceding  a slash `"/"`.
     * -  when the given value `o.isCaseSensitive` is not a boolean.
     * -  when the given value `o.authProtocols` is neither null nor an object.
     * -  when the given value `o.authProtocols` is a non-null object but not an iterable.
     * -  when the given value `o.authProtocols` is an iterable containing an entry which is not an `AbstractAuthProtocol`.
     */
    constructor(o) {
        if (new.target === WebEntity) {
            throw new SyntaxError(`${WebEntity.name} cannot be instantiated dirlectly`);
        } else if (o === null || typeof o !== "object") {
            throw new TypeError(`${o} is not a non-null object`);
        }

        const path_              = o.path,
              auth_protocols_    = o.authProtocols,
              is_case_sensitive_ = o.isCaseSensitive ?? false
        ;

        if (typeof path_ !== "string") {
            throw new TypeError(`${path_} is not a string`);
        } else if (path_.startsWith("*/")) {  //  to prevent backward/partial matching
            throw new TypeError(`Path pattern should not start with "*/" but ${JSON.stringify(path_)} was given`);
        } else if (typeof is_case_sensitive_ !== "boolean") {
            throw new TypeError(`${is_case_sensitive_} is not a boolean`);
        } else if (!(auth_protocols_ == null || typeof auth_protocols_ === "object")) {
            throw new TypeError(`${auth_protocols_} is neither null nor an object`);
        } else if (auth_protocols_ != null) {
            if (typeof auth_protocols_[Symbol.iterator] !== "function") {
                throw new TypeError(`${auth_protocols_} is not an iterable`);
            } else {
                for (const protocol of auth_protocols_) {
                    if (!(protocol instanceof AbstractAuthProtocol)) {
                        throw new TypeError(`${protocol} is not an AuthProtocol`);
                    }
                }
            }
        }

        const protocol_map = new Map();

        if (auth_protocols_ != null) {
            for (const protocol of auth_protocols_) {
                protocol_map.set(protocol.scheme, protocol);
            }
        }

        this.#path           = new Pattern({ pattern: path_, isCaseSensitive: is_case_sensitive_ });
        this.#auth_protocols = protocol_map;
    }

    /** @type {Pattern} */
    #path;

    /** @type {Map<string, AbstractAuthProtocol>} */
    #auth_protocols;
}

module.exports = { WebEntity };
