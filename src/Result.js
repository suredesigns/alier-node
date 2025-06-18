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
 * @template T
 */
class __Result__ {
    /** @param {T} o */
    constructor(o) {
        if (new.target !== __Result__) {
            throw new SyntaxError("You cannot extend this class");
        }
        Object.assign(this, o);
    }
};

/**
 * @async
 * Tests whether the given `Promise` is resolved or rejected and then returns its value.
 * @template {T}
 * @param {Promise<T>} o a `Promise` to be enveloped
 * @returns {Promise<{ ok: T }> | Promise<{ error: Error }>}
 * If the given `Promise` is resolved, then returns a `Promise` enveloping a `{ ok: any }`.
 * 
 * Otherwise, if the given `Promise` is rejected, then returns a `Promise` enveloping a `{ error: Error }`.
 */
async function Result(o) {
    if (o instanceof __Result__) {
        return o;
    } else if (o instanceof Promise) {
        try {
            const ok = await o;
            if (ok instanceof __Result__) {
                return ok;
            } else {
                return new __Result__({ ok: ok });
            }
        } catch(error) {
            return new __Result__({ error: error });
        }
    } else {
        return new __Result__({ ok: o });
    }
}

module.exports = { Result };
