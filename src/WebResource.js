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

const node$fs         = require("node:fs/promises");
const node$path       = require("node:path");

const { Use }         = require("./Use.js");
const { ContentType } = require("./ContentType.js");
const { WebEntity }   = require("./_WebEntity.js");
const {
    AbstractAuthProtocol
} = require("./Auth.js");

const {
    UnsupportedMediaTypeError,
    ForbiddenError,
    InternalServerError,
    BadRequestError,
    NotFoundError,
    ServiceUnavailableError
} = require("./WebApiError.js");

/**
 * @abstract
 * 
 * An abstract class of Web resources.
 * 
 * This class is not intended for direct use.
 * Implementers of Web APIs, MUST define the subclass of this and supply the subclass to the API users.
 */
class WebResource extends WebEntity {

    /**
     * The primary content type.
     */
    get contentType() {
        return this.#content_type;
    }

    /**
     * A list of allowed content types.
     * It is given as an Iterable of content types.
     */
    get allowedContentTypes() {
        return this.#getAllowedContentTypes();
    }

    /**
     * Tests whether or not the given Content-Type is acceptable and if it is acceptable,
     * returns a concrete allowed type compatible with the given type, otherwise `undefined`.
     *  
     * @param {string} contentType 
     * A string representing a Content-Type requested from a client.
     * 
     * @returns
     * A concrete allowed type compatible with the given type if it is acceptable, otherwise `undefined`.
     */
    getAllowedType(contentType) {
        /**
         * @type {string}
         */
        const content_type = contentType;

        if (!ContentType.isContentType(content_type)) {
            return undefined;
        }

        const [ main_type, sub_type ] = content_type.split("/").map(s => s.toLowerCase());
        const   is_main_wildcard = main_type === "*",
                is_sub_wildcard  = sub_type === "*"
        ;

        if (is_main_wildcard && is_sub_wildcard) {
            return this.#uses_wildcard ? undefined : this.contentType;
        } else if (is_main_wildcard) {
            for (const [allowed_main_type, allowed_sub_types] of this.#allowed_content_types.entries()) {
                if (allowed_sub_types.has(sub_type)) {
                    return `${allowed_main_type}/${sub_type}`;
                }
            }
            return undefined;
        } else if (is_sub_wildcard) {
            const allowed_sub_types = this.#allowed_content_types.get(main_type);
            const allowed_sub_type  = allowed_sub_types?.values().next().value;
            return allowed_sub_type !== undefined ? `${main_type}/${allowed_sub_type}`: undefined;
        } else {
            return this.#allowed_content_types.get(main_type)?.has(sub_type) ? `${main_type}/${sub_type}` : undefined;
        }
    }

    /**
     * Gets a resource as one of the accepted content types.
     * 
     * @param {string} path 
     * A string representing the requested path.
     * 
     * @param {...({ value: string, params: { [param_name: string]: string }? })} acceptedTypes
     * A list of descriptor of the Accept request header lines.
     * 
     * If the list is not provided, the default content type is used.
     * Otherwise, the first one in the list which matches one of the allowed content types ({@link allowedContentTypes}) is used.
     * 
     * The order of content types in the list of accepted types is sorted by Q-value if the Q-values are provided.
     * Otherwise, the order follows the definition order of the Accept request headers in the request.
     * 
     * @returns
     * Body of a response with its content-type.
     * 
     * @throws {SyntaxError}
     * -  when the given path did not match the target WebResource's path pattern
     * 
     * @throws {TypeError}
     * -  when the given path is not a string
     * -  when some of the given accepted types is not a non-null object
     * -  when the given accepted type object does not have the "value" property, or it is not a string
     * 
     * @throws {UnsupportedMediaTypeError}
     * -  when none of the given content types are allowed 
     * 
     * @throws {InternalServerError}
     * -  when the return value is neither a `string` nor an `Uint8Array`.
     */
    async get(path, ...acceptedTypes) {
        if (typeof path !== "string") {
            throw new TypeError(`${path} is not a string`);
        }

        const extracted = this.path.extract(path);
        if (extracted == null) {
            throw new SyntaxError(`${JSON.stringify(path)} does not match the pattern ${JSON.stringify(this.path.pattern)}`);
        }

        const allowed_content_type = (() => {
            /**
             * @type {[number, string][]}
             */
            const accepted_types = [];
            for (const accepted_type of acceptedTypes) {
                if (accepted_type === null || typeof accepted_type !== "object") {
                    throw new TypeError(`${accepted_type} is not a non-null object`);
                } else if (typeof accepted_type.value !== "string") {
                    throw new TypeError(`${accepted_type.value} is not a string`);
                }
                const qs = accepted_type.params?.q ?? "1";

                let q = Number(qs);
                if (Number.isNaN(q)) {
                    q = 0;
                } else if (q < 0) {
                    q = 0;
                } else if (q > 1) {
                    q = 1;
                }

                accepted_types.push([q, accepted_type.value]);
            }

            if (accepted_types.length <= 0 && !this.#uses_wildcard) {
                accepted_types.push([1, this.contentType]);
            }
            accepted_types.sort(([x,], [y,]) => ((x < y) - (x > y)));
            for (const [, accepted_type] of accepted_types) {
                const allowed_type = this.getAllowedType(accepted_type);
                if (allowed_type !== undefined) {
                    return allowed_type;
                }
            }

            if (this.#uses_wildcard) {
                const main_type = this.contentType.split("/")[0];

                for (const candidate of ContentType.typesOf(node$path.extname(path))) {
                    if (main_type === "*" || candidate.type === main_type) {
                        return candidate.toString();
                    }
                }
            }

            const unsupported_types = accepted_types.map(([, t]) => JSON.stringify(t));
            throw new UnsupportedMediaTypeError(unsupported_types, {
                description: `Requested content type(s) not supported:\n\t${unsupported_types.join("\n\t")}`
            });
        })()
        ;

        const req_desc = Object.assign({ contentType: allowed_content_type }, extracted);
        const body     = await this.#target.get(path, req_desc);

        if (!(typeof body === "string" || (body instanceof Uint8Array))) {
            const cause = new TypeError("Unexpected type of resource is obtained: it is expected to be a string or an Uint8Array");
            throw new InternalServerError(`Internal server error: ${cause.message}`, {
                description: "Something went wrong",
                cause      : cause
            });
        }

        return { contentType: allowed_content_type, body: body };
    }
    
    /**
     * @constructor
     * 
     * Creates a new `WebResource` instance.
     * 
     * Unlike {@link WebApi}, the `WebResource` class is concrete, i.e. it can be directly instantiated.
     * 
     * @param {object} o 
     * @param {string} o.path
     * see {@link WebEntity}
     * 
     * @param { AbstractAuthProtocol[] | null} o.authProtocols
     * see {@link WebEntity}
     * 
     * @param {string} o.contentType
     * a string representing a default Content-Type.
     * 
     * @param {Iterable<string>?} o.allowedContentTypes
     * a set of Content-Types.
     * 
     * @param {
     *  string |
     *  ({
     *      get(
     *          requestedPath    : string,
     *          requestDescriptor: {
     *              contentType : string,
     *              first       : string[],
     *              last        : string[],
     *              params      : ({ [param_name: string]: string })
     *          }
     *      ) => string | Uint8Array
     *  })} o.target
     * 
     * @throws {TypeError}
     * -  when the given `o.contentType` is not a string
     * -  when the given `o.allowedContentTypes` is a non-null object but not an iterable
     * -  when the given `o.contentType` is not a valid MIME format content type
     * -  when some component of `o.allowedContentTypes` is not a string
     * -  when some component of `o.allowedContentTypes` is not a valid MIME format content type
     */
    constructor(o) {
        super(o);

        const content_type_  = o.contentType;

        if (typeof content_type_ !== "string") {
            throw new TypeError(`contentType ${content_type_} is not a string`);
        } else if (o.allowedContentTypes != null && typeof o.allowedContentTypes[Symbol.iterator] !== "function") {
            throw new TypeError("allowedContentTypes must be an iterable");
        } else if (!ContentType.isContentType(content_type_)) {
            throw new TypeError(`${JSON.stringify(content_type_)} is not a content-type`);
        }

        const [ content_main_type_, content_sub_type_ ] = content_type_.split("/").map(s => s.toLowerCase());
        const uses_wildcard_  = content_main_type_ === "*" || content_sub_type_ === "*";

        /** @type {Map<string, Set<string>>} */
        const allowed_content_types_ = uses_wildcard_ ?
            new Map() :
            new Map([[content_main_type_, new Set([content_sub_type_])]])
        ;
        {
            const content_types = o.allowedContentTypes;
            if (content_types != null) {
                for (const content_type of content_types) {
                    if (typeof content_type !== "string") {
                        throw new TypeError(`${content_type} is not a string`);
                    } else if (!ContentType.isContentType(content_type)) {
                        throw new TypeError(`${JSON.stringify(content_type)} is not a content-type`);
                    }
                    const [ main_type, sub_type ] = content_type.split("/").map(s => s.toLowerCase());

                    if (allowed_content_types_.has(main_type)) {
                        allowed_content_types_.get(main_type).add(sub_type);
                    } else {
                        allowed_content_types_.set(main_type, new Set([sub_type]));
                    }
                }
            }
        }

        /**
         * @type {({
         *      get: (
         *          requestedPath    : string,
         *          requestDescriptor: {
         *              contentType: string,
         *              first      : string[],
         *              last       : string[],
         *              params     : {
         *                  [param_name: string]: string
         *          }
         *          }) => Promise<string | Uint8Array>
         * })}
         */
        const target_ = typeof o.target === "string" ? ((filepath) => {
                const norm_filepath = node$path.resolve(filepath);

                return Object.defineProperties(Object.create(null), {
                    get: {
                        enumerable: false,
                        writable  : false,
                        value     : async function get(requestedPath, requestDescriptor) {
                            const target_path_ = requestDescriptor.last.length > 0 ?
                                node$path.resolve([ norm_filepath, ...requestDescriptor.last ].join(node$path.sep)) :
                                norm_filepath
                            ;

                            if (!target_path_.startsWith(norm_filepath) ||
                                (target_path_.length > norm_filepath.length && target_path_[norm_filepath.length] !== node$path.sep)
                            ) {
                                throw new ForbiddenError(requestedPath, { description: `Permission denied to access "${requestedPath}"`});
                            }

                            let fhandle = null;
                            try {
                                fhandle = await node$fs.open(target_path_, "r");
                            } catch (e) {
                                switch (e.code) {
                                case "ENOENT":
                                case "EISDIR":  //  To hide information on file hierarchy from the client, throw NotFoundError instead of ForbiddenError
                                    throw new NotFoundError(requestedPath, {
                                        description: `"${requestedPath}" is not found`,
                                        cause      : e
                                    });
                                case "EMFILE":
                                    throw new ServiceUnavailableError(`Failed to open a file: ${target_path_}`, {
                                        description: "Service temporarily unavailable",
                                        retryAfter : 120,
                                        cause      : e
                                    });
                                default: 
                                    throw new BadRequestError(`Failed to open a file: ${target_path_}`, {
                                        description: "Malformed request",
                                        cause      : e
                                    });
                                }
                            }

                            return Use(fhandle)(async () => {
                                return fhandle.readFile().catch(e => {
                                    switch (e.code) {
                                    case "EISDIR":  //  To hide information on file hierarchy from the client, throw NotFoundError instead of ForbiddenError
                                        throw new NotFoundError(requestedPath, {
                                            description: `"${requestedPath}" is not found`,
                                            cause      : e
                                        });
                                    default: 
                                        throw new BadRequestError(`Filed to read a file: ${target_path_}`, {
                                            description: "Malformed request",
                                            cause      : e
                                        });
                                    }
                                });
                            });
                        },
                    }
                });
            })(o.target) :
            o.target
        ;

        this.#uses_wildcard         = uses_wildcard_;
        this.#content_type          = content_type_;
        this.#allowed_content_types = allowed_content_types_;
        this.#target                = target_;
    }

    *#getAllowedContentTypes() {
        for (const [main_type, sub_types] of this.#allowed_content_types.entries()) {
            for (const sub_type of sub_types) {
                yield `${main_type}/${sub_type}`;
            }
        }
    }

    /**
     * @type {boolean}
     */
    #uses_wildcard;

    /**
     * @type {string}
     */
    #content_type;

    /**
     * @type {Map<string, Set<string>>}
     */
    #allowed_content_types;

    #target;
}

module.exports = { WebResource };
