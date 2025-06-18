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

const crypto = require("node:crypto");
const http = require("node:http");
const { Users } = require("./_CredentialsInterface.js");

const HEADER_AUTHORIZATION = "Authorization";
const HEADER_WWW_AUTHENTICATE = "WWW-Authenticate";

class AbstractAuthProtocol {
    /**
     * Get the authentication scheme.
     * @returns {string}
     */
    get scheme() {}

    /**
     * Verify the incoming request message can access resources.
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
     *  }) | http.IncomingMessage } _request
     * Incoming request to be verified.
     * @returns {Promise<(
     * {
     *   ok: boolean,
     *   status: number?,
     *   reason: any?,
     *   scheme: string?
     * }
     * )>} Verification result.
     * @see {@link WebApi.verify}
     */
    async verify(request) {}

    /**
     * Get a header field for Authentication.
     * @param {VerifyResult.reason} reason
     * Reasons for verification failure.
     * @returns {string}
     * The response header field for WWW-Authenticate
     */
    async getChallenge(reason) {}
}

class DigestAuthProtocol extends AbstractAuthProtocol {
    static scheme = "Digest";
    static algorithmMapForHash = {
        "SHA-256": "sha256",
    };
    static quotedParams = new Set(["realm", "domain", "nonce", "opaque", "qop"]);

    #credentialsTableName;
    #credentialsProjection;
    #algorithm;
    #qop;
    #realm;
    #domain;
    #secretData;
    #opaque;
    #hash;

    /**
     * @constructor
     * @param {object} params
     * Parameters for {@link https://datatracker.ietf.org/doc/html/rfc7616|HTTP Digest Access Authentication}.
     * @param {"auth"|"auth-int"|"auth,auth-int"} params.qop
     * The quality of protection.
     * @param {string} params.secretData - A string to generate nonce.
     * @param {string?} params.realm
     * Notify to user which username and password to use.
     * @param {string?} params.domain - URI to define protection space.
     * @param {"SHA-256"|undefined} params.algorithm - The algorithm to hash.
     * @param {number?} params.opaqueLength
     * A number for byte array to generate opaque.
     * @param {string?} credentialsTableName
     * The table name for Credentials. Defaults to the first table.
     * @param {object?} credentialsProjection
     * The projection map for Credentials.
     * For more details, see {@link Users.getContent}.
     * Defaults to null.
     */
    constructor(params, credentialsTableName, credentialsProjection) {
        super();

        const qop = params.qop;
        const realm = params.realm;
        const domain = params.domain;
        const algorithm = params.algorithm ?? "MD5";
        const opaqueLength = params.opaqueLength ?? 32;
        const secretData = params.secretData;

        if (secretData == null) {
            throw new TypeError("Given params does not have the secretData property");
        } else if (qop == null) {
            throw new TypeError("Given params does not have the qop property");
        } else if (
            credentialsProjection != null &&
            typeof credentialsProjection !== "object"
        ) {
            throw new TypeError("credentialsPath must be an optional object");
        }

        this.#qop = qop;
        this.#realm = realm;
        this.#domain = domain;
        this.#algorithm = algorithm;
        this.#opaque = crypto.randomBytes(opaqueLength).toString("base64");
        this.#secretData = secretData;
        this.#hash = crypto.createHash(
            DigestAuthProtocol.algorithmMapForHash[algorithm],
        );

        this.#credentialsTableName = credentialsTableName;
        this.#credentialsProjection = credentialsProjection ?? null;
    }

    get scheme() {
        return DigestAuthProtocol.scheme;
    }

    async getChallenge(reason) {
        const params = this.getChallengeParameters();
        const header = parametersToHeader(
            this.scheme,
            params,
            DigestAuthProtocol.quotedParams,
        );
        return header;
    }

    makeNonce() {
        const timestamp = Date.now();
        const hash = this.#hash.copy();
        hash.update(`${timestamp}:${this.#secretData}`);
        const nonce = hash.digest("base64");
        return nonce;
    }

    getChallengeParameters() {
        const nonce = this.makeNonce();
        const parameters = {
            nonce: nonce,
            opaque: this.#opaque,
            algorithm: this.#algorithm,
            qop: this.#qop,
        };
        if (this.#realm != null) {
            parameters.realm = this.#realm;
        }
        if (this.#domain != null) {
            parameters.domain = this.#domain;
        }
        return parameters;
    }

    async verify(request) {
        try {
            if (request instanceof http.IncomingMessage) {
                const method = request.method;
                const header = request.headers.authorization;
                const params = parseAuthorizationHeader(header);

                return await this.verifyParameters(method, params);
            } else {
                const method = request.method;
                const header = request.headers?.authorization?.[0];
                const params = header.params;

                return await this.verifyParameters(method, params);
            }
        } catch (e) {
            return { ok: false, scheme: this.scheme };
        }
    }

    async verifyParameters(method, parameters) {
        const username = parameters.username;
        const password = await Users.getContent(username, {
            tableName: this.#credentialsTableName,
            projection: this.#credentialsProjection,
        });
        const encoding = "hex";

        const a1 = `${username}:${this.#realm}:${password}`;
        const hashA1 = this.#hash.copy();
        hashA1.update(a1);
        const hashedA1 = hashA1.digest(encoding);

        const a2 = `${method}:${parameters.uri}`;
        const hashA2 = this.#hash.copy();
        hashA2.update(a2);
        const hashedA2 = hashA2.digest(encoding);

        const secret = hashedA1;
        const data = `${parameters.nonce}:${parameters.nc}:${parameters.cnonce}:${parameters.qop}:${hashedA2}`;
        const hashResponse = this.#hash.copy();
        hashResponse.update(`${secret}:${data}`);
        const response = hashResponse.digest(encoding);

        const result = response === parameters.response;

        if (password == null) {
            return { ok: false, scheme: this.scheme };
        }
        return { ok: result, scheme: this.scheme };
    }
}

function parseAuthorizationHeader(header) {
    const reParseHeader =
        /(?<scheme>[\w\-]+)(?<params>(?:\s(?:"[\w\-\.~\+\/]+=*"|[\w\-]+=(?:"(?:[^"\\]|\\.)+"|[^,"]+)),?)*)(?=$|,)/;
    const reSplitParams =
        /\b("(?:[\w\-\.~\+\/]+)=*"|(?:[\w\-]+=(?:"(?:[^"\\]|\\.)+"|[^,"]+)))(?=,|$)/g;
    const reParseParam =
        /"(?<token68>[\w\-\.~\+\/]+)=*"|(?<key>[\w\-]+)=(?:"(?<quotedValue>(?:[^"\\]|\\.)+)"|(?<noQuotedValue>[^,"]+))/;

    const parameters = {};

    const parsedHeader = reParseHeader.exec(header);
    const scheme = parsedHeader.groups?.scheme;
    if (scheme == null) {
        throw new Error("Failed to capture scheme");
    }

    for (const param of header.match(reSplitParams)) {
        const parsedParam = reParseParam.exec(param);
        const token68 = parsedParam.groups?.token68;
        if (token68 != null) {
            parameters.token68 = token68.replaceAll('\\"', '"');
        } else {
            const key = parsedParam.groups?.key;
            if (key == null) {
                throw new Error("No authorization header parameter key");
            }
            const quoted = parsedParam.groups?.quotedValue;
            const noquote = parsedParam.groups?.noQuotedValue;
            let value;
            if (quoted != null) {
                value = quoted.replaceAll('\\"', '"');
            } else if (noquote != null) {
                value = noquote;
            } else {
                throw new Error("No authorization header parameter value");
            }
            parameters[key] = value;
        }
    }

    return parameters;
}

function parametersToHeader(scheme, params, quotedParams) {
    const paramsArray = [];
    for (const key in params) {
        if (!Object.prototype.hasOwnProperty.call(params, key)) {
            continue;
        }

        const value = params[key];

        if (quotedParams.has(key)) {
            const escapedValue = JSON.stringify(value);
            // const escapedValue = value.replace('"', '\"');
            paramsArray.push(`${key}=${escapedValue}`);
        } else {
            paramsArray.push(`${key}=${value}`);
        }
    }
    const joinedParams = paramsArray.join(", ");
    const header = `${scheme} ${joinedParams}`;
    return header;
}

module.exports = { AbstractAuthProtocol, DigestAuthProtocol };
