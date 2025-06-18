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
 * A symbol used for getting a `Promise` from a delegate object returned by the function `LazyNew()`.
 * The `Promise` is expected to be resolved after completion of initialization of the delegate's implementation.
 * 
 * @see
 * -    {@link LazyNew}
 */
const LazyNew$initialized = Symbol("LazyNew$initialized");

/**
 * Creates a delegate of an instance of the given constructor.
 * The delegate defers construction until using the instance is used.
 * 
 * @param {function} ctor 
 * A constructor function to be invoked when one of its instance's methods or properties is used.
 * 
 * @param {(ctor: function) => (Promise<any> | any)} initializer 
 * A function used for initialization of the given constructor.
 * This function must return an instance of the given constructor `ctor`,
 * and hence the returned value must be an object in the strict sense, i.e. it must be an object being neither null nor a function nor null-prototyped.
 * 
 * If the initializer function returns a `Promise`, 
 * its resolution can be awaited by using the `[LazyNew$initialized]` property of the delegate object returned by the function `LazyNew()`.
 * 
 * Note that, the function `LazyNew()` can only check whether the initializer has already been invoked or not.
 * Therefore, there may be an overhead to check the existence of an initialized instance for each method call including the use of getters/setters.
 * To avoid this overhead, in the initializer, you should replace all values of variables and/or properties binding the delegate with the same value as the return value.
 * 
 * @returns 
 * A delegate.
 * 
 * @throws {TypeError}
 * -    when the given argument `ctor` is not a function
 * -    when the given argument `initializer` is not a function
 * -    when the given initializer does not return neither an instance of the given constructor nor a `Promise` enveloping it
 * 
 * @throws {ReferenceError}
 * -    when an improper this argument is given for the delegate's function
 * 
 * @see
 * -    {@link LazyNew$initialized}
 */
const LazyNew = (ctor, initializer) => {
    if (typeof ctor !== "function") {
        throw new TypeError(`ctor ${ctor} is not a function`);
    } else if (typeof initializer !== "function") {
        throw new TypeError(`initializer ${initializer} is not a function`);
    }

    const initializer_ = initializer;

    let _init_resolve, _init_reject, _init_promise = new Promise((resolve, reject) => {
        _init_resolve = resolve;
        _init_reject  = reject;
    });
    const delegate = Object.defineProperty(Object.create(null), LazyNew$initialized, {
        enumerable  : false,
        configurable: false,
        writable    : false,
        value       : _init_promise
    });

    let _wait_resolved = false;
    let _impl = null;

    const descriptors = Object.getOwnPropertyDescriptors(ctor.prototype);
    for (const key of [...Object.getOwnPropertyNames(descriptors), ...Object.getOwnPropertySymbols(descriptors)]) {
        const desc = descriptors[key];

        if (typeof desc.value === "function") {
            Object.defineProperty(delegate, key, {
                enumerable  : false,
                configurable: false,
                writable    : false,
                value       : function(...args) {
                    if (this !== delegate) {
                        throw new ReferenceError("Improper \"this\" argument was given.");
                    } else if (_impl != null) {
                        return _impl[key](...args);
                    } else if (_wait_resolved) {
                        return this[LazyNew$initialized].then(() => {
                            return _impl[key](...args);
                        });
                    } else {
                        const instance = initializer_(ctor);

                        if (instance instanceof Promise) {
                            _wait_resolved = true;

                            return instance.then((instance) => {
                                if (!(instance instanceof ctor)) {
                                    throw new TypeError(`A value returned from the given initializer (${instance}) is not an instance of the given constructor (${ctor}).`);
                                }

                                _impl = instance;
                            }).then(() => {
                                _init_resolve(true);
                                return _impl[key](...args);
                            }, _init_reject);
                        } else {
                            if (!(instance instanceof ctor)) {
                                throw new TypeError(`A value returned from the given initializer (${instance}) is not an instance of the given constructor (${ctor}).`);
                            }

                            _impl = instance;
                            return _impl[key](...args);
                        }
                    }
                }
            });
        } else {
            Object.defineProperty(delegate, key, {
                enumerable  : false,
                configurable: false,
                get() {
                    if (this !== delegate) {
                        throw new ReferenceError("Improper \"this\" argument was given.");
                    } else if (_impl != null) {
                        return _impl[key];
                    } else if (_wait_resolved) {
                        return this[LazyNew$initialized].then(() => {
                            return _impl[key];
                        });
                    } else {
                        const instance = initializer_(ctor);

                        if (instance instanceof Promise) {
                            _wait_resolved = true;

                            return instance.then((instance) => {
                                if (!(instance instanceof ctor)) {
                                    throw new TypeError(`A value returned from the given initializer (${instance}) is not an instance of the given constructor (${ctor}).`);
                                }

                                _impl = instance;
                            }).then(() => {
                                _init_resolve(true);
                                return _impl[key];
                            }, _init_reject);
                        } else {
                            if (!(instance instanceof ctor)) {
                                throw new TypeError(`A value returned from the given initializer (${instance}) is not an instance of the given constructor (${ctor}).`);
                            }

                            _impl = instance;
                            return _impl[key];
                        }
                    }
                },
                set(value) {
                    if (this !== delegate) {
                        throw new ReferenceError("Improper \"this\" argument was given.");
                    } else if (_impl != null) {
                        _impl[key] = value;
                    } else if (_wait_resolved) {
                        this[LazyNew$initialized].then(() => {
                            _impl[key] = value;
                        });
                    } else {
                        const instance = initializer_(ctor);

                        if (instance instanceof Promise) {
                            _wait_resolved = true;
                            
                            instance.then((instance) => {
                                if (!(instance instanceof ctor)) {
                                    throw new TypeError(`A value returned from the given initializer (${instance}) is not an instance of the given constructor (${ctor}).`);
                                }

                                _impl = instance;
                            }).then(() => {
                                _init_resolve(true);
                                _impl[key] = value;
                            }, _init_reject);
                        } else {
                            if (!(instance instanceof ctor)) {
                                throw new TypeError(`A value returned from the given initializer (${instance}) is not an instance of the given constructor (${ctor}).`);
                            }

                            _impl = instance;
                            _impl[key] = value;
                        }
                    }
                }
            });
        }
    }

    return delegate;
}

/// Platform Specific -->
module.exports = { LazyNew, LazyNew$initialized };
/// <-- Platform Specific
