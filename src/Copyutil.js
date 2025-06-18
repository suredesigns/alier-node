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
 * Deserializes the given JSON string.
 * 
 * This function is almost equivalent of `JSON.parse()` function
 * but it tests whether the given JSON contains `__proto__` property or not.
 * 
 * If the the JSON contains  `__proto__` property, that property will not be used.
 * 
 * @param {string} json 
 * A JSON string to be deserialized.
 * 
 * @param {((key: string, value: any, context: ({ source: string })?) => ( any | undefined ))?} reviver 
 * A reviver function which modifies the value corresponding to the given key by returning the modified value or `undefined` for deletion.
 * 
 * @returns 
 */
const parseJson = (json, reviver) => {
    //  test whether or not the reviver function is provided before invoking JSON.parse()
    //  because typically the JSON contains multiple properties and the reviver function is called for every property and
    //  if you do check the type inside of the below anonymous function, it may cause unnecessary type check. 
    if (typeof reviver === "function") {
        //  Due to capture the this argument given by the JSON.parse(),
        //  use function expression instead of arrow function expression here.
        return JSON.parse(json, function (key, value, context) {
            if (key === "__proto__") {
                return undefined;
            } else {
                //  the "context" argument is available Node.js v21 or higher
                //  (but be aware that the lowest "stable" version is v22).
                return reviver.call(this, key, value, context);
            }
        });
    } else {
        return JSON.parse(json, (key, value) => {
            if (key === "__proto__") {
                return undefined;
            } else {
                return value;
            }
        });
    }
};


/**
 * Assigns the given source objects into the given target object.
 * 
 * This function is almost equivalent of `Object.assign()` function
 * but it tests whether any of the source objects has `__proto__` property or not.
 *  
 * If the source object has `__proto__` property, the `__proto__` property will be copied.
 * 
 * @param {object} target 
 * target object to be assigned to
 * @param  {...object} sources 
 * a set of source objects.
 * 
 * @returns target object
 */
const merge = (target, ...sources) => {

    for (const source of sources) {
        for (const k in source) {
            if (!Object.prototype.hasOwnProperty.call(source, k) || k === "__proto__") { continue; }
            target[k] = source[k];
        }
    }
    return target;
}

module.exports = {
    merge,
    parseJson
};