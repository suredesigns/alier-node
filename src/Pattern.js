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
 * An object represents a string pattern.
 * 
 * This class focuses on strings delimited by slashes `"/"`.
 * 
 * In addition, this class provides a method for capturing parameters associated with some labels.
 * If a pattern containing some labels is given,
 * those labels works as wildcards when testing whether the given string matches the pattern or not.
 * 
 * Each of labels is specified with its name with the prefix `":"`.
 * 
 * If you want to use partial matching rather than exact matching, you can use `"*"` as a wildcard.
 * 
 * Which kind of matching will being used is determined as follows:
 * 
 * -  Forward match
 *    -  When the given pattern starts with `"*"` preceding `"/"`, forward matching is used.
 * -  Backward match
 *    -  When the given pattern ends with `"*"` succeeding `"/"`, backward matching is used.
 * -  Partial match
 *    -  When the given pattern starts with `"*"` preceding `"/"` and ends with  `"*"` succeeding `"/"`, partial matching is used.
 * -  Exact match
 *    -  When the given pattern does not match any of the above conditions, exact matching is used.
 * 
 */
class Pattern {
    /**
     * Represents whether test is done case-sensitively or not.
     */
    get isCaseSensitive () {
        return this.#is_case_sensitive;
    }

    /**
     * Given pattern string
     */
    get pattern () {
        return this.#pattern;
    }

    /**
     * Tokens in the given pattern. 
     */
    get tokens() {
        return this.#tokens.values();
    }

    /**
     * Labels in the given pattern. 
     */
    get labels() {
        return this.#label_id_name_dict.values();
    }

    /**
     * Kind of matching.
     */
    get kind() {
        return this.#kind;
    }

    /**
     * @constructor
     * 
     * @param {object} o 
     * @param {string} o.pattern
     * A string representing a pattern.
     * It should be a sequence of words or labels separated by slashes (`"/"`).
     * 
     * Where "label" means a string starting with a colon (`":"`).
     * 
     * The pattern can contain leading and/or trailing asterisks (`"*"`) as wildcards.
     * If an asterisk appears as a word in the middle of the pattern, it is not treated as a wildcard.
     * 
     * @param {boolean?} o.isCaseSensitive
     * A boolean indicating whether or not match is done case-sensitively.
     * Match is done case-sensitively if it is `true`, match is done case-insensitively otherwise.
     * 
     * By default, it is `false`, i.e. match is done case-insensitively.
     * 
     * @throws {TypeError}
     * -  when the given argument (`o`) is not a non-null object
     * -  when the given pattern (`o.pattern`) is not a string
     * -  when the given case-sensitivity flag (`o.isCaseSensitive`) is not a boolean
     */
    constructor(o) {
        if (o === null || typeof o !== "object") {
            throw new TypeError(`${o} is not a non-null object`);
        }

        const   pattern_           = o.pattern,
                is_case_sensitive_ = o.isCaseSensitive ?? false
        ;

        if (typeof pattern_ !== "string") {
            throw new TypeError(`${pattern_} is not a string`);
        } else if (typeof is_case_sensitive_ !== "boolean") {
            throw new TypeError(`${is_case_sensitive_} is not a boolean`);
        }
        const   tokens_              = pattern_.split("/"),
                label_id_name_dict_  = new Map(),
                label_name_pos_dict_ = new Map(),
                label_pos_id_dict_   = new Map()
        ;

        const
                kind_                = (
            (tokens_[0] === "*" && tokens_[tokens_.length - 1] === "*") ?
                "partial" :
            tokens_[0] === "*" ?
                "backward" :
            tokens_[tokens_.length - 1] === "*" ?
                "forward" :
                "exact"
        );

        switch (kind_) {
            case "partial": {
                if (tokens_.length >= 2) {
                    tokens_[tokens_.length - 1] = "";
                }
                tokens_[0] = "";
            }
            break;
            case "backward": {
                tokens_[0] = "";
            }
            break;
            case "forward": {
                tokens_[tokens_.length - 1] = "";
            }
            break;
        }

        const escaped_token_expr = /^\\:/;

        if (tokens_[0] === "\\*") {
            tokens_[0] = "*";
        }
        if (tokens_[tokens_.length - 1] === "\\*") {
            tokens_[tokens_.length - 1] = "*";
        }

        for (const [i, token] of tokens_.entries()) {
            if (token.startsWith(":")) {
                const   label       = token.slice(1),
                        label_index = label_id_name_dict_.size
                ;

                label_id_name_dict_.set(label_index, label);
                label_name_pos_dict_.set(label, i);
                label_pos_id_dict_.set(i, label_index);

                tokens_[i] = `:${label_index}`;
            } else {
                let s = token;
                if (!is_case_sensitive_) {
                    s = s.toLowerCase();
                }
                if (escaped_token_expr.test(s)) {
                    s = s.slice(1);
                }
                tokens_[i] = s;
            }
        }

        this.#pattern             = pattern_;
        this.#is_case_sensitive   = is_case_sensitive_;
        this.#tokens              = tokens_;
        this.#label_id_name_dict  = label_id_name_dict_;
        this.#label_name_pos_dict = label_name_pos_dict_;
        this.#label_pos_id_dict   = label_pos_id_dict_;
        this.#kind                = kind_;
    }

    /**
     * Test whether the given string match the pattern or not.
     * 
     * @param {string | Pattern} s 
     * A string or a `Pattern` to be tested.
     * 
     * @returns 
     * `true` if matched, `false` otherwise.
     */
    match(s) {
        if (s instanceof Pattern) {
            return Pattern.compare(this, s) === 0;
        } else if (typeof s !== "string") {
            return false;
        }

        return this.matchAt(s) >= 0;
    }

    /**
     * 
     * @param {string} s 
     * A string to be searched.
     * 
     * @returns 
     * An index of the matched position.
     * If the given string does not match the pattern, `-1` is returned.
     * 
     * For exact / forward matching, the returned index is always `0` (if matched).
     * 
     * @throws {TypeError}
     * -  When the given argument `s` is not a string
     */
    matchAt(s) {
        if (typeof s !== "string") {
            throw new TypeError(`${s} is not a string`);
        }

        const   given_tokens = s.split("/"),
                kind         = this.#kind,
                matched      = (this.isCaseSensitive ?
            (given_token, own_token) => (given_token === own_token) :
            (given_token, own_token) => (given_token.toLowerCase() === own_token)  // own_token is already lower-cased here
        );

        switch (kind) {
            case "exact": 
            case "forward":
            {
                if ((given_tokens.length < this.#tokens.length) ||
                    (kind === "exact" && given_tokens.length > this.#tokens.length)
                ) {
                    return -1;
                }

                const   first_index = 0,
                        last_index  = kind === "forward" ?
                            this.#tokens.length - 1 :
                            this.#tokens.length
                ;

                for (let i = first_index; i < last_index; i++) {
                    if (this.#label_pos_id_dict.has(i)) { continue; }

                    const   given_token = given_tokens[i],
                            own_token   = this.#tokens[i]
                    ;

                    if (!matched(given_token, own_token)) {
                        return -1;
                    }
                }

                return 0;
            }
            case "backward":
            {
                if (given_tokens.length < this.#tokens.length) {
                    return -1;
                }

                const   offset      = given_tokens.length - this.#tokens.length;
                
                const   first_index = 1,
                        last_index  = this.#tokens.length
                ;


                for (let i = first_index; i < last_index; i++) {
                    if (this.#label_pos_id_dict.has(i)) { continue; }

                    const   given_token = given_tokens[i + offset],
                            own_token   = this.#tokens[i]
                    ;

                    if (!matched(given_token, own_token)) {
                        return -1;
                    }
                }

                return offset + first_index;
            }
            case "partial":
            {
                if (given_tokens.length < this.#tokens.length) {
                    return -1;
                }

                const   first_index = 1,
                        last_index  = this.#tokens.length - 1
                ;

                const offset_max            = given_tokens.length - this.#tokens.length;
                let   offset                = 0, 
                      given_token           = "",
                      last_token            = "",
                      last_unmatched_index  = -1
                ;
                while (offset <= offset_max) {
                    for (let i = first_index; i < last_index; i++) {
                        if (this.#label_pos_id_dict.has(i)) { continue; }

                        given_token = given_tokens[i + offset];
                        last_token  = this.#tokens[i];

                        if (!matched(given_token, last_token)) {
                            last_unmatched_index = i;
                            break;
                        }
                    }
                    if (last_unmatched_index < 0) {
                        return offset + first_index;
                    } else {
                        let j = last_unmatched_index + offset + 1;
                        while (j < given_tokens.length) {

                            given_token = given_tokens[j];

                            if (matched(given_token, last_token)) {
                                break;
                            }
                            j++;
                        }
                        offset = j - last_unmatched_index;
                        last_unmatched_index = -1;
                    }
                }

                return -1;
            }
            default:
                throw new Error("UNREACHABLE");
        }
    }

    /**
     * Extracts parameters and from the given string.
     * 
     * @param {string} s 
     * A string containing parameters to be extracted.
     * 
     * @returns 
     * `null` if the given string does not match the pattern.
     * Otherwise, an object having the following properties is returned:
     * 
     * -  `params`:
     *    -  a set of the parameters
     * -  `first`:
     *    -  a sequence of words preceding the match
     * -  `last`:
     *    -  a sequence of words succeeding the match
     * 
     * @throws {TypeError}
     * -  When the given argument `s` is not a string
     */
    extract(s) {
        if (typeof s !== "string") {
            throw new TypeError(`${s} is not a string`);
        }
        const matched_at = this.matchAt(s);

        if (matched_at < 0) {
            return null;
        }

        const kind = this.kind;
        const offset = (kind === "backward" || kind === "partial") ? matched_at - 1 : matched_at;
        
        const given_tokens = s.split("/");

        /**
         * @type {({
         *     params: ({ [param_name: string]: string }),
         *     first: string[],
         *     last:  string[]
         * })}
         */
        const   result = Object.create(null);
        result.params  = Object.create(null);

        const   params = result.params;
        for (const [name, pos] of this.#label_name_pos_dict.entries()) {
            params[name] = given_tokens[pos + offset];
        }

        switch (kind) {
            case "backward":
            {
                result.first = given_tokens.slice(0, offset + 1);
                result.last  = [];
            }
            break;
            case "forward":
            {
                result.first = [];
                result.last  = given_tokens.slice(this.#tokens.length - 1);
            }
            break;
            case "partial":
            {
                result.first = given_tokens.slice(0, offset + 1);
                result.last  = given_tokens.slice(offset + this.#tokens.length - 1);
            }
            break;
            case "exact":
            {
                result.first = [];
                result.last  = [];
            }
            break;
        }

        return result;
    }

    /**
     * Replaces labels with the given parameters.
     *  
     * @param {any[] | object} params 
     * Values of labels.
     * 
     * @returns A pattern string 
     *
     * @throws {TypeError}
     * -  when the given argument `params` is not a non-null object 
     * -  when the number of the given parameters is fewer than the number of the labels.
     */
    map(params) {
        if (params === null || typeof params !== "object") {
            throw new TypeError(`${params} is not a non-null object`);
        }

        if  (Array.isArray(params)) {
            {
                const expected_count = this.#label_id_name_dict.size;
                const actual_count   = params.length;
                if (actual_count < expected_count) {
                    throw new TypeError(
                        `Too few parameters were given. ` +
                        `${expected_count} parameters were expected but ${actual_count} were given.`
                    );
                }
            }

            const mapped_words = [...this.#tokens];
            let j = 0;
            for (const i of this.#label_pos_id_dict.keys()) {
                mapped_words[i] = (String(params[j]));
                j++;
            }
            return mapped_words.join("/");
        } else {
            for (const k in params) {
                if (!this.#label_name_pos_dict.has(k)) {
                    Alier.Sys.logw(0,
                        `${this.constructor.name}::${this.map.name}(): ` +
                        `variable ${JSON.stringify(k)} is unused in this pattern (${this.pattern}).`
                    );
                }
            }
            for (const k of this.#label_name_pos_dict.keys()) {
                if (!Object.prototype.hasOwnProperty.call(params, k)) {
                    throw new TypeError(`Value of a variable ${JSON.stringify(k)} was not provided`);
                }
            }

            const mapped_words = [...this.#tokens];
            for (const [i, pos] of this.#label_pos_id_dict.entries()) {
                mapped_words[i] = String(params[this.#label_id_name_dict.get(pos)]);
            }
            return mapped_words.join("/");
        }
    }

    /**
     * Tests whether or not there is a label named as the same as the given string.
     * 
     * @param {string} label
     * A string representing a label name.
     * 
     * @returns 
     * `true` if there is a label named as the same as the given string.
     * `false` otherwise.
     */
    has(label) {
        return (
            typeof label === "string" && 
            this.#label_name_pos_dict.has(label)
        );
    }

    /**
     * Compares two given `Pattern`s.
     * 
     * @param {Pattern} x
     * a left-hand-side comparate
     * 
     * @param {Pattern} y
     * a right-hand-side comparete
     * 
     * @returns
     * a negative value if the lhs is less than the rhs, 
     * or `0` if the lhs equals rhs,
     * or otherwise a positive value.
     * 
     * Note that this function compares the order token by token and a label always matches the other.
     * e.g., "/foo/:var0/bar" and "/foo/42/bar" are treated as the same pattern because `:var0` matches `42`.
     * In this case, the `compare()` function returns `0`.
     * 
     * In addition, the kind of match affect the order as follows:
     * 
     * -  Forward match is greater than exact match.
     *    -   e.g., a forward match pattern `"/ foo / bar / *"` is greater than an exact match `"/ foo / bar /"`
     * -  Backward match is greater than forward match.
     *    -   e.g., a backward match pattern `"* / foo / bar /"` is greater than a forward match `"/ foo / bar / *"`
     * -  Partial match is greater than backward match.
     *    -   e.g., a partial match pattern `"* / foo / bar / *"` is greater than a backward match `"* / foo / bar /"`
     */
    static compare(x, y) {
        if (!((x instanceof Pattern) && (y instanceof Pattern))) {
            return (x > y) - (x < y);
        }

        if (
            (x.kind === "backward" || x.kind === "partial") &&
            (y.kind === "exact"    || y.kind === "forward")
        ) {
            return 1;
        } else if (
            (y.kind === "backward" || y.kind === "partial") &&
            (x.kind === "exact"    || x.kind === "forward")
        ) {
            return -1;
        }

        const   x_tokens = x.#tokens,
                y_tokens = y.#tokens,
                x_len    = x_tokens.length,
                y_len    = y_tokens.length
        ;

        for (const i of (x_len < y_len ? x_tokens.keys() : y_tokens.keys())) {
            if (x.#label_pos_id_dict.has(i) || y.#label_pos_id_dict.has(i)) { continue; }

            const tx  = x_tokens[i],
                  ty  = y_tokens[i],
                  ord = (tx > ty) - (tx < ty)
            ;

            if (ord !== 0) {
                return ord;
            }
        }

        const ord = (x_len > y_len) - (x_len < y_len);
        
        if (ord !== 0) {
            return ord;
        }

        const x_kind = (
            x.kind === "exact" ?
                0 :
            x.kind === "forward" ?
                1 :
            x.kind === "backward" ?
                2 :
                3
        );
        const y_kind = (
            y.kind === "exact" ?
                0 :
            y.kind === "forward" ?
                1 :
            y.kind === "backward" ?
                2 :
                3
        );

        return (x_kind > y_kind) - (x_kind < y_kind);
    }

    /**
     * Escapes special characters in the given string.
     * 
     * Where "special character" means a character matching one of the succeeding patterns:
     * 
     * -  A colon succeeding a slash `"/"`
     * -  An asterisk appearing at the head of the string which precedes a slash `"/"`
     * -  An asterisk appearing at the tail of the string which succeeds a slash `"/"`
     * 
     * @param {string} s 
     * A string to be escaped.
     * 
     * @returns 
     * escaped string.
     * 
     * @throws {TypeError}
     * -  when the given argument `s` is not a string
     * 
     * @see
     * -  {@link Pattern.unescape}
     */
    static escape(s) {
        if (typeof s !== "string") {
            throw new TypeError(`${s} is not a string`);
        }

        return s.replaceAll(Pattern.#escape_regex, (ss) => (ss.startsWith("/") ? `/\\${ss.slice(1)}` : `\\${ss}`));
    }

    /**
     * Replaces escape sequences in the given string.
     * 
     * Where "escape sequence" means a substring matching one of the succeeding patterns:
     * 
     * -  A colon with a preceding backslash `"\\:"` which succeeds a slash `"/"`
     * -  An asterisk with a preceding backslash `"\\*"` which appears at the head of the string and precedes a slash `"/"`
     * -  An asterisk with a preceding backslash `"\\*"` which appears at the tail of the string and succeeds a slash `"/"`
     * 
     * @param {string} s 
     * A string to be unescaped.
     * 
     * @returns 
     * unescaped string.
     * 
     * @throws {TypeError}
     * -  when the given argument `s` is not a string
     * 
     * @see
     * -  {@link Pattern.escape}
     */
    static unescape(s) {
        if (typeof s !== "string") {
            throw new TypeError(`${s} is not a string`);
        }

        return s.replaceAll(Pattern.#unescape_regex, (ss) => (ss.startsWith("/") ? "/" + ss.slice(2) : ss.slice(1)));
    }

    static #escape_regex   = /\/(?::|\*$)|^(?::|\*(?=\/))/g;
    static #unescape_regex = /\/(?:\\:|\\\*$)|^(?:\\:|\\\*(?=\/))/g;

    #pattern;
    #is_case_sensitive;
    #tokens;
    /**
     * @type {Map<number, string>}
     */
    #label_id_name_dict;
    /**
     * @type {Map<string, number>}
     */
    #label_name_pos_dict;
    /**
     * @type {Map<number, number>}
     */
    #label_pos_id_dict;

    /**
     * @type { "exact" | "forward" | "backward" | "partial" }
     */
    #kind;
}

/** @exports "./Pattern.js" */
module.exports = {
    Pattern
};
