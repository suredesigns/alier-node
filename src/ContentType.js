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
 * @class
 * 
 * A class of objects representing content types (also known as MIME types) and those corresponding extensions.
 */
class ContentType {
    /**
     * the major type part of the target content type.
     */
    get type() {
        return this.#type;
    }

    /**
     * the subtype part of the target content type.
     */
    get subtype() {
        return this.#subtype;
    }

    /**
     * A series of extensions associated with the target content type.
     */
    get extensions() {
        return this.#extensions.values();
    }

    /**
     * Converts the target content type to a string.
     * 
     * @returns
     * A string representing the content type.
     */
    toString() {
        return `${this.type}/${this.subtype}`;
    }

    /**
     * Converts the target content type to a string.
     * 
     * @returns
     * A string representing the content type.
     */
    valueOf() {
        return this.toString();
    }

    /**
     * @constructor
     * 
     * Creates a new `ContentType` instance if the given content type is not registered.
     * Otherwise, an instance previously created is reused.
     * 
     * @param {string} contentType 
     * A string representing a content type (also known as a MIME type).
     * 
     * @param  {...string} extensions 
     * A sequence of strings representing extensions of files to be associated with the given content type.
     * 
     * If the given content type is already registered, the given extensions are merged to the existing associated extensions.
     * 
     * @throws {TypeError}
     * -  when the given argument {@link contentType} is not a string
     * -  when the given argument {@link contentType} is not a valid content type
     * -  when the given argument {@link extensions} contains a non-string value
     */
    constructor(contentType, ...extensions) {
        const content_type_ = contentType;
        /**
         * @type {Set<string>}
         */
        const extensions_   = new Set();

        if (typeof content_type_ !== "string") {
            throw new TypeError(`${content_type_} is not a string`);
        } else if (!ContentType.isContentType(content_type_)) {
            throw new TypeError(`${content_type_} is not a valid Content-Type`);
        }

        const [ type_, subtype_ ] = content_type_.split("/").map(s => s.toLowerCase());

        for (const extension of extensions) {
            if (typeof extension !== "string") {
                throw new TypeError(`${extension} is not a string`);
            }
            
            const extension_ = (extension.startsWith(".") ? extension.slice(1) : extension).toLowerCase();

            extensions_.add(extension_);
        }

        const other = ContentType.get(content_type_);

        this.#type       = type_;
        this.#subtype    = subtype_;
        this.#extensions = extensions_;

        if (other instanceof ContentType) {
            for (const extension of extensions_) {
                if (other.#extensions.has(extension)) { continue; }

                other.#extensions.add(extension);

                let associated_types = ContentType.#ext_repos.get(extension);

                if (associated_types === undefined) {
                    associated_types = new Set();
                    ContentType.#ext_repos.set(extension, associated_types);
                }

                associated_types.add(other);
            }
            return other;
        } else {
            let subtype_map = ContentType.#type_repos.get(type_);

            if (subtype_map === undefined) {
                subtype_map = new Map();
                ContentType.#type_repos.set(type_, subtype_map);
            }

            subtype_map.set(subtype_, this);
            for (const extension of extensions_) {
                let associated_types = ContentType.#ext_repos.get(extension);

                if (associated_types === undefined) {
                    associated_types = new Set();
                    ContentType.#ext_repos.set(extension, associated_types);
                }

                associated_types.add(this);
            }
        }
    }

    /**
     * Gets a `ContentType` corresponding the given content type string.
     * 
     * @param {string} contentType 
     * A string representing a content type.
     * 
     * @returns
     * a `ContentType` if the given content type is registered, otherwise `undefined`.
     */
    static get(contentType) {
        const content_type = contentType;
        if (!(typeof content_type === "string" && ContentType.isContentType(content_type))) {
            return undefined;
        } else {
            const [ type, subtype ] = content_type.split("/").map(s => s.toLowerCase());

            return ContentType.#type_repos.get(type)?.get(subtype);
        }
    }

    /**
     * Gets a sequence of content types associated with the given extension.
     * 
     * @param {string} extension 
     * A string representing an extension associated with the desired content type.
     * 
     * @returns
     * a sequence of `ContentType`s.
     * 
     * @throws {TypeError}
     * -  when the given argument {@link extension} is not a string
     */
    static typesOf(extension) {
        if (typeof extension !== "string") {
            throw new TypeError(`${extension} is not a string`);
        }

        const extension_ = (extension.startsWith(".") ? extension.slice(1) : extension).toLowerCase();

        const candidates = ContentType.#ext_repos.get(extension_);
        if (candidates === undefined) {
            return [];
        } else {
            return [...candidates];
        }
    }

    /**
     * 
     * @param {string} s 
     * a string to be tested whether or not it is a valid content type.
     * 
     * @returns
     * `true` if the given string is a valid content type, `false` otherwise.
     */
    static isContentType(s) {
        const tchar = String.raw`\!\#\$\%\&\'\*\+\-\.\^\_\`\|\~0-9a-zA-Z`;
        const token = String.raw`[${tchar}]+`;
        const media_type_expr = new RegExp(String.raw`^${token}\/${token}$`);

        return (typeof s === "string" && media_type_expr.test(s));
    }

    #type;
    #subtype;
    #extensions;
    /**
     * @type {Map<string, Map<string, ContentType>>}
     */
    static #type_repos = new Map();

    /**
     * @type {Map<string, Set<ContentType>>}
     */
    static #ext_repos = new Map();
}

const _common_content_type_defs = [
    // [ content-type, ... extensions ]
    // application/*
    [ "application/json"             , "json"   ],
    [ "application/ld+json"          , "jsonld" ],
    [ "application/xml"              , "xml"    ],
    [ "application/zip"              , "zip"    ],
    [ "application/x-zip-compressed" , "zip"    ],
    [ "application/x-bzip"           , "bz"     ],
    [ "application/x-bzip2"          , "bz2"    ],
    [ "application/msword"           , "doc"    ],
    [ "application/epub+zip"         , "epub"   ],
    [ "application/gzip"             , "gz"     ],
    [ "application/x-gzip"           , "gz"     ],
    [ "application/x-tar"            , "tar"    ],
    [ "application/java-archive"     , "jar"    ],
    [ "application/ogg"              , "ogx"    ],
    [ "application/pdf"              , "pdf"    ],
    [ "application/vnd.ms-powerpoint", "ppt"    ],
    [ "application/vnd.ms-excel"     , "xls"    ],
    [ "application/vnd.oasis.opendocument.presentation", "odp"  ],
    [ "application/vnd.oasis.opendocument.spreadsheet" , "ods"  ],
    [ "application/vnd.oasis.opendocument.text"        , "odt"  ],
    [ "application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx" ],
    [ "application/vnd.openxmlformats-officedocument.wordprocessingml.document"  , "docx" ],
    [ "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"        , "xlsx" ],
    // font/*
    [ "font/otf"  , "otf"   ],
    [ "font/ttf"  , "ttf"   ],
    [ "font/woff" , "woff"  ],
    [ "font/woff2", "woff2" ],
    // text/*
    [ "text/plain"       , "txt"  ],
    [ "text/csv"         , "csv"  ],
    [ "text/css"         , "css"  ],
    [ "text/html"        , "html" , "htm" ],
    [ "text/javascript"  , "js", "cjs", "mjs" ],
    [ "text/xml"         , "xml"  ],
    // audio/*
    [ "audio/aac"        , "aac"  , "mp4" , "m4a" ],
    [ "audio/3gpp"       , "3gpp" , "3gp" ],
    [ "audio/3gpp2"      , "3gpp2", "3g2" ],
    [ "audio/flac"       , "flac" ],
    [ "audio/wav"        , "wave" , "wav" ],
    [ "audio/ogg"        , "ogg"  , "oga" ],
    [ "audio/opus"       , "opus" ],
    [ "audio/mp4"        , "m4a"  ],
    [ "audio/mpeg"       , "mp3"  ],
    [ "audio/webm"       , "weba" ],
    [ "audio/x-matroska" , "mka" ],
    // video/*
    [ "video/mp4"        , "mp4"  ],
    [ "video/webm"       , "webm" ],
    [ "video/ogg"        , "ogg"  , "ogv" ],
    [ "video/mpeg"       , "mpeg" , "mpg" ],
    [ "video/quicktime"  , "mov" ],
    [ "video/mp2t"       , "ts" ],
    [ "video/x-matroska" , "mkv" ],
    [ "video/3gpp"       , "3gpp" , "3gp" ],
    [ "video/3gpp2"      , "3gpp2", "3g2" ],
    // image/*
    [ "image/apng"       , "apng"],
    [ "image/png"        , "png" ],
    [ "image/avif"       , "avif"],
    [ "image/bmp"        , "bmp" ],
    [ "image/tiff"       , "tif" , "tiff" ],
    [ "image/gif"        , "gif" ],
    [ "image/webp"       , "webp" ],
    [ "image/jpeg"       , "jpeg", "jpg" ],
    [ "image/svg+xml"    , "svg" ],
];

for (const [content_type, ...extensions] of _common_content_type_defs) {
    new ContentType(content_type, ...extensions);  //  register a content type and its associated extensions.
}

module.exports = {
    ContentType
};
