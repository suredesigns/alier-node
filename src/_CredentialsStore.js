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

const path = require("node:path");
const fs = require("node:fs");
const fsPromises = require("node:fs/promises");

let _gdbm,
    _debug_gdbm = false;
try {
    if (process.env.ALIER_GDBM_DEBUG === "1") {
        _gdbm = require("../build/Debug/gdbm_binding");
        _debug_gdbm = true;
    } else {
        _gdbm = require("../build/Release/gdbm_binding");
    }
} catch (e) {
    if (e.code !== "MODULE_NOT_FOUND") {
        throw e;
    }
}
const gdbm = _gdbm;

/**
 * @interface
 */
class AbstractCredentialStore {
    /**
     * @returns {string}
     */
    static get typeName() {
        throw new Error("not implemented");
    }

    /**
     * @returns {boolean}
     */
    static get isAvailable() {
        throw new Error("not implemented");
    }

    /**
     * Create the store.
     * @param {Object} args - Initialize arguments
     */
    constructor(args) {}

    /**
     * @returns {number}
     */
    get size() {
        throw new Error("not implemented");
    }

    /**
     * Sign-up new account.
     * @async
     * @template V
     * @param {string} key - Account identifier.
     * @param {V} [value] - Optional. Initialize value.
     * @returns {Promise<boolean>} If sign-up success, return true, otherwise false.
     */
    async signup(key, value) {
        throw new Error("not implemented");
    }

    /**
     * Remove the account.
     * @async
     * @param {string} key - Account identifier to remove.
     * @returns {Promise<boolean>} Success to remove or not.
     */
    async remove(key) {
        throw new Error("not implemented");
    }

    /**
     * Get a value with the key.
     * @async
     * @template V
     * @param {string} key - Account identifier.
     * @returns {Promise<V|undefined>} Account data. If key is invalid, return undefined.
     */
    async get(key) {
        throw new Error("not implemented");
    }

    /**
     * Check the account exists.
     * @async
     * @param {string} key - Account identifier.
     * @returns {Promise<boolean>} If account exists, return true, otherwise false.
     */
    async has(key) {
        throw new Error("not implemented");
    }

    /**
     * Update the value to the data store.
     * @async
     * @template V
     * @param {string} key - The field key to set the value.
     * @param {V} value - Set value.
     * @param {boolean} allowNewKey - Allow new key to stored value.
     * @returns {Promise<boolean>} Success to set or not.
     */
    async update(key, value, allowNewKey) {
        throw new Error("not implemented");
    }

    /**
     * Delete the value in the `deletePath`.
     * @async
     * @param {string} key - Account identifier.
     * @param {{ [key: string]: boolean|null }} [projection]
     * Projection to the delete data.
     * If property is true, delete key.
     * If property is null, replace the value to null.
     * If undefined, replaced by null.
     * @returns {Promise<boolean>} Success to delete or not.
     */
    async delete(key, projection) {
        throw new Error("not implemented");
    }
}

class InMemoryCredentialStore extends AbstractCredentialStore {
    static get typeName() {
        return "inmemory";
    }

    static get isAvailable() {
        return true;
    }

    _store;

    /**
     * @param {object} args
     */
    constructor(args) {
        super(args);
        this._store = new Map();
    }

    get size() {
        return this._store.size;
    }

    /**
     * Register the new account.
     * @async
     * @template V
     * @param {string} key - Account identifier.
     * @param {{ [key: string]: V }} [value] - Optional. Initialize value.
     * @returns {Promise<boolean>} If sign-up success, return true, otherwise false.
     */
    async signup(key, value) {
        if (this._store.has(key)) {
            return false;
        }
        const setValue = value == null ? value : deepFreeze(toNullObject(value));
        this._store.set(key, setValue);
        return true;
    }

    /**
     * Remove the account.
     * @async
     * @param {string} key - Account identifier to remove.
     * @returns {Promise<boolean>} Success to remove or not.
     */
    async remove(key) {
        return this._store.delete(key);
    }

    /**
     * Check the account exists.
     * @async
     * @param {string} key - Account identifier.
     * @returns {Promise<boolean>} If account exists, return true, otherwise false.
     */
    async has(key) {
        return this._store.has(key);
    }

    /**
     * Get a value with the key.
     * @async
     * @template V
     * @param {string} key - Account identifier.
     * @returns {Promise<V|undefined>}
     * A value with the key. If key is invalid, return undefined.
     */
    async get(key) {
        if (!this._store.has(key)) {
            return undefined;
        }
        return this._store.get(key);
    }

    /**
     * Update the value to the data store with the key.
     * @async
     * @template V
     * @param {string} key - The field key to set the value.
     * @param {V} value - Set value.
     * @param {boolean} allowNewKey - Allow new key to stored value.
     * @returns {Promise<boolean>} Success to set or not.
     */
    async update(key, value, allowNewKey) {
        if (!this._store.has(key)) {
            return false;
        }
        if (value == null) {
            return false;
        }
        const oldValue = this._store.get(key);
        let newValue;
        try {
            newValue = deepFreeze(structuredMerge(oldValue, value, allowNewKey));
        } catch (e) {
            return false;
        }
        this._store.set(key, newValue);
        return true;
    }

    /**
     * Delete the value in the `deletePath`.
     * @async
     * @param {string} key - Account identifier.
     * @param {{ [key: string]: boolean|null }} [projection]
     * Projection to the delete data.
     * If property is true, delete key.
     * If property is null, replace the value to null.
     * If undefined, replaced by null.
     * @returns {Promise<boolean>} Success to delete or not.
     */
    async delete(key, projection) {
        if (projection == null) {
            this._store.set(key, null);
            return true;
        }

        const data = this._store.get(key);
        if (data == null) {
            return false;
        }

        try {
            const newData = deleteNestedObject(data, projection);
            this._store.set(key, newData);
            return true;
        } catch {
            return false;
        }
    }
}

class JsonCachedCredentialStore extends InMemoryCredentialStore {
    static get typeName() {
        return "jsoncached";
    }

    static get isAvailable() {
        return true;
    }

    static #EXT = ".json";
    static #MODE = 0o640;

    /** @type {string} */
    #filepath;

    /**
     * Create the store by simply .json file and cached memory.
     * This store must be for debugging.
     * @param {Object} args - Initialize arguments
     * @param {string} args.name - Table name. File name will be `name`.json.
     * @param {string} [args.dirpath]
     * Directory path to save/load the data, relative to entry script or absolute path.
     * If undefined, file path to save/load the data is same directory with entry script.
     */
    constructor(args) {
        const args_ = { name: args.name, dirpath: args.dirpath };
        super(args_);

        if (typeof args_.name !== "string") {
            throw new TypeError("name must be string");
        }
        if (typeof args_.dirpath !== "string" && args_.dirpath !== undefined) {
            throw new TypeError("path must be string or undefined");
        }

        const ext = JsonCachedCredentialStore.#EXT;
        const filename = path.extname(args_.name) === "" ? args_.name + ext : args_.name;

        const pathList = [];
        if (args_.dirpath != null && path.isAbsolute(args_.dirpath)) {
            pathList.push(args_.dirpath);
        } else {
            pathList.push(require.main.path);
            if (args_.dirpath != null) {
                pathList.push(args_.dirpath);
            }
        }
        pathList.push(filename);
        this.#filepath = path.resolve(...pathList);

        if (fs.existsSync(this.#filepath)) {
            const contents = fs.readFileSync(this.#filepath, { encoding: "utf-8" });
            const values = JSON.parse(contents, reviverFreezeNullObj);
            for (const [key, value] of Object.entries(values)) {
                this._store.set(key, value);
            }
        }
    }

    get size() {
        return this._store.size;
    }

    async #saveMem(store, filepath) {
        const mode = JsonCachedCredentialStore.#MODE;
        const contents = JSON.stringify(store, replacerMap, 2);
        await fsPromises.writeFile(filepath, contents, { flag: "w", mode: mode });
    }

    async #loadFile(filepath) {
        const contents = await fsPromises.readFile(filepath);
        const values = JSON.parse(contents, reviverFreezeNullObj);
        const store = new Map();
        for (const [key, value] of Object.entries(values)) {
            store.set(key, value);
        }
        return store;
    }

    async signup(key, value) {
        const result = await super.signup(key, value);
        if (result) {
            try {
                await this.#saveMem(this._store, this.#filepath);
            } catch (e) {
                this._store = await this.#loadFile(this.#filepath);
                return false;
            }
        }
        return result;
    }

    async remove(key) {
        const result = await super.remove(key);
        if (result) {
            try {
                await this.#saveMem(this._store, this.#filepath);
            } catch (e) {
                this._store = await this.#loadFile(this.#filepath);
                return false;
            }
        }
        return result;
    }

    async update(key, value, allowNewKey) {
        const result = await super.update(key, value, allowNewKey);
        if (result) {
            try {
                await this.#saveMem(this._store, this.#filepath);
            } catch (e) {
                this._store = await this.#loadFile(this.#filepath);
                return false;
            }
        }
        return result;
    }

    async delete(key, projection) {
        const result = await super.delete(key, projection);
        if (result) {
            try {
                await this.#saveMem(this._store, this.#filepath);
            } catch (e) {
                this._store = await this.#loadFile(this.#filepath);
                return false;
            }
        }
        return result;
    }
}

class GdbmCredentialStore extends AbstractCredentialStore {
    static get typeName() {
        return "gdbm";
    }

    static #isAvailable = gdbm != null;

    static get isAvailable() {
        return GdbmCredentialStore.#isAvailable;
    }

    #filepath;
    #encoder;
    #decoder;

    /**
     * Create the store.
     * @param {Object} args - Initialize arguments
     * @param {string} args.name
     * @param {string} [args.dirpath]
     * @param {number} [args.blockSize]
     */
    constructor(args) {
        super(args);

        if (gdbm == null) {
            throw new Error();
        }
        if (typeof args.name !== "string") {
            throw new Error();
        }
        if (args.dirpath !== undefined && typeof args.dirpath !== "string") {
            throw new Error();
        }
        if (
            args.blockSize !== undefined &&
            !(typeof args.blockSize === "number" && Number.isInteger(args.blockSize))
        ) {
            throw new Error();
        }

        const currentDir = require.main.path;
        const dirpath =
            args.dirpath != null ? path.resolve(currentDir, args.dirpath) : currentDir;
        const filename =
            path.extname(args.name) === ".gdbm" ? args.name : args.name + ".gdbm";
        this.#filepath = path.join(dirpath, filename);

        const blockSize = args.blockSize ?? 0;

        gdbm.createTable(this.#filepath, blockSize);

        this.#encoder = new TextEncoder();
        this.#decoder = new TextDecoder();
    }

    /**
     * @returns {number}
     */
    get size() {
        return gdbm.countRecords(this.#filepath);
    }

    /**
     * Sign-up new account.
     * @async
     * @template V
     * @param {string} key - Account identifier.
     * @param {V} [value] - Optional. Initialize value.
     * @returns {Promise<boolean>} If sign-up success, return true, otherwise false.
     */
    async signup(key, value) {
        const stringified = value !== undefined ? JSON.stringify(value) : undefined;
        const encoded = this.#encoder.encode(stringified);
        let result;
        try {
            result = gdbm.insertRecord(this.#filepath, key, encoded);
        } catch (err) {
            if (_debug_gdbm) {
                console.error(`${GdbmCredentialStore.name}`, err);
            }
            return false;
        }
        return result;
    }

    /**
     * Remove the account.
     * @async
     * @param {string} key - Account identifier to remove.
     * @returns {Promise<boolean>} Success to remove or not.
     */
    async remove(key) {
        let result;
        try {
            result = gdbm.removeRecord(this.#filepath, key);
        } catch (err) {
            if (_debug_gdbm) {
                console.error(`${GdbmCredentialStore.name}`, err);
            }
            return false;
        }
        return result;
    }

    /**
     * Get a value with the key.
     * @async
     * @template V
     * @param {string} key - Account identifier.
     * @returns {Promise<(V|{ [key: string]: V }|undefined)>}
     * Account data. If key is invalid, return undefined.
     */
    async get(key) {
        let value;
        try {
            value = gdbm.getContent(this.#filepath, key);
        } catch (err) {
            if (_debug_gdbm) {
                console.error(`${GdbmCredentialStore.name}`, err);
            }
            return undefined;
        }

        if (value.length === 0) {
            return null;
        }

        const decoded = this.#decoder.decode(value);
        const parsed = JSON.parse(decoded, reviverFreezeNullObj);

        return parsed;
    }

    /**
     * Check the account exists.
     * @async
     * @param {string} key - Account identifier.
     * @returns {Promise<boolean>} If account exists, return true, otherwise false.
     */
    async has(key) {
        let result;
        try {
            result = gdbm.hasKey(this.#filepath, key);
        } catch (err) {
            if (_debug_gdbm) {
                console.error(`${GdbmCredentialStore.name}`, err);
            }
            result = false;
        }
        return result;
    }

    /**
     * Update the value to the data store.
     * @async
     * @template V
     * @param {string} key - The field key to set the value.
     * @param {V} value - Set value.
     * @param {boolean} allowNewKey - Allow new key to stored value.
     * @returns {Promise<boolean>} Success to set or not.
     */
    async update(key, value, allowNewKey) {
        if (value == null) {
            return false;
        }

        let oldContent;
        try {
            oldContent = gdbm.getContent(this.#filepath, key);
        } catch (err) {
            if (_debug_gdbm) {
                console.error(`${GdbmCredentialStore.name}`, err);
            }
            return false;
        }

        let newValue;
        if (oldContent.length === 0) {
            newValue = value;
        } else {
            const oldDecoded = this.#decoder.decode(oldContent);
            const oldParsed = JSON.parse(oldDecoded);

            try {
                newValue = structuredMerge(oldParsed, value, allowNewKey);
            } catch (err) {
                console.error(`${GdbmCredentialStore.name} error: Failed to merge`);
                return false;
            }
        }

        const stringified = JSON.stringify(newValue);
        const encoded = this.#encoder.encode(stringified);
        try {
            gdbm.updateContent(this.#filepath, key, encoded);
        } catch (err) {
            if (_debug_gdbm) {
                console.error(`${GdbmCredentialStore.name}`, err);
            }
            return false;
        }
        return true;
    }

    /**
     * Delete the value in the `deletePath`.
     * @async
     * @param {string} key - Account identifier.
     * @param {{ [key: string]: boolean|null }} projection
     * Projection to the delete data.
     * If property is true, delete key.
     * If property is null, replace the value to null.
     * If undefined, replaced by null.
     * @returns {Promise<boolean>} Success to delete or not.
     */
    async delete(key, projection) {
        if (projection == null) {
            const encoded = this.#encoder.encode(undefined);
            try {
                gdbm.updateContent(this.#filepath, key, encoded);
            } catch (err) {
                if (_debug_gdbm) {
                    console.error(`${GdbmCredentialStore.name}`, err);
                }
                return false;
            }
            return true;
        }

        let oldContent;
        try {
            oldContent = gdbm.getContent(this.#filepath, key);
        } catch (err) {
            if (_debug_gdbm) {
                console.error(`${GdbmCredentialStore.name}`, err);
            }
            return false;
        }

        const oldDecoded = this.#decoder.decode(oldContent);
        const oldParsed = JSON.parse(oldDecoded);

        if (oldParsed == null) {
            return false;
        }

        let newValue;
        try {
            newValue = deleteNestedObject(oldParsed, projection);
        } catch (err) {
            return false;
        }

        const newStringified = JSON.stringify(newValue);
        const newEncoded = this.#encoder.encode(newStringified);

        try {
            gdbm.updateContent(this.#filepath, key, newEncoded);
        } catch (err) {
            if (_debug_gdbm) {
                console.error(`${GdbmCredentialStore.name}`, err);
            }
            return false;
        }
        return true;
    }
}

const objectToMap = (value, valueTypes, nullable) => {
    if (
        valueTypes.some((element) => typeof value === element) ||
        (nullable && value === null)
    ) {
        return value;
    }
    if (value instanceof Map) {
        return new Map(
            value
                .entries()
                .filter(([k, v]) => typeof k === "string")
                .map(([k, v]) => [k, objectToMap(v, valueTypes, nullable)])
        );
    }
    if (typeof value === "object") {
        return new Map(
            Object.entries(value).map(([k, v]) => [
                k,
                objectToMap(v, valueTypes, nullable),
            ])
        );
    }
    throw new Error(`value is invalid: ${value}`);
};

function deepFreeze(obj) {
    if (
        obj === null ||
        (typeof obj !== "object" && typeof obj !== "function") ||
        Object.isFrozen(obj)
    ) {
        return obj;
    }

    if (obj instanceof Array) {
        obj.forEach((item) => deepFreeze(item));
    } else {
        Object.values(obj).forEach((value) => {
            if (!Object.isFrozen(value)) {
                deepFreeze(value);
            }
        });
    }

    Object.freeze(obj);

    return obj;
}

function toNullObject(obj) {
    if (typeof obj !== "object" || obj === null) return obj;

    const nullObj = Object.assign(Object.create(null), obj);
    for (const key in nullObj) {
        nullObj[key] = toNullObject(nullObj[key]);
    }
    return nullObj;
}

function structuredMerge(target, source, allowNewKey) {
    if (source == null) throw new Error();

    if (target == null) {
        return typeof source === "object" ? toNullObject(source) : source;
    }

    if (typeof target === "object" && typeof source === "object") {
        const newTarget = Object.assign(Object.create(null), target);
        for (const key in source) {
            if (!allowNewKey && !Object.hasOwn(newTarget, key)) {
                throw new Error();
            }
            if (!Object.hasOwn(newTarget, key) || newTarget[key] == null) {
                const merged = structuredMerge(null, source[key], allowNewKey);
                Object.assign(newTarget, { [key]: merged });
            } else if (
                typeof target[key] === "object" &&
                typeof source[key] === "object"
            ) {
                const merged = structuredMerge(newTarget[key], source[key], allowNewKey);
                Object.assign(newTarget, { [key]: merged });
            } else if (typeof target[key] === typeof source[key]) {
                Object.assign(newTarget, { [key]: source[key] });
            } else {
                throw new Error();
            }
        }
        return newTarget;
    }

    if (typeof target === typeof source) {
        return source;
    }

    throw new Error();
}

function deleteNestedObject(obj, projection) {
    if (typeof obj !== "object" || typeof projection !== "object") {
        throw new Error();
    }
    const newObj = Object.assign(Object.create(null), obj);
    for (const [projKey, projValue] of Object.entries(projection)) {
        if (!Object.hasOwn(newObj, projKey)) {
            throw new Error();
        }
        if (projValue === true) {
            delete newObj[projKey];
        } else if (projValue === null) {
            newObj[projKey] = null;
        } else if (typeof projValue === "object") {
            newObj[projKey] = deleteNestedObject(newObj[projKey], projValue);
        }
    }
    return deepFreeze(newObj);
}

function reviverFreezeNullObj(key, value) {
    if (value !== null && typeof value === "object") {
        const obj = Object.assign(Object.create(null), value);
        Object.freeze(obj);
        return obj;
    }
    return value;
}

function replacerMap(key, value) {
    if (value instanceof Map) {
        const obj = Object.create(null);
        for (const [mapKey, mapValue] of value.entries()) {
            obj[mapKey] = mapValue;
        }
        return obj;
    }
    return value;
}

module.exports = {
    AbstractCredentialStore,
    InMemoryCredentialStore,
    JsonCachedCredentialStore,
    GdbmCredentialStore,
};
