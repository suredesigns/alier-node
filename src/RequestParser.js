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
const { merge, parseJson }  = require("./Copyutil.js");

// const SingleValuedResponseHeaders = new Set([
//     "age"              , "content-length", "content-type" ,
//     "etag"             , "expires"       , "last-modified", 
//     "location"         , "retry-after"   , "server"
// ]);

// const SingleValuedRequestHeaders = new Set([
//     "authorization"      , "content-length", "content-type"       ,
//     "from"               , "host"          , "if-modified-since"  ,
//     "if-unmodified-since", "max-forwards"  , "proxy-authorization",
//     "referer"            , "user-agent"
// ]);

/**
 * tests whether or not the given string is a quoted-string.
 * 
 * @param {string} s
 * a string to be tested
 */
function _isQuotedString(s) {
    return (s.length >= 2 && s.startsWith("\"") && s.endsWith("\""));
}

/**
 * Creates a header descriptor.
 * 
 * @return {({ value: string, params: { [param_name: string]: string }?})}
 */
function _nextDesc () {
    return ({ value: "", params: null });
}

/**
 * Set the given parameter of the target header descriptor.
 * 
 * @param {({ value: string, params: ({ [param_name: string]: string })?})} desc 
 * the target header descriptor
 * @param {string} key 
 * parameter name
 * @param {string} value 
 * parameter value
 * @returns the target descriptor
 */
function _setDescParam(desc, key, value) {
    if (desc.params == null) {
        desc.params = {};
    }

    if (Object.prototype.hasOwnProperty.call(desc.params, key)) {
        throw new SyntaxError(`Duplicated parameter definition found. ${JSON.stringify(key)} is already defined.`);
    }

    desc.params[key] = (value == null) ?
            "" :
        _isQuotedString(value) ?
            parseJson(value) :
            value
    ;

    return desc;
}

/**
 * Tokenizer used in {@link _parseGenericHeaderValue}.
 * 
 * @param {IterableIterator<string>} substringIterator 
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _tokenizeGenericHeaderValue(substringIterator) {
    const comma      = String.raw`\x2c`;  //  \,
    const semicolon  = String.raw`\x3b`;  //  \;
    const equal      = String.raw`\x3d`;  //  \=
    const rest       = String.raw`[\x21\x23-\x2b\x2d-\x3a\x3c\x3e-\x7e\x80-\xff]+`;

    const token_expr = new RegExp(`${comma}|${semicolon}|${equal}|${rest}`, "g");

    const wsp_expr   = /^[\x09\x20]+$/;

    for (const s of substringIterator) {
        if (_isQuotedString(s) || wsp_expr.test(s)) {
            yield s;
        } else {
            for (const m of s.matchAll(token_expr)) {
                yield m[0];
            }
        }
    }
}

/**
 * @param {IterableIterator<string>} substringIterator 
 * An iterator provided from the caller, i.e. {@link parseHeaderValue}.
 * This iterator generates the following types of strings:
 * 
 * -  `quoted-string`: a string surrounded with a pair of double quotes.
 * -  `white-space`  : a string composed with horizontal tabs (`\x09`) and/or spaces (`\x20`).
 * -  `token`        : a string does not match both quoted-strings and white-spaces.
 * 
 * Any type of strings will not contain control characters except horizontal tabs.
 */
function* _parseGenericHeaderValue(substringIterator) {
    //  field-content = field-value field-params 
    //  field-params  = *(OWS ";" OWS param-name "=" param-value)
    //  field-value   = (vchar / obs-text) *(1*(SP / HTAB) (vchar / obs-text))

    const State = Object.freeze({
        /**
         * ```text
         * buf: (*) 
         *   OR (value-frag, value-frag / space, ..., value-frag, *)  ;  value-frag = token / "=" / quoted-str
         * 
         * |WAIT_VALUE| --> "="        --> |WAIT_VALUE|       (buf --> ("=", *))
         * |WAIT_VALUE| --> ";"        --> (len(buf) > 0) ?
         *                                 |WAIT_PARAM_NAME|  (buf --> (..., token, ";", *))
         *                               : error              (empty value)
         * |WAIT_VALUE| --> ","        --> (len(buf) > 0)
         *                                 |WAIT_VALUE|       (parsed as `field-value`; buf is cleared)
         *                               : error              (empty value)
         * |WAIT_VALUE| --> space      --> (len(buf) > 0) ?
         *                                 |WAIT_VALUE|       (buf --> (..., token, space, *))
         *                               : |WAIT_VALUE|       (whitespace is ignored)
         * |WAIT_VALUE| --> token      --> |WAIT_VALUE|       (buf --> (..., token, *))
         * |WAIT_VALUE| --> quoted-str --> |WAIT_VALUE|       (buf --> (..., quoted-str, *))
         * |WAIT_VALUE| --> end        --> (len(buf) > 0)
         *                                 |WAIT_VALUE|       (parsed as `field-value`)
         *                               : error              (empty value)
         * ```
         */
        WAIT_VALUE                 : 0x00,
        /**
         * ```text
         * buf: (..., ";", *)
         * 
         * |WAIT_PARAM_NAME| --> "="        --> error                (token is expected)
         * |WAIT_PARAM_NAME| --> ";"        --> error                (token is expected)
         * |WAIT_PARAM_NAME| --> ","        --> error                (token is expected)
         * |WAIT_PARAM_NAME| --> space      --> |WAIT_PARAM_NAME|    (whitespace is ignored)
         * |WAIT_PARAM_NAME| --> token      --> |WAIT_PARAM_KV_SEP|  (buf --> (..., ";", token, *))
         * |WAIT_PARAM_NAME| --> quoted-str --> error                (token is expected)
         * |WAIT_PARAM_NAME| --> end        --> error                (token is expected)
         * ```
         */
        WAIT_PARAM_NAME            : 0x01,
        /**
         * ```text
         * buf: (..., ";", token, *)
         * 
         * |WAIT_PARAM_KV_SEP| --> "="        --> |WAIT_PARAM_VALUE|   (buf --> (..., ";", token, "=", *))
         * |WAIT_PARAM_KV_SEP| --> ";"        --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> ","        --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> space      --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> token      --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> quoted-str --> error                ("=" is expected)
         * |WAIT_PARAM_KV_SEP| --> end        --> error                ("=" is expected)
         * ```
         */
        WAIT_PARAM_KV_SEP          : 0x02,
        /**
         * ```text
         * buf: (..., ";", token, "=", *)
         *   OR (..., ";", token, "=", token-frag, ..., token-frag, *);  token-frag = token / "="
         * 
         * |WAIT_PARAM_VALUE| --> "="        --> |WAIT_PARAM_VALUE|             (buf --> (..., "=", [...], "=", *))
         * |WAIT_PARAM_VALUE| --> ";"        --> ( count(token-frag) > 0 ) ?
         *                                       |WAIT_PARAM_NAME|              (buf --> (..., "=", token-frag, ..., token-frag,  ";", *))
         *                                     : error                          (token / quoted-str is expected)
         * |WAIT_PARAM_VALUE| --> ","        --> ( count(token-frag) > 0 ) ?
         *                                       |WAIT_VALUE|                   (parsed as `field-value field-params`; buf is cleared)
         *                                     : error                          (token / quoted-str is expected)
         * |WAIT_PARAM_VALUE| --> space      --> ( count(token-frag) > 0 ) ?
         *                                       |WAIT_VALUE_SEP_OR_PARAM_SEP|  (buf --> (..., "=", token-frag + ... + token-frag, space, *))
         *                                     : error                          (token / quoted-str is expected)
         * |WAIT_PARAM_VALUE| --> token      --> |WAIT_PARAM_VALUE|             (buf --> (..., ";", token, "=", [...], token, *))
         * |WAIT_PARAM_VALUE| --> quoted-str --> ( count(token-frag) > 0 ) ?
         *                                       error                          (token / ";" / "," / "=" is expected)
         *                                     : |WAIT_VALUE_SEP_OR_PARAM_SEP|  (buf --> (..., ";", token, "=", quoted-str, *))
         * |WAIT_PARAM_VALUE| --> end        --> ( count(token-frag) > 0 ) ?
         *                                       return                         (parsed as `field-value field-params`)
         *                                     : error                          (token /quoted-str is expected)
         * ```
         */
        WAIT_PARAM_VALUE           : 0x03,
        /**
         * ```text
         * buf: (..., ";", token, "=", token, *)
         * 
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> "="        --> error                          (";" / "," is expected)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> ";"        --> |WAIT_PARAM_NAME|              (buf --> (..., ";" token, "=", token, ";", *))
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> ","        --> |WAIT_VALUE|                   (parsed as `field-value field-params`; buf is cleared)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> space      --> |WAIT_VALUE_SEP_OR_PARAM_SEP|  (whitespace is ignored)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> token      --> error                          (";" / "," is expected)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> quoted-str --> error                          (";" / "," is expected)
         * |WAIT_VALUE_SEP_OR_PARAM_SEP| --> end        --> return                         (parsed as `field-value field-params`)
         * ```
         */
        WAIT_VALUE_SEP_OR_PARAM_SEP: 0x04,
    });

    const is_wsp      = (s) => /^[\x09\x20]/.test(s);  //  exact match is not needed because other tokens are not starting with whitespaces.

    let   state       = State.WAIT_VALUE;
    const token_frags = [];
    let   desc        = _nextDesc();

    for (const token of _tokenizeGenericHeaderValue(substringIterator)) {
        switch (state) {
        case State.WAIT_VALUE:
        {
            if (token === "=") {
                token_frags.push(token);
            } else if (token === ";") {
                if (token_frags.length === 0) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. field-value is empty.`);
                }

                while (token_frags.length > 0 && is_wsp(token_frags[token_frags.length - 1])) {
                    token_frags.pop();
                }
                desc.value = token_frags.splice(0, token_frags.length).join("");

                state      = State.WAIT_PARAM_NAME;
            } else if (token === ",") {
                if (token_frags.length === 0) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. field-value is empty.`);
                }

                while (token_frags.length > 0 && is_wsp(token_frags[token_frags.length - 1])) {
                    token_frags.pop();
                }
                desc.value = token_frags.splice(0, token_frags.length).join("");

                yield desc;

                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                if (token_frags.length > 0) {
                    token_frags.push(token);
                }
            } else {
                token_frags.push(token);
            }
        }
        break;
        case State.WAIT_PARAM_NAME:
        {
            if (token === "=" || token === ";" || token === "," || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters is expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else {
                token_frags.push(token);
                state = State.WAIT_PARAM_KV_SEP;
            }
        }
        break;
        case State.WAIT_PARAM_KV_SEP:
        {
            if (token === "=") {
                state = State.WAIT_PARAM_VALUE;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters is expected.`);
            }
        }
        break;
        case State.WAIT_PARAM_VALUE:
        {
            if (token === "=") {
                token_frags.push(token);
            } else if (token === ";") {
                if (token_frags.length <= 1) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. param-value is empty.`);
                }

                const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
                const param_value = token_frags.splice(0, token_frags.length).join("");

                _setDescParam(desc, param_name, param_value);

                state = State.WAIT_PARAM_NAME;
            } else if (token === ",") {
                if (token_frags.length <= 1) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. param-value is empty.`);
                }

                const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
                const param_value = token_frags.splice(0, token_frags.length).join("");

                _setDescParam(desc, param_name, param_value);

                yield desc;
                desc = _nextDesc(desc);

                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                if (token_frags.length <= 1) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. param-value is empty.`);
                }

                const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
                const param_value = token_frags.splice(0, token_frags.length).join("");

                _setDescParam(desc, param_name, param_value);

                state = State.WAIT_VALUE_SEP_OR_PARAM_SEP;
            } else if (_isQuotedString(token)) {
                if (token_frags.length >= 2) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. quoted-string is not allowed here.`);
                }

                const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
                const param_value = token;

                _setDescParam(desc, param_name, param_value);

                state = State.WAIT_VALUE_SEP_OR_PARAM_SEP;
            } else {
                token_frags.push(token);
            }
        }
        break;
        case State.WAIT_VALUE_SEP_OR_PARAM_SEP:
        {
           if (token === ";") {
                state = State.WAIT_PARAM_NAME;
            } else if (token === ",") {
                yield desc;

                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                continue;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. separator for field-values or field-contents are expected.`);
            }
        }
        break;
        default:
            throw new Error("UNREACHABLE");
        }
    }

    switch (state) {
    case State.WAIT_VALUE:
    {

        if (token_frags.length === 0) {
            throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. field-value is empty.`);
        }

        while (token_frags.length > 0 && is_wsp(token_frags[token_frags.length - 1])) {
            token_frags.pop();
        }
        desc.value = token_frags.splice(0, token_frags.length).join("");

        yield desc;
    }
    break;
    case State.WAIT_PARAM_NAME:
    {
        throw new SyntaxError("Incomplete field was given. vchars with no delimiters is expected.");
    }
    case State.WAIT_PARAM_KV_SEP:
    {
        throw new SyntaxError("Incomplete field was given. key-value separator is expected.");
    }
    case State.WAIT_PARAM_VALUE:
    {
        if (token_frags.length <= 1) {
            throw new SyntaxError("Incomplete field was given. vchars with no delimiters or quoted-string are expected.");
        }

        const param_name  = token_frags.splice(0, 1)[0].toLowerCase();
        const param_value = token_frags.splice(0, token_frags.length).join("");

        _setDescParam(desc, param_name, param_value);

        yield desc;
    }
    break;
    case State.WAIT_VALUE_SEP_OR_PARAM_SEP:
    {
        yield desc;
    }
    break;
    default:
        throw new Error("UNREACHABLE");
    }
}


/**
 * Tokenizer used in {@link _parseCredentialsListHeader}.
 * 
 * @param {IterableIterator<string>} substringIterator 
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _tokenizeCredentialsList(substringIterator) {
    const comma      = String.raw`\x2c`;  //  \,
    const equal      = String.raw`\x3d`;  //  \=
    const rest       = String.raw`[\x21\x23-\x2b\x2d-\x3c\x3e-\x7e\x80-\xff]+`;

    const token_expr = new RegExp(`${comma}|${equal}|${rest}`, "g");
    const wsp_expr   = /^[\x09\x20]+$/;

    for (const s of substringIterator) {
        if (_isQuotedString(s) || wsp_expr.test(s)) {
            yield s;
        } else {
            for (const m of s.matchAll(token_expr)) {
                yield m[0];
            }
        }
    }
}

/**
 * @param {IterableIterator<string>} substringIterator 
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _parseCredentialsListHeader(substringIterator) {
    //  token68     =   1*( ALPHA / DIGIT /
    //                      "-" / "." / "_" / "~" / "+" / "/" ) *"="
    //  auth-scheme =   token
    //  SP          =   \x20
    //  HTAB        =   \x09
    //  BWS         =   OWS              #   "Bad" White-Space. 
    //  OWS         =   *[ SP / HTAB ]   #   Optional White-Space
    //  auth-param  =   token BWS "=" BWS ( token / quoted-string )
    //  credentials =   auth-scheme [ 1*SP ( token68 / #auth-param ) ]

    const State = Object.freeze({
        /**
         * ```text
         * buf: (*)
         * 
         * |WAIT_VALUE| --> ","        --> error
         * |WAIT_VALUE| --> "="        --> error
         * |WAIT_VALUE| --> space      --> |WAIT_VALUE|  (whitespace is ignored)
         * |WAIT_VALUE| --> quoted-str --> error
         * |WAIT_VALUE| --> token      --> |WAIT_SPACE|  (buf --> (token, *))
         * |WAIT_VALUE| --> end        --> error
         * ```
         */
        WAIT_VALUE                  : 0x00,
        /**
         * ```text
         * buf: (token, *)
         * 
         * |WAIT_SPACE| --> "="        --> error
         * |WAIT_SPACE| --> ","        --> |WAIT_VALUE|                  (parsed as `auth-scheme`; buf is cleared)
         * |WAIT_SPACE| --> space      --> |WAIT_TOKEN68_OR_PARAM_NAME|  (buf --> (token, space, *))
         * |WAIT_SPACE| --> quoted-str --> error
         * |WAIT_SPACE| --> token      --> error
         * |WAIT_SPACE| --> end        --> return                        (parsed as `auth-scheme`)
         * ```
         */
        WAIT_SPACE                  : 0x01,
        /**
         * ```text
         * buf: (token, space, *)
         * 
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> "="        --> error
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> ","        --> |WAIT_VALUE|                    (parsed as `auth-scheme`; buf is cleared)
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> space      --> |WAIT_TOKEN68_OR_PARAM_NAME|    (whitespace is ignored)
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> quoted-str --> error
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> token      --> |WAIT_PADDING_OR_PARAM_KV_SEP|  (buf --> (token, space, token, *))
         * |WAIT_TOKEN68_OR_PARAM_NAME| --> end        --> return                          (parsed as `auth-scheme`)
         * ```
         */
        WAIT_TOKEN68_OR_PARAM_NAME  : 0x02,
        /**
         * ```text
         * buf: (token, space, token, *)
         * 
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> "="        --> |WAIT_PADDING_OR_PARAM_VALUE|  (buf --> (token, space, token, "="))
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> ","        --> |WAIT_VALUE|                   (parsed as `auth-scheme SP token68`; buf is cleared)
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> space      --> |WAIT_PARAM_KV_SEP|            (state is changed but whitespace is ignored)
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> quoted-str --> error
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> token      --> error
         * |WAIT_PADDING_OR_PARAM_KV_SEP| --> end        --> return                         (parsed as `auth-scheme SP token68`)
         * ```
         */
        WAIT_PADDING_OR_PARAM_KV_SEP: 0x03,
        /**
         * ```text
         * buf: (token, space, token, "=", *)
         * 
         * |WAIT_PADDING_OR_PARAM_VALUE| --> "="        --> |WAIT_PADDING|      (buf --> (token, space, token + "=" + "=", *))
         * |WAIT_PADDING_OR_PARAM_VALUE| --> ","        --> |WAIT_VALUE|        (parsed as `auth-scheme SP token68`; buf is cleared)
         * |WAIT_PADDING_OR_PARAM_VALUE| --> space      --> |WAIT_VALUE_SEP|    (buf --> (token, space, token + "=", *))
         * |WAIT_PADDING_OR_PARAM_VALUE| --> quoted-str --> |WAIT_VALUE_SEP|    (buf --> (token, space, token + "=" + quoted-str, *))
         * |WAIT_PADDING_OR_PARAM_VALUE| --> token      --> |WAIT_VALUE_SEP|    (buf --> (token, space, token + "=" + token, *))
         * |WAIT_PADDING_OR_PARAM_VALUE| --> end        --> return              (parsed as `auth-scheme SP token68`)
         * ```
         */
        WAIT_PADDING_OR_PARAM_VALUE : 0x04,
        /**
         * ```text
         * buf: (token, space, token68, *)
         * 
         * |WAIT_PADDING| --> "="        --> |WAIT_PADDING|      (buf --> (token, space, token68 + "=", *))
         * |WAIT_PADDING| --> ","        --> |WAIT_VALUE|        (parsed as `auth-scheme SP token68`; buf is cleared)
         * |WAIT_PADDING| --> space      --> |WAIT_VALUE_SEP|    (buf --> (token, space, token68, *))
         * |WAIT_PADDING| --> quoted-str --> error
         * |WAIT_PADDING| --> token      --> error
         * |WAIT_PADDING| --> end        --> return              (parsed as `auth-scheme SP token68`)
         * ```
         */
        WAIT_PADDING                : 0x05,
        /**
         * ```text
         * buf: (token, space, token, *)
         *   OR (token, space, (auth-param, ","), ..., token, *)
         * 
         * |WAIT_PARAM_KV_SEP| --> "="        --> |WAIT_PARAM_VALUE|   (buf --> (token, space, token, "=", *))
         * |WAIT_PARAM_KV_SEP| --> ","        --> ( count(auth-param) >= 1 ) ?
         *                                        |WAIT_VALUE|         (parsed as `auth-scheme SP #auth-param`
         *                                                              and then parsed as `auth-scheme`
         *                                                              ; buf is cleared)
         *                                      : |WAIT_VALUE|         (parsed as `auth-scheme SP token68`
         *                                                              ; buf is cleared)
         * |WAIT_PARAM_KV_SEP| --> space      --> |WAIT_PARAM_KV_SEP|
         * |WAIT_PARAM_KV_SEP| --> quoted-str --> error                (the last item cannot be concatenated with other tokens/quoted-strs)
         * |WAIT_PARAM_KV_SEP| --> token      --> error                (the last item cannot be concatenated with other tokens/quoted-strs)
         * |WAIT_PARAM_KV_SEP| --> end        --> ( count(auth-param) >= 1 ) ?
         *                                        return               (parsed as `auth-scheme SP #auth-param`
         *                                                              and then parsed as `auth-scheme`)
         *                                      : return               (parsed as `auth-scheme SP token68`)
         * ```
         */
        WAIT_PARAM_KV_SEP           : 0x10,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., token, "=", *)
         *   OR (token, space, token, "=", *)
         * 
         * |WAIT_PARAM_VALUE| --> "="           --> error                   (invalid token)
         * |WAIT_PARAM_VALUE| --> ","           --> error                   (missing a param-value for an auth-param)
         * |WAIT_PARAM_VALUE| --> space         --> |WAIT_PARAM_VALUE|      (whitespace is ignored)
         * |WAIT_PARAM_VALUE| --> quoted-str    --> |WAIT_VALUE_SEP|        (buf --> (..., token, "=", quoted-str, *))
         * |WAIT_PARAM_VALUE| --> token         --> |WAIT_VALUE_SEP|        (buf --> (..., token, "=", token, *))
         * |WAIT_PARAM_VALUE| --> end           --> error                   (missing a param-value for an auth-param)
         * ```
         */
        WAIT_PARAM_VALUE            : 0x11,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., auth-param, *)
         *   OR (token, space, token68, *)
         * 
         * |WAIT_VALUE_SEP| --> "="        --> error
         * |WAIT_VALUE_SEP| --> ","        --> ( buf.endswith(auth-param) ) ?
         *                                     |WAIT_VALUE_OR_PARAM|  (buf --> (token, space, ..., auth-param, ",", *))
         *                                   : |WAIT_VALUE|           (parsed as `auth-scheme SP token68`; buf is cleared)
         * |WAIT_VALUE_SEP| --> space      --> |WAIT_VALUE_SEP|       (whitespace is ignored)
         * |WAIT_VALUE_SEP| --> quoted-str --> error
         * |WAIT_VALUE_SEP| --> token      --> error
         * |WAIT_VALUE_SEP| --> end        --> return
         * ```
         */
        WAIT_VALUE_SEP              : 0x20,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., auth-param, ",", *)
         * 
         * |WAIT_VALUE_OR_PARAM| --> "="        --> error
         * |WAIT_VALUE_OR_PARAM| --> ","        --> error
         * |WAIT_VALUE_OR_PARAM| --> space      --> |WAIT_VALUE_OR_PARAM|   (whitespace is ignored)
         * |WAIT_VALUE_OR_PARAM| --> quoted-str --> error
         * |WAIT_VALUE_OR_PARAM| --> token      --> |WAIT_SPACE_OR_KV_SEP|  (buf --> (token, space, (auth-param, ","), ..., token, *))
         * |WAIT_VALUE_OR_PARAM| --> end        --> error 
         * ```
         */
        WAIT_VALUE_OR_PARAM         : 0x30,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., token, *)
         * 
         * |WAIT_SPACE_OR_KV_SEP| --> "="        --> |WAIT_PARAM_VALUE|        (buf --> (..., "," token, "=", *))
         * |WAIT_SPACE_OR_KV_SEP| --> ","        --> |WAIT_VALUE|              (parsed as `token SP #auth-param` and then as `token`; buf is cleared)
         * |WAIT_SPACE_OR_KV_SEP| --> space      --> |WAIT_TOKEN68_OR_KV_SEP|  (buf --> (..., "," token, space, *))
         * |WAIT_SPACE_OR_KV_SEP| --> quoted-str --> error
         * |WAIT_SPACE_OR_KV_SEP| --> token      --> error
         * |WAIT_SPACE_OR_KV_SEP| --> end        --> return                    (parsed as `token SP #auth-param` and then as `token`)
         * ```
         */
        WAIT_SPACE_OR_KV_SEP        : 0x31,
        /**
         * ```text
         * buf: (token, space, (auth-param, ","), ..., token, space, *)
         * 
         * |WAIT_TOKEN68_OR_KEY_SEP| --> "="        --> |WAIT_PARAM_VALUE|              (the last whitespace is ignored;  buf --> (..., "," token, "=", *))
         * |WAIT_TOKEN68_OR_KEY_SEP| --> ","        --> error                           (invalid token)
         * |WAIT_TOKEN68_OR_KEY_SEP| --> space      --> |WAIT_TOKEN68_OR_KV_SEP|        (whitespace is ignored)
         * |WAIT_TOKEN68_OR_KEY_SEP| --> quoted-str --> error
         * |WAIT_TOKEN68_OR_KEY_SEP| --> token      --> |WAIT_PADDING_OR_PARAM_KV_SEP|  (parse buf excluding the last 2 components as `token SP #auth-param`,
         *                                                                               and then buf --> (token, space, token, *))
         * |WAIT_TOKEN68_OR_KEY_SEP| --> end        --> return                          (parsed as `token SP #auth-param` 
         *                                                                               and then as `token`)
         * ```
         */
        WAIT_TOKEN68_OR_KV_SEP      : 0x32,
    });
    
    const wsp_expr   = /^[\x09\x20]/;  //  exact match is not needed because other tokens are not starting with whitespaces.
    const is_wsp     = (s) => wsp_expr.test(s);

    let   state =  State.WAIT_VALUE;
    /**
     * @type {string[]}
     */
    const token68_or_param = [];

    /**
     * @param {({ value: string, params: ({ [param_name: string]: string })?})} desc 
     */
    const split_scheme_and_token68 = (desc) => {
        const [ scheme, token68 ] = desc.value.split(" ");

        _setDescParam(desc, "scheme", scheme.toLowerCase());    // scheme matches case-insensitively.
        if (typeof token68 === "string" && token68.length > 0) {
            _setDescParam(desc, "token68", token68);
        }
        return desc;
    };

    let desc  = _nextDesc();
    for (const token of _tokenizeCredentialsList(substringIterator)) {
        switch(state) {
        case State.WAIT_VALUE:
        {
            if (token === "=" || token === "," || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters is expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else {
                desc.value = token;
                state = State.WAIT_SPACE;
            }
        }
        break;
        case State.WAIT_SPACE:
        {
            if (is_wsp(token)) {
                state = State.WAIT_TOKEN68_OR_PARAM_NAME;
            } else if (token === ",") {
                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. whitespace is expected.`);
            }
        }
        break;
        case State.WAIT_TOKEN68_OR_PARAM_NAME:
        {
            if (token === "=" || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. token68 or param-name are expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else if (token === ",") {
                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else {
                token68_or_param.push(token);
                state = State.WAIT_PADDING_OR_PARAM_KV_SEP;
            }
        }
        break;
        case State.WAIT_PADDING_OR_PARAM_KV_SEP:
        {
            if (token === "=") {
                token68_or_param.push(token);
                state = State.WAIT_PADDING_OR_PARAM_VALUE;
            } else if (token === ",") {
                if (token68_or_param.length > 0) {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
                }
                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                state = State.WAIT_PARAM_KV_SEP;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. token68 or param-name are expected.`);
            }
        }
        break;
        case State.WAIT_PADDING_OR_PARAM_VALUE:
        {
            if (token === "=") {
                token68_or_param.push(token);
                state = State.WAIT_PADDING;
            } else if (token === ",") {
                if (token68_or_param.length > 0) {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
                }
                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                if (token68_or_param.length > 0) {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
                }
                state = State.WAIT_VALUE_SEP;
            } else {
                const param_name = token68_or_param.splice(0, token68_or_param.length)[0];
                _setDescParam(desc, param_name, token);
                state = State.WAIT_VALUE_SEP;
            }
        }
        break;
        case State.WAIT_PADDING:
        {
            if (token === "=") {
                token68_or_param.push(token);
            } else if (token === ",") {
                desc.value += " ";
                desc.value += token68_or_param.splice(0, token68_or_param.length).join("");

                yield split_scheme_and_token68(desc);
                desc  = _nextDesc();

                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                desc.value += " ";
                desc.value += token68_or_param.splice(0, token68_or_param.length).join("");

                state = State.WAIT_VALUE_SEP;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. padding in a token68 is expected.`);
            }
        }
        break;
        case State.WAIT_PARAM_KV_SEP:
        {
            if (token === "=") {
                token68_or_param.push(token);

                state = State.WAIT_PARAM_VALUE;
            } else if (token === ",") {
                if (desc.params != null) {
                    yield split_scheme_and_token68(desc);
                    desc  = _nextDesc();

                    desc.value = token68_or_param.splice(0, token68_or_param.length).join("")
                    yield split_scheme_and_token68(desc);
                    desc  = _nextDesc();

                    state = State.WAIT_VALUE;
                } else {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
                    yield split_scheme_and_token68(desc);
                    desc  = _nextDesc();

                    state = State.WAIT_VALUE;
                }
            } else if (is_wsp(token)) {
                continue;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. key-value separator is expected.`);
            }
        }
        break;
        case State.WAIT_PARAM_VALUE:
        {
            if (token === "=" || token === ",") {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters or quoted-string are expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else {
                const param_name = token68_or_param.splice(0, token68_or_param.length)[0];

                _setDescParam(desc, param_name, token);

                state = State.WAIT_VALUE_SEP;
            }
        }
        break;
        case State.WAIT_VALUE_SEP:
        {
            if (token === ",") {
                if (desc.params != null) {
                    state = State.WAIT_VALUE_OR_PARAM;
                } else {
                    desc.value += " ";
                    desc.value += token68_or_param.splice(0, token68_or_param.length).join("");

                    yield split_scheme_and_token68(desc);

                    desc = _nextDesc();
                    state = State.WAIT_VALUE;
                }
            } else if (is_wsp(token)) {
                continue;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. separator of values / key-value pairs is expected.`);
            }
        }
        break;
        case State.WAIT_VALUE_OR_PARAM:
        {
            if (token === "=" || token === "," || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters is expected.`);
            } else if (is_wsp(token)) {
                continue;
            } else {
                token68_or_param.push(token);
                state = State.WAIT_SPACE_OR_KV_SEP;
            }
        }
        break;
        case State.WAIT_SPACE_OR_KV_SEP:
        {
            if (token === "=") {
                state = State.WAIT_PARAM_VALUE;
            } else if (token === ",") {
                yield split_scheme_and_token68(desc);
                desc = _nextDesc();
                state = State.WAIT_VALUE;
            } else if (is_wsp(token)) {
                state = State.WAIT_TOKEN68_OR_KV_SEP;
            } else {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. whitespace or key-value separator are expected.`);
            }
        }
        break;
        case State.WAIT_TOKEN68_OR_KV_SEP:
        {
            if (token === "," || _isQuotedString(token)) {
                throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. vchars with no delimiters or key-value separator are expected.`);
            } else if (token === "=") {
                state = State.WAIT_PARAM_VALUE;
            } else if (is_wsp(token)) {
                continue;
            } else {
                yield split_scheme_and_token68(desc);
                desc = _nextDesc();
                desc.value = token68_or_param.splice(0, token68_or_param.length).join("");
                token68_or_param.push(token);
                state = State.WAIT_PADDING_OR_PARAM_KV_SEP;
            }
        }
        break;
        default:
            throw new Error("UNREACHABLE");
        }
    }
    switch (state) {
    case State.WAIT_VALUE:
    case State.WAIT_VALUE_OR_PARAM:
    {
        throw new SyntaxError("Incomplete field was given. vchars with no delimiters is expected.");
    }
    case State.WAIT_PARAM_VALUE:
    {
        throw new SyntaxError("Incomplete field was given. vchars with no delimiters or quoted-string are expected.");
    }
    case State.WAIT_SPACE: 
    case State.WAIT_TOKEN68_OR_PARAM_NAME:
    {
        yield split_scheme_and_token68(desc);
    }
    break;
    case State.WAIT_PADDING_OR_PARAM_KV_SEP:
    case State.WAIT_PADDING_OR_PARAM_VALUE:
    case State.WAIT_PADDING:
    {
        desc.value += " ";
        desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
        yield split_scheme_and_token68(desc);
    }
    break;
    case State.WAIT_PARAM_KV_SEP:
    {
        if (desc.params != null) {
            yield split_scheme_and_token68(desc);
            desc = _nextDesc();
            desc.value = token68_or_param.splice(0, token68_or_param.length).join("");
            yield split_scheme_and_token68(desc);
        } else {
            desc.value += " ";
            desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
            yield split_scheme_and_token68(desc);
        }
    }
    break;
    case State.WAIT_VALUE_SEP:
    {
        if (desc.params != null) {
            yield split_scheme_and_token68(desc);
        } else {
            desc.value += " ";
            desc.value += token68_or_param.splice(0, token68_or_param.length).join("");
            yield split_scheme_and_token68(desc);
        }
    }
    break;
    case State.WAIT_SPACE_OR_KV_SEP:
    case State.WAIT_TOKEN68_OR_KV_SEP:
    {
        yield split_scheme_and_token68(desc);
        desc = _nextDesc();
        desc.value = token68_or_param.splice(0, token68_or_param.length).join("");
        yield split_scheme_and_token68(desc);
    }
    break;
    default:
        throw new Error("Unexpected error");
    }
}

/**
 * @param {IterableIterator<string>} substringIterator 
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _parseCredentialsHeader(substringIterator) {
    yield _parseCredentialsListHeader(substringIterator).next().value;
}

/**
 * @param {IterableIterator<string>} substringIterator 
 * @see
 * - {@link _parseGenericHeaderValue}
 */
function* _parseSingleValuedHeader(substringIterator) {
    const desc = _nextDesc();
    desc.value = [...substringIterator].join("");
    yield desc;
}

const ParseHeaderSpecializations = new Map(Object.entries({
    //  authorization    = credentials
    "authorization"   : _parseCredentialsHeader,
    //  www-authenticate = #challenge
    //  NOTE: credentials and challenge have common syntax: token [1*SP (token68 / #auth-param )]
    "www-authenticate": _parseCredentialsListHeader,
    "user-agent"      : _parseSingleValuedHeader
}));

function* parseHeaderValue(headerName, headerValue) {
    const header_name  = headerName;
    const header_value = headerValue;

    if (typeof header_name !== "string") {
        throw new TypeError(`${header_name} is not a string`);
    } else if (typeof header_value !== "string") {
        throw new TypeError(`${header_value} is not a string`);
    }

    const unused     = String.raw`[\x00-\x08\x0a-\x1f\x7f]+`;
    const spaces     = String.raw`[\x09\x20]+`;
    const qstring    = String.raw`\x22(?:\\\x22|[^\x22])*\x22`;
    const rest       = String.raw`[\x21\x23-\x7e\x80-\xff]+`;
    
    const token_expr = new RegExp(`${unused}|${spaces}|${qstring}|${rest}`, "g");

    const is_bad_qstring = (s) => /[\x00-\x08\x0a-\x1f\x7f]/.test(s);
    const parser = (
        ParseHeaderSpecializations.get(header_name.toLowerCase()) ??
        _parseGenericHeaderValue
    );
    const substr_iter = function* () {
        let next_index = 0;
        for (const m of header_value.matchAll(token_expr)) {
            const index = m.index;

            if (next_index !== index) {
                const skipped_token = header_value.slice(next_index, index);
                throw new SyntaxError(`Unexpected token ${JSON.stringify(skipped_token)} appeared.`)
            }

            const token = m[0];
            const code = token.charCodeAt(0);

            if (code === 0x7f || (code !== 0x09 && code < 0x20) || (code == 0x22 && is_bad_qstring(token))) {
                // unused character detected
                throw new SyntaxError(`${JSON.stringify(token)} is not allowed to be appeared in HTTP headers`);
            } else {
                yield token;
            }

            next_index = m.index + token.length;
        }
    };

    yield* parser(substr_iter());
}

function* tokenize(text) {
    if (!(typeof text === "string" || (text instanceof Uint8Array))) {
        throw new TypeError(`${text} is neither a string nor a Uint8Array i.e. a byte array`);
    }
    /**
     * code to string
     * @param {number} c 
     * @returns 
     */
    const ctos      = (c) => JSON.stringify(String.fromCharCode(c));

    // list of ASCII codes for special characters.
    const dquote    = 0x22;
    const backslash = 0x5c;
    const htab      = 0x09;
    const sp        = 0x20;
    const del       = 0x7f;

    const decoder = new TextDecoder("us-ascii", { fatal: true });
    const text_bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;

    /**
     * test whether or not the code is whitespace.
     * @param {number} c 
     * @returns 
     */
    const is_wsp = (c) => (c === sp || c === htab);

    let   in_whitespace = false;
    let   in_quote      = false;
    let   first         = 0;
    const last          = text_bytes.length;
    let   i             = 0;
    let   code          = 0;
    while (i < last) {
        code = text_bytes[i];
        if ((code !== htab && code < 0x20) || code === del) {
            throw new SyntaxError(`Unexpected code 0x${code.toString(16)} (${ctos(code)}) appeared. control characters are not allowed.`);
        }

        i++;

        if (in_quote) {
            if (code === backslash) {
                i++;
            } else if (code === dquote) {
                in_quote = false;
                const token = decoder.decode(text_bytes.slice(first, i));
                first = i;
                yield token;
            }
        } else if (in_whitespace) {
            if (!is_wsp(code)) {
                in_whitespace = false;
                if (code === dquote) {
                    in_quote = true;
                }
                const token_last = i - 1;
                if (first < token_last) {
                    const token = decoder.decode(text_bytes.slice(first, token_last));
                    yield token;
                }
                first = token_last;
            }
        } else if (is_wsp(code)) {
            in_whitespace = true;
            const token_last = i - 1;
            if (first < token_last) {
                const token = decoder.decode(text_bytes.slice(first, token_last));
                yield token;
            }
            first = token_last;
        } else if (code === dquote) {
            in_quote = true;
            const token_last = i - 1;
            if (first < token_last) {
                const token = decoder.decode(text_bytes.slice(first, token_last));
                yield token;
            }
            first = token_last;
        }
    }
    if (in_quote) {
        throw new SyntaxError("Quoted string not terminated");
    } else if (code === backslash) {
        throw new SyntaxError("Escape sequence not terminated");
    }

    if (first < last) {
        const token = decoder.decode(text_bytes.slice(first, last));
        if (token.length > 0) {
            yield token;
        }
    }
}

/**
 * @class
 * 
 * A class provides tools for inspecting the request from clients.
 * 
 * Basically, use of {@link RequestParser.parse} is sufficient for that purpose.  
 */
class RequestParser {
    /**
     * Analyses the given request and returns its descriptor.
     * 
     * The returned descriptor is an object which consists of a method, a path, headers, query, and a body.
     * 
     * Because fetching the request body is done asynchronously, this function is labelled as async.
     * 
     * This function handles "data", "end", "error" events associated with the given request.
     * 
     * @param {http.IncomingMessage} request 
     */
    static async parse(request) {
        if (request === null || typeof request !== "object") {
            throw new TypeError(`${request} is not a non-null object`);
        } else if (!request.readable) {
            throw new TypeError("Given request is not readable");
        }

        const { method, url } = request;
        const headers = {};
        {
            const original_headers = request.headers;
            for (const header_name in original_headers) {
                const header = original_headers[header_name];

                if (typeof header === "string") {
                    headers[header_name] = RequestParser.parseHeader(`${header_name}: ${header}`)[header_name];
                } else {
                    headers[header_name] = RequestParser.parseHeader(`${header_name}: ${header.join(", ")}`)[header_name];
                }
            }
        }
        const [ path, search_params ] = ((i) => {
            return i < 0 ?
                [ url            , new URLSearchParams("")               ] :
                [ url.slice(0, i), new URLSearchParams(url.slice(i + 1)) ]
            ;
        })(url.indexOf("?"));

        //  buffer to store incoming chunks which represents the request body.
        /** @type {Buffer[] | string[]} */
        const chunks = [];
        const content_length = Number(request.headers["content-length"] ?? -1); 
        let actual_content_length = 0;

        //  To handle state of the Promise returned from this function, 
        //  keep reject and resolve functions given by Promise constructor as local variables.
        let resolve_fn, reject_fn;
        /**
         * @type {Promise<{
         *      method : string,
         *      path   : string,
         *      headers: http.IncomingHttpHeaders,
         *      query  : { [key: string]: string },
         *      body   : Buffer | string | { [key: string]: number | string | boolean | object | Uint8Array | null }
         *  }>}
         */
        const promise = new Promise((resolve_, reject_) => {
            resolve_fn = resolve_;
            reject_fn  = reject_;
        });
        //  1.  Store a chunk in `chunks` whenever "data" event occurs
        //  2.  After that, construct the descriptor of the given request in "end" event handler
        //  3.  And then pass the descriptor to `resolve_fn`, it makes the Promise returned by `parse()` "resolved".
        //
        //  If "error" event occurred, reject the Promise returned by this function, `parse()`.
        (request
            .on("data", ( /** @type {Buffer | string } */ chunk) => {
                if (content_length >= 0) {
                    const encoding = request.readableEncoding;
                    actual_content_length += (encoding == null ?
                        Buffer.byteLength(chunk) :
                        Buffer.byteLength(chunk, encoding)
                    );
                }
                chunks.push(chunk);
            })
            .on("end", () => {
                if (content_length >= 0 && content_length !== actual_content_length) {
                    reject_fn(new RangeError(`Content-Length is set to ${content_length} but actual length is ${actual_content_length}`));
                    return;
                }

                const result = {
                    method: method,
                    path: path,
                    headers: headers,
                    query: Object.fromEntries(search_params),
                    body: null
                };
                
                const body = Buffer.concat(chunks);

                /** @type {{ value: string, params: { [param_name: string]: value} ?}[]} */
                const content_types = headers["content-type"] ?? [{ value: "application/octet-stream", params: null }]; 

                //  Read Content-Type header field from headers.
                //  If Content-Type is not provided, "application/octet-stream" is used instead.
                const content_type = content_types[0];

                if (content_types.length >= 2) {
                    console.warn(`Multiple Content-Type header lines are provided. ${content_type} was used and others were discarded.`);
                }
                if (content_type.value === "multipart/form-data") {
                    try {
                        result.body = RequestParser.parseFormData(body, content_type.params.boundary);
                    } catch(e) {
                        console.error(e, body);
                        reject_fn(e);
                        return;
                    }
                } else if (content_type.value === "application/x-www-form-urlencoded") {
                    result.body = Object.fromEntries(new URLSearchParams(body.toString()));
                } else if (content_type.value === "application/json") {
                    let json;
                    try {
                        json = body.toString();
                    } catch(e) {
                        console.error(e, body);
                        reject_fn(e);
                        return;
                    }
                    let data;
                    try {
                        data = parseJson(json);
                    } catch(e) {
                        console.error(e, json);
                        reject_fn(e);
                        return;
                    }
                    result.body = data;
                } else if (content_type.value.startsWith("text/")) {
                    const charset = content_type.params?.charset;
                    try {
                        if (typeof charset === "string") {
                            result.body = new TextDecoder(charset, { fatal: true }).decode(body);
                        } else {
                            result.body = new TextDecoder("utf-8", { fatal: true }).decode(body);
                        }
                    } catch(w) {
                        console.warn(w, body);
                        if (typeof charset !== "string" || charset.toLowerCase() === "utf-8") {
                            reject_fn(w);
                            return;
                        }

                        try {
                            result.body = new TextDecoder("utf-8", { fatal: true }).decode(body);
                        } catch(e) {
                            console.error(e, body);
                            reject_fn(e);
                            return;
                        }
                    }
                } else {
                    result.body = body;
                }
                resolve_fn(result);
            })
            .on("error", (error) => {
                reject_fn(error);
            })
        );

        //  return the Promise. At this time, it is not settled yet.
        //  It'll be settled when "end" or "error" event is fired.
        return promise;
    }
    /**
     * Analyses the given Buffer which represents the form-data typed request body,
     * and the returns the descriptor of the given form-data.
     * 
     * The descriptor's shape is vary depending on the each content-type of the encapsulated parts of the given form-data.
     * If an encapsulated part has no Content-Type header lines, its body is assumed as "text/plain".
     * Otherwise, the content-type of the encapsulated part follows the given Content-Type header value.
     * 
     * @param {Buffer} body 
     * @param {string} boundary 
     */
    static parseFormData(body, boundary) {
        if (!(body instanceof Buffer)) {
            throw new TypeError(`${body} is not a Buffer`);
        } else if (typeof boundary !== "string" || boundary.length === 0) {
            throw new TypeError(`${boundary} is not a non-empty string`);
        }
        const encoder    = new TextEncoder();

        const delim      = encoder.encode(`\r\n--${boundary}\r\n`);
        const body_delim = encoder.encode("\r\n\r\n");

        let   first;
        const last = body.lastIndexOf(encoder.encode(`\r\n--${boundary}--\r\n`));
        {
            const first_delim = encoder.encode(`--${boundary}\r\n`);

            first = body.indexOf(first_delim);
            if (first < 0) {
                throw new TypeError(`boundary "--${boundary}" does not appear in the given body`);
            } else if (last < 0) {
                throw new TypeError(`Missing the closing boundary "--${boundary}--"`);
            }
        
            if (first > 0 && !(body[first - 2] === 0x0d && body[first - 1] === 0x0a)) {
                first = body.indexOf(delim, first + first_delim.length);
                if (first < 0) {
                    throw new TypeError(`boundary "--${boundary}" does not appear in the given body`);
                }
                first += delim.length;
            } else {
                first += first_delim.length;
            }

            if (first >= last) {
                throw new TypeError(`Missing the initial boundary "--${boundary}"`);
            }
        }

        /**
         * @type {{ [form_name: string]: number | string | boolean | object | Uint8Array | null }}
         */
        const form_data = {};
        //  Because Buffer.prototype.slice() is deprecated, direct call of Uint8Array's slice() method is needed.
        /** @type {(buf: Buffer, start: number, end: number) => Uint8Array} */
        const slice = (buf, start, end) => Uint8Array.prototype.slice.call(buf, start, end);
        while (first < last) {
            //  Due to header lines may be empty in encapsulated parts, an empty line may appear immediate after the preceding boundary.
            //  So indexOf() should start from `first - 2`, i.e. the index of CR following the boundary token.
            const header_last = body.indexOf(body_delim, first - 2);
            if (header_last < 0) {
                throw new TypeError("Missing a delimiter of headers and bodies of encapsulated parts");
            }
            const part_first = header_last + body_delim.length;
    
            let part_last = body.indexOf(delim, part_first);
            if (part_last < 0) {
                part_last = body.indexOf(encoder.encode(`\r\n--${boundary}--\r\n`), part_first);
                if (part_last !== last) {
                    throw new TypeError("Missing a boundary of encapsulated parts");
                }
            }

            /** @type {({ [header_name: string]: { value: string, params: { [param_name: string]: string }? }[] })} */
            const part_headers = {};
            if (header_last > first) {
                const lines = RequestParser.splitLines(slice(body, first, header_last), false);
                for (const line of lines) {
                    const header = RequestParser.parseHeader(line);
                    merge(part_headers, header);
                }
            }
        
            if (!Object.prototype.hasOwnProperty.call(part_headers, "content-disposition")) {
                throw new TypeError(`"Content-Disposition" header is not declared`);
            }
        
            const content_disposition = part_headers["content-disposition"]?.[0];
            if (content_disposition.value !== "form-data") {
                throw new TypeError(`Unexpected value is set to the "Content-Disposition" header: "${content_disposition.value}"`);
            } else if (!Object.prototype.hasOwnProperty.call(content_disposition.params, "name")) {
                throw new TypeError(`The "name" parameter is not defined in the "Content-Disposition" header`);
            }

            const part_body = slice(body, part_first, part_last);
            const form_name = content_disposition.params.name;

            const content_type = part_headers["content-type"]?.[0];
            const content_type_value = content_type?.value ?? "text/plain";
            if (content_type_value === "text/plain") {
                const charset = content_type?.params?.charset ?? "utf-8";
                const decoder = new TextDecoder(charset, { fatal: true });
                form_data[form_name] = decoder.decode(part_body);
            } else if (content_type_value === "application/json") {
                const decoder = new TextDecoder("utf-8", { fatal: true });
                form_data[form_name] = parseJson(decoder.decode(part_body));
            } else {
                form_data[form_name] = part_body;
            }

            first = part_last + delim.length;
        }
        
        return form_data;
    }

    /**
     * Splits the given data into an array of lines.
     * Each of lines is represented as a byte array.
     * 
     * @param {string|Uint8Array} data a string or a byte array to be splitted into array of lines.
     * @param {boolean} keepLinebreak a flag indicating whether or not to keep line breaks placed at the end of lines.
     * @returns array of lines.
     */
    static splitLines(data, keepLinebreak = false) {
        if (typeof data !== "string" && !(data instanceof Uint8Array)) {
            throw new TypeError(`${data} is neither a string nor a Uint8Array i.e. a byte array`);
        }

        const keep_crlf = typeof keepLinebreak === "boolean" ? keepLinebreak : false;

        const htab = 0x09;
        const sp   = 0x20;
        const crlf = new Uint8Array([0x0d, 0x0a]);

        const data_bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;

        const lines = [];

        let first = 0;
        let last = data_bytes.indexOf(crlf, first);
        while (first < last) {
            last += crlf.length;
            let next_byte = data_bytes[last];
            if (!(next_byte === htab || next_byte === sp)) {
                lines.push(data_bytes.slice(first, keep_crlf ? last : (last - crlf.length)));
                first = last;
                last = data_bytes.indexOf(crlf, first);
            } else {
                last = data_bytes.indexOf(crlf, last);
            }
        }
        if (first < data_bytes.length) {
            lines.push(data_bytes.slice(first));
        }

        return lines;
    }

    /**
     * Parses the given header field line.
     * 
     * @param {string|Uint8Array} header a string or a byte array representing a header field line.
     * @returns An object having a property which has the same name as the header field name.
     * The property has an array of objects each of which has a pair of a field value and field parameters.
     * 
     * Because of their case-insensitivity, parameter names and a field name is converted to lowercase.
     * 
     * @throws {TypeError} 
     * -  when the given header field is not a string
     * -  when the given header field contains an invalid character
     * -  when missing termination of the quoted-string in the given header field
     * -  when missing termination of the escape sequence in the given header field
     * -  when missing the field name
     * -  when missing a delimiter of the field name and value
     * -  when missing a delimiter of the field parameter name
     * -  when missing a delimiter of the field parameter name and value
     * -  when missing a delimiter of the field parameter value
     */
    static parseHeader(header) {
        if (typeof header !== "string" && !(header instanceof Uint8Array)) {
            throw new TypeError(`${header} is neither a string nor a Uint8Array i.e. a byte array`);
        }


        const header_desc = {
            name : "",
            value: ""
        };

        const space_expr = /^[\x09\x20]/;
        const token_generator = function*() {
            const colon      = String.raw`\x3a`;  //  \:
            const rest       = String.raw`[\x21\x23-\x39\x3b-\x7e\x80-\xff]+`;

            const token_expr = new RegExp(`${colon}|${rest}`, "g");

            for (const token of tokenize(header)) {
                if (_isQuotedString(token) || space_expr.test(token)) {
                    yield token;
                } else {
                    for (const m of token.matchAll(token_expr)) {
                        const s = m[0];
                        yield s;
                    }
                }
            }
        };

        {
            const tokens_iter = token_generator();
            let token = tokens_iter.next()?.value;
            let header_value = null;
            while (token != null) {
                if (token !== ":" && header_desc.name.length > 0) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared.`);
                } else if (_isQuotedString(token)) {
                    throw new SyntaxError(`Unexpected token ${JSON.stringify(token)} appeared. quoted-string is not allowed to be a field-name.`);
                } else if (token === ":") {
                    header_value = "";
                    token = tokens_iter.next()?.value;
                    while (token != null) {
                        header_value += token;
                        token = tokens_iter.next()?.value;
                    }
                    header_desc.value = header_value;
                    break;
                } else if (!space_expr.test(token)) {
                    header_desc.name = token;
                }
                token = tokens_iter.next()?.value;
            }
            if (header_value === null) {
                throw new SyntaxError("name-value separator did not appear.");
            }
        }
        if (header_desc.name.length === 0) {
            throw new SyntaxError("field-name is empty");
        }

        const { name: header_name, value: header_value } = header_desc;
        return { [header_name]: [...parseHeaderValue(header_name, header_value)] };
    }
}

module.exports = { RequestParser };
