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

const { Pattern } = require("./Pattern.js");

class __Node__ {

    get value() { return this.#value; }
    set value(newValue) {
        this.#value = newValue ?? undefined;
    }

    *[Symbol.iterator]() {
        const refs = new WeakSet();
        /**
         * @type {__Node__[]}
         */
        const buf = [this];
        while (buf.length > 0) {
            /** @type {__Node__} */
            const node = buf.pop();
            refs.add(node);
            yield node;
            for (const descendant of node.#descendants.values()) {
                if (refs.has(descendant)) { continue; }
                buf.push(descendant);
            }
        }
    }

    /**
     * Serialises itself in JSON format.
     * 
     * Each of nodes is serialised as follows:
     * ```
     * [ node.value, { [key]} ]
     * ``` 
     */
    toJSON() {
        const random_hex = () => {
            let candidate = ((Number.MAX_SAFE_INTEGER + 1) * Math.random()).toString(16);
            while (__Node__.#random_ids.has(candidate)) {
                candidate = ((Number.MAX_SAFE_INTEGER + 1) * Math.random()).toString(16);
            }
            return candidate;
        };
        const refs = new WeakSet();
        /**
         * @type {__Node__[]}
         */
        const json_root = [this.value ?? null, Object.create(null)];
        const buf = [[this, json_root]];
        while (buf.length > 0) {
            /** @type {__Node__} */
            const [node, json_ref] = buf.pop();
            refs.add(node);

            const o = json_ref[1];
            for (const [key, descendant] of node.#descendants.entries()) {
                if (refs.has(descendant)) { continue; }
                let sub_key = __Node__.#substitute_symbols.get(key);

                if (sub_key === undefined) {
                    switch (typeof key) {
                    case "string":
                    {
                        sub_key = key;
                    }
                    break;
                    case "number":
                    case "bigint":
                    case "boolean":
                    {
                        sub_key = key.toString();
                    }
                    break;
                    case "undefined":
                    {
                        sub_key = "undefined";
                    }
                    break;
                    case "symbol":
                    {
                        sub_key = key.description === undefined ? `Symbol(${random_hex()})` : key.toString();
                        __Node__.#substitute_symbols.set(key, sub_key);
                    }
                    break;
                    case "function":
                    {
                        sub_key = `Function(${key.name})`;
                        __Node__.#substitute_symbols.set(key, sub_key);
                    }
                    break;
                    case "object":
                    {
                        if (key === null) {
                            sub_key = "null";
                        } else {
                            sub_key = `Object(${random_hex()})`;
                            __Node__.#substitute_symbols.set(key, sub_key);
                        }
                    }
                    break;
                    default:
                        throw new Error("UNREACHABLE");
                    }
                }

                o[sub_key] = [descendant.value ?? null, Object.create(null)];
                buf.push([descendant, o[sub_key]]);
            }
        }
        return JSON.stringify(json_root);
    }

    valueOf() { return this.value; }

    has(key) {
        return this.#descendants.has(key);
    }

    get(...keys) {
        /**
         * @type {__Node__ | undefined }
         */
        let node = this;

        for (const key of keys) {
            node = node.#descendants.get(key);
            if (!(node instanceof __Node__)) {
                return undefined;
            }
        }

        return node;
    }

    remove() {
        for (const [key, ancestor] of this.#ancestors.entries()) {
            ancestor.#descendants.delete(key);
            this.#ancestors.delete(key);
        }

        return this;
    }

    set(key, descendant) {
        if (!(descendant instanceof __Node__)) {
            throw new TypeError(`${descendant} is not a node`);
        }

        descendant.#ancestors.set(key, this);
        this.#descendants.set(key, descendant);

        return this;
    }

    getBack(...keys) {
        /**
         * @type {__Node__ | undefined }
         */
        let node = this;

        for (const key of keys) {
            node = node.#ancestors.get(key);
            if (!(node instanceof __Node__)) {
                return undefined;
            }
        }

        return node;
    }

    static #random_ids         = new Set();
    static #substitute_symbols = new Map();

    /**
     * @type { Map<any, __Node__> }
     */
    #ancestors  = new Map();

    /**
     * @type { Map<any, __Node__> }
     */
    #descendants = new Map();

    /**
     * @type {any}
     */
    #value       = undefined;

}
/** 
 * @class
 * 
 * @template T
 */
class PatternMap {
    /**
     * Gets a value paired with the given pattern.
     * 
     * @param {Pattern} pattern 
     * A pattern object corresponding to the value to be retrieved.
     * 
     * @returns {T | undefined}
     * The value corresponding to the given pattern if it exists, `undefined` otherwise.
     */
    get(pattern) {
        if (!(pattern instanceof Pattern)) {
            throw new TypeError(`${pattern} is not a Pattern`);
        }

        return this.#getNode(pattern)?.value;
    }

    /**
     * Adds a pair of a key and a value.
     * 
     * @param {Pattern} pattern 
     * A pattern indicating the given value.
     * 
     * @param {T} value
     * A value to be set.
     */
    set(pattern, value) {
        if (!(pattern instanceof Pattern)) {
            throw new TypeError(`${pattern} is not a Pattern`);
        } else if (!(pattern.kind === "exact" || pattern.kind === "forward")) {
            throw new TypeError(`${pattern.kind} matching is not allowed`);
        }

        let node = this.#root;

        for (const key of PatternMap.#getKeys(pattern)) {
            const prev_node = node;

            if (node.has(PatternMap.#wordwise_wildcard)) {
                node = prev_node.get(PatternMap.#wordwise_wildcard);
            } else if (node.has(PatternMap.#wildcard)) {
                node = prev_node.get(PatternMap.#wildcard);
                break;
            } else if (node.has(key)) {
                node = prev_node.get(key);
            } else {
                node = new __Node__();
                prev_node.set(key, node);
            } 
        }

        node.value = value;

        return this;
    }

    /**
     * Tests whether or not the given pattern is set.
     * 
     * @param {Pattern} pattern 
     * A pattern to be tested.
     * 
     * @returns
     * `true` if the given pattern is registered on this map, `false` otherwise.
     */
    has(pattern) {
        return (pattern instanceof Pattern) && this.#getNode(pattern) !== undefined;
    }

    /**
     * Deletes the entry corresponding to the given pattern.
     * 
     * @param {Pattern} pattern 
     * A pattern indicating the target entry.
     * 
     * @returns
     * `true` if the target entry is removed, `false` otherwise.
     */
    delete(pattern) {
        if (!(pattern instanceof Pattern)) {
            throw new TypeError(`${pattern} is not a Pattern`);
        }

        const node = this.#getNode(pattern);
        if (node === undefined) {
            return false;
        } else {
            node.remove();
            return true;
        }
    }

    /**
     * Converts itself to a JSON formatted string.
     * 
     * This function is equivalent to {@link toString}.
     * 
     * @returns
     * JSON string representing this map.
     */
    toJSON() {
        return this.#root.toJSON();
    }

    /**
     * Gets a string representation of this map.
     * 
     * This function is equivalent to {@link toJSON}.
     * 
     * @returns
     * JSON string representing this map.
     */
    toString() {
        return this.#root.toJSON();
    }

    #getNode(pattern) {
        if (!(pattern instanceof Pattern)) {
            throw new TypeError(`${pattern} is not a Pattern`);
        }

        let node = this.#root;
        for (const key of PatternMap.#getKeys(pattern)) {
            if (node.has(PatternMap.#wildcard)) {
                return node.get(PatternMap.#wildcard);
            }

            const next_node = (
                node.has(PatternMap.#wordwise_wildcard) ?
                    node.get(PatternMap.#wordwise_wildcard) :
                    node.get(key)
            );

            if (next_node === undefined) {
                return undefined;
            } else {
                node = next_node;
            }
        }

        return node;
    }

    static *#getKeys(pattern) {
        if (!(pattern instanceof Pattern)) {
            throw new TypeError(`${pattern} is not a Pattern`);
        }
        const tokens_iter = pattern.tokens;
        let prev = tokens_iter.next().value;

        for (const token of tokens_iter) {
            
            yield prev.startsWith(":") ?
                PatternMap.#wordwise_wildcard :
                prev
            ;

            prev = token;
        }
        
        if (pattern.kind === "forward") {
            yield PatternMap.#wildcard;
        } else {
            yield prev.startsWith(":") ?
                PatternMap.#wordwise_wildcard :
                prev
            ;
        }
    }

    static #wordwise_wildcard = Symbol("wordwise_wildcard");
    static #wildcard          = Symbol("wildcard");

    #root = new __Node__();
}

module.exports = {
    PatternMap
};
