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

/// PLATFORM-SPECIFIC SECTION: BEGIN
const { sql, DBConnector, DBError, DBInternalError } = require("./_DBConnector.js");
const { getDefaultConnector, registerDefaultConnector } = require("./DefaultDBConnector.js");
/// PLATFORM-SPECIFIC SECTION: END

/**
 * @typedef {(
 *      name: string,
 *      primaryKey: string[],
 *      indexes: {
 *          [index_name: string]: {
 *              unique: boolean,
 *              origin:
 *                  "create-index" |
 *                  "unique"       |
 *                  "primary-key"  ,
 *              [optional_property: string]: any
 *          }
 *      },
 *      columns: {
 *          [column_name: string]: {
 *              type: string,
 *              unique: boolean,
 *              nullable: boolean,
 *              defaultValue?: string | number,
 *              foreignKey?: ({
 *                  table: string,
 *                  to: string,
 *                  onUpdate:
 *                      "set-null"    |
 *                      "set-default" |
 *                      "cascade"     |
 *                      "restrict"    |
 *                      "no-action"   ,
 *                  onDelete:
 *                      "set-null"    |
 *                      "set-default" |
 *                      "cascade"     |
 *                      "restrict"    |
 *                      "no-action"
 *                  })[],
 *              [optional_property: string]: any
 *          }
 *      }
 * )} TableSchemaType
 * 
 * @typedef {({
 *      tables: TableSchemaType[]
 * })} DatabaseSchemaType
 */
/**
 * @typedef {object} AlierTableConstructorOptions
 * @property {AlierDB} database
 * The {@link AlierDB} associated with the table.
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.database | database}.
 * 
 * @property {string} name
 * The name of the table.
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.columns | columns}.
 * 
 * @property {(string | string[])?} columns
 * A list of the result columns.
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.columns | columns}.
 * 
 * @property {string?} alias
 * The alias of the table.
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.alias | alias}.
 * 
 * @typedef {object} VirtualAlierTableSpecificConstructorOptions
 * @property {AlierTable?} leftTable
 * The left-hand side operand of `JOIN` operation.
 * 
 * This parameter is set by {@link AlierTable.prototype.join | join()} method.
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.leftTable | leftTable}.
 * 
 * @property {AlierTable?} rightTable
 * The right-hand side operand of `JOIN` operation.
 * 
 * This parameter is set by {@link AlierTable.prototype.join | join()} method.
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.rightTable | rightTable}.
 * 
 * @property {DBJoinType?} joinType
 * An enumerator representing the kind of `JOIN` operation.
 * 
 * This must be either one of {@link DBJoinType} enumerators.
 * 
 * By default, `INNER JOIN` is used ({@link DBJoinType.INNER_JOIN}).
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.joinType | joinType}.
 * 
 * @property {string?} on
 * A string representing the conditional expression in the `ON` clause.
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.on | on}.
 * 
 * @property {string[]?} using
 * An array of strings each of which represents the column name in
 * the `USING` clause.
 * 
 * This is used for initializing the property
 * {@link AlierTable.prototype.using | using}.
 * 
 * @typedef {AlierTableConstructorOptions & VirtualAlierTableSpecificConstructorOptions} VirtualAlierTableConstructorOptions
 * 
 * @typedef {object} AggregatorObjectType
 * @property {string} aggregate
 * @property {(string | string[])?} group
 * @property {string?} having
 * 
 * @typedef {((record: object, index: number) => (void | Promise<void>))} AggregatorFunctionType
 * 
 * @typedef {AggregatorObjectType | AggregatorFunctionType} AggregatorType
 * 
 * @typedef {object} AlierTableGetDescriptorType
 * A data type of arguments for {@link AlierTable.prototype.get()}
 * function.
 * 
 * @property {string[]?} sort
 * An array of column names used as a sort key.
 * 
 * This is used as an expression for the `ORDER BY` clause.
 * 
 * To sort the records in the descending order, you can specify
 * the column name with the special prefix "!".
 * 
 * If an empty array is specified as the sort key, it is ignored.
 * 
 * If the sort key is not provided, sorting does not happen.
 * 
 * @property {AggregatorType?} aggregate
 * A function or an object used for aggregating the retrieved records.
 * 
 * If a function is given as `aggregate`, it is invoked for each records.
 * 
 * If an object is given as `aggregate`, the corresponding built-in
 * aggregate function will be invoked.
 * 
 * If this is not provided, aggregation does not happen.
 * 
 * @property {string?} aggregateAs
 * An optional string representing the alias for the aggregate result.
 * 
 * If this is not provided, the alias is not given for the aggregate
 * result.
 * 
 * @property {((recordCount: number) => (void | Promise<void>))?} final
 * An optional function invoked when aggregation is done.
 * 
 * @property {number?} limit
 * An optional number representing the limit of number of records.
 * 
 * This is used as an expression for the `LIMIT` clause.
 * 
 * If a fractional number is specified as the limit, its fraction part
 * is truncated.
 * 
 * If a negative number or `NaN` is specified as the limit, it is ignored.
 * 
 * If the limit is specified as less than 1, the number of records is 
 * limited to 0.
 * 
 * Due to limitation required from the JavaScript language,
 * the maximum number of the limit is the same as the limit of
 * array length, the maximum number of unsigned 32 bit integer (`0xffff_ffff`).
 * 
 * By default, the record count is not limited.
 * 
 * To limit the number of records, you must also set
 * the `sort` argument.
 * If the `sort` is not specified, `limit` has no effect.
 * 
 * @property {number?} offset
 * An optional number representing the position of the first record.
 * 
 * This is used as an expression for the `OFFSET` clause.
 * 
 * If the offset is specified, the first `offset` records satisfying
 * the query condition is discarded.
 * 
 * If a fractional number is specified as the offset, its fraction part
 * is truncated.
 * 
 * If a negative number or `NaN` is specified as the offset, it is ignored.
 * 
 * Due to limitation required from the JavaScript language,
 * the maximum number of the offset is the same as the maximum number of
 * safe integer (`Number.MAX_SAFE_INTEGER`).
 * 
 * By default, the offset is set to 0 (no offset).
 * 
 * To discard the first records satisfying the given condition,
 * you must also set the `sort` argument.
 * If the `sort` is not specified, `offset` has no effect.
 * 
 * @typedef {({
 *      [updated_column: string]: any,
 *      filter?: string
 * })} AlierTablePutDescriptorType
 * Objects having parameters for {@link AlierTable.prototype.put()} method.
 * 
 * @typedef {({
 *      [inserted_column: string]: any
 * })} AlierTablePostDescriptorType
 * Objects having parameters for {@link AlierTable.prototype.post()} method.
 * 
 * @typedef {({
 *      filter?: string
 * })} AlierTableDeleteDescriptorType
 * Objects having parameters for {@link AlierTable.prototype.delete()} method.
 * 
 */

/**
 * @readonly
 * @enum {number}
 */
const DBJoinType = Object.freeze({
    CROSS_JOIN               : 0,
    INNER_JOIN               : 1,
    LEFT_OUTER_JOIN          : 2,
    RIGHT_OUTER_JOIN         : 4,
    FULL_OUTER_JOIN          : 8,
    NATURAL_INNER_JOIN       : 0x11,
    NATURAL_LEFT_OUTER_JOIN  : 0x12,
    NATURAL_RIGHT_OUTER_JOIN : 0x14,
    NATURAL_FULL_OUTER_JOIN  : 0x18
});

/**
 * Gets the `JOIN` operator corresponding to the given type.
 * 
 * @param {DBJoinType} joinType 
 * A enumerator of {@link DBJoinType}.
 * 
 * @return
 * `JOIN` operator.
 */
function _joinOperator(joinType) {
    switch (joinType) {
        case DBJoinType.CROSS_JOIN:
            return "CROSS JOIN";
        case DBJoinType.INNER_JOIN:
            return "INNER JOIN";
        case DBJoinType.LEFT_OUTER_JOIN:
            return "LEFT OUTER JOIN";
        case DBJoinType.RIGHT_OUTER_JOIN:
            return "RIGHT OUTER JOIN";
        case DBJoinType.FULL_OUTER_JOIN:
            return "FULL OUTER JOIN";
        case DBJoinType.NATURAL_INNER_JOIN:
            return "NATURAL INNER JOIN";
        case DBJoinType.NATURAL_LEFT_OUTER_JOIN:
            return "NATURAL LEFT OUTER JOIN";
        case DBJoinType.NATURAL_RIGHT_OUTER_JOIN:
            return "NATURAL RIGHT OUTER JOIN";
        case DBJoinType.NATURAL_FULL_OUTER_JOIN:
            return "NATURAL FULL OUTER JOIN";
        default:
            return "INNER JOIN";
    }
}

/**
 * @class
 * 
 * A class for representing prepared statements.
 */
class PreparedStatement {
    /**
     * An `AlierDB` instance associated with the target prepared
     * statement.
     * 
     * @type {AlierDB}
     */
    database;

    /**
     * An optional string used as an identifier of the target
     * prepared statement.
     * 
     * The value being null represents the prepared statement is
     * anonymous.
     */
    name;

    /**
     * A string representing a query used by the underlying database
     * management system.
     * 
     * @type {string}
     */
    statement;

    /**
     * A non-negative integer representing a number of placeholders
     * in the statement.
     * @type {number}
     */
    placeholderCount = 0;

    /**
     * 
     * @param {string} name 
     * @param {string} statement 
     * @param {AlierDB} database 
     */
    constructor(name, statement, database) {
        if (!(database instanceof AlierDB)) {
            throw new TypeError("Given database is not an AlierDB");
        } else if (typeof name !== "string") {
            throw new TypeError("Given statement name is not a string");
        } else if (name.length <= 0) {
            throw new TypeError("Given statement name is empty");
        } else if (typeof statement !== "string") {
            throw new TypeError("Given statement is not a string");
        }

        const statement_ = sql`${database.fixPreparedStatementQuery(statement)}`;

        let placeholder_count = 0;
        for (const m of statement_.matchAll(/\?|'(?:[^']|'')*'|"(?:[^"]|"")*"/g)) {
            if (m[0] === "?") { placeholder_count++; }
        }
        
        this.database         = database;
        this.name             = name;
        this.placeholderCount = placeholder_count;
        this.statement        = statement_;

        //  Make a PreparedStatement immutable.
        Object.freeze(this);
    }

    /**
     * @async
     * Executes the target {@link PreparedStatement}.
     * 
     * @param  {...any} params 
     * A set of parameters to replace placeholders in the target
     * statement.
     * 
     * @returns {Promise<{
     *      status: true,
     *      records?: any[]
     * }|{
     *      status: false,
     *      message?: string 
     * }>}
     * A `Promise` that resolves to an object representing the
     * execution result.
     */
    async execute(...params) {
        if (params.length > this.placeholderCount) {
            return {
                status : false,
                message: `Too many arguments: number of parameters exceeds the number of placeholders (${params.length} > ${this.placeholderCount})`
            };
        }
        return this.database.execSQL(this.statement, ...params);
    }
}

class AlierDB {
    /**
     * A number of connections in use.
     * 
     * If {@link DBConnector}s associated with `AlierDB` are using
     * connection pooling, release all the pools whenever the connection
     * count reaches 0.
     * 
     * @type {number}
     */
    static #connection_count = 0;

    /**
     * @type {Set<DBConnector>}
     */
    static #connectors = new Set();

    /**
     * An object implementing the interface for the functionality of
     * the underlying database management system.
     * 
     * @type {DBConnector}
     */
    connector;

    /**
     * A boolean indicating whether or not to connect to the underlying
     * database automatically.
     * Auto-connection is enabled when the flag is `true`,
     * `false` otherwise.
     * 
     * This flag can affect all {@link AlierTable}s obtained from
     * the target {@link AlierDB}.
     * 
     * By default, auto-connection is enabled (`true`).
     * @type {boolean}
     */
    autoConnect;

    /**
     * A boolean indicating whether or not to start a transaction
     * automatically.
     * Auto-transaction is enabled when the flag is `true`,
     * `false` otherwise.
     * 
     * This flag can affect all {@link AlierTable}s obtained from
     * the target {@link AlierDB}.
     * 
     * By default, auto-transaction is disabled (`false`).
     * @type {boolean}
     */
    autoTransaction;

    /**
     * a set of prepared statements with their names.
     * 
     * @type {Map<string, PreparedStatement>}
     */
    preparedStatements = new Map();

    /**
     * An object describing the database schema.
     * @type {(Promise<DatabaseSchemaType> | DatabaseSchemaType)?}
     */
    schema = null;

    /**
     * @constructor
     * Create a new instance of {@link AlierDB}.
     *
     * @param {object} o 
     * @param {DBConnector?} o.connector 
     * A {@link DBConnector} instance associated with the `AlierDB` to
     * be created.
     * 
     * @param {string?} o.database
     * A string representing the database name.
     * 
     * This argument is ignored when the argument for `connector` is
     * given.
     * Otherwise, this argument is used as an argument for
     * {@link getDefaultConnector()}.
     * In the latter case, the created {@link AlierDB} has
     * the {@link DBConnector} returned from {@link getDefaultConnector()}
     * as the {@link connector} property.
     * 
     * @param {string?} o.databaseType
     * A string representing the database type.
     * 
     * This argument is ignored when the argument for `connector` is
     * given.
     * Otherwise, this argument is used as an argument for
     * {@link getDefaultConnector()}.
     * In the latter case, the created {@link AlierDB} has
     * the {@link DBConnector} returned from {@link getDefaultConnector()}
     * as the {@link connector} property.
     * 
     * @param {number?} o.version
     * A number representing the database version.
     * 
     * This must be a positive integer (`version >= 1`).
     * 
     * This argument is ignored when the argument for `connector` is
     * given.
     * Otherwise, this argument is used as an argument for
     * {@link getDefaultConnector()}.
     * In the latter case, the created {@link AlierDB} has
     * the {@link DBConnector} returned from {@link getDefaultConnector()}
     * as the {@link connector} property.
     * 
     * @param {object?} o.connectorOptions
     * An object containing options for {@link DBConnector}.
     * 
     * This argument is ignored when the argument for `connector` is
     * given.
     * Otherwise, this argument is used as an argument for
     * {@link getDefaultConnector()}.
     * In the latter case, the created {@link AlierDB} has
     * the {@link DBConnector} returned from {@link getDefaultConnector()}
     * as the {@link connector} property.
     * 
     * @param {boolean?} o.autoConnect
     * A boolean indicating whether or not to connect to the underlying
     * database automatically.
     * Auto-connection is enabled when the flag is `true`,
     * `false` otherwise.
     * 
     * This flag can affect all {@link AlierTable}s obtained from
     * the target {@link AlierDB}.
     * 
     * By default, auto-connection is enabled (`true`).
     * 
     * @param {boolean?} o.autoTransaction
     * A boolean indicating whether or not to start a transaction
     * automatically.
     * Auto-transaction is enabled when the flag is `true`,
     * `false` otherwise.
     * 
     * This flag can affect all {@link AlierTable}s obtained from
     * the target {@link AlierDB}.
     * 
     * By default, auto-transaction is disabled (`false`).
     * 
     * @throws {TypeError}
     * When the given connector is not a {@link DBConnector}.
     */
    constructor(o) {
        const {
            connector,
            database,
            databaseType,
            version,
            connectorOptions: connector_options,
            autoConnect     : auto_connect,
            autoTransaction : auto_transaction
        } = o ?? {};
        if (connector != null && !(connector instanceof DBConnector)) {
            throw new TypeError("DBconnector is not given");
        }

        const default_connector_options = { ...(connector_options ?? {}), database, databaseType, version };
        //  Erase all undefined-valued properties to prevent to cause an unexpected error.
        for (const k of Object.keys(default_connector_options)) {
            if (default_connector_options[k] === undefined) {
                delete default_connector_options[k];
            }
        }
        const connector_ = connector ?? getDefaultConnector(default_connector_options);

        this.autoConnect     = typeof auto_connect !== "boolean" || auto_connect;
        /// FIXME: Change the default value to `true`. Currently,
        /// implementation upon transaction handling for Mobile platform is broken and hence
        /// set the default value to false temporarily for avoiding to cause errors on transaction handling.
        this.autoTransaction = typeof auto_transaction === "boolean" && auto_transaction;

        Object.defineProperties(this, {
            connector: {
                value       : connector_,
                configurable: false,
                writable    : false,
                enumerable  : true
            }
        });
    }

    /**
     * @async
     * Executes the given SQL statement.
     * 
     * @param {string} statement 
     * A string representing the SQL statement to execute.
     * 
     * @param  {...any} params 
     * A sequence of parameters replacing placeholders in the given
     * statement.
     * 
     * @returns {Promise<{
     *      status: true,
     *      records?: any[]
     * } | {
     *      status: false,
     *      message?: string
     * }>} 
     * A `Promise` that resolves to an object describing the execution
     * result.
     * 
     * @throws {TypeError}
     * When
     * -    the given statement is not a string.
     */
    async execSQL(statement, ...params) {
        if (typeof statement !== "string") {
            throw new TypeError("Given statement is not a string");
        }

        try {
            return this.connector.execute(sql`${statement}`, ...params);
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }

            console.error(e);

            return {
                status: false,
                message: e.message
            };
        }
    }

    /**
     * @async
     * Connects the associated client to the database.
     * 
     * @returns {Promise<{
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * A `Promise` resolves the result for connecting to the database.
     * 
     * @throws {DBInternalError}
     * When the underlying {@link DBConnector} does not implement
     * {@link DBConnector.prototype.connect} method.
     */
    async connect() {
        try {
            const connected = await this.connector.connect();

            //  Increment connection count and register a connector
            //  for managing connection pools.
            //  See also: disconnect()
            if (connected) {
                AlierDB.#connectors.add(this.connector);
                AlierDB.#connection_count++;
            }

            return {
                status: connected
            };
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }

            console.error(e);

            return {
                status: false,
                message: e.message
            };
        }
    }
    
    /**
     * @async
     * Disconnects the associated client from the database.
     * 
     * @returns {Promise<{
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * A `Promise` resolves the result for disconnecting
     * from the database.
     * 
     * @throws {DBInternalError}
     * When the underlying {@link DBConnector} does not implement
     * {@link DBConnector.prototype.disconnect} and/or
     * {@link DBConnector.prototype.end} methods.
     */
    async disconnect() {
        try {
            await this.connector.disconnect();

            //  If succeeded to disconnect from the database,
            //  decrement connection count.
            //  And then release connection pools if the connection
            //  count reaches 0.
            //  see also: connect()
            if (AlierDB.#connection_count > 0) {
                AlierDB.#connection_count--;
                if (AlierDB.#connection_count <= 0) {
                    const connectors = [...AlierDB.#connectors];

                    //  Forget all connections for allowing to free them up.
                    AlierDB.#connectors.clear();

                    //  Release all connections and connection pools.
                    const end_results = connectors.filter(connector => typeof connector.end === "function")
                        .map(connector => connector.end())
                    ;

                    /** @type {Error[]} */
                    const reasons = (await Promise.allSettled(end_results))
                        .filter(result => result.reason != null)
                        .map(({ reason }) => reason)
                    ;

                    //  Rethrow if errors are caught.
                    if (reasons.length > 0) {
                        const message = reasons.map(reason => `${reason.constructor.name}: ${reason?.stack ?? reason?.message ?? ""}`).join("\n");
                        const cause = new AggregateError(reasons, message);

                        //  If errors contains an error other than DBError, throw an error as DBInternalError.
                        //  Otherwise, throw an error as DBError.
                        //  This is intended for avoiding to confuse recoverable errors and others.
                        if (reasons.some(reason => !(reason instanceof DBError))) {
                            throw new DBInternalError(message, { cause });
                        } else {
                            throw new DBError(message, { cause });
                        }
                    }
                }
            }

            return { status: true };
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }

            console.error(e);

            return {
                status : false,
                message: e.message
            };
        }
    }

    /**
     * @async
     * 
     * Starts a new transaction.
     * 
     * @param {object} options 
     * An object containing options for transaction settings.
     * 
     * @returns {Promise<({
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * })>}
     * an object representing the operation result.
     * If `status` is `true`, the operation is succeeded, otherwise
     * the operation is failed.
     * 
     * If there already exists an on-going transaction,
     * this operation is failed. 
     * 
     * @throws {DBInternalError}
     * When the underlying {@link DBConnector} does not implement
     * {@link DBConnector.prototype.startTransaction} method.
     */
    async startTransaction(options) {
        try {
            await this.connector.startTransaction(options ?? {});
            return { status: true };
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }

            console.error(e);

            return {
                status : false,
                message: e.message
            };
        }
    }

    /**
     * @async
     * Commits the on-going transaction.
     * 
     * @returns {Promise<({
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * })>}
     * an object representing the operation result.
     * If `status` is `true`, the operation is succeeded, otherwise
     * the operation is failed.
     * 
     * @throws {DBInternalError}
     * When the underlying {@link DBConnector} does not implement
     * {@link DBConnector.prototype.commit} method.
     */
    async commit() {
        try {
            await this.connector.commit();
            return { status: true };
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }

            console.error(e);

            return {
                status : false,
                message: e.message
            };
        }
    }

    /**
     * @async
     * Rollbacks the on-going transaction.
     * 
     * @returns {Promise<({
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * })>}
     * an object representing the operation result.
     * If `status` is `true`, the operation is succeeded, otherwise
     * the operation is failed.
     * 
     * @throws {DBInternalError}
     * When the underlying {@link DBConnector} does not implement
     * {@link DBConnector.prototype.rollback} method.
     */
    async rollback() {
        try {
            await this.connector.rollback();
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }

            console.error(e);

            return {
                status : false,
                message: e.message
            };
        }
    }

    /**
     * @async
     * Puts a savepoint on the on-going transaction.
     * 
     * @param {string} savepoint 
     * A string representing the savepoint name.
     * 
     * @returns {Promise<({
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * })>}
     * an object representing the operation result.
     * If `status` is `true`, the operation is succeeded, otherwise
     * the operation is failed.
     * 
     * @throws {DBInternalError}
     * When the underlying {@link DBConnector} does not implement
     * {@link DBConnector.prototype.putSavepoint} method.
     */
    async putSavepoint(savepoint) {
        try {
            await this.connector.putSavepoint(savepoint);
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }

            console.error(e);

            return {
                status : false,
                message: e.message
            };
        }
    }

    /**
     * @async
     * Rollbacks the on-going transaction to the specified savepoint.
     * 
     * @param {string} savepoint 
     * A string representing the savepoint name.
     * 
     * @returns {Promise<({
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * })>}
     * an object representing the operation result.
     * If `status` is `true`, the operation is succeeded, otherwise
     * the operation is failed.
     * 
     * @throws {DBInternalError}
     * When the underlying {@link DBConnector} does not implement
     * {@link DBConnector.prototype.rollbackTo} method.
     */
    async rollbackTo(savepoint) {
        try {
            await this.connector.rollbackTo(savepoint);
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }

            console.error(e);

            return {
                status : false,
                message: e.message
            };
        }
    }

    /**
     * @async
     * 
     * Makes a transaction block.
     * 
     * @param {object} options 
     * An object containing options for the transaction.
     * 
     * @param {(db: AlierDB) => Promise<boolean>} block
     * A function representing a set of instructions to do in 
     * the transaction.
     * 
     * The return value is used for deciding whether or not to commit
     * the operation result.
     * If you want to rollback the database state to the previous state,
     * you should return `false` from the block.
     * 
     * If an error occurs while executing the block,
     * then the database state is rolled back automatically.
     * 
     * @returns {Promise<{
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * A `Promise` that resolves to an object describing the operation
     * result.
     * 
     * @throws {TypeError}
     * When
     * -    the given block is not a function
     */
    async transaction(options, block) {
        if (typeof block !== "function") {
            throw new TypeError("Given block is not a function");
        }

        const start_result = await this.startTransaction(options);
        if (!start_result.status) {
            return start_result;
        }

        let error_in_block;
        let can_commit;
        try {
            const can_commit_ = await block(this);
            //  can_commit becomes false if and only if block returns false.
            can_commit = (typeof can_commit_ !== "boolean" || can_commit_);
        } catch (e) {
            console.error(e);
            error_in_block = e;
            can_commit = false;
        }

        if (can_commit) {
            const commit_result = await this.commit();
            if (commit_result.status) {
                return commit_result;
            } else {
                const rollback_result = await this.rollback();
                return rollback_result.status ? {
                        status: false,
                        message: "Operations done in the transaction are successfully rolled back"
                    } :
                    rollback_result
                ;
            }
        } else if (error_in_block instanceof DBError) {
            const rollback_result = await this.rollback();
            return rollback_result.status ? {
                    status: false,
                    message: "Operations done in the transaction are successfully rolled back"
                } :
                rollback_result
            ;
        } else {
            //  rethrow an Error other than DBError.
            throw error_in_block;
        }
    }

    /**
     * Registers the given SQL statement as a {@link PreparedStatement}.
     * 
     * @param {string?} name 
     * A string representing a prepared statement name or nullish.
     * 
     * If an empty string or nullish value is specified,
     * This function returns an anonymous prepared statement rather than
     * trying to register a new prepared statement.
     * 
     * @param {string} statement 
     * A string representing the SQL statement to register.
     * 
     * @returns {PreparedStatement?}
     * A {@link PreparedStatement} if success to register the statement,
     * a `null` otherwise.
     * 
     * If the given name is already used by another {@link PreparedStatement},
     * this function returns `null`.
     */
    registerPreparedStatement(name, statement) {
        const ps_name = typeof name === "string" ? name : "";
        if (ps_name.length > 0) {
            if (this.preparedStatements.has(ps_name)) {
                return null;
            } else {
                const ps = new PreparedStatement(ps_name, statement, this);
                this.preparedStatements.set(ps.name, ps);
                return ps;
            }
        } else {
            //  just returns an anonymous prepared statement
            return new PreparedStatement("", statement, this);
        }
    }

    /**
     * Removes the specified {@link PreparedStatement} from
     * the target {@link AlierDB} if the statement exists.
     * 
     * @param {string} name 
     * A string representing the name of the {@link PreparedStatement}
     * registered at the target {@link AlierDB}.
     */
    removePreparedStatement(name) {
        this.preparedStatements.delete(name);
    }
    
    /**
     * Executes a query by using the given prepared statement.
     * 
     * @param {string} name
     * A string representing the name of {@link PreparedStatement} to 
     * execute.
     * 
     * @param {any[]} params 
     * An array of parameters replacing placeholders in
     * the prepared statement.
     * 
     * @returns {Promise<({
     *      status: true,
     *      records?: any[]
     * } | {
     *      status: false,
     *      message?: string
     * })>}
     * an object representing the operation result.
     * If `status` is `true`, the operation is succeeded, otherwise
     * the operation is failed.
     * 
     * If there already exists an on-going transaction,
     * this operation is failed. 
     */
    async execPreparedStatement(name, params) {
        const name_ = String(name);
        const ps = this.preparedStatements.get(name_);

        if (ps == null) {
            const failure = {
                status : false,
                message: typeof name === "string" ?
                    `${this.connector.database}: Prepared statement "${name_}" is not registered` :
                    `${this.connector.database}: Invalid argument: ${name_}`
            };
            console.error(failure.message);
            return failure;
        } else if (ps.database !== this) {
            const failure = {
                status : false,
                message: `${this.connector.database}: Target database "${ps.database.connector.database}" not match the receiver`
            };
            console.error(failure.message);
            return failure;
        }

        return ps.execute(...params);
    }

    /**
     * Replaces all occurrences of placeholders in the given statement
     * with the appropriate symbols.
     * 
     * @param {string} query 
     * A string representing the SQL statement.
     * 
     * @returns {string}
     * A string representing the formatted SQL statement.
     */
    fixPreparedStatementQuery(query) {
        return this.connector.fixPreparedStatementQuery(query);
    }

    /**
     * @async
     * 
     * Creates a database from the given schema.
     * 
     * This function updates the target {@link AlierDB}'s
     * {@link schema} property if succeeded to create.
     * 
     * @param {DatabaseSchemaType | Promise<DatabaseSchemaType>} schema 
     * An object or a `Promise` that resolves to an object describing
     * database schema.
     * 
     * @param {boolean?} ifNotExists 
     * An optional boolean indicating whether or not to create a table
     * only if it does not exist yet.
     * 
     * By default, tables are created if they do not exist (`true`).
     * 
     * @returns {Promise<({
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * })>}
     * an object representing the operation result.
     * If `status` is `true`, the operation is succeeded, otherwise
     * the operation is failed.
     * 
     * If there already exists an on-going transaction,
     * this operation is failed. 
     * 
     * @throws {TypeError}
     * When
     * -    the given schema is not a non-null object
     * -    the given schema does not have the `tables` property
     * -    the `tables` property does not have an array
     */
    async createDatabase(schema, ifNotExists) {
        const schema_ = (schema instanceof Promise) ? await schema : schema;
        if (schema_ === null || typeof schema_ !== "object") {
            throw new TypeError("Given schema is not a non-null object");
        }

        let resolve;
        let reject;
        const update_notifier = new Promise((resolve_, reject_) => {
            resolve = resolve_;
            reject  = reject_;
        });

        this.schema = update_notifier;
        
        const table_schemata = schema_.tables;
        if (table_schemata == null) {
            throw new TypeError("'tables' is not defined in the given schema");
        } else if (!Array.isArray(table_schemata)) {
            throw new TypeError("'tables' must be an array");
        }

        const if_not_exists = (typeof ifNotExists !== "boolean" || ifNotExists);

        const new_tables = [];
        for (const table_schema of table_schemata) {
            try {
                const new_table = await this.connector.createTable(table_schema, if_not_exists);
                new_tables.push(new_table);
            } catch (e) {
                for (let i = new_tables.length - 1; i >= 0; i--) {
                    const new_table   = new_tables[i];
                    const table_name  = new_table.name;
                    const index       = table_schemata.findIndex(table => table.name === table_name);
                    if (index >= 0) {
                        table_schemata.splice(index, 1, new_table);
                        new_tables.splice(i, 1);
                    }
                }
                new_tables.splice(0, 0, ...table_schemata);

                this.schema = { tables: new_tables };
                reject(e);
                return { status: false, message: e.message };
            }
        }

        this.schema = { tables: new_tables };

        resolve(this.schema);

        return { status: true };
    }

    /**
     * Gets a {@link AlierTable}.
     * 
     * @param {object} tableAttributes
     * @param {string} tableAttributes.table
     * A string representing the table to access.
     * 
     * @param {(string | string[])?} tableAttributes.columns
     * A string or a string array representing the result column list.
     * 
     * If the list is not provided, all columns are retrieved.
     * 
     * @param {(string)?} tableAttributes.alias
     * A string representing the alias of the target table.
     * 
     * @returns {AlierTable?}
     * An {@link AlierTable} if succeeded to get the table, `null` otherwise.
     * 
     * @throws {TypeError}
     * When
     * -    the table name not specified
     */
    get(tableAttributes) {
        const { table: table_name, columns, alias } = tableAttributes;
        if (table_name == null) {
            throw new TypeError(`Table name ('table') not specified in the given table attributes`);
        }
        const args = {
            database: this,
            name    : table_name,
            columns,
            alias
        };
        try {
            return (columns != null) ?
                new VirtualAlierTable(args) :   //  View of a physical table
                new AlierTable(args)            //  Physical table
            ;
        } catch (e) {
            console.error(`${this.connector.database}: AlierDB.get an unexpected error has occurred : ${e.message}`);
            return null;
        }
    }

    /**
     * @async
     * Drops the specified table.
     * 
     * @param {object} o 
     * @param {string} o.table
     * A string representing the table name to drop.
     * 
     * @returns {Promise<{
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * }>} 
     * A `Promise` that resolves to the operation result.
     * 
     * @throws {TypeError}
     * When a table name is not specified.
     */
    async delete(o) {
        const table_name = o.table;
        if (table_name == null) {
            throw new TypeError("'table' not specified");
        }

        try {
            await this.connector.dropTable(table_name);

            const schema = this.schema;
            if (schema instanceof Promise) {
                this.schema = await schema;
            }

            const table_schemata = schema.tables;
            for (const i of table_schemata.keys()) {
                const table_schema = table_schemata[i];
                if (table_schema.name === table_name) {
                    table_schemata.splice(i, 1);
                    break;
                }
            }

            return { status: true };
        } catch (e) {
            if (!(e instanceof DBError)) {
                throw e;
            }
            console.error(e);

            return {
                status: false,
                message: e.message
            };
        }
    }

    /**
     * Escapes the given string as an SQL identifier.
     * 
     * @param {string} rawIdentifier 
     * A string to escape as an SQL identifier.
     * 
     * @returns {string}
     * An SQL identifier.
     */
    asIdentifier(rawIdentifier) {
        return this.connector.asIdentifier(rawIdentifier);
    }

    /**
     * Escapes the given string as an SQL string literal.
     * 
     * @param {string} rawIdentifier 
     * A string to escape as an SQL string literal.
     * 
     * @returns {string}
     * An SQL string literal.
     */
    asString(rawString) {
        return this.connector.asString(rawString);
    }

    /**
     * Converts the given data to an SQL value literal.
     * 
     * @param { object | string | boolean | number | bigint | undefined } rawValue 
     * A value to convert to an SQL value literal.
     * 
     * @returns {string}
     * An SQL value literal.
     */
    asValue(rawValue) {
        return this.connector.asValue(rawValue);
    }
}

class AlierTable {
    /**
     * The associated `AlierDB` instance.
     * @type {AlierDB}
     */
    database;

    /**
     * A string representing the table name.
     * @type {string}
     */
    name;

    /**
     * An array of the result column names.
     * @type {string[]?}
     */
    columns = null;

    /**
     * A string representing the alias of the target table.
     * @type {string?}
     */
    alias = null;

    /**
     * Left side term of JOIN operator.
     * @type {AlierTable?}
     */
    leftTable = null;

    /**
     * Right side term of JOIN operator.
     * @type {AlierTable?}
     */
    rightTable = null;

    /**
     * An enumerator indicating a type of `JOIN` operation.
     * @type {DBJoinType}
     */
    joinType = DBJoinType.INNER_JOIN;

    /**
     * A string representing the conditional expression in the `ON` clause.
     * @type {string}
     */
    on = "";

    /**
     * An array of strings each of which represents the column name in
     * the `USING` clause.
     * @type {string[]}
     */
    using = [];

    /**
     * @constructor
     * Creates a new {@link AlierTable}.
     * 
     * @param {AlierTableConstructorOptions} param0
     */
    constructor({
        database,
        name,
        columns,
        alias
    }) {
        if (!(database instanceof AlierDB)) {
            throw new TypeError("'database' is not an AlierDB");
        } else if (typeof name !== "string") {
            throw new TypeError("'name' is not a string");
        } else if (alias != null && typeof alias !== "string") {
            throw new TypeError("'alias' is not a string");
        } else if (columns != null && !(typeof columns === "string" || Array.isArray(columns))) {
            throw new TypeError("'columns' is neither a string nor an array");
        }

        const columns_ = (typeof columns === "string" ?
                columns.split(",").map(column => column.trim()) :
                columns
            )?.filter(column => column.length > 0)    
        ;

        this.database = database;
        this.name     = name;
        this.alias    = alias;
        this.columns  = columns_ != null && columns_.length > 0 ? columns_ : null;
    }

    get schema() {
        const db_schema = this.database.schema;
        if (db_schema instanceof Promise) {
            return db_schema.then(db_schema => {
                this.database.schema = db_schema;
                return db_schema.tables.find(table => table.name === this.name);
            });
        } else {
            return db_schema.tables.find(table => table.name === this.name);
        }
    }

    /**
     * A boolean indicating whether or not auto-connection is enabled.
     * 
     * This property is synced with the {@link AlierDB.autoConnect}
     * of the `AlierDB` associated with the target {@link AlierTable}.
     * 
     * This value is used whenever invoking REST interfaces of
     * {@link AlierTable}, i.e. {@link get()}, {@link post()},
     * {@link put()}, and {@link delete()}.
     * 
     * @type {boolean}
     * 
     * @see
     * -    {@link AlierDB.autoConnect}
     * -    {@link autoTransaction}
     * -    {@link get()}
     * -    {@link post()}
     * -    {@link put()}
     * -    {@link delete()}
     */
    get autoConnect() {
        return this.database.autoConnect;
    }

    /**
     * A boolean indicating whether or not auto-connection is enabled.
     * 
     * This property is synced with the {@link AlierDB.autoTransaction}
     * of the `AlierDB` associated with the target {@link AlierTable}.
     * 
     * This value is used whenever invoking REST interfaces of
     * {@link AlierTable}, i.e. {@link get()}, {@link post()},
     * {@link put()}, and {@link delete()}.
     * 
     * @type {boolean}
     * 
     * @see
     * -    {@link AlierDB.autoTransaction}
     * -    {@link autoConnect}
     * -    {@link get()}
     * -    {@link post()}
     * -    {@link put()}
     * -    {@link delete()}
     */
    get autoTransaction() {
        return this.database.autoTransaction;
    }

    /**
     * @async
     * 
     * Gets the records from the corresponding database table with
     * the given condition.
     * 
     * This method is associated with `SELECT` commands in SQL.
     * 
     * @param {AlierTableGetDescriptorType} getDescriptor 
     * An object describing the "get" operation.
     * 
     * The `aggregate` property represents an aggregation operation.
     * If the `aggregate` is a function, it is invoked for each record
     * and its index.
     * If the `aggregate` is an object, it represents either one of
     * the SQL aggregate functions, `COUNT()`, `MAX()`, `MIN()`, `SUM()`,
     * or `AVG()`.
     * The objects representing the SQL aggregation functions can be 
     * generated from {@link $count()}, {@link $sum()}, {@link $avg()}, 
     * {@link $max()}, {@link $min()}. They represents `COUNT()`,
     * `MAX()`, `MIN()`, `SUM()`, and `AVG()` respectively.
     * 
     * Note that, none of arithmetic operations is supported for 
     * the aggregation results. i.e., you cannot compute
     * `MAX(x) - MIN(x)` in a direct way for instance.
     * 
     * The `final` property is an optional function invoked after
     * completion of the aggregation.
     * 
     * @returns {Promise<{
     *      status: true,
     *      records: object[]
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * A `Promise` that resolves to an object representing the
     * execution result.
     * 
     * @throws {Error}
     * When an unexpected error other than {@link DBError} occurs.
     * 
     * @see
     * 
     * -    {@link put()}
     * -    {@link post()}
     * -    {@link delete()}
     * -    {@link $count()}
     * -    {@link $sum()}
     * -    {@link $avg()}
     * -    {@link $max()}
     * -    {@link $min()}
     */
    async get(getDescriptor) {
        if (this.#read_lock.length > 0) {
            await Promise.all(this.#read_lock);
            //  clear all components.
            this.#read_lock.length = 0;
        }

        return this.#restImpl(getDescriptor, async desc => {
            /**
             * @type {AlierTableGetDescriptorType}
             */
            const desc_ = desc ?? {};
            try {
                const statement = _createSelectStatement(this, desc_);
                const { status, records, message } = await this.database.execSQL(statement);
                if (status) {
                    const records_ = records ?? [];
                    const { aggregate, final, aggregateAs: aggregate_as } = desc_;

                    //  Aggregate retrieved records.
                    if (typeof aggregate === "function") {
                        const aggregate_results = [];
                        for (const i of records_.keys()) {
                            try {
                                const aggregate_result = aggregate(records_[i], i);
                                if (aggregate_result instanceof Promise) {
                                    aggregate_results.push(aggregate_result);
                                }
                            } catch (e) {
                                aggregate_results.push(Promise.reject(e));
                            }
                        }
                        await Promise.all(aggregate_results);
                    }

                    //  Add an alias for the aggregate result.
                    //  This function modifies records.
                    _renameAggregateResults(records_, aggregate_as ?? "");

                    //  Finalize.
                    if (typeof final === "function") {
                        await final(records_.length);
                    }

                    return { status, records: records_ };
                } else {
                    return { status, message };
                }
            } catch (e) {
                if (!(e instanceof DBError)) {
                    throw e;
                }

                console.error(e);

                return {
                    status : false,
                    message: e.message
                }
            }
        });
    }

    /**
     * @async
     * 
     * Puts the given record to the corresponding database table.
     * 
     * This method is associated with `UPDATE` commands in SQL.
     * 
     * @param {AlierTablePutDescriptorType} putDescriptor 
     * An object describing the "put" operation.
     * 
     * Each property represents a pair of the column name and its value
     * to update.
     * 
     * @returns {Promise<{
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * A `Promise` that resolves to an object representing the
     * execution result.
     * 
     * @throws {Error}
     * When an unexpected error other than {@link DBError} occurs.
     * 
     * @see
     * -    {@link get()}
     * -    {@link post()}
     * -    {@link delete()}
     */
    async put(putDescriptor) {
        const { lock, resolve } = this.#getLockObject();
        this.#read_lock.push(lock);

        return this.#restImpl(putDescriptor, desc => {
            /**
             * @type {AlierTablePutDescriptorType}
             */
            const desc_ = desc ?? {};
            const statement = _createUpdateStatement(this, desc_);
            return this.database.execSQL(statement);
        }).then(result => {
            resolve();
            return result;
        });
    }

    /**
     * @async
     * 
     * Posts the given record to the corresponding database table.
     * 
     * This method is associated with `INSERT` commands in SQL.
     * 
     * @param {AlierTablePostDescriptorType} postDescriptor 
     * An object describing the "post" operation.
     * 
     * Each property represents a pair of the column name and its value
     * to insert.
     * 
     * @returns {Promise<{
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * A `Promise` that resolves to an object representing the
     * execution result.
     * 
     * @throws {Error}
     * When an unexpected error other than {@link DBError} occurs.
     * 
     * @see
     * -    {@link get()}
     * -    {@link put()}
     * -    {@link delete()}
     */
    async post(postDescriptor) {
        const { lock, resolve } = this.#getLockObject();
        this.#read_lock.push(lock);

        return this.#restImpl(postDescriptor, desc => {
            /**
             * @type {AlierTablePostDescriptorType} 
             */
            const desc_ = desc ?? {};
            const statement = _createInsertStatement(this, desc_);
            return this.database.execSQL(statement);
        }).then(result => {
            resolve();
            return result;
        });
    }

    /**
     * @async
     * 
     * Deletes the given record to the corresponding database table.
     * 
     * This method is associated with `DELETE` commands in SQL.
     * 
     * @param {AlierTableDeleteDescriptorType} deleteDescriptor 
     * An object describing the "delete" operation.
     * 
     * The `filter` property represents the conditional expression
     * in the `WHERE` clause applied to `DELETE` command.
     * 
     * @returns {Promise<{
     *      status: true
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     * A `Promise` that resolves to an object representing the
     * execution result.
     * 
     * @throws {Error}
     * When an unexpected error other than {@link DBError} occurs.
     * 
     * @see
     * -    {@link get()}
     * -    {@link put()}
     * -    {@link post()}
     */
    async delete(deleteDescriptor) {
        const { lock, resolve } = this.#getLockObject();
        this.#read_lock.push(lock);

        return this.#restImpl(deleteDescriptor, desc => {
            /**
             * @type {AlierTableDeleteDescriptorType}
             */
            const desc_ = desc ?? {};

            const statement = _createDeleteStatement(this, desc_);
            return this.database.execSQL(statement);
        }).then(result => {
            resolve();
            return result;
        });
    }

    /**
     * Tests whether or not the target {@link AlierTable} is obtained from {@link join()} method.
     * 
     * @returns {this is AlierTable & { leftTable: AlierTable, rightTable: AlierTable }}
     * `true` if the target table is obtained from {@link join()} method,
     * `false` otherwise.
     * 
     * It is also guaranteed that both the {@link leftTable} and
     * {@link rightTable} have {@link AlierTable} instances when `true`
     * is returned.
     */
    isJoined() {
        return (this.leftTable instanceof AlierTable) && (this.rightTable instanceof AlierTable);
    }

    /**
     * `JOIN`s the target table with the given table.
     * 
     * @param {object} o
     * An object containing arguments.
     * 
     * @param {AlierTable} o.table
     * an {@link AlierTable} representing the right-hand operand of
     * `JOIN` operator.
     * 
     * @param {(string | string[])?} o.columns
     * An optional string or an string array representing
     * a list of column names in the `USING` clause.
     * 
     * @param {DBJoinType?} o.joinType
     * An optional enumerator indicating the type of `JOIN` operation.
     * 
     * By default, {@link DBJoinType.INNER_JOIN} is used.
     * 
     * @param {string?} o.on
     * An optional string representing the conditional expression in
     * the `ON` clause.
     * 
     * @param {string[]?} o.using
     * An optional string array representing a list of column names
     * in the `USING` clause.
     * 
     * @returns {AlierTable | VirtualAlierTable}
     * An `AlierTable` representing the result of `JOIN` operation.
     */
    join(o) {
        const { table: right_table, joinType: join_type, on, using, columns } = o ?? {};

        if (!(right_table instanceof AlierTable)) {
            throw new DBError("Right-hand side operand of JOIN operator is not provided");
        } else if ((
            join_type === DBJoinType.INNER_JOIN       ||
            join_type === DBJoinType.LEFT_OUTER_JOIN  ||
            join_type === DBJoinType.RIGHT_OUTER_JOIN ||
            join_type === DBJoinType.FULL_OUTER_JOIN
        ) && ((on != null) === (using != null))) {
            throw new DBError("INNER JOIN and non-NATURAL JOIN must have either an `ON` or `USING` clause");
        } else if ((
            join_type === DBJoinType.CROSS_JOIN               ||
            join_type === DBJoinType.NATURAL_INNER_JOIN       ||
            join_type === DBJoinType.NATURAL_LEFT_OUTER_JOIN  ||
            join_type === DBJoinType.NATURAL_RIGHT_OUTER_JOIN ||
            join_type === DBJoinType.NATURAL_FULL_OUTER_JOIN
        ) && ((on != null) || (using != null))) {
            throw new DBError("CROSS JOIN and NATURAL JOIN must not have an `ON` or `USING` clause");
        } else if (this.isJoined() && right_table.isJoined()) {
            throw new DBError("JOINing two JOIN results are not supported");
        } else if (
            !(right_table.database.connector instanceof this.database.connector.constructor) ||
            this.database.connector.database !== right_table.database.connector.database
        ) {
            throw new DBError("Two tables do not exist in the same database");
        }

        const join_type_ = join_type ?? DBJoinType.INNER_JOIN;
        const join_op    = _joinOperator(join_type_);

        const join_table = new VirtualAlierTable({
            //  Common parameters for AlierTables
            database  : this.database,
            name      : `${this.name} ${join_op} ${right_table.name}`,
            columns   : columns,
            //  VirtualAlierTable specific parameters
            joinType  : join_type ?? DBJoinType.INNER_JOIN,
            leftTable : this,
            rightTable: right_table,
            on,
            using
        });
        //  Share lock objects with the joined table.
        //  To do so, share the array reference with each others instead
        //  sharing components of the array to align database access from multiple
        //  instances of `AlierTable` targeting the same table.
        join_table.#read_lock = this.#read_lock;

        return join_table;
    }

    /**
     * Does the given REST operation.
     * 
     * @param {object} transactionOptions
     * An object containing the transaction options.
     *  
     * @param {object} statementDescriptor 
     * An object describing the statement.
     * 
     * @param {(statementDescriptor: object) => Promise<{
     *      status: true,
     *      records?: any[]
     * } | {
     *      status: false,
     *      message?: string
     * }>} impl
     * Implementation of the REST operation.
     * 
     * @return {Promise<{
     *      status: true,
     *      records?: any[]
     * } | {
     *      status: false,
     *      message?: string
     * }>}
     */
    async #restImpl(statementDescriptor, impl) {
        //  Lazy init
        //  this.schema invokes get schema() method.
        //  This modifies the AlierDB's schema property when the returned Promise resolves. 
        const schema = this.schema;
        if (schema instanceof Promise) {
            //  no need to assign the result of await.
            await schema;
        }

        const statement_desc   = statementDescriptor ?? {};
        const auto_connect     = this.autoConnect;
        const auto_transaction = this.autoTransaction;

        const task = async () => {
            let records;
            let message;
            const block = async () => {
                const get_result = await impl(statement_desc);
                const status     = get_result.status;
                if (status) {
                    records = get_result.records;
                } else {
                    message = get_result.message;
                }

                //  commit if succeeded, rollback otherwise.
                return status;
            };

            if (auto_transaction) {
                const transaction_result = await this.database.transaction(null, block);
                if (!transaction_result.status) {
                    return { status: false, message: transaction_result.message ?? message };
                } else {
                    return { status: true, records };
                }
            } else {
                try {
                    const can_commit = await block();
                    return can_commit ?
                        { status: true , records } :
                        { status: false, message }
                    ;
                } catch (e) {
                    if (!(e instanceof DBError)) {
                        throw e;
                    }
                    return {
                        status : false,
                        message: e.message
                    };
                }
            }
        };

        if (auto_connect) {
            const connect_result = await this.database.connect();
            if (!connect_result.status) {
                return connect_result;
            }

            const task_result = await task();
            
            const disconnect_result = await this.database.disconnect();
            if (!disconnect_result.status) {
                console.error(disconnect_result.message);
            }

            return task_result;
        } else {
            return task();
        }
    }

    /**
     * Gets a new lock object.
     * 
     * @returns {({
     *      lock: Promise<void>,
     *      resolve: () => void
     * })}
     * 
     * A lock object with the associated resolve function.
     */
    #getLockObject() {
        /** @type {() => void} */
        let resolve;
        const lock = new Promise(resolve_ => {
            resolve = resolve_;
        });
        return { lock, resolve };
    }

    /**
     * An array of `Promise`s used for waiting for completion of modification.
     * @type {Promise<void>[]}
     */
    #read_lock = [];
}


/**
 * Creates a `SELECT` statement from the given descriptor.
 * 
 * @param {AlierTable} targetTable
 * 
 * @param {AlierTableGetDescriptorType} getDescriptor 
 * An object describing the "get" operation.
 * 
 * For more details, see {@link AlierTable.get()}.
 * 
 * @returns {string}
 * A `SELECT` statement.
 */
function _createSelectStatement(targetTable, getDescriptor) {
    const get_desc = getDescriptor;
    const { aggregate, sort, limit, offset } = get_desc;
    const db = targetTable.database;

    const select_statement = [
        _appendWhereClause(`SELECT ${_createResultColumnList(targetTable, get_desc)} FROM ${_createTableExpression(targetTable)}`, get_desc)
    ];

    if (aggregate !== null && typeof aggregate === "object") {
        const { group, having } = aggregate;
        if (group != null) {
            const group_ = (typeof group === "string" ?
                group.split(",") :
                group
            ).map(x => x.trim())
            .filter(x => x.length > 0)
            .map(x => db.asIdentifier(x))
            .filter(x => x.length > 0).join(",")
            ;
            if (group_.length > 0) {
                select_statement.push(`GROUP BY ${group_}`);
            }
        }
        if (having != null) {
            const having_ = having.trim();
            if (having_.length > 0) {
                select_statement.push(`HAVING ${having}`);
            }
        }
    }

    if (Array.isArray(sort)) {
        const sort_ = sort
            .map(x => x.trim())
            .filter(x => x.length > 0 && x !== "!")
            .map(column => (column.startsWith("!") ?
                `${db.asIdentifier(column.slice(1))} DESC` :
                db.asIdentifier(column)
            ))
        ;

        if (sort_.length > 0) {
            select_statement.push(`ORDER BY ${sort_.join(",")}`);

            const use_limit  = (typeof limit === "number");
            const use_offset = (typeof offset === "number" && offset > 0);
            const limit_     = (
                use_limit &&
                !Number.isNaN(limit) &&
                0xffffffff > limit && limit >= 0
            ) ?
                Math.trunc(limit) :
                0xffffffff
            ;
        
            if (use_offset) {
                const offset_ = Number.isNaN(offset) ?
                        0 :
                    offset >= Number.MAX_SAFE_INTEGER ?
                        Number.MAX_SAFE_INTEGER :
                        Math.trunc(offset)
                ;
                select_statement.push(`LIMIT ${limit_} OFFSET ${offset_}`);
            } else if (use_limit) {
                select_statement.push(`LIMIT ${limit_}`);
            }
        }
    }

    //  Extract the first statement and discard the rest.
    return _splitStatements(select_statement.join(" "))[0];
}

/**
 * Create a result column list.
 * 
 * @param {AlierTable} targetTable 
 * The target table.
 * 
 * @param {AlierTableGetDescriptorType} getDescriptor 
 * An object describing parameters for {@link AlierTable.get()} method.
 * 
 * @returns {string}
 * A string representing the result column list.
 */
function _createResultColumnList(targetTable, getDescriptor) {
    const db            = targetTable.database;
    const aggregate     = getDescriptor?.aggregate;
    const has_aggregate = aggregate !== null && typeof aggregate === "object";
    const columns       = targetTable.columns;

    const result_columns = [];

    //  Build result-column-list.
    //  If the target table specifies the result columns, use it.
    //  Or, if the target table is created from JOIN operations,
    //  
    if (columns != null) {
        result_columns.push(...columns.map(x => db.asIdentifier(x)));
    } else if (targetTable.isJoined()) {
        const left  = targetTable.leftTable;
        const right = targetTable.rightTable;

        /**
         * @param {AlierTable} table 
         * @returns {string[]}
         */
        const get_result_columns = (table) => {
            const column_names = [];
            if (table.isJoined()) {
                column_names.push(_createResultColumnList(table, getDescriptor));
            } else {
                const table_name  = table.schema.name;
                const table_alias = table.alias ?? table_name;
                for (const column of Object.keys(table.schema.columns)) {
                    const canonical_name = `${db.asIdentifier(table_name)}.${db.asIdentifier(column)}`;
                    const alias = db.asIdentifier(`${table_alias}_${column}`);
                    column_names.push(`${canonical_name} AS ${alias}`);
                }
            }
            return column_names;
        };

        result_columns.push(
            ...get_result_columns(left),
            ...get_result_columns(right)
        );
    } else if (!has_aggregate) {
        result_columns.push("*");
    }

    if (has_aggregate) {
        result_columns.push(aggregate.aggregate);
    }

    return result_columns.join(",");
}

/**
 * @param {AlierTable} targetTable
 * @param {AlierTablePutDescriptorType} putDescriptor 
 * @returns {string}
 */
function _createUpdateStatement(targetTable, putDescriptor) {
    const { filter, ...put_desc } = putDescriptor;
    const db       = targetTable.database;

    let update_statement = "UPDATE";
    update_statement += " ";
    update_statement += _createTableExpression(targetTable);

    const assignments = [];
    for (const [k, v] of Object.entries(put_desc)) {
        const sql_key   = db.asIdentifier(k);
        const sql_value = db.asValue(v);
        assignments.push(`${sql_key}=${sql_value}`);
    }

    if (assignments.length === 0) {
        throw new SyntaxError("SET clause is empty");
    }

    update_statement += " ";
    update_statement += `SET ${assignments.join(",")}`;
    update_statement = _appendWhereClause(update_statement, { filter });

    //  Extract the first statement and discard the rest.
    return _splitStatements(update_statement)[0];
}

/**
 * 
 * @param {AlierTable} targetTable
 * @param {AlierTablePostDescriptorType} postDescriptor 
 * @returns {string}
 */
function _createInsertStatement(targetTable, postDescriptor) {
    const post_desc = postDescriptor;
    const db        = targetTable.database;

    let insert_statement = "INSERT INTO";
    insert_statement += " ";
    insert_statement += _createTableExpression(targetTable);

    const columns = [];
    const values  = [];
    for (const [k, v] of Object.entries(post_desc)) {
        columns.push(db.asIdentifier(k));
        values.push(db.asValue(v));
    }

    insert_statement += `(${columns.join(",")}) VALUES(${values.join(",")})`;

    //  Extract the first statement and discard the rest.
    return _splitStatements(insert_statement)[0];
}

/**
 * Creates a `DELETE` statement from the given descriptor.
 * 
 * @param {AlierTable} targetTable
 * @param {AlierTableDeleteDescriptorType} deleteDescriptor 
 * An object containing parameters for the delete operation.
 * 
 * @returns {string}
 * A string representing the `DELETE` statement.
 */
function _createDeleteStatement(targetTable, deleteDescriptor) {
    const { filter } = deleteDescriptor;

    let delete_statement = "DELETE";
    delete_statement += " ";
    delete_statement += `FROM ${_createTableExpression(targetTable)}`;
    delete_statement = _appendWhereClause(delete_statement, { filter });

    //  Extract the first statement and discard the rest.
    return _splitStatements(delete_statement)[0];
}
/**
 * Creates a common-table-expression from the given {@link AlierTable}.
 * 
 * @param {AlierTable} alierTable 
 * An {@link AlierTable} to create the associated common-table-expression.
 * 
 * @returns {string}
 * A string representing the common-table-expression associated with
 * the given {@link AlierTable}.
 */
function _createTableExpression(alierTable) {
    const alier_table = alierTable;
    const db          = alierTable.database;

    if (alier_table.isJoined()) {
        const join_op    = _joinOperator(alier_table.joinType);
        const left_from  = _createTableExpression(alier_table.leftTable);
        const right_from = _createTableExpression(alier_table.rightTable);

        const table_expr = [left_from, join_op, right_from];

        const on = alier_table.on.trim();
        if (on.length > 0) {
            table_expr.push(`ON ${_replaceJavaScriptLikeNotation(on)}`);
        }

        const using = alier_table.using;
        if (using.length > 0) {
            table_expr.push(`USING (${using.map(x => db.asIdentifier(x)).join(",")})`);
        }

        return `(${table_expr.join(" ")})`;
    } else {
        const table_name = db.asIdentifier(alier_table.name);
        const alias      = alier_table.alias?.trim();
        return (typeof alias === "string" && alias.length > 0) ?
                `${table_name} AS ${db.asIdentifier(alias)}` :
                table_name
        ;
    }
}

/**
 * Appends a `WHERE` clause to the given SQL statement.
 *  
 * @param {string} statement 
 * A string representing the SQL statement to be applied the given
 * filtering condition.
 * @param {object} param1
 * @param {string?} param1.filter
 * An optional string representing the conditional expression to place
 * in a `WHERE` clause.
 * @returns {string}
 * A string representing the SQL statement which is applied
 * the given filtering condition.
 */
function _appendWhereClause(statement, { filter }) {
    const filter_ = typeof filter !== "string" ?
        "" :
        _replaceJavaScriptLikeNotation(filter).trim()
    ;
    return filter_.length > 0 ?
        `${statement} WHERE ${filter_}` :
        statement
    ;
}

class VirtualAlierTable extends AlierTable {

    /**
     * @constructor
     * 
     * Creates a new {@link VirtualAlierTable}.
     * 
     * This is invoked from the {@link join()} and {@link get()} methods
     * and not intended for direct use.
     * 
     * @param {VirtualAlierTableConstructorOptions} o 
     * An object containing named parameters.
     * 
     */
    constructor(o) {
        const o_ = o ?? {};
        super(o_);
        const {
            leftTable: left_table,
            rightTable: right_table,
            joinType: join_type,
            on,
            using
        } = o_;
        if (left_table != null && !(left_table instanceof AlierTable)) {
            throw new TypeError("'leftTable' is not an AlierTable");
        } else if (right_table != null && !(right_table instanceof AlierTable)) {
            throw new TypeError("'rightTable' is not an AlierTable");
        } else if (join_type != null && !Object.values(DBJoinType).some(t => t === join_type)) {
            throw new TypeError("'joinType' is neither one of DBJoinType");
        } else if (on != null && typeof on !== "string") {
            throw new TypeError("'on' is not a string");
        } else if (using != null && (!Array.isArray(using) || using.some(column => (typeof column !== "string" || column.length <= 0)))) {
            throw new TypeError("'using' is not a string array");
        }

        this.leftTable  = left_table;
        this.rightTable = right_table;
        this.joinType   = join_type ?? DBJoinType.INNER_JOIN;
        this.on         = on ?? "";
        this.using      = using != null ? [...using] : [];
    }

    async post() {
        return {
            status: false,
            message: "'post()' is not implemented for VirtualAlierTable"
        };
    }

    async delete() {
        return {
            status: false,
            message: "'delete()' is not implemented for VirtualAlierTable"
        };
    }
}

/**
 * Renames names of columns containing aggregation results
 * in the provided records.
 * 
 * This function modifies the given records directly.
 * 
 * @param {object[]} records 
 * An array of the records to rename.
 * 
 * Each record must be mutable.
 * 
 * @param {string} aggregateAs 
 * A string representing the alias of the column of the aggregation
 * result.
 * @returns {Map<string, string>}
 * A `Map` object mapping column name to its alias.
 * 
 */
function _renameAggregateResults(records, aggregateAs) {
    const aggregate_as = typeof aggregateAs === "string" ?
        aggregateAs :
        ""
    ;
    if (records.length <= 0) {
        return new Map();
    }

    const aggregate_fn_expr = /^(?<fname>[a-zA-Z]+)\(.+\)$/g;
    const aggregate_result_keys = new Map(Object.keys(records[0])
        .map(column => {
            const m = aggregate_fn_expr.exec(column);
            if (m == null) {
                return null;
            }

            const { fname } = m.groups;
            const column_as = aggregate_as ?
                aggregate_as :
                String(fname).toLowerCase()
            ;
            return column === column_as ? null : [column, column_as];
        })
        .filter(pair => pair != null)
    );
    if (aggregate_result_keys.size <= 0) {
        return new Map();
    }

    for (const record of records) {
        for (const [column, column_as] of aggregate_result_keys.entries()) {
            //  move value from `key` to `column`.
            const value = record[column];
            delete record[column];
            record[column_as] = value;
        }
    }

    return aggregate_result_keys;
}

/**
 * Replaces JavaScript-like notations in the given filtering condition.
 * 
 * @param {string} condition
 * A string representing the conditions of filtering.
 * 
 * @returns {string}
 * A string representing a fragment of an SQL statement.
 * 
 */
function _replaceJavaScriptLikeNotation(condition) {
    if (typeof condition !== "string") {
        throw new TypeError("Given statement is not a string");
    }
    const s = condition;
    return s.replaceAll(/[^"']+|'(?:[^']|'')*'|"(?:[^"]|"")*"/g, m => {
        if (m.startsWith("'") || m.startsWith("\"")) {
            return m;
        }
        return m.replaceAll(/!+(?:[^=]|$)|(?:={2,3}|!={1,2})(?:\s*(?:null|undefined)\b)?|&&|\|\|/g, (m_, offset) => {
            const end_index = m_.length + offset;
            const offset_m1 = offset - 1;
            const prev_ch = m[offset_m1] ?? "";
            const next_ch = m[end_index] ?? "";
            const last_ch = m_[m_.length - 1];
            const before = /[^a-zA-Z0-9_]/.test(prev_ch) ? "" : " ";
            const after  = /[^a-zA-Z0-9_]/.test(next_ch) ? "" : " ";

            return (m_ === "&&" ?
                    before + "AND" + after:
                m_ === "||" ?
                    before + "OR" + after:
                m_.startsWith("=") ?
                    before + (/(?:null|undefined)$/.test(m_) ? "IS NULL" : "=") + after:
                last_ch === "=" ?   // m_ starts with "!"
                    before + "!=" + after:
                last_ch === "!" ?
                    (m_.length % 2 === 1 ? "NOT" : "") :
                /(?:null|undefined)$/.test(m_) ?
                    before + "IS NOT NULL" + after :
                    (m_.length % 2 === 0 ? "NOT" + (/^\s$/.test(last_ch) ? "" : " ") + last_ch : last_ch)
            );
        });
    });
}

/**
 * Splits the given SQL statements.
 * 
 * @param {string} statement 
 * A string representing a bunch of SQL statements.
 * 
 * @returns {string[]}
 * An array of SQL statements.
 * Each statement ends with a semicolon.
 */
function _splitStatements(statement) {
    let statement_ = String(statement).trim();

    const statements = [];
    let last_statement = "";
    for (const m of statement_.matchAll(/(?<others>'(?:[^']|'')*'|"(?:[^"]|"")*"|\s+|[^'";]+)|(?<eos>;)/g)) {
        const { others, eos } = m.groups;
        if (eos == null) {
            last_statement += others;
        } else {
            statements.push(last_statement.trim() + ";");
            last_statement = "";
        }
    }
    if (last_statement.length > 0) {
        statements.push(last_statement.trim() + ";");
    }
    return statements;
}

/**
 * @param {string} aggregate 
 * @param {(string | string[])?} group 
 * @param {string?} having 
 * @returns {AggregatorObjectType?}
 */
function _makeAggregateObject(aggregate, group, having) {
    if (aggregate == null) { return null; }

    const o = { aggregate: String(aggregate) };

    if (group != null) {
        o.group = (Array.isArray(group) ?
            group :
            String(group).split(",")
        ).map(x => x.trim())
        .filter(x => x.length > 0)
        ;
    }

    if (having != null) {
        o.having = String(having);
    }

    return o;
}

/**
 * Builds a part of a SQL statement which invokes
 * the aggregate function `COUNT()` with or without a `GROUP BY`
 * clause and/or a `HAVING` clause.
 * 
 * This function is used for calculating the number of
 * the specified column in the retrieved records.
 * 
 * @param {object} o 
 * An object containing the following arguments.
 * 
 * @param {string?} o.column
 * A string representing the target column to be aggregated.
 * If this is provided, `COUNT(target column)` will be evaluated.
 * Otherwise, `COUNT(*)` is evaluated instead.
 * 
 * @param {(string|string[])?} o.group
 * A string array or a string representing the column used for grouping.
 * 
 * @param {string?} o.having
 * A string representing conditions applied to the groups.
 * 
 * @param {boolean?} o.distinct
 * A boolean indicating whether or not to count records that
 * distinguishable on the specified column.
 * i.e. this flag indicates whether or not to use `DISTINCT` keyword
 * with the aggregate function.
 * 
 * The database counts records unique for the specified column
 * if the flag is `true`, counts all records otherwise.
 * 
 * By default, this flag is set to `false`.
 * 
 * @returns {AggregatorObjectType?}
 * An object may having parts of the query statement to be generated.
 * 
 * The `aggregate` property has a string representing the use of
 * the aggregate function in the statement.
 * 
 * The `group` property has a string array representing 
 * the column list used for grouping if exists.
 * 
 * The `having` property has a string representing 
 * an expression in the `HAVING` clause in the statement if exists.
 * 
 * @see
 * -    {@link AlierTable.get()}
 */
function $count(o) {
    const column    = o?.column ?? "*";
    const distinct  = Boolean(o?.distinct) && column !== "*";

    const aggregate = distinct ?
        `COUNT(DISTINCT ${ column })` :
        `COUNT(${ column })`
    ;
    return _makeAggregateObject(aggregate, o.group, o.having);
}

/**
 * Builds a part of a SQL statement which invokes
 * the aggregate function `SUM()` with or without a `GROUP BY`
 * clause and/or a `HAVING` clause.
 * 
 * This function is used for calculating the total value of
 * the specified column in the retrieved records.
 * 
 * @param {object} o 
 * An object containing the following arguments.
 * 
 * @param {string?} o.column
 * A string representing the target column to be aggregated.
 * 
 * @param {(string|string[])?} o.group
 * A string array or a string representing the column used for grouping.
 * 
 * @param {string?} o.having
 * A string representing conditions applied to the groups.
 * 
 * @param {boolean?} o.distinct
 * A boolean indicating whether or not to count records that
 * distinguishable on the specified column.
 * i.e. this flag indicates whether or not to use `DISTINCT` keyword
 * with the aggregate function.
 * 
 * The database counts records unique for the specified column
 * if the flag is `true`, counts all records otherwise.
 * 
 * By default, this flag is set to `false`.
 * 
 * @returns {AggregatorObjectType?}
 * An object may having parts of the query statement to be generated.
 * 
 * The `aggregate` property has a string representing the use of
 * the aggregate function in the statement if exists.
 * 
 * The `group` property has a string array representing 
 * the column list used for grouping if exists.
 * 
 * The `having` property has a string representing 
 * an expression in the `HAVING` clause in the statement if exists.
 * 
 * @see
 * -    {@link AlierTable.get()}
 */
function $sum(o) {
    const column    = o?.column;
    const distinct  = Boolean(o?.distinct);

    const aggregate = column == null ?
            undefined :
        distinct ?
            `SUM(DISTINCT ${ column })` :
            `SUM(${ column })`
    ;

    return _makeAggregateObject(aggregate, o.group, o.having);
}

/**
 * Builds a part of a SQL statement which invokes
 * the aggregate function `AVG()` with or without a `GROUP BY`
 * clause and/or a `HAVING` clause.
 * 
 * This function is used for calculating the average value of
 * the specified column in the retrieved records.
 * 
 * @param {object} o 
 * An object containing the following arguments.
 * 
 * @param {string?} o.column
 * A string representing the target column to be aggregated.
 * 
 * @param {(string|string[])?} o.group
 * A string array or a string representing the column used for grouping.
 * 
 * @param {string?} o.having
 * A string representing conditions applied to the groups.
 * 
 * @param {boolean?} o.distinct
 * A boolean indicating whether or not to count records that
 * distinguishable on the specified column.
 * i.e. this flag indicates whether or not to use `DISTINCT` keyword
 * with the aggregate function.
 * 
 * The database counts records unique for the specified column
 * if the flag is `true`, counts all records otherwise.
 * 
 * By default, this flag is set to `false`.
 * 
 * @returns {AggregatorObjectType?}
 * An object may having parts of the query statement to be generated.
 * 
 * The `aggregate` property has a string representing the use of
 * the aggregate function in the statement if exists.
 * 
 * The `group` property has a string array representing 
 * the column list used for grouping if exists.
 * 
 * The `having` property has a string representing 
 * an expression in the `HAVING` clause in the statement if exists.
 * 
 * @see
 * -    {@link AlierTable.get()}
 */
function $avg(o) {
    const column    = o?.column;
    const distinct  = Boolean(o?.distinct);

    const aggregate = column == null ?
            undefined :
        distinct ?
            `AVG(DISTINCT ${ column })` :
            `AVG(${ column })`
    ;

    return _makeAggregateObject(aggregate, o.group, o.having);
}

/**
 * Builds a part of a SQL statement which invokes
 * the aggregate function `MAX()` with or without a `GROUP BY`
 * clause and/or a `HAVING` clause.
 * 
 * This function is used for calculating the maximum value of
 * the specified column in the retrieved records.
 * 
 * @param {object} o 
 * An object containing the following arguments.
 * 
 * @param {string?} o.column
 * A string representing the target column to be aggregated.
 * 
 * @param {(string|string[])?} o.group
 * A string array or a string representing the column used for grouping.
 * 
 * @param {string?} o.having
 * A string representing conditions applied to the groups.
 * 
 * @returns {AggregatorObjectType?}
 * An object may having parts of the query statement to be generated.
 * 
 * The `aggregate` property has a string representing the use of
 * the aggregate function in the statement if exists.
 * 
 * The `group` property has a string array representing 
 * the column list used for grouping if exists.
 * 
 * The `having` property has a string representing 
 * an expression in the `HAVING` clause in the statement if exists.
 * 
 * @see
 * -    {@link AlierTable.get()}
 */
function $max(o) {
    const column    = o?.column;

    const aggregate = column == null ?
            undefined :
            `MAX(${ column })`
    ;

    return _makeAggregateObject(aggregate, o.group, o.having);
}

/**
 * Builds a part of a SQL statement which invokes
 * the aggregate function `MIN()` with or without a `GROUP BY`
 * clause and/or a `HAVING` clause.
 * 
 * This function is used for calculating the minimum value of
 * the specified column in the retrieved records.
 * 
 * @param {object} o 
 * An object containing the following arguments.
 * 
 * @param {string?} o.column
 * A string representing the target column to be aggregated.
 * 
 * @param {(string|string[])?} o.group
 * A string array or a string representing the column used for grouping.
 * 
 * @param {string?} o.having
 * A string representing conditions applied to the groups.
 * 
 * @returns {AggregatorObjectType?}
 * An object may having parts of the query statement to be generated.
 * 
 * The `aggregate` property has a string representing the use of
 * the aggregate function in the statement if exists.
 * 
 * The `group` property has a string array representing 
 * the column list used for grouping if exists.
 * 
 * The `having` property has a string representing 
 * an expression in the `HAVING` clause in the statement if exists.
 * 
 * @see
 * -    {@link AlierTable.get()}
 */
function $min(o) {
    const column    = o?.column;

    const aggregate = column == null ?
            undefined :
            `MIN(${ column })`
    ;

    return _makeAggregateObject(aggregate, o.group, o.having);
}

/// PLATFORM-SPECIFIC SECTION: BEGIN
module.exports = {
    registerDefaultConnector,
    AlierDB,
    AlierTable,
    DBJoinType,
    $count,
    $sum,
    $avg,
    $max,
    $min
};
/// PLATFORM-SPECIFIC SECTION: END
