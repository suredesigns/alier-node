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

const _secret = Symbol();

class OverloadModifier {
    /** @type {Map<string|symbol, function>} */
    #functions = new Map();

    constructor(secret) {
        if (new.target !== OverloadModifier || secret !== _secret) {
            throw new SyntaxError(`${new.target.name} is not a constructor`);
        }
    }

    define(functionName, implementation) {
        const function_name   = functionName;
        const implementation_ = implementation;

        if (typeof function_name !== "string" && typeof function_name !== "symbol") {
            throw new TypeError(`Given functionName (${functionName}) is neither a string nor a symbol`);
        } else if (typeof implementation_ !== "function") {
            throw new TypeError(`Given implementation (${implementation}) is not a function`);
        }

        this.#functions.set(function_name, implementation_);

        return this;
    }

    get(functionName) {
        return this.#functions.get(functionName);
    }
}

class Overload {
    /** @type {WeakMap<function, OverloadModifier>} */
    static #repo = new WeakMap();

    /**
     * Gets or creates an `OverloadModifier` for the given constructor.
     * 
     * @param {function} constructor 
     * 
     * @returns {OverloadModifier}
     * an `OverloadModifier` of the given constructor.
     */
    static for(constructor) {
        const constructor_ = constructor;
        if (typeof constructor_ !== "function") {
            throw new TypeError(`Given constructor (${constructor}) is not a function`);
        }

        let modifier = this.#repo.get(constructor);
        if (modifier == null) {
            modifier = new OverloadModifier(_secret);
            this.#repo.set(constructor_, modifier);
        }

        return modifier;
    }

    /**
     * Invokes the specified function.
     * 
     * @param {object} thisArg 
     * target object.
     * 
     * @param {string|symbol} functionName 
     * A string or a symbol representing a function name.
     * 
     * @param  {...any} args 
     * @returns return value of the invoked function.
     */
    static invoke(thisArg, functionName, ...args) {
        if (thisArg == null) {
            throw new TypeError(`Given thisArg (${thisArg}) is null or undefined`);
        }

        const overload = Overload.get(thisArg, functionName);
        if (overload != null) {
            return overload.apply(thisArg, args);
        } else {
            return thisArg[functionName](...args);
        }
    }

    /**
     * Gets a function.
     * 
     * @param {object} thisArg 
     * target object
     * @param {string|symbol} functionName 
     * A string or a symbol representing a function name.
     * 
     * @returns `undefined` if the specified function is not defined, `function` otherwise.
     */
    static get(thisArg, functionName) {
        const function_name = functionName;
        if (thisArg == null) {
            return undefined;
        } else if (typeof function_name !== "string" && typeof function_name !== "symbol") {
            return undefined;
        }

        for (let proto = Object.getPrototypeOf(thisArg);
            proto?.constructor != null;
            proto = Object.getPrototypeOf(proto)
        ) {
            const overload = Overload.#repo.get(proto.constructor)?.get(function_name);
            if (overload != null) {
                return overload;
            }
        }

        return Overload.#repo.get(Object)?.get(functionName);
    }
}

/// Platform Specific -->
module.exports = { Overload };
/// <-- Platform Specific
