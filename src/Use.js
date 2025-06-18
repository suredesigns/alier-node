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
 * Makes an async function requiring a function which consumes the given closable object.
 *
 * The consumer works as a code block and this function itself works as special statement such like `try-catch`.
 * 
 * @param {({ close: () => Promise<void> })} closable 
 * An object implementing close method which returns a `Promise<void>`.
 * 
 * @template T
 * @returns {(consumer: (closable: {close: () => Promise<void>}) => T) => Promise<T>}
 * an async function requiring a function which consumes the given closable.
 */
const Use = (closable) => {
    if (closable === null || typeof closable !== "object") {
        throw new TypeError(`${closable} is not a non-null object`);
    } else if (typeof closable.close !== "function") {
        throw new TypeError(`${closable} is not a closable`);
    }

    let closed = false;

    return async (consumer) => {
        if (closed) {
            throw new Error("Already closed");
        } else if (typeof consumer !== "function") {
            throw new TypeError(`${consumer} is not a function`);
        }

        try {
            return await consumer.call(closable, closable);
        } finally {
            await closable.close();
            closed = true;
        }
    };
}

module.exports = {
    Use
};
