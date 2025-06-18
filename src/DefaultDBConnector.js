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

const { DBConnector, DBError } = require("./_DBConnector.js");

/**
 * @type {Map<string, string>}
 */
const _module_path_repos = new Map();

/**
 * Gets a default database connector.
 * 
 * @param {object} o
 * An object containing arguments.
 * 
 * @param {string} o.database
 * A string representing the database name.
 * 
 * @param {string} o.databaseType
 * A string representing the database type.
 * 
 * @return {DBConnector}
 * A default database connector.
 */
function getDefaultConnector(o) {
    const { databaseType: type, ...config } = o ?? {};
    const module_path = _module_path_repos.get(type);
    if (module_path == null) {
        return undefined;
    }

    const ctor = require(module_path);

    for  (let proto = ctor?.prototype; proto != null; proto = Object.getPrototypeOf(proto)) {
        if (proto === DBConnector.prototype) {
            return new ctor(config);
        }
    }
    throw new DBError(`module does not provide a default connector: ${module_path}`);
}

/**
 * Registers a module path providing a default database connector class.
 * 
 * @param {string} type 
 * A string representing the type of the backend database.
 * 
 * @param {string} modulePath
 * A string representing the file path of the module file to register.
 * 
 */
function registerDefaultConnector(type, modulePath) {
    const type_ = type;
    const module_path = modulePath;
    if (typeof type_ !== "string") {
        throw new TypeError("A value not being a string is given as type");
    }
    if (typeof module_path !== "string") {
        throw new TypeError("A value not being a string is given as module path");
    }
    if (_module_path_repos.has(type_)) { return; }

    const resolved_path = require.resolve(module_path);

    _module_path_repos.set(type_, resolved_path);
}

registerDefaultConnector("postgres", "./_DBConnector_Postgres.js");
registerDefaultConnector("mysql", "./_DBConnector_MySql.js");
registerDefaultConnector("oracledb", "./_DBConnector_Oracle.js");

module.exports = {
    getDefaultConnector,
    registerDefaultConnector
};
