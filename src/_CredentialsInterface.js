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

const { AbstractCredentialStore } = require("./_CredentialsStore.js");

/**
 * @type {Map<string, new (options: object) => AbstractCredentialStore>}
 */
const storeMap = new Map();

const StoreClasses = {
    /**
     * Register store class.
     * @param {new (options: object) => AbstractCredentialStore} storeClass
     * Store class that inherits from AbstractCredentialStore.
     */
    register(storeClass) {
        let targetClass = storeClass;
        while (true) {
            const superClass = Object.getPrototypeOf(targetClass);
            if (superClass === null) {
                throw new Error(
                    `storeClass must inherit from AbstractCredentialStore: ${storeClass}`
                );
            }
            if (superClass === AbstractCredentialStore) {
                break;
            }
            targetClass = superClass;
        }
        if (!storeClass.isAvailable) {
            return;
        }
        const typeName = storeClass.typeName;
        if (typeof typeName !== "string") {
            throw new Error(`StoreClass.typeName must be string`);
        }
        if (storeMap.has(typeName)) {
            throw new Error(`typeName ${typeName} already exists`);
        }
        storeMap.set(typeName, storeClass);
    },

    /**
     * Show available store names.
     * @returns {string[]} List of available store names.
     */
    available() {
        return [...storeMap.keys()];
    },

    /**
     * Check if the store is available
     * @param {string} key - Store name.
     * @returns {boolean} Available or not.
     */
    isAvailable(key) {
        return storeMap.has(key);
    },
};

/**
 * @type {Map<string, AbstractCredentialStore>}
 */
const tableMap = new Map();

/**
 * @typedef {string|number|boolean} UserInfoItem
 */

const validateInfoItemType = (item) => {
    return (
        item === null ||
        typeof item === "string" ||
        typeof item === "number" ||
        typeof item === "boolean"
    );
};

/**
 * @type {Map<string, { [info: string]: UserInfoItem|null|function }>}
 */
const defaultInfoMap = new Map();

const createDefaultUserInfo = (tableName) => {
    const defaultUserInfo = defaultInfoMap.get(tableName);
    let info;
    if (defaultUserInfo != null) {
        info = Object.fromEntries(
            Object.entries(defaultUserInfo).map(([k, v]) => [
                k,
                typeof v === "function" ? v() : v,
            ])
        );
    } else {
        info = {};
    }
    return info;
};

/**
 * Register store table with the type.
 * @param {string} tableName The table name.
 * @param {string} storeType The store type.
 * @param {object} args Additional options to initialize the store.
 * @param {{ [info: string]: UserInfoItem|null|function }} [defaultUserInfo]
 */
function registerTable(tableName, storeType, args, defaultUserInfo) {
    if (typeof tableName !== "string") {
        throw new TypeError("tableName must be string");
    }

    if (
        defaultUserInfo != null &&
        typeof defaultUserInfo === "object" &&
        typeof defaultUserInfo !== "function"
    ) {
        for (const item of Object.values(defaultUserInfo)) {
            if (
                !validateInfoItemType(item) &&
                !(typeof item === "function" && validateInfoItemType(item()))
            ) {
                throw new TypeError("invalid defaultInfo type");
            }
        }
    } else if (defaultUserInfo != null) {
        throw new TypeError("invalid defaultInfo type");
    }

    if (tableMap.has(tableName)) {
        throw new Error(`tableName ${tableName} already exists`);
    }

    const storeClass = storeMap.get(storeType);
    if (storeClass == null) {
        throw new Error(
            `storeType ${storeType} does not exist, available: ${availableStores()}`
        );
    }

    const store = new storeClass(args);
    tableMap.set(tableName, store);

    if (defaultUserInfo != null) {
        defaultInfoMap.set(tableName, defaultUserInfo);
    }
}

/**
 * Get the table.
 * @param {string|null|undefined} tableName - The table name.
 * @returns {AbstractCredentialStore}
 * @throws Invalid table name.
 */
const getTable = (tableName) => {
    let table;
    if (tableName === undefined) {
        table = tableMap.values().next().value;
    } else {
        table = tableMap.get(tableName);
    }
    if (table === undefined) {
        throw new Error("Invalid table name");
    }
    return table;
};

const filterWithProjection = (obj, proj) => {
    if (typeof obj !== "object") {
        throw new Error();
    }

    const newObj = Object.create(null);
    for (const [projKey, projValue] of Object.entries(proj)) {
        if (!Object.hasOwn(obj, projKey)) {
            throw new Error();
        }
        if (projValue === true) {
            newObj[projKey] = obj[projKey];
        } else if (typeof projValue === "object") {
            const filtered = filterWithProjection(obj[projKey], projValue);
            if (Object.keys(filtered).length > 0) {
                newObj[projKey] = filtered;
            }
        }
    }
    return Object.freeze(newObj);
};

const Users = {
    /**
     * Sign-up new account with key in tableName.
     * @async
     * @param {string} userId - User identifier.
     * @param {object} [options]
     * @param {any} [options.content] - Initialized value.
     * @param {string} [options.tableName] - Optional. Table name.
     * @returns {Promise<boolean>} Success to sign up, or not.
     */
    async signup(userId, options) {
        const tableName = options?.tableName;

        const table = getTable(tableName);

        if (typeof userId !== "string") {
            throw new TypeError("userId must be string");
        }

        const info = createDefaultUserInfo(tableName);

        const value = { content: options?.content ?? null, info };

        return await table.signup(userId, value);
    },

    /**
     * Remove account by key in tableName.
     * @async
     * @param {string} userId - User identifier.
     * @param {object} [options]
     * @param {string} [options.tableName] - Optional. Table name.
     * @returns {Promise<boolean>} Success to remove account, or not
     */
    async removeUser(userId, options) {
        const tableName = options?.tableName;

        const table = getTable(tableName);

        if (typeof userId !== "string") {
            throw new TypeError("userId must be string");
        }

        return await table.remove(userId);
    },

    /**
     * The tableName store has the key.
     * @async
     * @param {string} userId - User identifier.
     * @param {object} [options]
     * @param {string} [options.tableName] - Optional. Table name.
     * @returns {Promise<boolean>} Exists the key, or not.
     */
    async exists(userId, options) {
        const tableName = options?.tableName;

        const table = getTable(tableName);

        if (typeof userId !== "string") {
            throw new TypeError("userId must be string");
        }

        return await table.has(userId);
    },

    /**
     * Get the value of the path.
     * @async
     * @param {string} userId - User identifier.
     * @param {object} [options]
     * @param {string} [options.tableName] - Optional. Table name.
     * @param {{ [key: string]: boolean|object }} [options.projection]
     * The projection to the target. If undefined, get all values.
     * If object, only return the keys with true.
     * With any invalid key, return undefined.
     * @returns {Promise<any|undefined>}
     */
    async getContent(userId, options) {
        const tableName = options?.tableName;
        const projection = options?.projection;

        const table = getTable(tableName);

        const value = await table.get(userId);
        if (value == null) {
            return undefined;
        }

        let content = value.content;

        if (content != null && projection != null && typeof projection === "object") {
            try {
                content = filterWithProjection(content, projection);
            } catch {
                return undefined;
            }
        }

        return content;
    },

    /**
     * Merge the content with stored.
     * If the value already exists, replace it.
     * If it does not exist, create a new key/value pair.
     * @async
     * @param {string} userId - User identifier.
     * @param {any} content - The content to be updated.
     * @param {object} [options]
     * @param {string} [options.tableName] - Optional. Table name.
     * @returns {Promise<boolean>} Success to update, or not
     */
    async updateContent(userId, content, options) {
        const tableName = options?.tableName;

        const table = getTable(tableName);

        return await table.update(userId, { content }, true);
    },

    /**
     * Delete the value of the path.
     * @async
     * @param {string} userId - User identifier.
     * @param {object} [options]
     * @param {{ [key: string]: boolean|object }} [options.projection]
     * Projection to the values to be deleted.
     * If undefined, the value of key is replaced by null.
     * If object, delete keys with true.
     * Otherwise, throw error.
     * With any invalid key, return false.
     * @param {string} [options.tableName] - Optional. Table name.
     * @returns {Promise<boolean>} Success to delete, or not.
     */
    async deleteContent(userId, options) {
        const projection = options?.projection;
        const tableName = options?.tableName;

        const table = getTable(tableName);

        if (typeof userId !== "string") {
            throw new TypeError("userId must be string");
        }

        let actualProjection;
        if (projection == null) {
            actualProjection = { content: null };
        } else if (typeof projection === "object") {
            actualProjection = { content: projection };
        } else {
            throw new TypeError("options.projection must be optional Object");
        }

        return await table.delete(userId, actualProjection);
    },

    /**
     * Get user info.
     * @async
     * @param {string} userId - User identifier.
     * @param {object} [options]
     * @param {string} [options.tableName]
     * @param {{ [key: string]: boolean }} [options.projection]
     * The projection to the target. If undefined, get all values.
     * If object, only return the keys with true.
     * With any invalid key, return undefined.
     * @returns {Promise<{ [info: string]: UserInfoItem|null }>}
     */
    async getUserInfo(userId, options) {
        const tableName = options?.tableName;

        if (typeof userId !== "string") {
            throw new TypeError("userId must be string");
        }

        const table = getTable(tableName);

        const value = await table.get(userId);
        let info = value.info;

        const projection = options?.projection;
        if (projection != null && typeof projection === "object") {
            try {
                info = filterWithProjection(info, projection);
            } catch {
                return undefined;
            }
        }

        return info;
    },

    /**
     * Update user info with existing keys.
     * If new key, it will be failed.
     * @async
     * @param {string} userId - User identifier.
     * @param {{ [info: string]: UserInfoItem }} userInfo - User info.
     * @param {object} [options]
     * @param {string} [options.tableName] - Table name.
     * @returns {Promise<boolean>}
     */
    async setUserInfo(userId, userInfo, options) {
        const tableName = options?.tableName;
        const info = userInfo;

        if (typeof userId !== "string") {
            throw new TypeError("userId must be string");
        }
        if (
            typeof info !== "object" ||
            typeof info === "function" ||
            Object.values(info).some((item) => !validateInfoItemType(item))
        ) {
            return false;
        }

        const table = getTable(tableName);

        return await table.update(userId, { info }, false);
    },
};

module.exports = { StoreClasses, registerTable, Users };
